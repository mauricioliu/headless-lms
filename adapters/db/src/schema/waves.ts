// waves tables — the Ola: a named group of Trabajadores inscribed together in
// one Curso. Owns the wave row and its membership; the org users and the
// course it references belong to their own contexts.
import { foreignKey, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { Wave } from "@headless-lms/core/schemas";
import { genId } from "@headless-lms/core/shared/id";
import { courses } from "./content.js";
import { organizations, orgUsers } from "./organizations.js";
import type { Expect, NoDrift } from "./drift.js";

export const waves = pgTable(
  "waves",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    id: text("id")
      .notNull()
      .$defaultFn(() => genId("wave")),
    name: text("name").notNull(),
    courseId: text("course_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    courseFk: foreignKey({
      columns: [t.orgId, t.courseId],
      foreignColumns: [courses.orgId, courses.id],
    }).onDelete("cascade"),
  }),
);

// One membership row per Trabajador per Ola; the same person can ride later
// Olas of the same Curso, each its own row.
export const waveMembers = pgTable(
  "wave_members",
  {
    orgId: text("org_id").notNull(),
    waveId: text("wave_id").notNull(),
    orgUserId: text("org_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.waveId, t.orgUserId] }),
    waveFk: foreignKey({
      columns: [t.orgId, t.waveId],
      foreignColumns: [waves.orgId, waves.id],
    }).onDelete("cascade"),
    orgUserFk: foreignKey({
      columns: [t.orgId, t.orgUserId],
      foreignColumns: [orgUsers.orgId, orgUsers.id],
    }).onDelete("cascade"),
  }),
);

// `memberCount` on the domain Wave is derived (a count of membership rows),
// so the drift check covers the stored columns only. The wave row itself is
// immutable — a correction is a new Ola, not an edit.
type _WavesDrift = Expect<NoDrift<typeof waves.$inferSelect, Omit<Wave, "memberCount">>>;
