import { NotFoundError, ForbiddenError, ConflictError } from '../shared/errors.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import { evaluationEvents } from './events.js';
import { InvalidAttemptAnswersError } from './errors.js';
import type {
  Attempt,
  AttemptFeedback,
  AttemptStatus,
  Evaluation,
  EvaluationView,
  ReplaceEvaluationInput,
  SubmitAttemptInput,
} from './model.js';
import type {
  CourseCompletionRefresher,
  EvaluationAttemptRepository,
  EvaluationCourseReader,
  EvaluationProgressGate,
  EvaluationRepository,
  EvaluationUnitOfWork,
} from './ports.js';

function withoutCorrectionKey(evaluation: Evaluation): EvaluationView {
  return {
    courseId: evaluation.courseId,
    cutoff: evaluation.cutoff,
    feedbackMode: evaluation.feedbackMode,
    questions: evaluation.questions.map(({ correctOptionId: _, ...question }) => question),
  };
}

function toAttemptStatus(attempt: Attempt): AttemptStatus {
  return {
    attemptNumber: attempt.attemptNumber,
    startedAt: new Date(attempt.startedAt).toISOString(),
    submittedAt: attempt.submittedAt ? new Date(attempt.submittedAt).toISOString() : null,
    score: attempt.score ?? null,
    cutoff: attempt.cutoff ?? null,
    passed: attempt.passed ?? null,
  };
}

export interface EvaluationServiceParams {
  repo: EvaluationRepository;
  attempts: EvaluationAttemptRepository;
  uow: EvaluationUnitOfWork;
  courses: EvaluationCourseReader;
  gate: EvaluationProgressGate;
  completion: CourseCompletionRefresher;
  logger?: Logger;
}

export class EvaluationService {
  private readonly repo: EvaluationRepository;
  private readonly attempts: EvaluationAttemptRepository;
  private readonly uow: EvaluationUnitOfWork;
  private readonly courses: EvaluationCourseReader;
  private readonly gate: EvaluationProgressGate;
  private readonly completion: CourseCompletionRefresher;
  private readonly logger: Logger;

  constructor(params: EvaluationServiceParams) {
    this.repo = params.repo;
    this.attempts = params.attempts;
    this.uow = params.uow;
    this.courses = params.courses;
    this.gate = params.gate;
    this.completion = params.completion;
    this.logger = params.logger ?? noopLogger;
  }

  async get(orgId: string, courseId: string): Promise<EvaluationView | null> {
    const evaluation = await this.repo.findByCourseId(orgId, courseId);
    return evaluation ? withoutCorrectionKey(evaluation) : null;
  }

  async replace(
    orgId: string,
    courseId: string,
    input: ReplaceEvaluationInput,
  ): Promise<EvaluationView> {
    if (!(await this.courses.getCourse(orgId, courseId))) {
      throw new NotFoundError('Course', courseId);
    }
    const view = await this.uow.run(async ({ evaluations, outbox }) => {
      const evaluation = await evaluations.replace(orgId, courseId, input);
      const sanitized = withoutCorrectionKey(evaluation);
      await outbox.append([evaluationEvents.replaced.make({ orgId, data: sanitized })]);
      return sanitized;
    });
    this.logger.info('evaluation replaced', {
      orgId,
      courseId,
      questionCount: input.questions.length,
    });
    return view;
  }

  async startAttempt(orgId: string, courseId: string, orgUserId: string): Promise<AttemptStatus> {
    if (!(await this.repo.findByCourseId(orgId, courseId))) {
      throw new NotFoundError('Evaluation', courseId);
    }
    await this.assertCourseComplete(orgId, courseId, orgUserId);
    const attempt = await this.uow.run(async ({ attempts }) => {
      const latest = await attempts.findLatest(orgId, courseId, orgUserId);
      if (latest && !latest.submittedAt) {
        return latest;
      }
      const startedAt = new Date();
      const inserted = await attempts.insert(orgId, {
        orgId,
        courseId,
        orgUserId,
        attemptNumber: (latest?.attemptNumber ?? 0) + 1,
        startedAt,
        submittedAt: null,
        answers: null,
        score: null,
        cutoff: null,
        passed: null,
      });
      if (!inserted) {
        const winner = await attempts.findLatest(orgId, courseId, orgUserId);
        if (winner && !winner.submittedAt) {
          return winner;
        }
        throw new ConflictError('attempt start lost the insert race');
      }
      return inserted;
    });
    this.logger.info('evaluation attempt started', { orgId, courseId, orgUserId });
    return toAttemptStatus(attempt);
  }

