import { and, desc, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Attempt, EvaluationAttemptRepository } from "@headless-lms/core/evaluation";
import type { Logger } from "@headless-lms/core/types";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { evaluationAttempts } from "../schema/evaluation-attempts.js";
import { translateDbErrors } from "./pg-errors.js";

type Row = typeof evaluationAttempts.$inferSelect;

function toAttempt(row: Row): Attempt {
  return {
    orgId: row.orgId,
    courseId: row.courseId,
    orgUserId: row.orgUserId,
    attemptNumber: row.attemptNumber,
    startedAt: row.startedAt,
    submittedAt: row.submittedAt,
    answers: row.answers ?? null,
    score: row.score ?? null,
    cutoff: row.cutoff ?? null,
    passed: row.passed ?? null,
  };
}

export class DrizzleEvaluationAttemptRepository implements EvaluationAttemptRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async findLatest(orgId: string, courseId: string, orgUserId: string): Promise<Attempt | null> {
    const [row] = await this.db
      .select()
      .from(evaluationAttempts)
      .where(
        and(
          eq(evaluationAttempts.orgId, orgId),
          eq(evaluationAttempts.courseId, courseId),
          eq(evaluationAttempts.orgUserId, orgUserId),
        ),
      )
      .orderBy(desc(evaluationAttempts.attemptNumber))
      .limit(1);
    return row ? toAttempt(row) : null;
  }

  async insert(orgId: string, attempt: Attempt): Promise<Attempt | null> {
    const [row] = await this.db
      .insert(evaluationAttempts)
      .values({
        orgId,
        courseId: attempt.courseId,
        orgUserId: attempt.orgUserId,
        attemptNumber: attempt.attemptNumber,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        answers: attempt.answers,
        score: attempt.score,
        cutoff: attempt.cutoff,
        passed: attempt.passed,
      })
      .onConflictDoNothing()
      .returning();
    if (row) {
      this.logger.debug("evaluation_attempts.insert", {
        orgId,
        courseId: attempt.courseId,
        orgUserId: attempt.orgUserId,
        attemptNumber: attempt.attemptNumber,
      });
    }
    return row ? toAttempt(row) : null;
  }

  async submit(
    orgId: string,
    courseId: string,
    orgUserId: string,
    attemptNumber: number,
    graded: {
      submittedAt: Date;
      answers: Attempt["answers"];
      score: number;
      cutoff: number;
      passed: boolean;
    },
  ): Promise<Attempt | null> {
    const [row] = await this.db
      .update(evaluationAttempts)
      .set({
        submittedAt: graded.submittedAt,
        answers: graded.answers,
        score: graded.score,
        cutoff: graded.cutoff,
        passed: graded.passed,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(evaluationAttempts.orgId, orgId),
          eq(evaluationAttempts.courseId, courseId),
          eq(evaluationAttempts.orgUserId, orgUserId),
          eq(evaluationAttempts.attemptNumber, attemptNumber),
          isNull(evaluationAttempts.submittedAt),
        ),
      )
      .returning();
    return row ? toAttempt(row) : null;
  }
}
translateDbErrors(DrizzleEvaluationAttemptRepository);
