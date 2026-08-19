// reporting/waves — Drizzle repository (implements the core outbound port).
// The per-Ola report's raw facts, read across waves, progress and evaluation
// attempts in one pass — the read reporting is allowed to make. An activity
// counts toward the avance denominator when its settings blob does not say
// published=false (missing ⇒ published), mirroring reporting/learn and
// reporting/courses. Only submitted attempts count — an open Intento is not a
// rendición yet, and the latest submitted Intento is the one that stands.
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  WaveReportData,
  WaveReportRepository,
  WaveWorkerFacts,
} from "@headless-lms/core/reporting/waves";
import type { Logger } from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import { courses, evaluations, waves } from "../schema/index.js";
import { translateDbErrors } from "./pg-errors.js";

interface WorkerRow {
  org_user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  completed_activities: string | number;
  course_completed_at: Date | string | null;
  attempts: string | number;
  latest_score: number | null;
  latest_passed: boolean | null;
}

export class DrizzleWaveReportRepository implements WaveReportRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async load(orgId: string, waveId: string): Promise<WaveReportData | null> {
    const [waveRow] = await this.db
      .select({
        id: waves.id,
        name: waves.name,
        courseId: waves.courseId,
        createdAt: waves.createdAt,
        courseTitle: courses.title,
        courseStatus: courses.status,
      })
      .from(waves)
      .innerJoin(courses, and(eq(courses.orgId, waves.orgId), eq(courses.id, waves.courseId)))
      .where(and(eq(waves.orgId, orgId), eq(waves.id, waveId)));
    if (!waveRow) {
      return null;
    }
    const courseId = waveRow.courseId;

    const published = await this.db.execute(sql`
      select count(*)::int as count
      from activities a
      where a.org_id = ${orgId}
        and a.course_id = ${courseId}
        and coalesce((a.settings ->> 'published')::boolean, true)
    `);
    const publishedActivities = Number(
      (published.rows[0] as { count: number } | undefined)?.count ?? 0,
    );

    const evaluation = await this.db
      .select({ courseId: evaluations.courseId })
      .from(evaluations)
      .where(and(eq(evaluations.orgId, orgId), eq(evaluations.courseId, courseId)));
    const hasEvaluation = evaluation.length > 0;

    const workersResult = await this.db.execute(sql`
      with acts as (
        select a.id
        from activities a
        where a.org_id = ${orgId}
          and a.course_id = ${courseId}
          and coalesce((a.settings ->> 'published')::boolean, true)
      ),
      members as (
        select wm.org_user_id, u.email, u.first_name, u.last_name, ou.status
        from wave_members wm
        join org_users ou on ou.org_id = wm.org_id and ou.id = wm.org_user_id
        join users u on u.id = ou.user_id
        where wm.org_id = ${orgId} and wm.wave_id = ${waveId}
      ),
      progress_counts as (
        select pr.org_user_id,
          count(*) filter (
            where pr.target_type = 'activity'
              and pr.target_id in (select id from acts)
              and pr.completed_at is not null
          ) as completed_activities,
          max(pr.completed_at) filter (
            where pr.target_type = 'course' and pr.target_id = ${courseId}
          ) as course_completed_at
        from progress_records pr
        where pr.org_id = ${orgId}
          and pr.org_user_id in (select org_user_id from members)
          and (
            (pr.target_type = 'activity' and pr.target_id in (select id from acts))
            or (pr.target_type = 'course' and pr.target_id = ${courseId})
          )
        group by pr.org_user_id
      ),
      attempt_counts as (
        select ea.org_user_id, count(*)::int as attempts
        from evaluation_attempts ea
        where ea.org_id = ${orgId}
          and ea.course_id = ${courseId}
          and ea.submitted_at is not null
          and ea.org_user_id in (select org_user_id from members)
        group by ea.org_user_id
      ),
      latest as (
        select distinct on (ea.org_user_id) ea.org_user_id, ea.score, ea.passed
        from evaluation_attempts ea
        where ea.org_id = ${orgId}
          and ea.course_id = ${courseId}
          and ea.submitted_at is not null
          and ea.org_user_id in (select org_user_id from members)
        order by ea.org_user_id, ea.attempt_number desc
      )
      select
        m.org_user_id,
        m.email,
        m.first_name,
        m.last_name,
        m.status,
        coalesce(pc.completed_activities, 0) as completed_activities,
        pc.course_completed_at,
        coalesce(ac.attempts, 0) as attempts,
        l.score as latest_score,
        l.passed as latest_passed
      from members m
      left join progress_counts pc on pc.org_user_id = m.org_user_id
      left join attempt_counts ac on ac.org_user_id = m.org_user_id
      left join latest l on l.org_user_id = m.org_user_id
      order by m.email
    `);

    const workers: WaveWorkerFacts[] = (workersResult.rows as unknown as WorkerRow[]).map((r) => ({
      orgUserId: r.org_user_id,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      status: r.status === "active" ? "active" : "invited",
      completedActivities: Number(r.completed_activities),
      courseCompletedAt: r.course_completed_at ? new Date(r.course_completed_at) : null,
      attempts: Number(r.attempts),
      latestScore: r.latest_score,
      latestPassed: r.latest_passed,
    }));

    this.logger.debug("wave_report.load", { orgId, waveId, workers: workers.length });
    return {
      wave: {
        id: waveRow.id,
        name: waveRow.name,
        courseId,
        createdAt: new Date(waveRow.createdAt),
      },
      course: {
        id: courseId,
        title: waveRow.courseTitle,
        status: waveRow.courseStatus === "published" ? "published" : "draft",
      },
      hasEvaluation,
      publishedActivities,
      workers,
    };
  }
}
translateDbErrors(DrizzleWaveReportRepository);
