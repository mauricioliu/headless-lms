import type { Attempt, ReplaceEvaluationInput, SubmitAttemptInput, Evaluation } from './model.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';

export interface EvaluationRepository {
  findByCourseId(orgId: string, courseId: string): Promise<Evaluation | null>;
  replace(orgId: string, courseId: string, input: ReplaceEvaluationInput): Promise<Evaluation>;
}

export type SubmittedAttemptsSummary = {
  count: number;
  latest: { score: number; passed: boolean } | null;
};

export interface EvaluationAttemptRepository {
  findLatest(orgId: string, courseId: string, orgUserId: string): Promise<Attempt | null>;
  summarizeSubmitted(
    orgId: string,
    courseId: string,
    orgUserId: string,
  ): Promise<SubmittedAttemptsSummary>;
  /** Any attempt at all, any course — the student-delete evidence guard. */
  existsForOrgUser(orgId: string, orgUserId: string): Promise<boolean>;
  insert(orgId: string, attempt: Attempt): Promise<Attempt | null>;
  submit(
    orgId: string,
    courseId: string,
    orgUserId: string,
    attemptNumber: number,
    graded: {
      submittedAt: Date;
      answers: SubmitAttemptInput['answers'];
      score: number;
      cutoff: number;
      passed: boolean;
    },
  ): Promise<Attempt | null>;
}

export interface EvaluationCourseRef {
  id: string;
}

export interface EvaluationCourseReader {
  getCourse(orgId: string, courseId: string): Promise<EvaluationCourseRef | null>;
}

export interface EvaluationProgressGate {
  coursePercent(orgId: string, orgUserId: string, courseId: string): Promise<number>;
}

export interface CourseCompletionRefresher {
  refreshCourseCompletion(orgId: string, orgUserId: string, courseId: string): Promise<void>;
}

export interface EvaluationTxScope {
  evaluations: EvaluationRepository;
  attempts: EvaluationAttemptRepository;
  outbox: OutboxAppender;
}

export type EvaluationUnitOfWork = UnitOfWork<EvaluationTxScope>;
