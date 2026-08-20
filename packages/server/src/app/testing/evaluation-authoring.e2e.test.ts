import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, CookieJar, enterByMagicLink, type TestApp } from './test-app.js';

let app: FastifyInstance;
let harness: TestApp;
let courseId: string;
let headers: () => { origin: string; cookie: string };

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
      email: 'evaluaciones@nuvora.test',
      password: 'pilot-password-1',
      name: 'Operador Nuvora',
    },
  });
  expect(signup.statusCode).toBeLessThan(400);
  jar.store(signup.headers['set-cookie']);

  const org = await app.inject({
    method: 'POST',
    url: '/api/organizations',
    headers: headers(),
    payload: { name: 'Faena Evaluaciones', slug: 'faena-evaluaciones' },
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
}, 180_000);

afterAll(async () => {
  await harness?.close();
}, 60_000);

async function createCourse(title: string): Promise<string> {
  const course = await app.inject({
    method: 'POST',
    url: '/api/courses',
    headers: headers(),
    payload: { title, description: 'Curso piloto', category: 'compliance' },
  });
  expect(course.statusCode).toBe(201);
  return course.json().id as string;
}

const evaluationInput = {
  cutoff: 70,
  questions: [
    {
      id: 'consentimiento',
      prompt: '¿El silencio significa aceptación?',
      options: [
        { id: 'si', text: 'Sí' },
        { id: 'no', text: 'No, el consentimiento debe ser expreso' },
      ],
      correctOptionId: 'no',
    },
  ],
};

const publicEvaluation = {
  courseId: expect.any(String),
  cutoff: 70,
  feedbackMode: 'score_only',
  questions: [
    {
      id: 'consentimiento',
      prompt: '¿El silencio significa aceptación?',
      options: [
        { id: 'si', text: 'Sí' },
        { id: 'no', text: 'No, el consentimiento debe ser expreso' },
      ],
    },
  ],
};

