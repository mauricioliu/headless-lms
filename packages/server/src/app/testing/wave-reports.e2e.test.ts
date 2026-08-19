import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, CookieJar, TEST_STUDENT_PORTAL_URL, type TestApp } from './test-app.js';

let app: FastifyInstance;
let harness: TestApp;
let courseId: string;
let activityIds: string[];
let waveId: string;

let headers: () => { origin: string; cookie: string };

const evaluationDoc = {
  cutoff: 70,
  feedbackMode: 'score_only' as const,
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
};

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

/** One Trabajador of the Ola: their invite token becomes a session the test
 *  drives avance and Intentos through. */
async function trabajador(email: string, name: string) {
  const jar = new CookieJar();
  const workerHeaders = () => ({ origin: TEST_STUDENT_PORTAL_URL, cookie: jar.header() });
  const captured = harness.mailer.to(email)[0]!;
  const rendered = JSON.parse(captured.text) as { params: { inviteUrl: string } };
  const token = new URL(rendered.params.inviteUrl).searchParams.get('token');
  expect(token).toBeTruthy();
  const signup = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: workerHeaders(),
    payload: { email, password: 'trabajador-password-1', name },
  });
  expect(signup.statusCode).toBeLessThan(400);
  jar.store(signup.headers['set-cookie']);
  const accepted = await app.inject({
    method: 'POST',
    url: '/api/organizations/invites/accept',
    headers: workerHeaders(),
    payload: { token },
  });
  expect(accepted.statusCode).toBe(200);
  jar.drop('better-auth.session_data');
  return workerHeaders;
}

async function watch(workerHeaders: () => { origin: string; cookie: string }, upto: number) {
  for (const activityId of activityIds.slice(0, upto)) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/learn/progress',
      headers: workerHeaders(),
      payload: { activity: activityId, reports: [{ completed: true }] },
    });
    expect(res.statusCode).toBe(200);
  }
}

async function rendir(
  workerHeaders: () => { origin: string; cookie: string },
  answers: Array<{ questionId: string; optionId: string }>,
  attemptNumber: number,
) {
  const start = await app.inject({
    method: 'POST',
    url: `/api/learn/courses/${courseId}/evaluation/attempts`,
    headers: workerHeaders(),
    payload: {},
  });
  expect(start.statusCode).toBe(201);
  expect(start.json().attemptNumber).toBe(attemptNumber);
  const submit = await app.inject({
    method: 'POST',
    url: `/api/learn/courses/${courseId}/evaluation/attempts/${attemptNumber}/submission`,
    headers: workerHeaders(),
    payload: { answers },
  });
  expect(submit.statusCode).toBe(200);
  return submit.json();
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
      email: 'reporte@nuvora.test',
      password: 'pilot-password-1',
      name: 'Admin Cliente',
    },
  });
  expect(signup.statusCode).toBeLessThan(400);
  jar.store(signup.headers['set-cookie']);
  const org = await app.inject({
    method: 'POST',
    url: '/api/organizations',
    headers: headers(),
    payload: { name: 'Faena Reporte', slug: 'faena-reporte' },
  });
  expect(org.statusCode).toBe(201);
  jar.drop('better-auth.session_data');

  const course = await app.inject({
    method: 'POST',
    url: '/api/courses',
    headers: headers(),
    payload: {
      title: 'Prevención del acoso y la violencia',
      description: 'Curso piloto',
      category: 'compliance',
    },
  });
  expect(course.statusCode).toBe(201);
  courseId = course.json().id as string;

  activityIds = [];
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
    activityIds.push(row.id as string);
  }
  expect(activityIds).toHaveLength(2);

  const evaluation = await app.inject({
    method: 'PUT',
    url: `/api/courses/${courseId}/evaluation`,
    headers: headers(),
    payload: evaluationDoc,
  });
  expect(evaluation.statusCode).toBe(200);

  const published = await app.inject({
    method: 'PATCH',
    url: `/api/courses/${courseId}`,
    headers: headers(),
    payload: { status: 'published' },
  });
  expect(published.statusCode).toBe(200);

  const roster = [
    'RUT,Nombre,Telefono,Correo',
    '11.111.111-1,María González,+56911111111,maria.gonzalez@faena.test',
    '22.222.222-2,Carlos Rojas,+56922222222,carlos.rojas@faena.test',
    '33.333.333-3,Daniela Soto,+56933333333,daniela.soto@faena.test',
    '44.444.444-4,Jorge Muñoz,+56944444444,jorge.munoz@faena.test',
    '55.555.555-5,"Ana ""Nana""",+56955555555,ana.morales@faena.test',
  ].join('\r\n');
  const ola = await app.inject({
    method: 'POST',
    url: '/api/waves',
    headers: headers(),
    payload: { name: 'Ola 1 · Faena norte', courseId, csv: roster },
  });
  expect(ola.statusCode).toBe(201);
  expect(ola.json()).toMatchObject({ memberCount: 5, invited: 5, alreadyActive: 0 });
  waveId = ola.json().id as string;

  const maria = await trabajador('maria.gonzalez@faena.test', 'María González');
  await watch(maria, 2);
  await rendir(maria, allCorrect, 1);

  const carlos = await trabajador('carlos.rojas@faena.test', 'Carlos Rojas');
  await watch(carlos, 2);

  const daniela = await trabajador('daniela.soto@faena.test', 'Daniela Soto');
  await watch(daniela, 2);
  await rendir(daniela, twoThirds, 1);
  await rendir(daniela, allWrong, 2);
  await rendir(daniela, twoThirds, 3);

  const jorge = await trabajador('jorge.munoz@faena.test', 'Jorge Muñoz');
  await watch(jorge, 1);

  const ana = await trabajador('ana.morales@faena.test', 'Ana "Nana"');
  await watch(ana, 2);
  await rendir(ana, allWrong, 1);
  await rendir(ana, allCorrect, 2);
}, 240_000);

