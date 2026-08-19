import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, CookieJar, type TestApp } from './test-app.js';

let app: FastifyInstance;
let harness: TestApp;
let courseId: string;
let activityId: string;
let adminHeaders: () => { origin: string; cookie: string };
let studentHeaders: () => { origin: string; cookie: string };

/** The Segment under test: authored with the video completion rule. */
const SEGMENT_SETTINGS = {
  title: 'Qué es el acoso laboral',
  published: true,
  completion: 'video',
};

/** A watch report as the player's tracker emits it. */
const watchReport = (seconds: number, furthest: number, duration: number) => ({
  asset: 'ast_segmento_1',
  seconds,
  furthest,
  watched: furthest,
  duration,
});

const DURATION = 180;

async function report(reports: unknown[]): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/learn/progress',
    headers: studentHeaders(),
    payload: { activity: activityId, reports },
  });
  expect(response.statusCode).toBe(200);
  return (response.json() as { status: string }).status;
}

async function courseProgress(): Promise<{
  activities: Record<string, string>;
  percent: number;
  completed: boolean;
  positions: Record<string, unknown>;
}> {
  const response = await app.inject({
    method: 'GET',
    url: `/api/learn/courses/${courseId}/progress`,
    headers: studentHeaders(),
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

beforeAll(async () => {
  harness = await buildTestApp();
  app = harness.app;

  const adminJar = new CookieJar();
  adminHeaders = () => ({ origin: harness.origin, cookie: adminJar.header() });
  const signup = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: adminHeaders(),
    payload: {
      email: 'operador.segmentos@nuvora.test',
      password: 'pilot-password-1',
      name: 'Operador Nuvora',
    },
  });
  expect(signup.statusCode).toBeLessThan(400);
  adminJar.store(signup.headers['set-cookie']);
  const org = await app.inject({
    method: 'POST',
    url: '/api/organizations',
    headers: adminHeaders(),
    payload: { name: 'Faena Segmentos', slug: 'faena-segmentos' },
  });
  expect(org.statusCode).toBe(201);
  adminJar.drop('better-auth.session_data');

  const course = await app.inject({
    method: 'POST',
    url: '/api/courses',
    headers: adminHeaders(),
    payload: { title: 'Ley Karin', description: 'Curso piloto', category: 'compliance' },
  });
  expect(course.statusCode).toBe(201);
  courseId = course.json().id as string;

  const module = await app.inject({
    method: 'POST',
    url: `/api/courses/${courseId}/modules`,
    headers: adminHeaders(),
    payload: { title: 'Segmento 1' },
  });
  expect(module.statusCode).toBe(200);
  const moduleId = (module.json() as { id: string; title: string }[]).find(
    (m) => m.title === 'Segmento 1',
  )?.id;
  expect(moduleId).toBeTruthy();

  const activity = await app.inject({
    method: 'POST',
    url: `/api/courses/${courseId}/modules/${moduleId}/activities`,
    headers: adminHeaders(),
    payload: { settings: SEGMENT_SETTINGS },
  });
  expect(activity.statusCode).toBe(200);

  const published = await app.inject({
    method: 'PATCH',
    url: `/api/courses/${courseId}`,
    headers: adminHeaders(),
    payload: { status: 'published' },
  });
  expect(published.statusCode).toBe(200);

  const activities = await app.inject({
    method: 'GET',
    url: `/api/courses/${courseId}/activities`,
    headers: adminHeaders(),
  });
  expect(activities.statusCode).toBe(200);
  const authored = (activities.json() as { id: string; settings: unknown }[]).find(
    (a) => (a.settings as { completion?: string })?.completion === 'video',
  );
  expect(authored).toBeTruthy();
  activityId = authored!.id;

  const email = 'trabajadora.segmento@faena.test';
  const invite = await app.inject({
    method: 'POST',
    url: '/api/organizations/invites',
    headers: adminHeaders(),
    payload: { email, firstName: 'Juana', lastName: 'Pérez', role: 'student' },
  });
  expect(invite.statusCode).toBe(201);
  const captured = harness.mailer.to(email);
  expect(captured).toHaveLength(1);
  const rendered = JSON.parse(captured[0]!.text) as { params: { inviteUrl: string } };
  const token = new URL(rendered.params.inviteUrl).searchParams.get('token');
  expect(token).toBeTruthy();

  const studentJar = new CookieJar();
  studentHeaders = () => ({ origin: harness.origin, cookie: studentJar.header() });
  const studentSignup = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: studentHeaders(),
    payload: { email, password: 'student-password-1', name: 'Juana Pérez' },
  });
  expect(studentSignup.statusCode).toBeLessThan(400);
  studentJar.store(studentSignup.headers['set-cookie']);
  const accepted = await app.inject({
    method: 'POST',
    url: '/api/organizations/invites/accept',
    headers: studentHeaders(),
    payload: { token },
  });
  expect(accepted.statusCode).toBe(200);
  studentJar.drop('better-auth.session_data');

  const viewer = await app.inject({
    method: 'GET',
    url: '/api/learn/viewer',
    headers: studentHeaders(),
  });
  expect(viewer.statusCode).toBe(200);
  const entitlement = await app.inject({
    method: 'POST',
    url: '/api/entitlements',
    headers: adminHeaders(),
    payload: {
      orgUserId: (viewer.json() as { orgUserId: string }).orgUserId,
      contentId: courseId,
      expiresAt: null,
    },
  });
  expect(entitlement.statusCode).toBe(201);
}, 180_000);

