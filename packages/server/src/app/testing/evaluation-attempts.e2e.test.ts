import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, CookieJar, type TestApp } from './test-app.js';

let app: FastifyInstance;
let harness: TestApp;

interface Staff {
  courseId: string;
  activityIds: string[];
  headers: () => { origin: string; cookie: string };
}

let staff: Staff;

interface Learner {
  orgUserId: string;
  headers: () => { origin: string; cookie: string };
}

const evaluationDoc = (feedbackMode: 'score_only' | 'answer_review') => ({
  cutoff: 70,
  feedbackMode,
  questions: [
    {
      id: 'consentimiento',
      prompt: '¿El silencio significa aceptación?',
      options: [
        { id: 'si', text: 'Sí, mientras no diga que no' },
        { id: 'no', text: 'No, el consentimiento debe ser expreso' },
      ],
      correctOptionId: 'no',
    },
    {
      id: 'terceros',
      prompt: 'Un proveedor amenaza a un trabajador en una reunión. ¿Cómo debe entenderse?',
      options: [
        { id: 'conflicto', text: 'Como un conflicto comercial externo' },
        { id: 'violencia', text: 'Como violencia de terceros en el trabajo' },
        { id: 'privada', text: 'Como una diferencia privada entre personas' },
      ],
      correctOptionId: 'violencia',
    },
    {
      id: 'denuncia',
      prompt: 'Ante una denuncia, ¿qué debe hacer la empresa?',
      options: [
        { id: 'difundir', text: 'Difundir los hechos para prevenir' },
        { id: 'resguardar', text: 'Resguardar, mantener confidencialidad e investigar' },
      ],
      correctOptionId: 'resguardar',
    },
  ],
});

async function inviteStudent(
  email: string,
  firstName: string,
): Promise<() => { origin: string; cookie: string }> {
  const jar = new CookieJar();
  const headers = () => ({ origin: harness.origin, cookie: jar.header() });
  const invite = await app.inject({
    method: 'POST',
    url: '/api/organizations/invites',
    headers: staff.headers(),
    payload: { email, firstName, lastName: 'Pérez', role: 'student' },
  });
  expect(invite.statusCode).toBe(201);
  const captured = harness.mailer.to(email);
  expect(captured).toHaveLength(1);
  const rendered = JSON.parse(captured[0]!.text) as { params: { inviteUrl: string } };
  const token = new URL(rendered.params.inviteUrl).searchParams.get('token');
  expect(token).toBeTruthy();
  const signup = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: headers(),
    payload: { email, password: 'student-password-1', name: firstName },
  });
  expect(signup.statusCode).toBeLessThan(400);
  jar.store(signup.headers['set-cookie']);
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

async function entitle(emailHeaders: () => { origin: string; cookie: string }, courseId: string) {
  const viewer = await app.inject({
    method: 'GET',
    url: '/api/learn/viewer',
    headers: emailHeaders(),
  });
  expect(viewer.statusCode).toBe(200);
  const orgUserId = viewer.json().orgUserId as string;
  const entitlement = await app.inject({
    method: 'POST',
    url: '/api/entitlements',
    headers: staff.headers(),
    payload: { orgUserId, contentId: courseId, expiresAt: null },
  });
  expect(entitlement.statusCode).toBe(201);
  return orgUserId;
}

async function enrollStudent(email: string, firstName: string, courseId: string) {
  const headers = await inviteStudent(email, firstName);
  const orgUserId = await entitle(headers, courseId);
  return { orgUserId, headers } satisfies Learner;
}