afterAll(async () => {
  await harness?.close();
}, 60_000);

describe('per-Ola report HTTP seam', () => {
  it('rejects an unauthenticated caller', async () => {
    const json = await app.inject({
      method: 'GET',
      url: `/api/waves/${waveId}/report`,
      headers: { origin: harness.origin },
    });
    expect(json.statusCode).toBe(401);
    const csv = await app.inject({
      method: 'GET',
      url: `/api/waves/${waveId}/report.csv`,
      headers: { origin: harness.origin },
    });
    expect(csv.statusCode).toBe(401);
  });

  it('reports the Ola: one aggregate row per Trabajador and the Ola totals', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/waves/${waveId}/report`,
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.wave).toMatchObject({ id: waveId, name: 'Ola 1 · Faena norte', courseId });
    expect(body.course).toMatchObject({
      id: courseId,
      title: 'Prevención del acoso y la violencia',
      status: 'published',
    });

    // 2 de 5 Completado = 40%; avance (100+100+100+50+100)/5 = 90;
    // puntaje promedio sobre quienes rindieron (100+67+100)/3 = 89;
    // intentos (1+0+3+0+2)/5 = 1.2
    expect(body.totals).toEqual({
      members: 5,
      completed: 2,
      completedRate: 40,
      avgProgress: 90,
      avgScore: 89,
      avgAttempts: 1.2,
    });

    const byEmail = Object.fromEntries(body.workers.map((w: { email: string }) => [w.email, w]));
    expect(Object.keys(byEmail).sort()).toEqual([
      'ana.morales@faena.test',
      'carlos.rojas@faena.test',
      'daniela.soto@faena.test',
      'jorge.munoz@faena.test',
      'maria.gonzalez@faena.test',
    ]);

    expect(byEmail['maria.gonzalez@faena.test']).toMatchObject({
      progress: 100,
      evaluationStatus: 'approved',
      score: 100,
      attempts: 1,
      completed: true,
    });
    expect(byEmail['carlos.rojas@faena.test']).toMatchObject({
      progress: 100,
      evaluationStatus: 'pending',
      score: null,
      attempts: 0,
      completed: false,
    });
    // vale el último Intento: rendida tres veces, nunca aprobada
    expect(byEmail['daniela.soto@faena.test']).toMatchObject({
      progress: 100,
      evaluationStatus: 'last_attempt',
      score: 67,
      attempts: 3,
      completed: false,
    });
    // avance a medias: la Evaluación sigue bloqueada por el gate
    expect(byEmail['jorge.munoz@faena.test']).toMatchObject({
      progress: 50,
      evaluationStatus: 'blocked',
      score: null,
      attempts: 0,
      completed: false,
    });
    expect(byEmail['ana.morales@faena.test']).toMatchObject({
      progress: 100,
      evaluationStatus: 'approved',
      score: 100,
      attempts: 2,
      completed: true,
    });

    expect(JSON.stringify(body)).not.toContain('correctOptionId');
    expect(JSON.stringify(body)).not.toContain('answers');
  });

  it('exports the CSV: the table columns per Trabajador, RFC 4180 escaping', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/waves/${waveId}/report.csv`,
      headers: headers(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="reporte-ola-ola-1-faena-norte.csv"',
    );

    const rows = res.body.split('\r\n');
    expect(rows[0]).toBe('Trabajador,Avance,Evaluación,Puntaje,Intentos');
    expect(rows[1]).toBe('"Ana ""Nana""",100%,Aprobada,100%,2');
    expect(rows[2]).toBe('Carlos Rojas,100%,Pendiente,,0');
    expect(rows[3]).toBe('Daniela Soto,100%,Último intento,67%,3');
    expect(rows[4]).toBe('Jorge Muñoz,50%,Bloqueada,,0');
    expect(rows[5]).toBe('María González,100%,Aprobada,100%,1');
    expect(rows[6]).toBe('');

    expect(res.body).not.toContain('correctOptionId');
  });

  it('404s for an Ola that does not exist', async () => {
    const json = await app.inject({
      method: 'GET',
      url: '/api/waves/wave_inexistente/report',
      headers: headers(),
    });
    expect(json.statusCode).toBe(404);
    const csv = await app.inject({
      method: 'GET',
      url: '/api/waves/wave_inexistente/report.csv',
      headers: headers(),
    });
    expect(csv.statusCode).toBe(404);
  });
});
