import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { EvaluationService } from './service.js';
import type {
  EvaluationAttemptRepository,
  EvaluationRepository,
  EvaluationUnitOfWork,
} from './ports.js';
import type { Evaluation, Attempt } from './model.js';
import type { NewDomainEvent } from '../types/index.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../shared/errors.js';
import { InvalidAttemptAnswersError } from './errors.js';

const AT = new Date('2026-08-18T16:42:00Z');

const document: Evaluation = {
  courseId: 'crs_1',
  cutoff: 70,
  feedbackMode: 'answer_review',
  questions: [
    {
      id: 'q1',
      prompt: '¿El silencio significa aceptación?',
      options: [
        { id: 'o1', text: 'Sí' },
        { id: 'o2', text: 'No, el consentimiento debe ser expreso' },
      ],
      correctOptionId: 'o2',
    },
    {
      id: 'q2',
      prompt: '¿Cómo se clasifica una amenaza de un proveedor?',
      options: [
        { id: 'a', text: 'Conflicto externo' },
        { id: 'b', text: 'Violencia de terceros' },
        { id: 'c', text: 'Diferencia privada' },
      ],
      correctOptionId: 'b',
    },
    {
      id: 'q3',
      prompt: '¿Qué debe hacer la empresa ante una denuncia?',
      options: [
        { id: 'x', text: 'Difundir' },
        { id: 'y', text: 'Resguardar e investigar' },
      ],
      correctOptionId: 'y',
    },
  ],
};

function fakeEvaluations(doc: Evaluation | null = document) {
  const evaluations: Evaluation[] = doc ? [doc] : [];
  const repo: EvaluationRepository = {
    async findByCourseId(_orgId, courseId) {
      return evaluations.find((e) => e.courseId === courseId) ?? null;
    },
    async replace(_orgId, courseId, input) {
      const next = { courseId, ...input };
      const idx = evaluations.findIndex((e) => e.courseId === courseId);
      if (idx >= 0) {
        evaluations[idx] = next;
      } else {
        evaluations.push(next);
      }
      return next;
    },
  };
  return { repo, evaluations };
}

function fakeAttempts() {
  const attempts: Attempt[] = [];
  const repo: EvaluationAttemptRepository = {
    async findLatest(_orgId, courseId, orgUserId) {
      return (
        [...attempts]
          .filter((a) => a.courseId === courseId && a.orgUserId === orgUserId)
          .sort((a, b) => b.attemptNumber - a.attemptNumber)[0] ?? null
      );
    },
    async summarizeSubmitted(_orgId, courseId, orgUserId) {
      const submitted = attempts
        .filter((a) => a.courseId === courseId && a.orgUserId === orgUserId && a.submittedAt)
        .sort((a, b) => b.attemptNumber - a.attemptNumber);
      const latest = submitted[0];
      return {
        count: submitted.length,
        latest:
          latest && latest.score !== null && latest.passed !== null
            ? { score: latest.score, passed: latest.passed }
            : null,
      };
    },
    async existsForOrgUser(_orgId, orgUserId) {
      return attempts.some((a) => a.orgUserId === orgUserId);
    },
    async insert(_orgId, attempt) {
      const key = (a: Attempt) => `${a.courseId}|${a.orgUserId}|${a.attemptNumber}`;
      if (attempts.some((a) => key(a) === key(attempt))) {
        return null;
      }
      attempts.push(attempt);
      return attempt;
    },
    async submit(_orgId, courseId, orgUserId, attemptNumber, graded) {
      const attempt = attempts.find(
        (a) =>
          a.courseId === courseId && a.orgUserId === orgUserId && a.attemptNumber === attemptNumber,
      );
      if (!attempt || attempt.submittedAt) {
        return null;
      }
      Object.assign(attempt, graded);
      return attempt;
    },
  };
  return { repo, attempts };
}

interface Harness {
  service: EvaluationService;
  appended: NewDomainEvent[];
  refreshed: Array<{ orgUserId: string; courseId: string }>;
  percentFor: (orgUserId: string) => number;
  attempts: Attempt[];
}