  async submitAttempt(
    orgId: string,
    courseId: string,
    orgUserId: string,
    attemptNumber: number,
    input: SubmitAttemptInput,
  ): Promise<AttemptFeedback> {
    if (!(await this.repo.findByCourseId(orgId, courseId))) {
      throw new NotFoundError('Evaluation', courseId);
    }
    await this.assertCourseComplete(orgId, courseId, orgUserId);
    const graded = await this.uow.run(async ({ attempts, evaluations, outbox }) => {
      const evaluation = await evaluations.findByCourseId(orgId, courseId);
      if (!evaluation) {
        throw new NotFoundError('Evaluation', courseId);
      }
      const latest = await attempts.findLatest(orgId, courseId, orgUserId);
      if (!latest || latest.attemptNumber !== attemptNumber) {
        throw new NotFoundError('Attempt', String(attemptNumber));
      }
      if (latest.submittedAt) {
        throw new ConflictError('attempt already submitted');
      }
      const selected = matchAnswers(evaluation, input);
      let hits = 0;
      for (const question of evaluation.questions) {
        if (selected.get(question.id) === question.correctOptionId) {
          hits += 1;
        }
      }
      // ADR 0003: puntaje = floor(100 × correctas / total).
      const score = Math.floor((hits / evaluation.questions.length) * 100);
      const passed = score >= evaluation.cutoff;
      const submittedAt = new Date();
      const stored = await attempts.submit(orgId, courseId, orgUserId, attemptNumber, {
        submittedAt,
        answers: input.answers,
        score,
        cutoff: evaluation.cutoff,
        passed,
      });
      if (!stored) {
        throw new ConflictError('attempt already submitted');
      }
      await outbox.append([
        evaluationEvents.attemptGraded.make({
          orgId,
          data: {
            courseId,
            orgUserId,
            attemptNumber,
            submittedAt,
            answers: input.answers,
            score,
            cutoff: evaluation.cutoff,
            passed,
          },
        }),
      ]);
      return { stored, evaluation };
    });
    this.logger.info('evaluation attempt graded', {
      orgId,
      courseId,
      orgUserId,
      attemptNumber,
      score: graded.stored.score,
    });
    if (graded.stored.passed) {
      try {
        await this.completion.refreshCourseCompletion(orgId, orgUserId, courseId);
      } catch (err) {
        this.logger.error('course completion refresh failed after a passed attempt', {
          orgId,
          courseId,
          orgUserId,
          err,
        });
      }
    }
    return toFeedback(graded.stored, graded.evaluation);
  }

  async latestAttempt(
    orgId: string,
    courseId: string,
    orgUserId: string,
  ): Promise<AttemptFeedback | null> {
    const evaluation = await this.repo.findByCourseId(orgId, courseId);
    if (!evaluation) {
      throw new NotFoundError('Evaluation', courseId);
    }
    const latest = await this.attempts.findLatest(orgId, courseId, orgUserId);
    return latest ? toFeedback(latest, evaluation) : null;
  }

  /** Whether the Trabajador has ever rendido in any course of the org. */
  hasAttempts(orgId: string, orgUserId: string): Promise<boolean> {
    return this.attempts.existsForOrgUser(orgId, orgUserId);
  }

  async latestApproval(
    orgId: string,
    courseId: string,
    orgUserId: string,
  ): Promise<{ passed: boolean } | null> {
    const evaluation = await this.repo.findByCourseId(orgId, courseId);
    if (!evaluation) {
      return null;
    }
    const latest = await this.attempts.findLatest(orgId, courseId, orgUserId);
    if (!latest || !latest.submittedAt) {
      return { passed: false };
    }
    return { passed: latest.passed === true };
  }

  private async assertCourseComplete(
    orgId: string,
    courseId: string,
    orgUserId: string,
  ): Promise<void> {
    const percent = await this.gate.coursePercent(orgId, orgUserId, courseId);
    if (percent < 100) {
      throw new ForbiddenError('evaluation requires 100% course progress');
    }
  }
}

function matchAnswers(evaluation: Evaluation, input: SubmitAttemptInput): Map<string, string> {
  const byQuestion = new Map(evaluation.questions.map((q) => [q.id, q]));
  if (input.answers.length !== evaluation.questions.length) {
    throw new InvalidAttemptAnswersError('answers must respond to every question exactly once');
  }
  const selected = new Map<string, string>();
  for (const answer of input.answers) {
    const question = byQuestion.get(answer.questionId);
    if (!question || !question.options.some((o) => o.id === answer.optionId)) {
      throw new InvalidAttemptAnswersError(
        `answer for ${answer.questionId} does not match the evaluation document`,
      );
    }
    selected.set(answer.questionId, answer.optionId);
  }
  return selected;
}

function toFeedback(attempt: Attempt, evaluation: Evaluation): AttemptFeedback {
  const base: AttemptFeedback = {
    ...toAttemptStatus(attempt),
    feedbackMode: evaluation.feedbackMode,
  };
  if (!attempt.submittedAt || evaluation.feedbackMode === 'score_only' || !attempt.answers) {
    return base;
  }
  const selected = new Map(attempt.answers.map((a) => [a.questionId, a.optionId]));
  const reviewable = evaluation.questions.filter((q) => selected.has(q.id));
  if (reviewable.length === 0) {
    return base;
  }
  return {
    ...base,
    questions: reviewable.map((question) => ({
      questionId: question.id,
      prompt: question.prompt,
      options: question.options,
      selectedOptionId: selected.get(question.id)!,
      correct: selected.get(question.id) === question.correctOptionId,
    })),
  };
}
