import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, CookieJar, TEST_STUDENT_PORTAL_URL, type TestApp } from './test-app.js';

let app: FastifyInstance;
let harness: TestApp;

beforeAll(async () => {
  harness = await buildTestApp();
  app = harness.app;
}, 180_000);

afterAll(async () => {
  await harness?.close();
}, 60_000);

describe('Sustrato delivery smoke', () => {
  it('exposes the deployment branding publicly for the pre-session portal', async () => {
    const branding = await app.inject({ method: 'GET', url: '/api/learn/branding' });
    expect(branding.statusCode).toBe(200);
    expect(branding.json()).toEqual({ brandName: 'Nuvora' });
  });

  it('bootstrap → published Curso → invited Trabajador → invite email captured', async () => {
    const owner = {
      email: 'operador@nuvora.test',
      password: 'pilot-password-1',
      name: 'Ana Admin',
    };
    const jar = new CookieJar();
    const headers = () => ({ origin: harness.origin, cookie: jar.header() });

    const signup = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: headers(),
      payload: owner,
    });
    expect(signup.statusCode).toBeLessThan(400);
    jar.store(signup.headers['set-cookie']);
    expect(jar.get('better-auth.session_token')).toBeTruthy();

    const org = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: headers(),
      payload: { name: 'Faena Piloto', slug: 'faena-piloto' },
    });
    expect(org.statusCode).toBe(201);

    jar.drop('better-auth.session_data');

    const coursesBefore = await app.inject({
      method: 'GET',
      url: '/api/courses',
      headers: headers(),
    });
    expect(coursesBefore.statusCode).toBe(200);

    const course = await app.inject({
      method: 'POST',
      url: '/api/courses',
      headers: headers(),
      payload: { title: 'Ley Karin', description: 'Curso piloto', category: 'compliance' },
    });
    expect(course.statusCode).toBe(201);
    expect(course.json().status).toBe('draft');
    const courseId = course.json().id as string;

    const modules = await app.inject({
      method: 'POST',
      url: `/api/courses/${courseId}/modules`,
      headers: headers(),
      payload: { title: 'Segmento 1' },
    });
    expect(modules.statusCode).toBe(200);
    const moduleId = (
      modules.json().find((m: { title: string }) => m.title === 'Segmento 1') as {
        id: string;
      }
    ).id;
    expect(moduleId).toBeTruthy();

    const activities = await app.inject({
      method: 'POST',
      url: `/api/courses/${courseId}/modules/${moduleId}/activities`,
      headers: headers(),
      payload: {},
    });
    expect(activities.statusCode).toBe(200);

    const published = await app.inject({
      method: 'PATCH',
      url: `/api/courses/${courseId}`,
      headers: headers(),
      payload: { status: 'published' },
    });
    expect(published.statusCode).toBe(200);
    expect(published.json().status).toBe('published');

    const trabajadora = { email: 'juana.perez@faena.test', firstName: 'Juana', lastName: 'Pérez' };
    const invite = await app.inject({
      method: 'POST',
      url: '/api/organizations/invites',
      headers: headers(),
      payload: { ...trabajadora, role: 'student' },
    });
    expect(invite.statusCode).toBe(201);

    const captured = harness.mailer.to(trabajadora.email);
    expect(captured).toHaveLength(1);
    const rendered = JSON.parse(captured[0]!.text) as {
      template: string;
      params: { url: string };
    };
    // The invitation IS the magic link: one click, a session, no password.
    expect(rendered.template).toBe('magicLink');
    const magicUrl = new URL(rendered.params.url);
    expect(`${magicUrl.origin}${magicUrl.pathname}`).toBe(
      `${harness.origin}/api/auth/magic-link/verify`,
    );
    const callback = new URL(magicUrl.searchParams.get('callbackURL')!);
    expect(`${callback.origin}${callback.pathname}`).toBe(`${TEST_STUDENT_PORTAL_URL}/welcome`);
    const token = callback.searchParams.get('token');
    expect(token).toBeTruthy();

    const peek = await app.inject({
      method: 'GET',
      url: `/api/organizations/invites/${token}`,
      headers: { origin: harness.origin },
    });
    expect(peek.statusCode).toBe(200);
    expect(peek.json().email).toBe(trabajadora.email);
  }, 120_000);
});