function makeService(opts?: {
  document?: Evaluation | null;
  percent?: (orgUserId: string) => number;
}): Harness {
  const { repo: evaluations } = fakeEvaluations(opts?.document);
  const { repo: attemptRepo, attempts } = fakeAttempts();
  const appended: NewDomainEvent[] = [];
  const refreshed: Array<{ orgUserId: string; courseId: string }> = [];
  const uow: EvaluationUnitOfWork = {
    run: (fn) =>
      fn({
        evaluations,
        attempts: attemptRepo,
        outbox: {
          append: async (events) => {
            appended.push(...(events as unknown as NewDomainEvent[]));
          },
        },
      }),
  };
  const percentFor = opts?.percent ?? (() => 100);
  const service = new EvaluationService({
    repo: evaluations,
    attempts: attemptRepo,
    uow,
    courses: { getCourse: async () => ({ id: document.courseId }) },
    gate: {
      coursePercent: async (_orgId, orgUserId) => percentFor(orgUserId),
    },
    completion: {
      refreshCourseCompletion: async (_orgId, orgUserId, courseId) => {
        refreshed.push({ orgUserId, courseId });
      },
    },
  });
  return { service, appended, refreshed, percentFor, attempts };
}

const allCorrect = [
  { questionId: 'q1', optionId: 'o2' },
  { questionId: 'q2', optionId: 'b' },
  { questionId: 'q3', optionId: 'y' },
];

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AT);
});
afterAll(() => {
  vi.useRealTimers();
});

