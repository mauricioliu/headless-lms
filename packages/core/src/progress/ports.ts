// progress context — ports.
// Inbound: the use-case interface the service implements.
// Outbound: the persistence contract the repository fulfils.
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';
import type { ProgressRecord } from './model.js';
import type { ProgressTarget, ReportProgressInput } from './types.js';

// Inbound port (use cases the service exposes).
export interface ProgressService {
  /** Process a usage report: ensure the record, apply position, evaluate
   *  completion (activity rule, then module/course against current structure),
   *  emit events. Returns the activity's record after the decision. */
  report(orgId: string, input: ReportProgressInput): Promise<ProgressRecord>;
  /** Fetch the record for a single (student, target), or null. */
  get(orgId: string, target: ProgressTarget): Promise<ProgressRecord | null>;
  /** Records for a set of target ids — the read the reporting layer composes. */
  listByTargets(orgId: string, orgUserId: string, targetIds: string[]): Promise<ProgressRecord[]>;
  /** Whether the Trabajador has any progress record at all in the org. */
  hasRecords(orgId: string, orgUserId: string): Promise<boolean>;
  /** Derived course percentage (0–100) against the current published structure —
   *  the fact the evaluation gate consumes. */
  coursePercent(orgId: string, orgUserId: string, courseId: string): Promise<number>;
  /** Re-evaluate the Completado conjunction for one student+course — the trigger
   *  the evaluation context calls after a passed attempt. Returns the course
   *  record when the course completes, else null. */
  refreshCourseCompletion(
    orgId: string,
    orgUserId: string,
    courseId: string,
  ): Promise<ProgressRecord | null>;
}

/** The evaluation half of the Completado conjunction: null = the course has no
 *  evaluation (no gate); otherwise the latest attempt's approval stands. */
export interface CourseEvaluationApprovalReader {
  latestApproval(
    orgId: string,
    courseId: string,
    orgUserId: string,
  ): Promise<{ passed: boolean } | null>;
}

// Outbound port (persistence contract the repository fulfils).
export interface ProgressRepository {
  /** Conflict-safe insert. null = lost a concurrent-insert race (unique key already taken). */
  insert(orgId: string, record: ProgressRecord): Promise<ProgressRecord | null>;
  /** Any record at all, any target — the student-delete evidence guard. */
  existsForOrgUser(orgId: string, orgUserId: string): Promise<boolean>;
  /** Scoped to the org — returns the record for the unique (student, target) key, or null. */
  findByTarget(orgId: string, target: ProgressTarget): Promise<ProgressRecord | null>;
  /** All of the student's records whose targetId is in the set. `forUpdate` takes tx-scoped
   *  row locks (ordered) to serialize concurrent reports for the same student+course. */
  findByTargets(
    orgId: string,
    orgUserId: string,
    targetIds: string[],
    opts?: { forUpdate?: boolean },
  ): Promise<ProgressRecord[]>;
  update(
    orgId: string,
    id: string,
    patch: Partial<Pick<ProgressRecord, 'position' | 'completedAt'>>,
  ): Promise<ProgressRecord | null>;
}

/** Writes that emit events run through this scope so row + outbox entry commit
 *  in one transaction. */
export interface ProgressWriteScope {
  progress: ProgressRepository;
  outbox: OutboxAppender;
}
export type ProgressUnitOfWork = UnitOfWork<ProgressWriteScope>;
