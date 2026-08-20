import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  buildTestApp,
  CookieJar,
  TEST_STUDENT_PORTAL_URL,
  type TestApp,
} from './test-app.js';

let app: FastifyInstance;
let harness: TestApp;
let courseId: string;
let headers: () => { origin: string; cookie: string };

const TRABAJADORA = 'sofia.diaz@faena.test';

beforeAll(async () => {
  harness = await buildTestApp();
  app = harness.app;

  const jar = new CookieJar();
  headers = () => ({ origin: harness.origin, cookie: jar.header() });
  const signup = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: headers(),
    payload: {
      email: 'operador@nuvora.test',
      password: 'pilot-password-1',
      name: 'Ana Admin',
    },
  });
  expect(signup.statusCode).toBeLessThan(400);
  jar.store(signup.headers['set-cookie']);
  const org = await app.inject({
    method: 'POST',
    url: '/api/organizations',
    headers: headers(),
    payload: { name: 'Faena Mágica', slug: 'faena-magica' },
  });
  expect(org.statusCode).toBe(201);
  jar.drop('better-auth.session_data');

  const course = await app.inject({
    method: 'POST',
    url: '/api/courses',
    headers: headers(),
    payload: { title: 'Ley Karin', description: 'Curso piloto', category: 'compliance' },
  });
  expect(course.statusCode).toBe(201);
  courseId = course.json().id as string;
  const published = await app.inject({
    method: 'PATCH',
    url: `/api/courses/${courseId}`,
    headers: headers(),
    payload: { status: 'published' },
  });
  expect(published.statusCode).toBe(200);
}, 180_000);

afterAll(async () => {
  await harness?.close();
}, 60_000);

describe('magic student invitation (historia 1: entrar sin contraseña)', () => {
  it('ingests the Ola and captures a magic-link invitation mail', async () => {
    const csv = [
      'RUT,Nombre,Teléfono,Correo',
      '16.666.777-8,Sofía Díaz,+56 9 6111 2222,sofia.diaz@faena.test',
    ].join('\r\n');
    const ola = await app.inject({
      method: 'POST',
      url: '/api/waves',
      headers: headers(),
      payload: { name: 'Ola 1', courseId, csv },
    });
    expect(ola.statusCode).toBe(201);
    expect(ola.json()).toMatchObject({ memberCount: 1, invited: 1 });

    const captured = harness.mailer.to(TRABAJADORA);
    expect(captured).toHaveLength(1);
    const rendered = JSON.parse(captured[0]!.text) as {
      template: string;
      params: { url: string };
    };
    expect(rendered.template).toBe('magicLink');

    const magicUrl = new URL(rendered.params.url);
    expect(`${magicUrl.origin}${magicUrl.pathname}`).toBe(
      `${harness.origin}/api/auth/magic-link/verify`,
    );
    const callback = new URL(magicUrl.searchParams.get('callbackURL')!);
    expect(`${callback.origin}${callback.pathname}`).toBe(`${TEST_STUDENT_PORTAL_URL}/welcome`);
    const inviteToken = callback.searchParams.get('token');
    expect(inviteToken).toBeTruthy();
  }, 120_000);

  it('the Trabajador follows the link: session established, Curso visible, no password anywhere', async () => {
    const rendered = JSON.parse(harness.mailer.to(TRABAJADORA)[0]!.text) as {
      params: { url: string };
    };
    const magicUrl = new URL(rendered.params.url);
    const callback = magicUrl.searchParams.get('callbackURL')!;

    // The click itself: fresh browser, no cookies.
    const visit = await app.inject({ method: 'GET', url: `${magicUrl.pathname}${magicUrl.search}` });
    expect([302, 307]).toContain(visit.statusCode);
    expect(visit.headers.location).toBe(callback);
    expect(visit.headers['set-cookie']).toBeTruthy();

    // The session the redirect set is a real one, and the Curso is already
    // visible — the Ola inscribed her before she ever arrived.
    const jar = new CookieJar();
    jar.store(visit.headers['set-cookie']);
    const worker = () => ({ origin: TEST_STUDENT_PORTAL_URL, cookie: jar.header() });

    const learn = await app.inject({ method: 'GET', url: '/api/learn/courses', headers: worker() });
    expect(learn.statusCode).toBe(200);
    expect(learn.json().map((c: { id: string }) => c.id)).toContain(courseId);

    // Passwordless means passwordless: no credential exists to sign in with.
    const passwordAttempt = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: TEST_STUDENT_PORTAL_URL },
      payload: { email: TRABAJADORA, password: 'cualquier-cosa-1' },
    });
    expect(passwordAttempt.statusCode).toBeGreaterThanOrEqual(400);

    // The welcome card's tap: accept the invitation with the minted session.
    const inviteToken = new URL(callback).searchParams.get('token')!;
    const accept = await app.inject({
      method: 'POST',
      url: '/api/organizations/invites/accept',
      headers: worker(),
      payload: { token: inviteToken },
    });
    expect(accept.statusCode).toBe(200);

    const students = await app.inject({ method: 'GET', url: '/api/students', headers: headers() });
    const sofia = students
      .json()
      .rows.find((s: { email: string }) => s.email === TRABAJADORA);
    expect(sofia).toMatchObject({ status: 'active' });
  }, 120_000);

  it('the magic token is one-time: a replay bounces back with an error, no second session', async () => {
    const rendered = JSON.parse(harness.mailer.to(TRABAJADORA)[0]!.text) as {
      params: { url: string };
    };
    const magicUrl = new URL(rendered.params.url);
    const callback = magicUrl.searchParams.get('callbackURL')!;

    const replay = await app.inject({ method: 'GET', url: `${magicUrl.pathname}${magicUrl.search}` });
    expect([302, 307]).toContain(replay.statusCode);
    const location = new URL(replay.headers.location!);
    expect(`${location.origin}${location.pathname}`).toBe(
      `${TEST_STUDENT_PORTAL_URL}/welcome`,
    );
    expect(location.searchParams.get('error')).toBeTruthy();
    expect(location.searchParams.get('token')).toBe(
      new URL(callback).searchParams.get('token'),
    );
  });
});
