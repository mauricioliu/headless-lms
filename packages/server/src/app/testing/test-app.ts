import { randomBytes } from 'node:crypto';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { expect } from 'vitest';
import { runMigrations } from '@headless-lms/adapter-db';
import { buildServer, createContainer } from '../../index.js';
import type { Container, ServerConfig } from '../../index.js';
import { EchoTemplateRenderer, TestMailer } from './test-mailer.js';
import type { EmailMessage } from '@headless-lms/core/shared/ports';

export const TEST_AUTH_BASE_URL = 'http://api.test.local';
export const TEST_STUDENT_PORTAL_URL = 'http://student.test.local';
export const TEST_ADMIN_APP_URL = 'http://admin.test.local';

export function testDatabaseAdminUrl(): string {
  return process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:8005/postgres';
}

export interface TestDatabase {
  url: string;
  drop(): Promise<void>;
}

async function withAdmin<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function databaseUrlFor(adminUrl: string, name: string): string {
  const parsed = new URL(adminUrl);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const adminUrl = testDatabaseAdminUrl();
  const name = `hlms_test_${randomBytes(6).toString('hex')}`;
  await withAdmin(adminUrl, (client) => client.query(`CREATE DATABASE "${name}"`));
  return {
    url: databaseUrlFor(adminUrl, name),
    drop: async () => {
      await withAdmin(adminUrl, (client) => client.query(`DROP DATABASE "${name}" WITH (FORCE)`));
    },
  };
}

export class CookieJar {
  private readonly cookies = new Map<string, string>();

  store(setCookie: string | string[] | undefined): void {
    if (!setCookie) {
      return;
    }
    const headers = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const header of headers) {
      const pair = header.split(';')[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq === -1) {
        continue;
      }
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  drop(name: string): void {
    this.cookies.delete(name);
  }

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

export interface TestApp {
  app: FastifyInstance;
  container: Container;
  mailer: TestMailer;
  origin: string;
  close(): Promise<void>;
}

export interface RenderedMail {
  template: string;
  params: Record<string, string>;
}

export function renderedMail(message: EmailMessage | undefined): RenderedMail | undefined {
  return message ? (JSON.parse(message.text) as RenderedMail) : undefined;
}

/** The student invitation is a magic link whose landing page (/welcome) carries
 *  the domain invite token in its query — this digs it out of the mail. */
export function inviteTokenOf(message: EmailMessage | undefined): string | undefined {
  const rendered = renderedMail(message);
  if (!rendered || rendered.template !== 'magicLink') {
    return undefined;
  }
  const magicUrl = new URL(rendered.params.url!);
  const callback = magicUrl.searchParams.get('callbackURL');
  return callback ? (new URL(callback).searchParams.get('token') ?? undefined) : undefined;
}

/** The Trabajador's full entry path at the HTTP seam: click the captured magic
 *  invitation (session minted, cookie captured), then the welcome card's accept
 *  tap. No password is ever created. Returns their request headers with the
 *  pre-org signed cookie cache dropped. */
export async function enterByMagicLink(
  app: FastifyInstance,
  mailer: TestMailer,
  email: string,
  origin: string,
): Promise<() => { origin: string; cookie: string }> {
  const jar = new CookieJar();
  const headers = () => ({ origin, cookie: jar.header() });
  const message = mailer.to(email)[0]!;
  const rendered = renderedMail(message)!;
  expect(rendered.template).toBe('magicLink');
  const token = inviteTokenOf(message)!;
  expect(token).toBeTruthy();
  const magicUrl = new URL(rendered.params.url!);
  const visit = await app.inject({ method: 'GET', url: `${magicUrl.pathname}${magicUrl.search}` });
  expect([302, 307]).toContain(visit.statusCode);
  jar.store(visit.headers['set-cookie']);
  const accepted = await app.inject({
    method: 'POST',
    url: '/api/organizations/invites/accept',
    headers: headers(),
    payload: { token },
  });
  expect(accepted.statusCode).toBe(200);
  jar.drop('better-auth.session_data');
  return headers;
}

export async function buildTestApp(): Promise<TestApp> {
  const database = await createTestDatabase();
  let container: Container | undefined;
  try {
    await runMigrations(database.url);
    const mailer = new TestMailer();
    const config: ServerConfig = {
      port: 0,
      host: '127.0.0.1',
      publicUrl: TEST_AUTH_BASE_URL,
      clientOrigins: [TEST_STUDENT_PORTAL_URL, TEST_ADMIN_APP_URL],
      requestLogging: false,
      deliveryExpirySeconds: 3600,
      container: {
        databaseUrl: database.url,
        authBaseURL: TEST_AUTH_BASE_URL,
        authSecret: 'test-secret-0123456789abcdef-0123456789abcdef',
        trustedOrigins: [TEST_STUDENT_PORTAL_URL, TEST_ADMIN_APP_URL],
        credentialStoreKey: randomBytes(32).toString('base64'),
        studentPortalUrl: TEST_STUDENT_PORTAL_URL,
        adminAppUrl: TEST_ADMIN_APP_URL,
        deliveryExpirySeconds: 3600,
        logging: { level: 'error' },
      },
    };
    container = await createContainer(config, {
      adapters: { email: mailer, templates: new EchoTemplateRenderer() },
    });
    const app = await buildServer(config, container);
    return {
      app,
      container,
      mailer,
      origin: TEST_AUTH_BASE_URL,
      close: async () => {
        try {
          await app.close();
        } finally {
          await database.drop();
        }
      },
    };
  } catch (err) {
    await container?.close();
    await database.drop();
    throw err;
  }
}