describe('EvaluationService.startAttempt', () => {
  it('refuses to start below 100% course progress', async () => {
    const { service } = makeService({ percent: () => 99 });
    await expect(service.startAttempt('org_1', document.courseId, 'orm_1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('returns 404 when the course has no evaluation', async () => {
    const { service } = makeService({ document: null });
    await expect(service.startAttempt('org_1', document.courseId, 'orm_1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('starts attempt 1 and resumes the open attempt without renumbering', async () => {
    const { service, attempts } = makeService();
    const first = await service.startAttempt('org_1', document.courseId, 'orm_1');
    expect(first).toEqual({
      attemptNumber: 1,
      startedAt: AT.toISOString(),
      submittedAt: null,
      score: null,
      cutoff: null,
      passed: null,
    });
    const second = await service.startAttempt('org_1', document.courseId, 'orm_1');
    expect(second.attemptNumber).toBe(1);
    expect(attempts).toHaveLength(1);
  });

  it('numbers each attempt per learner; attempts are append-only', async () => {
    const { service, attempts } = makeService();
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    await service.submitAttempt('org_1', document.courseId, 'orm_1', 1, {
      answers: allCorrect,
    });
    const next = await service.startAttempt('org_1', document.courseId, 'orm_1');
    expect(next.attemptNumber).toBe(2);
    expect(attempts.map((a) => a.attemptNumber)).toEqual([1, 2]);
    const other = await service.startAttempt('org_1', document.courseId, 'orm_2');
    expect(other.attemptNumber).toBe(1);
  });
});

describe('EvaluationService.submitAttempt', () => {
  it('grades on the server and records the cutoff in force', async () => {
    const { service, attempts, appended } = makeService();
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    const feedback = await service.submitAttempt('org_1', document.courseId, 'orm_1', 1, {
      answers: allCorrect,
    });
    expect(feedback).toMatchObject({
      attemptNumber: 1,
      score: 100,
      cutoff: 70,
      passed: true,
      feedbackMode: 'answer_review',
    });
    expect(attempts[0]?.answers).toEqual(allCorrect);
    expect(appended.filter((e) => e.type === 'evaluation.attempt.graded')).toHaveLength(1);
  });

  it('scores one miss out of three at 66 (floor per ADR 0003); passing is score ≥ cutoff', async () => {
    const { service } = makeService();
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    const feedback = await service.submitAttempt('org_1', document.courseId, 'orm_1', 1, {
      answers: [
        { questionId: 'q1', optionId: 'o2' },
        { questionId: 'q2', optionId: 'a' },
        { questionId: 'q3', optionId: 'y' },
      ],
    });
    expect(feedback.score).toBe(66);
    expect(feedback.passed).toBe(false);

    const lenient = makeService({
      document: { ...document, cutoff: 66 },
    });
    await lenient.service.startAttempt('org_1', document.courseId, 'orm_1');
    const atCutoff = await lenient.service.submitAttempt('org_1', document.courseId, 'orm_1', 1, {
      answers: [
        { questionId: 'q1', optionId: 'o2' },
        { questionId: 'q2', optionId: 'b' },
        { questionId: 'q3', optionId: 'x' },
      ],
    });
    expect(atCutoff.score).toBe(66);
    expect(atCutoff.cutoff).toBe(66);
    expect(atCutoff.passed).toBe(true);
  });

  it('blocks submitting below 100% course progress', async () => {
    const { service } = makeService({ percent: () => 42 });
    await expect(
      service.submitAttempt('org_1', document.courseId, 'orm_1', 1, {
        answers: allCorrect,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects answers that do not match the document exactly', async () => {
    const { service } = makeService();
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    const invalid = [
      { answers: allCorrect.slice(0, 2) },
      { answers: [...allCorrect, { questionId: 'q1', optionId: 'o1' }] },
      { answers: [{ questionId: 'q1', optionId: 'nope' }, ...allCorrect.slice(1)] },
      { answers: [{ questionId: 'zz', optionId: 'o1' }, ...allCorrect.slice(1)] },
    ];
    for (const payload of invalid) {
      await expect(
        service.submitAttempt('org_1', document.courseId, 'orm_1', 1, payload),
      ).rejects.toBeInstanceOf(InvalidAttemptAnswersError);
    }
  });

  it('refuses to resubmit a graded attempt', async () => {
    const { service } = makeService();
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    await service.submitAttempt('org_1', document.courseId, 'orm_1', 1, {
      answers: allCorrect,
    });
    await expect(
      service.submitAttempt('org_1', document.courseId, 'orm_1', 1, {
        answers: allCorrect,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('404s an attempt number that is not the latest', async () => {
    const { service } = makeService();
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    await service.submitAttempt('org_1', document.courseId, 'orm_1', 1, {
      answers: allCorrect,
    });
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    await expect(
      service.submitAttempt('org_1', document.courseId, 'orm_1', 1, {
        answers: allCorrect,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('answer_review confirms hits and never reveals the key on misses', async () => {
    const { service } = makeService();
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    const feedback = await service.submitAttempt('org_1', document.courseId, 'orm_1', 1, {
      answers: [
        { questionId: 'q1', optionId: 'o1' },
        { questionId: 'q2', optionId: 'b' },
        { questionId: 'q3', optionId: 'x' },
      ],
    });
    expect(feedback.questions).toHaveLength(3);
    const miss = feedback.questions?.[0];
    expect(miss).toEqual({
      questionId: 'q1',
      prompt: document.questions[0]!.prompt,
      options: document.questions[0]!.options,
      selectedOptionId: 'o1',
      correct: false,
    });
    const hit = feedback.questions?.[1];
    expect(hit).toEqual({
      questionId: 'q2',
      prompt: document.questions[1]!.prompt,
      options: document.questions[1]!.options,
      selectedOptionId: 'b',
      correct: true,
    });
    const serialized = JSON.stringify(feedback);
    expect(serialized).not.toContain('correctOptionId');
  });

  it('score_only feedback carries no per-question review', async () => {
    const { service } = makeService();
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    const feedback = await service.submitAttempt('org_1', document.courseId, 'orm_1', 1, {
      answers: allCorrect,
    });
    expect(feedback.feedbackMode).toBe('answer_review');
    const scoreOnly = makeService({
      document: { ...document, feedbackMode: 'score_only' },
    });
    await scoreOnly.service.startAttempt('org_1', document.courseId, 'orm_1');
    const bare = await scoreOnly.service.submitAttempt('org_1', document.courseId, 'orm_1', 1, {
      answers: allCorrect,
    });
    expect(bare.feedbackMode).toBe('score_only');
    expect(bare.questions).toBeUndefined();
    expect(JSON.stringify(bare)).not.toContain('prompt');
  });

  it('refreshes course completion only when the attempt passes', async () => {
    const pass = makeService();
    await pass.service.startAttempt('org_1', document.courseId, 'orm_1');
    await expect(
      pass.service.submitAttempt('org_1', document.courseId, 'orm_1', 1, {
        answers: [
          { questionId: 'q1', optionId: 'o1' },
          { questionId: 'q2', optionId: 'a' },
          { questionId: 'q3', optionId: 'x' },
        ],
      }),
    ).resolves.toMatchObject({ passed: false });
    expect(pass.refreshed).toHaveLength(0);

    await pass.service.startAttempt('org_1', document.courseId, 'orm_1');
    await pass.service.submitAttempt('org_1', document.courseId, 'orm_1', 2, {
      answers: allCorrect,
    });
    expect(pass.refreshed).toEqual([{ orgUserId: 'orm_1', courseId: document.courseId }]);
  });
});

describe('EvaluationService.latestAttempt and latestApproval', () => {
  it('returns null before any attempt', async () => {
    const { service } = makeService();
    expect(await service.latestAttempt('org_1', document.courseId, 'orm_1')).toBeNull();
  });

  it('returns the last attempt with its recorded cutoff', async () => {
    const { service } = makeService();
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    await service.submitAttempt('org_1', document.courseId, 'orm_1', 1, {
      answers: [
        { questionId: 'q1', optionId: 'o1' },
        { questionId: 'q2', optionId: 'a' },
        { questionId: 'q3', optionId: 'x' },
      ],
    });
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    await service.submitAttempt('org_1', document.courseId, 'orm_1', 2, {
      answers: allCorrect,
    });
    const latest = await service.latestAttempt('org_1', document.courseId, 'orm_1');
    expect(latest).toMatchObject({ attemptNumber: 2, score: 100, cutoff: 70, passed: true });
  });

  it('an open latest attempt reports no score and no review', async () => {
    const { service } = makeService();
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    const latest = await service.latestAttempt('org_1', document.courseId, 'orm_1');
    expect(latest).toMatchObject({ attemptNumber: 1, score: null, submittedAt: null });
    expect(latest?.questions).toBeUndefined();
  });

  it('latestApproval answers null without evaluation, false until passed, then true', async () => {
    const without = makeService({ document: null });
    expect(await without.service.latestApproval('org_1', document.courseId, 'orm_1')).toBeNull();

    const { service } = makeService();
    expect(await service.latestApproval('org_1', document.courseId, 'orm_1')).toEqual({
      passed: false,
    });
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    expect(await service.latestApproval('org_1', document.courseId, 'orm_1')).toEqual({
      passed: false,
    });
    await service.submitAttempt('org_1', document.courseId, 'orm_1', 1, {
      answers: allCorrect,
    });
    expect(await service.latestApproval('org_1', document.courseId, 'orm_1')).toEqual({
      passed: true,
    });
  });

  it('latestApproval keeps the last submitted pass when a later attempt is still open', async () => {
    const { service } = makeService();
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    await service.submitAttempt('org_1', document.courseId, 'orm_1', 1, {
      answers: allCorrect,
    });
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    expect(await service.latestApproval('org_1', document.courseId, 'orm_1')).toEqual({
      passed: true,
    });
  });
});

describe('EvaluationService.attemptsSummary', () => {
  const oneMiss = [
    { questionId: 'q1', optionId: 'o2' },
    { questionId: 'q2', optionId: 'a' },
    { questionId: 'q3', optionId: 'y' },
  ];

  it('returns zero submitted attempts when there are none, even without an evaluation', async () => {
    const without = makeService({ document: null });
    expect(await without.service.attemptsSummary('org_1', document.courseId, 'orm_1')).toEqual({
      intentos: 0,
      ultimo: null,
    });

    const { service } = makeService();
    expect(await service.attemptsSummary('org_1', document.courseId, 'orm_1')).toEqual({
      intentos: 0,
      ultimo: null,
    });
  });

  it('ignores an open attempt that was never submitted', async () => {
    const { service } = makeService();
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    expect(await service.attemptsSummary('org_1', document.courseId, 'orm_1')).toEqual({
      intentos: 0,
      ultimo: null,
    });
  });

  it('reports the last submitted attempt when it failed', async () => {
    const { service } = makeService();
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    await service.submitAttempt('org_1', document.courseId, 'orm_1', 1, { answers: oneMiss });
    expect(await service.attemptsSummary('org_1', document.courseId, 'orm_1')).toEqual({
      intentos: 1,
      ultimo: { puntaje: 66, aprobado: false },
    });
  });

  it('reports the last submitted attempt when it passed', async () => {
    const { service } = makeService();
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    await service.submitAttempt('org_1', document.courseId, 'orm_1', 1, { answers: oneMiss });
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    await service.submitAttempt('org_1', document.courseId, 'orm_1', 2, { answers: allCorrect });
    expect(await service.attemptsSummary('org_1', document.courseId, 'orm_1')).toEqual({
      intentos: 2,
      ultimo: { puntaje: 100, aprobado: true },
    });
  });

  it('does not let an open later attempt overwrite the last submitted one', async () => {
    const { service } = makeService();
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    await service.submitAttempt('org_1', document.courseId, 'orm_1', 1, { answers: allCorrect });
    await service.startAttempt('org_1', document.courseId, 'orm_1');
    expect(await service.attemptsSummary('org_1', document.courseId, 'orm_1')).toEqual({
      intentos: 1,
      ultimo: { puntaje: 100, aprobado: true },
    });
  });
});
