import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InlineAutomationEngine } from '@headless-lms/adapter-defaults/workflows';
import { buildTestApp, CookieJar, TEST_ADMIN_APP_URL, type TestApp } from './test-app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let harness: TestApp;

beforeAll(async () => {
  harness = await buildTestApp();
  app = harness.app;
}, 180_000);

afterAll(async () => {
  await harness?.close();
}, 60_000);

/** Signs up + creates the org → the caller ends up the org's owner. */
async function bootstrapOwner(email: string, slug: string): Promise<() => { origin: string; cookie: string }> {
  const jar = new CookieJar();
  const headers = () => ({ origin: harness.origin, cookie: jar.header() });
  const signup = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: headers(),
    payload: { email, password: 'operator-password-1', name: 'Ana Owner' },
  });
  expect(signup.statusCode).toBeLessThan(400);
  jar.store(signup.headers['set-cookie']);
  const org = await app.inject({
    method: 'POST',
    url: '/api/organizations',
    headers: headers(),
    payload: { name: 'Faena Automations', slug },
  });
  expect(org.statusCode).toBeLessThan(400);
  jar.drop('better-auth.session_data');
  return headers;
}

describe('v1 automation engine', () => {
  it('uses the Inline container default', () => {
    expect(harness.container.automationEngine).toBeInstanceOf(InlineAutomationEngine);
  });
});

describe('automations HTTP surface is owner-only', () => {
  it('answers 403 to a non-owner staff member on every automations route', async () => {
    const owner = await bootstrapOwner('owner.automations@nuvora.test', 'faena-automations');

    // The member invite keeps its set-password flow: invite → set password →
    // accept — this is exactly what the admin app's /invite page drives.
    const invite = await app.inject({
      method: 'POST',
      url: '/api/organizations/invites',
      headers: owner(),
      payload: { email: 'manager.automations@faena.test', role: 'admin' },
    });
    expect(invite.statusCode).toBeLessThan(400);
    const rendered = JSON.parse(harness.mailer.to('manager.automations@faena.test')[0]!.text) as {
      params: { inviteUrl: string };
    };
    const inviteUrl = new URL(rendered.params.inviteUrl);
    expect(`${inviteUrl.origin}${inviteUrl.pathname}`).toBe(`${TEST_ADMIN_APP_URL}/invite`);
    const token = inviteUrl.searchParams.get('token')!;
    expect(token).toBeTruthy();

    const jar = new CookieJar();
    const member = () => ({ origin: harness.origin, cookie: jar.header() });
    const signup = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: member(),
      payload: { email: 'manager.automations@faena.test', password: 'member-password-1', name: 'Rosa Admin' },
    });
    expect(signup.statusCode).toBeLessThan(400);
    jar.store(signup.headers['set-cookie']);
    const accept = await app.inject({
      method: 'POST',
      url: '/api/organizations/invites/accept',
      headers: member(),
      payload: { token },
    });
    expect(accept.statusCode).toBeLessThan(400);
    // The signed cookie cache still holds the pre-org session; drop it so the
    // guard re-resolves the session server-side.
    jar.drop('better-auth.session_data');

    const createBody = {
      name: 'recordatorio prohibido',
      trigger: 'progress.record.completed',
      actions: [{ type: 'sendEmail', input: { template: 'courseCompleted' } }],
    };
    const reads = await Promise.all([
      app.inject({ method: 'GET', url: '/api/automations', headers: member() }),
      app.inject({ method: 'GET', url: '/api/automations/actions', headers: member() }),
      app.inject({ method: 'GET', url: '/api/automations/triggers', headers: member() }),
      app.inject({ method: 'POST', url: '/api/automations', headers: member(), payload: createBody }),
      app.inject({ method: 'GET', url: '/api/automations/aut_x/runs', headers: member() }),
    ]);
    for (const res of reads) {
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe('forbidden');
    }

    const ownerList = await app.inject({ method: 'GET', url: '/api/automations', headers: owner() });
    expect(ownerList.statusCode).toBe(200);
    expect(ownerList.json()).toEqual([]);
  }, 120_000);
});
