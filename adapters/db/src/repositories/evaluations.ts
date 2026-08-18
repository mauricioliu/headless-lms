import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { NotFoundError } from "@headless-lms/core/shared/errors";
import type {
  Evaluation,
  EvaluationRepository,
  ReplaceEvaluationInput,
} from "@headless-lms/core/evaluation";
import type { Logger } from "@headless-lms/core/types";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { evaluations } from "../schema/evaluations.js";
import { pgErrorFields, translateDbErrors } from "./pg-errors.js";

const COURSES_FK = "evaluations_org_id_course_id_courses_org_id_id_fk";

function toEvaluation(row: typeof evaluations.$inferSelect): Evaluation {
  return {
    courseId: row.courseId,
    cutoff: row.cutoff,
    feedbackMode: row.feedbackMode,
    questions: row.questions,
  };
}

export class DrizzleEvaluationRepository implements EvaluationRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async findByCourseId(orgId: string, courseId: string): Promise<Evaluation | null> {
    const [row] = await this.db
      .select()
      .from(evaluations)
      .where(and(eq(evaluations.orgId, orgId), eq(evaluations.courseId, courseId)));
    return row ? toEvaluation(row) : null;
  }

  async replace(
    orgId: string,
    courseId: string,
    input: ReplaceEvaluationInput,
  ): Promise<Evaluation> {
    try {
      const [row] = await this.db
        .insert(evaluations)
        .values({ orgId, courseId, ...input })
        .onConflictDoUpdate({
          target: [evaluations.orgId, evaluations.courseId],
          set: { ...input, updatedAt: new Date() },
        })
        .returning();
      if (!row) {
        throw new Error("evaluation replacement returned no row");
      }
      this.logger.debug("evaluation.replace", { orgId, courseId });
      return toEvaluation(row);
    } catch (err) {
      const pg = pgErrorFields(err);
      if (pg?.code === "23503" && pg.constraint === COURSES_FK) {
        throw new NotFoundError("Course", courseId);
      }
      throw err;
    }
  }
}
translateDbErrors(DrizzleEvaluationRepository);
