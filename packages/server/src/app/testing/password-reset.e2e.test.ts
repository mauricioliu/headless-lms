import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestApp,
  CookieJar,
  TEST_ADMIN_APP_URL,
  TEST_AUTH_BASE_URL,
  TEST_STUDENT_PORTAL_URL,
  type TestApp,
} from './test-app.js';

let app: FastifyInstance;
let harness: TestApp;

beforeAll(async () => {
  harness = await buildTestApp();
  app = harness.app;
}, 180_000);

afterAll(async () => {
  await harness?.close();
}, 60_000);

interface RenderedReset {
  template: string;
  params: { resetUrl: string };
}

/** The reset mail lands via a background hook; give it a moment to arrive. */
async function capturedReset(to: string): Promise<RenderedReset | undefined> {
  for (let i = 0; i < 20; i++) {
    const message = harness.mailer.to(to).at(-1);
    const rendered = message ? (JSON.parse(message.text) as RenderedReset) : undefined;
    if (rendered?.template === 'passwordReset') {
      return rendered;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return undefined;
}

/** Signs up + creates the org, leaving the caller with an owner membership. */
async function bootstrapStaff(email: string, name: string): Promise<void> {
  const jar = new CookieJar();
  const headers = () => ({ origin: harness.origin, cookie: jar.header() });
  const signup = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: headers(),
    payload: { email, password: 'original-password-1', name },
  });
  jar.store(signup.headers['set-cookie']);
  const org = await app.inject({
    method: 'POST',
    url: '/api/organizations',
    headers: headers(),
    payload: { name: 'Faena Reset', slug: 'faena-reset' },
  });
  expect(org.statusCode).toBeLessThan(400);
}

/** Invites + enters by magic link + accepts, leaving the Trabajador active. */
async function bootstrapStudent(email: string, firstName: string, lastName: string): Promise<void> {
  const owner = new CookieJar();
  const ownerHeaders = () => ({ origin: harness.origin, cookie: owner.header() });
  const signup = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: ownerHeaders(),
    payload: { email: 'operador-reset@nuvora.test', password: 'operator-password-1', name: 'Oper' },
  });
  expect(signup.statusCode).toBeLessThan(400);
  owner.store(signup.headers['set-cookie']);
  const org = await app.inject({
    method: 'POST',
    url: '/api/organizations',
    headers: ownerHeaders(),
    payload: { name: 'Faena Reset Est', slug: 'faena-reset-est' },
  });
  expect(org.statusCode).toBeLessThan(400);
  // The signed cookie cache still holds the pre-org session; drop it so the
  // invite route re-resolves the session server-side.
  owner.drop('better-auth.session_data');

  const invite = await app.inject({
    method: 'POST',
    url: '/api/organizations/invites',
    headers: ownerHeaders(),
    payload: { email, role: 'student', firstName, lastName },
  });
  expect(invite.statusCode).toBeLessThan(400);
  const studentInvite = await capturedInviteToken(email);
  expect(studentInvite).toBeTruthy();

  const magic = await capturedMagicUrl(email);
  expect(magic).toBeTruthy();
  const jar = new CookieJar();
  const headers = () => ({ origin: TEST_STUDENT_PORTAL_URL, cookie: jar.header() });
  const visit = await app.inject({ method: 'GET', url: `${magic!.pathname}${magic!.search}` });
  expect([302, 307]).toContain(visit.statusCode);
  jar.store(visit.headers['set-cookie']);
  const accept = await app.inject({
    method: 'POST',
    url: '/api/organizations/invites/accept',
    headers: headers(),
    payload: { token: studentInvite },
  });
  expect(accept.statusCode).toBeLessThan(400);
}

async function capturedInviteToken(to: string): Promise<string | undefined> {
  for (let i = 0; i < 20; i++) {
    const message = harness.mailer.to(to).at(-1);
    if (message) {
      const rendered = JSON.parse(message.text) as {
        template: string;
        params: { url: string };
      };
      if (rendered.template === 'magicLink') {
        const callback = new URL(rendered.params.url).searchParams.get('callbackURL');
        const token = callback ? new URL(callback).searchParams.get('token') : null;
        if (token) {
          return token;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return undefined;
}

async function capturedMagicUrl(to: string): Promise<URL | undefined> {
  for (let i = 0; i < 20; i++) {
    const message = harness.mailer.to(to).at(-1);
    if (message) {
      const rendered = JSON.parse(message.text) as {
        template: string;
        params: { url: string };
      };
      if (rendered.template === 'magicLink') {
        return new URL(rendered.params.url);
      }
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return undefined;
}

async function requestReset(email: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/request-password-reset',
    headers: { origin: harness.origin },
    payload: { email },
  });
}

describe('password reset', () => {
  it('answers the same generic confirmation for an unknown address and sends no mail', async () => {
    const before = harness.mailer.sent.length;
    const unknown = await requestReset('nadie@faena.test');
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json()).toHaveProperty('status', true);
    expect(harness.mailer.sent.length).toBe(before);
  });

  it('sends the reset mail with a real URL to the admin set-password page for staff', async () => {
    const email = 'admin.reset@faena.test';
    await bootstrapStaff(email, 'Rosa Admin');

    const res = await requestReset(email);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty('status', true);

    const rendered = await capturedReset(email);
    expect(rendered).toBeTruthy();
    const url = new URL(rendered!.params.resetUrl);
    expect(url.origin).toBe(TEST_AUTH_BASE_URL);
    expect(url.pathname).toMatch(/^\/api\/auth\/reset-password\/.+$/);
    expect(url.searchParams.get('callbackURL')).toBe(`${TEST_ADMIN_APP_URL}/reset-password`);

    const token = url.pathname.split('/').at(-1)!;
    const visit = await app.inject({
      method: 'GET',
      url: `/api/auth/reset-password/${token}?callbackURL=${encodeURIComponent(
        `${TEST_ADMIN_APP_URL}/reset-password`,
      )}`,
      headers: { origin: harness.origin },
    });
    expect([302, 307]).toContain(visit.statusCode);
    expect(visit.headers.location).toBe(`${TEST_ADMIN_APP_URL}/reset-password?token=${token}`);

    const consume = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: { origin: TEST_ADMIN_APP_URL },
      payload: { newPassword: 'nueva-password-1', token },
    });
    expect(consume.statusCode).toBe(200);

    const oldPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: TEST_ADMIN_APP_URL },
      payload: { email, password: 'original-password-1' },
    });
    expect(oldPassword.statusCode).toBe(401);

    const newPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: TEST_ADMIN_APP_URL },
      payload: { email, password: 'nueva-password-1' },
    });
    expect(newPassword.statusCode).toBeLessThan(400);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: { origin: TEST_ADMIN_APP_URL },
      payload: { newPassword: 'otra-password-1', token },
    });
    expect(replay.statusCode).toBe(400);
  }, 120_000);

  it('routes the reset URL to the student set-password page for a Trabajador', async () => {
    const email = 'trabajador.reset@faena.test';
    await bootstrapStudent(email, 'Juana', 'Pérez');

    const res = await requestReset(email);
    expect(res.statusCode).toBe(200);

    const rendered = await capturedReset(email);
    expect(rendered).toBeTruthy();
    const url = new URL(rendered!.params.resetUrl);
    expect(url.searchParams.get('callbackURL')).toBe(
      `${TEST_STUDENT_PORTAL_URL}/reset-password`,
    );
  }, 120_000);
});
