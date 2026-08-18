import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { EvaluationQuestion, FeedbackMode } from "@headless-lms/core/evaluation";
import { courses } from "./content.js";

export const evaluations = pgTable(
  "evaluations",
  {
    orgId: text("org_id").notNull(),
    courseId: text("course_id").notNull(),
    cutoff: integer("cutoff").notNull().default(70),
    feedbackMode: text("feedback_mode", { enum: ["score_only", "answer_review"] })
      .$type<FeedbackMode>()
      .notNull()
      .default("score_only"),
    questions: jsonb("questions").$type<EvaluationQuestion[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.courseId] }),
    courseFk: foreignKey({
      columns: [t.orgId, t.courseId],
      foreignColumns: [courses.orgId, courses.id],
    }).onDelete("cascade"),
    cutoffRange: check("evaluations_cutoff_range", sql`${t.cutoff} between 1 and 100`),
  }),
);
