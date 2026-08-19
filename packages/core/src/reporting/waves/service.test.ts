import { describe, it, expect } from 'vitest';
import { WaveReportServiceImpl } from './service.js';
import type { WaveReportData, WaveWorkerFacts } from './model.js';
import type { WaveReportRepository } from './index.js';

const WAVE = {
  id: 'wave_1',
  name: 'Ola 1',
  courseId: 'crs_1',
  createdAt: new Date('2026-08-01T12:00:00.000Z'),
};

const COURSE = { id: 'crs_1', title: 'Prevención del acoso', status: 'published' as const };

function facts(
  partial: Partial<WaveWorkerFacts> & Pick<WaveWorkerFacts, 'orgUserId'>,
): WaveWorkerFacts {
  return {
    email: `${partial.orgUserId}@faena.test`,
    firstName: 'Trabajador',
    lastName: partial.orgUserId,
    status: 'invited',
    completedActivities: 0,
    courseCompletedAt: null,
    attempts: 0,
    latestScore: null,
    latestPassed: null,
    ...partial,
  };
}

function fakeRepo(data: WaveReportData | null): WaveReportRepository {
  return {
    load: async () => data,
  };
}

function service(data: WaveReportData | null): WaveReportServiceImpl {
  return new WaveReportServiceImpl({ repo: fakeRepo(data) });
}