afterAll(async () => {
  await harness?.close();
}, 60_000);

describe('Segment playback rules over the Learn API', () => {
  it('exposes the authored Segment to the Trabajador with its rule and structure', async () => {
    const course = await app.inject({
      method: 'GET',
      url: `/api/learn/courses/${courseId}`,
      headers: studentHeaders(),
    });
    expect(course.statusCode).toBe(200);

    const activities = await app.inject({
      method: 'GET',
      url: `/api/learn/courses/${courseId}/activities`,
      headers: studentHeaders(),
    });
    expect(activities.statusCode).toBe(200);
    const rows = activities.json() as { id: string; settings: unknown }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(activityId);
    expect((rows[0]!.settings as { completion?: string })?.completion).toBe('video');
  });

  it('opening and watching partway keeps the Segment in progress and stores the resume state', async () => {
    await expect(report([])).resolves.toBe('in-progress');
    await expect(report([watchReport(45, 45, DURATION)])).resolves.toBe('in-progress');

    const progress = await courseProgress();
    expect(progress.activities[activityId]).toBe('in-progress');
    expect(progress.percent).toBe(0);
    // The exact per-asset state the player re-hydrates on the next session:
    // `seconds` resumes playback, `furthest` re-arms the no-forward-seek gate.
    expect(progress.positions[activityId]).toEqual({
      ast_segmento_1: { seconds: 45, furthest: 45, watched: 45, duration: DURATION },
    });
  });

  it('a manual claim cannot complete a Segment — only the end of the video can', async () => {
    await expect(report([{ completed: true }])).resolves.toBe('in-progress');
    await expect(report([watchReport(90, 90, DURATION), { completed: true }])).resolves.toBe(
      'in-progress',
    );
    // Seek-to-end without the continuity trail: furthest stays behind the end.
    await expect(report([watchReport(DURATION, 171, DURATION)])).resolves.toBe('in-progress');
    const progress = await courseProgress();
    expect(progress.activities[activityId]).toBe('in-progress');
  });

  it('the end-of-video report auto-completes the Segment and the course', async () => {
    await expect(report([watchReport(DURATION, DURATION, DURATION)])).resolves.toBe('completed');

    const progress = await courseProgress();
    expect(progress.activities[activityId]).toBe('completed');
    expect(progress.percent).toBe(100);
    expect(progress.completed).toBe(true);
  });
});
