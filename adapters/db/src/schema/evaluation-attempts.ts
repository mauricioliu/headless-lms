import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AttemptAnswer } from "@headless-lms/core/evaluation";
import { courses } from "./content.js";
import { orgUsers } from "./organizations.js";

export const evaluationAttempts = pgTable(
  "evaluation_attempts",
  {
    orgId: text("org_id").notNull(),
    courseId: text("course_id").notNull(),
    orgUserId: text("org_user_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    answers: jsonb("answers").$type<AttemptAnswer[]>(),
    score: integer("score"),
    cutoff: integer("cutoff"),
    passed: boolean("passed"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.courseId, t.orgUserId, t.attemptNumber] }),
    courseFk: foreignKey({
      columns: [t.orgId, t.courseId],
      foreignColumns: [courses.orgId, courses.id],
    }).onDelete("cascade"),
    orgUserFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }).onDelete("cascade"),
    scoreRange: check(
      "evaluation_attempts_score_range",
      sql`${t.score} is null or ${t.score} between 0 and 100`,
    ),
    cutoffRange: check(
      "evaluation_attempts_cutoff_range",
      sql`${t.cutoff} is null or ${t.cutoff} between 1 and 100`,
    ),
  }),
);