describe('reporting/waves — reporte por Ola', () => {
  it('returns null when the Ola does not exist', async () => {
    expect(await service(null).report('o1', 'wave_x')).toBeNull();
  });

  it('derives each Trabajador row: avance, estado, puntaje, intentos, Completado', async () => {
    const data: WaveReportData = {
      wave: WAVE,
      course: COURSE,
      hasEvaluation: true,
      publishedActivities: 4,
      workers: [
        // avance 100, aprobada en el último Intento → Completado
        facts({
          orgUserId: 'aprobada',
          completedActivities: 4,
          courseCompletedAt: new Date('2026-08-10T10:00:00.000Z'),
          attempts: 2,
          latestScore: 100,
          latestPassed: true,
        }),
        // avance 100, rendida y no aprobada → vale el último Intento
        facts({
          orgUserId: 'reintentos',
          completedActivities: 4,
          attempts: 3,
          latestScore: 67,
          latestPassed: false,
        }),
        // avance 100, nunca rendida → pendiente
        facts({ orgUserId: 'pendiente', completedActivities: 4 }),
        // avance a medias → bloqueada por el gate
        facts({ orgUserId: 'bloqueada', completedActivities: 3 }),
        // no ha entrado
        facts({ orgUserId: 'nueva' }),
      ],
    };

    const report = await service(data).report('o1', WAVE.id)!;

    const byId = Object.fromEntries(report!.workers.map((w) => [w.orgUserId, w]));
    expect(byId.aprobada).toMatchObject({
      progress: 100,
      evaluationStatus: 'approved',
      score: 100,
      attempts: 2,
      completed: true,
    });
    expect(byId.reintentos).toMatchObject({
      progress: 100,
      evaluationStatus: 'last_attempt',
      score: 67,
      attempts: 3,
      completed: false,
    });
    expect(byId.pendiente).toMatchObject({
      progress: 100,
      evaluationStatus: 'pending',
      score: null,
      attempts: 0,
      completed: false,
    });
    expect(byId.bloqueada).toMatchObject({
      progress: 75,
      evaluationStatus: 'blocked',
      score: null,
      attempts: 0,
      completed: false,
    });
    expect(byId.nueva).toMatchObject({
      progress: 0,
      evaluationStatus: 'blocked',
      score: null,
      attempts: 0,
      completed: false,
    });
  });

  it('rounds avance to a whole percent against the published structure', async () => {
    const data: WaveReportData = {
      wave: WAVE,
      course: COURSE,
      hasEvaluation: true,
      publishedActivities: 3,
      workers: [facts({ orgUserId: 'dos_de_tres', completedActivities: 2 })],
    };
    const report = await service(data).report('o1', WAVE.id)!;
    expect(report!.workers[0]!.progress).toBe(67);
  });

  it('aggregates the Ola: tasa de Completado, promedios de avance, puntaje e intentos', async () => {
    const data: WaveReportData = {
      wave: WAVE,
      course: COURSE,
      hasEvaluation: true,
      publishedActivities: 4,
      workers: [
        facts({
          orgUserId: 'a',
          completedActivities: 4,
          courseCompletedAt: new Date('2026-08-10T10:00:00.000Z'),
          attempts: 2,
          latestScore: 100,
          latestPassed: true,
        }),
        facts({
          orgUserId: 'b',
          completedActivities: 4,
          attempts: 3,
          latestScore: 67,
          latestPassed: false,
        }),
        facts({ orgUserId: 'c', completedActivities: 2 }),
        facts({ orgUserId: 'd' }),
        facts({
          orgUserId: 'e',
          completedActivities: 4,
          courseCompletedAt: new Date('2026-08-11T10:00:00.000Z'),
          attempts: 4,
          latestScore: 100,
          latestPassed: true,
        }),
      ],
    };

    const report = await service(data).report('o1', WAVE.id)!;
    // 2 de 5 Completado = 40%; avance (100+100+50+0+100)/5 = 70;
    // puntaje promedio sobre quienes rindieron (100+67+100)/3 = 89;
    // intentos (2+3+4)/5 = 1.8
    expect(report!.totals).toEqual({
      members: 5,
      completed: 2,
      completedRate: 40,
      avgProgress: 70,
      avgScore: 89,
      avgAttempts: 1.8,
    });
  });

  it('avgScore is null when nobody has rendido; the rest still aggregates', async () => {
    const data: WaveReportData = {
      wave: WAVE,
      course: COURSE,
      hasEvaluation: true,
      publishedActivities: 2,
      workers: [facts({ orgUserId: 'a', completedActivities: 1 }), facts({ orgUserId: 'b' })],
    };
    const report = await service(data).report('o1', WAVE.id)!;
    expect(report!.totals).toEqual({
      members: 2,
      completed: 0,
      completedRate: 0,
      avgProgress: 25,
      avgScore: null,
      avgAttempts: 0,
    });
  });

  it('a course without an Evaluación has no gate: every Trabajador reads no_evaluation', async () => {
    const data: WaveReportData = {
      wave: WAVE,
      course: COURSE,
      hasEvaluation: false,
      publishedActivities: 2,
      workers: [
        // Completado = avance 100% solo, sin aprobación que leer
        facts({ orgUserId: 'completa', completedActivities: 2, courseCompletedAt: new Date() }),
        facts({ orgUserId: 'a_medias', completedActivities: 1 }),
      ],
    };
    const report = await service(data).report('o1', WAVE.id)!;
    expect(report!.workers.map((w) => [w.evaluationStatus, w.completed])).toEqual([
      ['no_evaluation', true],
      ['no_evaluation', false],
    ]);
  });

  it('an Ola with no published structure reads avance 0 for everyone', async () => {
    const data: WaveReportData = {
      wave: WAVE,
      course: COURSE,
      hasEvaluation: true,
      publishedActivities: 0,
      workers: [facts({ orgUserId: 'a', completedActivities: 3 })],
    };
    const report = await service(data).report('o1', WAVE.id)!;
    expect(report!.workers[0]!.progress).toBe(0);
    expect(report!.totals.avgProgress).toBe(0);
  });

  it('an open Intento (started, not submitted) is not a rendición: stays pending', async () => {
    const data: WaveReportData = {
      wave: WAVE,
      course: COURSE,
      hasEvaluation: true,
      publishedActivities: 2,
      workers: [facts({ orgUserId: 'abierta', completedActivities: 2 })],
    };
    const report = await service(data).report('o1', WAVE.id)!;
    expect(report!.workers[0]!).toMatchObject({
      evaluationStatus: 'pending',
      attempts: 0,
      score: null,
    });
  });
});
