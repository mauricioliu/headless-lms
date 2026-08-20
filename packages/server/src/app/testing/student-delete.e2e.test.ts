import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, CookieJar, type TestApp } from './test-app.js';

let app: FastifyInstance;
let harness: TestApp;
let courseId: string;
let activityIds: string[];
let headers: () => { origin: string; cookie: string };

interface Learner {
  orgUserId: string;
  email: string;
  headers: () => { origin: string; cookie: string };
}

async function enrollStudent(email: string, firstName: string): Promise<Learner> {
  const jar = new CookieJar();
  const worker = () => ({ origin: harness.origin, cookie: jar.header() });
  const invite = await app.inject({
    method: 'POST',
    url: '/api/organizations/invites',
    headers: headers(),
    payload: { email, firstName, lastName: 'Pérez', role: 'student' },
  });
  expect(invite.statusCode).toBe(201);
  const rendered = JSON.parse(harness.mailer.to(email)[0]!.text) as {
    params: { url: string };
  };
  const magicUrl = new URL(rendered.params.url);
  const token = new URL(magicUrl.searchParams.get('callbackURL')!).searchParams.get('token');
  expect(token).toBeTruthy();
  const visit = await app.inject({ method: 'GET', url: `${magicUrl.pathname}${magicUrl.search}` });
  expect([302, 307]).toContain(visit.statusCode);
  jar.store(visit.headers['set-cookie']);
  const accept = await app.inject({
    method: 'POST',
    url: '/api/organizations/invites/accept',
    headers: worker(),
    payload: { token },
  });
  expect(accept.statusCode).toBe(200);
  jar.drop('better-auth.session_data');

  const viewer = await app.inject({ method: 'GET', url: '/api/learn/viewer', headers: worker() });
  expect(viewer.statusCode).toBe(200);
  const orgUserId = viewer.json().orgUserId as string;
  const entitlement = await app.inject({
    method: 'POST',
    url: '/api/entitlements',
    headers: headers(),
    payload: { orgUserId, contentId: courseId, expiresAt: null },
  });
  expect(entitlement.statusCode).toBe(201);
  return { orgUserId, email, headers: worker };
}

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
      email: 'registro@nuvora.test',
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
    payload: { name: 'Faena Registro', slug: 'faena-registro' },
  });
  expect(org.statusCode).toBe(201);
  jar.drop('better-auth.session_data');

  const course = await app.inject({
    method: 'POST',
    url: '/api/courses',
    headers: headers(),
    payload: { title: 'Ley Karin · Registro', description: 'Curso piloto', category: 'compliance' },
  });
  expect(course.statusCode).toBe(201);
  courseId = course.json().id as string;

  const activityIds_: string[] = [];
  for (let i = 0; i < 2; i++) {
    const module = await app.inject({
      method: 'POST',
      url: `/api/courses/${courseId}/modules`,
      headers: headers(),
      payload: { title: `Segmento ${i + 1}` },
    });
    expect(module.statusCode).toBe(200);
    const moduleId = (
      module.json().find((m: { title: string }) => m.title === `Segmento ${i + 1}`) as {
        id: string;
      }
    ).id;
    const activity = await app.inject({
      method: 'POST',
      url: `/api/courses/${courseId}/modules/${moduleId}/activities`,
      headers: headers(),
      payload: {},
    });
    expect(activity.statusCode).toBe(200);
  }
  const activities = await app.inject({
    method: 'GET',
    url: `/api/courses/${courseId}/activities`,
    headers: headers(),
  });
  for (const row of activities.json()) {
    activityIds_.push(row.id as string);
  }
  expect(activityIds_).toHaveLength(2);
  activityIds = activityIds_;

  const evaluation = await app.inject({
    method: 'PUT',
    url: `/api/courses/${courseId}/evaluation`,
    headers: headers(),
    payload: {
      cutoff: 70,
      feedbackMode: 'score_only',
      questions: [
        {
          id: 'q1',
          prompt: '¿Pregunta?',
          options: [
            { id: 'a', text: 'Sí' },
            { id: 'b', text: 'No' },
          ],
          correctOptionId: 'a',
        },
      ],
    },
  });
  expect(evaluation.statusCode).toBe(200);

  const published = await app.inject({
    method: 'PATCH',
    url: `/api/courses/${courseId}`,
    headers: headers(),
    payload: { status: 'published' },
  });
  expect(published.statusCode).toBe(200);
}, 240_000);

afterAll(async () => {
  await harness?.close();
}, 60_000);

describe('student delete: the registro is append-only (evidence guard)', () => {
  it('refuses 409 for a Trabajador with Intentos — the Intentos stay queryable', async () => {
    const learner = await enrollStudent('con.intentos@faena.test', 'Ivonne');
    for (const activityId of activityIds) {
      const report = await app.inject({
        method: 'POST',
        url: '/api/learn/progress',
        headers: learner.headers(),
        payload: { activity: activityId, reports: [{ completed: true }] },
      });
      expect(report.statusCode).toBe(200);
    }
    const start = await app.inject({
      method: 'POST',
      url: `/api/learn/courses/${courseId}/evaluation/attempts`,
      headers: learner.headers(),
    });
    expect(start.statusCode).toBe(201);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/students/${learner.orgUserId}`,
      headers: headers(),
    });
    expect(del.statusCode).toBe(409);
    expect(del.json().error).toBe('conflict');
    expect(del.json().message).toContain('evidence');

    const latest = await app.inject({
      method: 'GET',
      url: `/api/learn/courses/${courseId}/evaluation/attempts/latest`,
      headers: learner.headers(),
    });
    expect(latest.statusCode).toBe(200);
    expect(latest.json().attemptNumber).toBe(1);
  }, 120_000);

  it('refuses 409 for a Trabajador with avance only — the record stays queryable (no more FK 500)', async () => {
    const learner = await enrollStudent('solo.avance@faena.test', 'Álvaro');
    const report = await app.inject({
      method: 'POST',
      url: '/api/learn/progress',
      headers: learner.headers(),
      payload: { activity: activityIds[0], reports: [{ completed: true }] },
    });
    expect(report.statusCode).toBe(200);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/students/${learner.orgUserId}`,
      headers: headers(),
    });
    expect(del.statusCode).toBe(409);
    expect(del.json().error).toBe('conflict');

    const progress = await app.inject({
      method: 'GET',
      url: `/api/learn/courses/${courseId}/progress`,
      headers: learner.headers(),
    });
    expect(progress.statusCode).toBe(200);
    expect(progress.json().percent).toBe(50);
  }, 120_000);

  it('deletes a zero-evidence Trabajador (ingest mistake), cascading their entitlements', async () => {
    const learner = await enrollStudent('sin.evidencia@faena.test', 'Sinidia');

    const grantsBefore = await app.inject({
      method: 'GET',
      url: `/api/entitlements?page=1&pageSize=50&orgUserId=${learner.orgUserId}&contentId=${courseId}`,
      headers: headers(),
    });
    expect(grantsBefore.json().total).toBe(1);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/students/${learner.orgUserId}`,
      headers: headers(),
    });
    expect(del.statusCode).toBe(204);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/students/${learner.orgUserId}`,
      headers: headers(),
    });
    expect(detail.statusCode).toBe(404);
    const grantsAfter = await app.inject({
      method: 'GET',
      url: `/api/entitlements?page=1&pageSize=50&orgUserId=${learner.orgUserId}&contentId=${courseId}`,
      headers: headers(),
    });
    expect(grantsAfter.json().total).toBe(0);
  }, 120_000);
});