describe('Evaluation authoring HTTP seam', () => {
  it('replaces a Course Evaluation and reads it back without the correction key', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: `/api/courses/${courseId}/evaluation`,
      headers: headers(),
      payload: { questions: evaluationInput.questions },
    });

    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual(publicEvaluation);
    expect(put.json().courseId).toBe(courseId);
    expect(JSON.stringify(put.json())).not.toContain('correctOptionId');

    const get = await app.inject({
      method: 'GET',
      url: `/api/courses/${courseId}/evaluation`,
      headers: headers(),
    });

    expect(get.statusCode).toBe(200);
    expect(get.json()).toEqual(publicEvaluation);
    expect(JSON.stringify(get.json())).not.toContain('correctOptionId');
  });

  it('rejects an invalid complete replacement without changing the stored Evaluation', async () => {
    const id = await createCourse('Evaluación atómica');
    const initial = await app.inject({
      method: 'PUT',
      url: `/api/courses/${id}/evaluation`,
      headers: headers(),
      payload: { ...evaluationInput, feedbackMode: 'answer_review' },
    });
    expect(initial.statusCode).toBe(200);

    const invalid = await app.inject({
      method: 'PUT',
      url: `/api/courses/${id}/evaluation`,
      headers: headers(),
      payload: {
        cutoff: 101,
        feedbackMode: 'answer_review',
        questions: [
          {
            id: 'duplicada',
            prompt: 'Pregunta inválida',
            options: [
              { id: 'misma', text: 'Una' },
              { id: 'misma', text: 'Dos' },
            ],
            correctOptionId: 'ausente',
          },
        ],
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error).toBe('validation_error');
    expect(invalid.json().issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: expect.any(String), message: expect.any(String) }),
      ]),
    );

    const after = await app.inject({
      method: 'GET',
      url: `/api/courses/${id}/evaluation`,
      headers: headers(),
    });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toEqual({
      ...publicEvaluation,
      courseId: id,
      feedbackMode: 'answer_review',
    });
  });

  it('enforces the hard schema limits and identifier invariants', async () => {
    const id = await createCourse('Límites de Evaluación');
    const option = (optionId: string) => ({ id: optionId, text: `Opción ${optionId}` });
    const question = (questionId: string, optionCount = 2) => ({
      id: questionId,
      prompt: `Pregunta ${questionId}`,
      options: Array.from({ length: optionCount }, (_, index) => option(`o${index}`)),
      correctOptionId: 'o0',
    });
    const invalidDocuments = [
      { cutoff: 0, questions: [question('q1')] },
      { cutoff: 70, feedbackMode: 'full_key', questions: [question('q1')] },
      { cutoff: 70, questions: [] },
      {
        cutoff: 70,
        questions: Array.from({ length: 101 }, (_, index) => question(`q${index}`)),
      },
      { cutoff: 70, questions: [question('q1', 1)] },
      { cutoff: 70, questions: [question('q1', 7)] },
      { cutoff: 70, questions: [question('same'), question('same')] },
      { cutoff: 70, questions: [question('q1'), question('q2')] },
      {
        cutoff: 70,
        questions: [
          {
            ...question('q1'),
            options: [option('q1'), option('o2')],
            correctOptionId: 'q1',
          },
        ],
      },
      {
        cutoff: 70,
        questions: [
          {
            ...question('q1'),
            options: [option('same'), option('same')],
          },
        ],
      },
      {
        cutoff: 70,
        questions: [{ ...question('q1'), correctOptionId: 'not-an-option' }],
      },
    ];

    for (const payload of invalidDocuments) {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/courses/${id}/evaluation`,
        headers: headers(),
        payload,
      });
      expect(response.statusCode).toBe(400);
    }

    const get = await app.inject({
      method: 'GET',
      url: `/api/courses/${id}/evaluation`,
      headers: headers(),
    });
    expect(get.statusCode).toBe(404);
  });

  it('returns 404 for an Evaluation or Course that does not exist', async () => {
    const withoutEvaluation = await createCourse('Curso sin Evaluación');
    const get = await app.inject({
      method: 'GET',
      url: `/api/courses/${withoutEvaluation}/evaluation`,
      headers: headers(),
    });
    expect(get.statusCode).toBe(404);

    const put = await app.inject({
      method: 'PUT',
      url: '/api/courses/course_missing/evaluation',
      headers: headers(),
      payload: evaluationInput,
    });
    expect(put.statusCode).toBe(404);
  });

  it('hides another organization\'s Course Evaluation from that org\'s staff', async () => {
    const otherJar = new CookieJar();
    const otherHeaders = () => ({ origin: harness.origin, cookie: otherJar.header() });

    const signup = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: otherHeaders(),
      payload: {
        email: 'faena.ajena@nuvora.test',
        password: 'pilot-password-1',
        name: 'Operador Ajeno',
      },
    });
    expect(signup.statusCode).toBeLessThan(400);
    otherJar.store(signup.headers['set-cookie']);

    const org = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: otherHeaders(),
      payload: { name: 'Faena Ajena', slug: 'faena-ajena' },
    });
    expect(org.statusCode).toBe(201);
    otherJar.drop('better-auth.session_data');

    const get = await app.inject({
      method: 'GET',
      url: `/api/courses/${courseId}/evaluation`,
      headers: otherHeaders(),
    });
    expect(get.statusCode).toBe(404);

    const put = await app.inject({
      method: 'PUT',
      url: `/api/courses/${courseId}/evaluation`,
      headers: otherHeaders(),
      payload: evaluationInput,
    });
    expect(put.statusCode).toBe(404);

    const owner = await app.inject({
      method: 'GET',
      url: `/api/courses/${courseId}/evaluation`,
      headers: headers(),
    });
    expect(owner.statusCode).toBe(200);
    expect(owner.json()).toEqual(publicEvaluation);
  });

  it('fully replaces the document and has no publication state of its own', async () => {
    const id = await createCourse('Evaluación reemplazable');
    await app.inject({
      method: 'PUT',
      url: `/api/courses/${id}/evaluation`,
      headers: headers(),
      payload: evaluationInput,
    });

    const replacement = {
      cutoff: 80,
      feedbackMode: 'answer_review',
      questions: [
        {
          id: 'terceros',
          prompt: '¿Cómo se clasifica una amenaza de un proveedor?',
          options: [
            { id: 'externa', text: 'Como un conflicto externo' },
            { id: 'violencia', text: 'Como violencia de terceros' },
            { id: 'privada', text: 'Como una diferencia privada' },
          ],
          correctOptionId: 'violencia',
        },
      ],
    } as const;
    const put = await app.inject({
      method: 'PUT',
      url: `/api/courses/${id}/evaluation`,
      headers: headers(),
      payload: replacement,
    });
    expect(put.statusCode).toBe(200);

    const published = await app.inject({
      method: 'PATCH',
      url: `/api/courses/${id}`,
      headers: headers(),
      payload: { status: 'published' },
    });
    expect(published.statusCode).toBe(200);

    const get = await app.inject({
      method: 'GET',
      url: `/api/courses/${id}/evaluation`,
      headers: headers(),
    });
    expect(get.statusCode).toBe(200);
    expect(get.json()).toEqual({
      courseId: id,
      cutoff: 80,
      feedbackMode: 'answer_review',
      questions: replacement.questions.map(({ correctOptionId: _, ...question }) => question),
    });
    expect(get.json()).not.toHaveProperty('status');
    expect(JSON.stringify(get.json())).not.toContain('consentimiento');
  });

  it('exposes the sanitized Evaluation to an enrolled Trabajador only after Course publish', async () => {
    const id = await createCourse('Evaluación publicada');
    const put = await app.inject({
      method: 'PUT',
      url: `/api/courses/${id}/evaluation`,
      headers: headers(),
      payload: evaluationInput,
    });
    expect(put.statusCode).toBe(200);

    const email = 'trabajadora.evaluacion@faena.test';
    const invite = await app.inject({
      method: 'POST',
      url: '/api/organizations/invites',
      headers: headers(),
      payload: { email, firstName: 'Juana', lastName: 'Pérez', role: 'student' },
    });
    expect(invite.statusCode).toBe(201);
    const captured = harness.mailer.to(email);
    expect(captured).toHaveLength(1);
    expect(JSON.parse(captured[0]!.text).template).toBe('magicLink');
    const studentHeaders = await enterByMagicLink(app, harness.mailer, email, harness.origin);

    const viewer = await app.inject({
      method: 'GET',
      url: '/api/learn/viewer',
      headers: studentHeaders(),
    });
    expect(viewer.statusCode).toBe(200);

    const entitlement = await app.inject({
      method: 'POST',
      url: '/api/entitlements',
      headers: headers(),
      payload: { orgUserId: viewer.json().orgUserId, contentId: id, expiresAt: null },
    });
    expect(entitlement.statusCode).toBe(201);

    const draft = await app.inject({
      method: 'GET',
      url: `/api/learn/courses/${id}/evaluation`,
      headers: studentHeaders(),
    });
    expect(draft.statusCode).toBe(404);

    const forbiddenAuthoring = await app.inject({
      method: 'PUT',
      url: `/api/courses/${id}/evaluation`,
      headers: studentHeaders(),
      payload: evaluationInput,
    });
    expect(forbiddenAuthoring.statusCode).toBe(403);

    const published = await app.inject({
      method: 'PATCH',
      url: `/api/courses/${id}`,
      headers: headers(),
      payload: { status: 'published' },
    });
    expect(published.statusCode).toBe(200);

    const visible = await app.inject({
      method: 'GET',
      url: `/api/learn/courses/${id}/evaluation`,
      headers: studentHeaders(),
    });
    expect(visible.statusCode).toBe(200);
    expect(visible.json()).toEqual({ ...publicEvaluation, courseId: id });
    expect(JSON.stringify(visible.json())).not.toContain('correctOptionId');
  });
});
