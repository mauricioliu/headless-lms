import type { Evaluation, ReplaceEvaluationInput } from './model.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';

export interface EvaluationRepository {
  findByCourseId(orgId: string, courseId: string): Promise<Evaluation | null>;
  replace(orgId: string, courseId: string, input: ReplaceEvaluationInput): Promise<Evaluation>;
}

export interface EvaluationCourseReader {
  getCourse(orgId: string, courseId: string): Promise<unknown | null>;
}

export interface EvaluationTxScope {
  evaluations: EvaluationRepository;
  outbox: OutboxAppender;
}

export type EvaluationUnitOfWork = UnitOfWork<EvaluationTxScope>;