async function createPublishedCourse(
  title: string,
  feedbackMode: 'score_only' | 'answer_review',
  withEvaluation: boolean,
  segmentCount = 2,
): Promise<{ courseId: string; activityIds: string[] }> {
  const course = await app.inject({
    method: 'POST',
    url: '/api/courses',
    headers: staff.headers(),
    payload: { title, description: 'Curso piloto', category: 'compliance' },
  });
  expect(course.statusCode).toBe(201);
  const courseId = course.json().id as string;

  const activityIds: string[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const module = await app.inject({
      method: 'POST',
      url: `/api/courses/${courseId}/modules`,
      headers: staff.headers(),
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
      headers: staff.headers(),
      payload: {},
    });
    expect(activity.statusCode).toBe(200);
  }

  const activities = await app.inject({
    method: 'GET',
    url: `/api/courses/${courseId}/activities`,
    headers: staff.headers(),
  });
  expect(activities.statusCode).toBe(200);
  for (const row of activities.json()) {
    activityIds.push(row.id as string);
  }
  expect(activityIds).toHaveLength(segmentCount);

  if (withEvaluation) {
    const put = await app.inject({
      method: 'PUT',
      url: `/api/courses/${courseId}/evaluation`,
      headers: staff.headers(),
      payload: evaluationDoc(feedbackMode),
    });
    expect(put.statusCode).toBe(200);
    expect(JSON.stringify(put.json())).not.toContain('correctOptionId');
  }

  const published = await app.inject({
    method: 'PATCH',
    url: `/api/courses/${courseId}`,
    headers: staff.headers(),
    payload: { status: 'published' },
  });
  expect(published.statusCode).toBe(200);
  return { courseId, activityIds };
}

async function watchAll(headers: () => { origin: string; cookie: string }, activityIds: string[]) {
  for (const activityId of activityIds) {
    const report = await app.inject({
      method: 'POST',
      url: '/api/learn/progress',
      headers: headers(),
      payload: { activity: activityId, reports: [{ completed: true }] },
    });
    expect(report.statusCode).toBe(200);
    expect(report.json().status).toBe('completed');
  }
}

const allCorrect = [
  { questionId: 'consentimiento', optionId: 'no' },
  { questionId: 'terceros', optionId: 'violencia' },
  { questionId: 'denuncia', optionId: 'resguardar' },
];

const twoThirds = [
  { questionId: 'consentimiento', optionId: 'no' },
  { questionId: 'terceros', optionId: 'violencia' },
  { questionId: 'denuncia', optionId: 'difundir' },
];

const allWrong = [
  { questionId: 'consentimiento', optionId: 'si' },
  { questionId: 'terceros', optionId: 'conflicto' },
  { questionId: 'denuncia', optionId: 'difundir' },
];

interface AttemptResponse {
  statusCode: number;
  body: {
    attemptNumber?: number;
    submittedAt?: string | null;
    score?: number | null;
    cutoff?: number | null;
    passed?: boolean | null;
    feedbackMode?: 'score_only' | 'answer_review';
    error?: string;
    questions?: Array<{
      questionId: string;
      prompt: string;
      options: Array<{ id: string; text: string }>;
      selectedOptionId: string;
      correct: boolean;
    }>;
  };
}

async function startAttempt(learner: Learner, courseId: string): Promise<AttemptResponse> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/learn/courses/${courseId}/evaluation/attempts`,
    headers: learner.headers(),
  });
  return { statusCode: res.statusCode, body: res.json() };
}

async function submitAttempt(
  learner: Learner,
  courseId: string,
  attemptNumber: number,
  answers: Array<{ questionId: string; optionId: string }>,
): Promise<AttemptResponse> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/learn/courses/${courseId}/evaluation/attempts/${attemptNumber}/submission`,
    headers: learner.headers(),
    payload: { answers },
  });
  return { statusCode: res.statusCode, body: res.json() };
}

async function latestAttempt(learner: Learner, courseId: string): Promise<AttemptResponse> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/learn/courses/${courseId}/evaluation/attempts/latest`,
    headers: learner.headers(),
  });
  return { statusCode: res.statusCode, body: res.json() };
}

async function courseCompleted(learner: Learner, courseId: string): Promise<boolean | undefined> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/learn/courses/${courseId}/progress`,
    headers: learner.headers(),
  });
  expect(res.statusCode).toBe(200);
  return res.json().completed as boolean;
}

beforeAll(async () => {
  harness = await buildTestApp();
  app = harness.app;

  const jar = new CookieJar();
  const adminHeaders = () => ({ origin: harness.origin, cookie: jar.header() });
  const signup = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: adminHeaders(),
    payload: {
      email: 'intentos@nuvora.test',
      password: 'pilot-password-1',
      name: 'Operador Nuvora',
    },
  });
  expect(signup.statusCode).toBeLessThan(400);
  jar.store(signup.headers['set-cookie']);
  const org = await app.inject({
    method: 'POST',
    url: '/api/organizations',
    headers: adminHeaders(),
    payload: { name: 'Faena Intentos', slug: 'faena-intentos' },
  });
  expect(org.statusCode).toBe(201);
  jar.drop('better-auth.session_data');
  staff = { courseId: '', activityIds: [], headers: adminHeaders };

  const course = await createPublishedCourse('Ley Karin · Intentos', 'answer_review', true);
  staff.courseId = course.courseId;
  staff.activityIds = course.activityIds;
}, 180_000);

afterAll(async () => {
  await harness?.close();
}, 60_000);

describe('Evaluation attempts HTTP seam', () => {
  it('blocks rendir below 100% course progress — the server enforces the gate', async () => {
    const learner = await enrollStudent('bloqueada@faena.test', 'Jorgelina', staff.courseId);

    const watchFirst = await app.inject({
      method: 'POST',
      url: '/api/learn/progress',
      headers: learner.headers(),
      payload: { activity: staff.activityIds[0], reports: [{ completed: true }] },
    });
    expect(watchFirst.statusCode).toBe(200);

    const progress = await app.inject({
      method: 'GET',
      url: `/api/learn/courses/${staff.courseId}/progress`,
      headers: learner.headers(),
    });
    expect(progress.json().percent).toBe(50);

    const blocked = await startAttempt(learner, staff.courseId);
    expect(blocked.statusCode).toBe(403);
    expect(JSON.stringify(blocked.body)).not.toContain('correctOptionId');

    const blockedSubmit = await submitAttempt(learner, staff.courseId, 1, allCorrect);
    expect(blockedSubmit.statusCode).toBe(403);
  });

  it('starts, submits and grades server-side; the key never travels', async () => {
    const learner = await enrollStudent('aprobada@faena.test', 'María', staff.courseId);
    await watchAll(learner.headers, staff.activityIds);

    const start = await startAttempt(learner, staff.courseId);
    expect(start.statusCode).toBe(201);
    expect(start.body).toEqual({
      attemptNumber: 1,
      startedAt: expect.any(String),
      submittedAt: null,
      score: null,
      cutoff: null,
      passed: null,
    });

    const resume = await startAttempt(learner, staff.courseId);
    expect(resume.statusCode).toBe(201);
    expect(resume.body.attemptNumber).toBe(1);

    const submitted = await submitAttempt(learner, staff.courseId, 1, allCorrect);
    expect(submitted.statusCode).toBe(200);
    expect(submitted.body).toMatchObject({
      attemptNumber: 1,
      score: 100,
      cutoff: 70,
      passed: true,
      feedbackMode: 'answer_review',
    });
    expect(JSON.stringify(submitted.body)).not.toContain('correctOptionId');

    const latest = await latestAttempt(learner, staff.courseId);
    expect(latest.statusCode).toBe(200);
    expect(latest.body.score).toBe(100);
    expect(latest.body.passed).toBe(true);
  });

  it('answer_review feedback: hits confirmed, misses never reveal the key', async () => {
    const learner = await enrollStudent('revision@faena.test', 'Daniela', staff.courseId);
    await watchAll(learner.headers, staff.activityIds);
    await startAttempt(learner, staff.courseId);

    const feedback = await submitAttempt(learner, staff.courseId, 1, [
      { questionId: 'consentimiento', optionId: 'si' },
      { questionId: 'terceros', optionId: 'violencia' },
      { questionId: 'denuncia', optionId: 'difundir' },
    ]);
    expect(feedback.statusCode).toBe(200);
    expect(feedback.body.score).toBe(33);
    expect(feedback.body.passed).toBe(false);

    const questions = feedback.body.questions ?? [];
    expect(questions).toHaveLength(3);

    const miss = questions[0];
    expect(miss).toEqual({
      questionId: 'consentimiento',
      prompt: expect.any(String),
      options: [
        { id: 'si', text: expect.any(String) },
        { id: 'no', text: expect.any(String) },
      ],
      selectedOptionId: 'si',
      correct: false,
    });

    const hit = questions[1]!;
    expect(hit.selectedOptionId).toBe('violencia');
    expect(hit.correct).toBe(true);

    for (const question of questions) {
      const serialized = JSON.stringify(question);
      expect(serialized).not.toContain('correctOptionId');
      if (!question.correct) {
        expect(Object.keys(question).sort()).toEqual(
          ['correct', 'options', 'prompt', 'questionId', 'selectedOptionId'].sort(),
        );
      }
    }
  });

  it('score_only feedback carries the score and nothing else', async () => {
    const bare = await createPublishedCourse('Solo puntaje', 'score_only', true);
    const learner = await enrollStudent('solo.puntaje@faena.test', 'Ana', bare.courseId);
    await watchAll(learner.headers, bare.activityIds);
    await startAttempt(learner, bare.courseId);
    const feedback = await submitAttempt(learner, bare.courseId, 1, allWrong);
    expect(feedback.statusCode).toBe(200);
    expect(feedback.body).toMatchObject({
      score: 0,
      cutoff: 70,
      passed: false,
      feedbackMode: 'score_only',
    });
    expect(feedback.body.questions).toBeUndefined();
    expect(JSON.stringify(feedback.body)).not.toContain('prompt');
  });

  it('attempts are unlimited and append-only; the last one stands', async () => {
    const learner = await enrollStudent('reintenta@faena.test', 'Carlos', staff.courseId);
    await watchAll(learner.headers, staff.activityIds);

    await startAttempt(learner, staff.courseId);
    const first = await submitAttempt(learner, staff.courseId, 1, twoThirds);
    expect(first.body).toMatchObject({ attemptNumber: 1, score: 67, passed: false });

    const resubmitted = await submitAttempt(learner, staff.courseId, 1, allCorrect);
    expect(resubmitted.statusCode).toBe(409);

    const secondStart = await startAttempt(learner, staff.courseId);
    expect(secondStart.body.attemptNumber).toBe(2);
    const second = await submitAttempt(learner, staff.courseId, 2, allWrong);
    expect(second.body).toMatchObject({ attemptNumber: 2, score: 0, passed: false });

    const thirdStart = await startAttempt(learner, staff.courseId);
    expect(thirdStart.body.attemptNumber).toBe(3);
    const third = await submitAttempt(learner, staff.courseId, 3, allCorrect);
    expect(third.body).toMatchObject({ attemptNumber: 3, score: 100, passed: true });

    const latest = await latestAttempt(learner, staff.courseId);
    expect(latest.body).toMatchObject({ attemptNumber: 3, score: 100, passed: true });

    const stale = await submitAttempt(learner, staff.courseId, 1, allCorrect);
    expect(stale.statusCode).toBe(404);
  });

  it('each attempt records the cutoff in force when it was graded', async () => {
    const raised = await createPublishedCourse('Corte vigente', 'score_only', true);
    const learner = await enrollStudent('corte@faena.test', 'Fernanda', raised.courseId);
    await watchAll(learner.headers, raised.activityIds);

    await startAttempt(learner, raised.courseId);
    const before = await submitAttempt(learner, raised.courseId, 1, twoThirds);
    expect(before.body.cutoff).toBe(70);
    expect(before.body.passed).toBe(false);

    const replace = await app.inject({
      method: 'PUT',
      url: `/api/courses/${raised.courseId}/evaluation`,
      headers: staff.headers(),
      payload: { ...evaluationDoc('score_only'), cutoff: 60 },
    });
    expect(replace.statusCode).toBe(200);

    await startAttempt(learner, raised.courseId);
    const after = await submitAttempt(learner, raised.courseId, 2, twoThirds);
    expect(after.body.cutoff).toBe(60);
    expect(after.body.score).toBe(67);
    expect(after.body.passed).toBe(true);
  });

  it('rejects answers that do not respond to the document, keeping the attempt open', async () => {
    const learner = await enrollStudent('invalida@faena.test', 'Ignacia', staff.courseId);
    await watchAll(learner.headers, staff.activityIds);
    await startAttempt(learner, staff.courseId);

    const invalid = [
      allCorrect.slice(0, 2),
      [...allCorrect, { questionId: 'consentimiento', optionId: 'si' }],
      [{ questionId: 'consentimiento', optionId: 'no-existe' }, ...allCorrect.slice(1)],
    ];
    for (const answers of invalid) {
      const res = await submitAttempt(learner, staff.courseId, 1, answers);
      expect(res.statusCode).toBe(400);
    }

    const schemaInvalid = await app.inject({
      method: 'POST',
      url: `/api/learn/courses/${staff.courseId}/evaluation/attempts/1/submission`,
      headers: learner.headers(),
      payload: { answers: [{ questionId: 'consentimiento' }] },
    });
    expect(schemaInvalid.statusCode).toBe(400);
    expect(schemaInvalid.json().error).toBe('validation_error');

    const stillOpen = await latestAttempt(learner, staff.courseId);
    expect(stillOpen.body.submittedAt).toBeNull();
    expect(stillOpen.body.score).toBeNull();

    const valid = await submitAttempt(learner, staff.courseId, 1, allCorrect);
    expect(valid.statusCode).toBe(200);
  });

  it('Completado is the conjunction: avance 100% + approved evaluation', async () => {
    const learner = await enrollStudent('conjuncion@faena.test', 'Perla', staff.courseId);
    await watchAll(learner.headers, staff.activityIds);
    expect(await courseCompleted(learner, staff.courseId)).toBe(false);

    await startAttempt(learner, staff.courseId);
    await submitAttempt(learner, staff.courseId, 1, allWrong);
    expect(await courseCompleted(learner, staff.courseId)).toBe(false);

    await startAttempt(learner, staff.courseId);
    await submitAttempt(learner, staff.courseId, 2, allCorrect);
    expect(await courseCompleted(learner, staff.courseId)).toBe(true);
  });

  it('a course without an evaluation has no gate: Completado = avance 100%', async () => {
    const plain = await createPublishedCourse('Sin evaluación', 'score_only', false);
    const learner = await enrollStudent('sin.eval@faena.test', 'Samuel', plain.courseId);
    expect(await courseCompleted(learner, plain.courseId)).toBe(false);

    const noEvaluation = await startAttempt(learner, plain.courseId);
    expect(noEvaluation.statusCode).toBe(404);

    await watchAll(learner.headers, plain.activityIds);
    expect(await courseCompleted(learner, plain.courseId)).toBe(true);
  });

  it('isolates learners: attempts are per (course, learner)', async () => {
    const a = await enrollStudent('aislada.a@faena.test', 'Amanda', staff.courseId);
    const b = await enrollStudent('aislada.b@faena.test', 'Bruno', staff.courseId);
    await watchAll(a.headers, staff.activityIds);
    await watchAll(b.headers, staff.activityIds);

    await startAttempt(a, staff.courseId);
    await submitAttempt(a, staff.courseId, 1, allCorrect);
    await startAttempt(a, staff.courseId);
    await submitAttempt(a, staff.courseId, 2, twoThirds);

    const bStart = await startAttempt(b, staff.courseId);
    expect(bStart.body.attemptNumber).toBe(1);
    const aLatest = await latestAttempt(a, staff.courseId);
    expect(aLatest.body.attemptNumber).toBe(2);
  });

  it('keeps the unentitled and other-org learners out', async () => {
    const outsider = await inviteStudent('ajena@otra.test', 'Ximena');
    const res = await app.inject({
      method: 'POST',
      url: `/api/learn/courses/${staff.courseId}/evaluation/attempts`,
      headers: outsider(),
      payload: {},
    });
    expect(res.statusCode).toBe(404);

    const latest = await latestAttempt({ orgUserId: 'x', headers: outsider }, staff.courseId);
    expect(latest.statusCode).toBe(404);
  });
});
