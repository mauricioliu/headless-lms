// students — Drizzle repository (implements the core outbound port).
// A read-model over org users + entitlements: a "student" row in the report is
// any org_users row with role 'student', with or without entitlements. Rooted at
// `org_users` and scoped by its org, with entitlements LEFT JOINed in for the
// aggregated count. Name/email come from the identity `users` row (INNER, since
// user_id is NOT NULL); the avatar comes from the better-auth `user` table,
// LEFT JOINed via that same identity row.
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { StudentsReportRepository } from '../../../reporting/students/index.js';
import type { Page, Student, StudentsQuery } from '../../../reporting/students/index.js';
import { orgUsers, users, entitlements } from '../schema/index.js';
import { STUDENT_ROLE } from '../../../core/organizations/index.js';
import { user } from '../../auth/schema.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';
import { orgUserProfileColumns } from './org-user-profile.js';

const entitlementCountExpr = sql<number>`count(${entitlements.id})`;
// Completion now lives in the progress domain; the students report no longer
// derives a percentage from entitlements. Placeholder until wired to progress.
const avgProgressExpr = sql<number>`0`;

interface StudentRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: Date;
  entitlementCount: number;
  avgProgress: number;
}

function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image ?? null,
    entitlementCount: Number(row.entitlementCount),
    avgProgress: Number(row.avgProgress),
    joinedAt: row.createdAt.toISOString(),
    lastActiveAt: null,
  };
}

export class DrizzleStudentsRepository implements StudentsReportRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async list(orgId: string, query: StudentsQuery): Promise<Page<Student>> {
    // Staff share this table now — the role filter is what keeps them out of
    // the students report.
    const filters: SQL[] = [eq(orgUsers.orgId, orgId), eq(orgUsers.role, STUDENT_ROLE)];
    const q = query.search?.trim();
    if (q) {
      const like = `%${q}%`;
      filters.push(or(ilike(users.displayName, like), ilike(users.email, like))!);
    }
    const where = and(...filters);

    const [totals] = await this.db
      .select({ total: sql<number>`count(*)` })
      .from(orgUsers)
      .innerJoin(users, eq(users.id, orgUsers.userId))
      .where(where);

    const rows = await this.db
      .select({
        ...orgUserProfileColumns,
        createdAt: orgUsers.createdAt,
        entitlementCount: entitlementCountExpr,
        avgProgress: avgProgressExpr,
      })
      .from(orgUsers)
      .leftJoin(
        entitlements,
        and(eq(entitlements.orgId, orgUsers.orgId), eq(entitlements.orgUserId, orgUsers.id)),
      )
      .innerJoin(users, eq(users.id, orgUsers.userId))
      .leftJoin(user, eq(user.id, users.externalId))
      .where(where)
      // Group by the full composite PK (orgId, id): grouping by id alone gives
      // Postgres no functional dependency for the other students columns.
      .groupBy(orgUsers.orgId, orgUsers.id, users.displayName, users.email, user.image)
      .orderBy(...this.resolveOrder(query.sort))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    return {
      rows: rows.map(toStudent),
      total: Number(totals?.total ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findById(orgId: string, id: string): Promise<Student | null> {
    const [row] = await this.db
      .select({
        ...orgUserProfileColumns,
        createdAt: orgUsers.createdAt,
        entitlementCount: entitlementCountExpr,
        avgProgress: avgProgressExpr,
      })
      .from(orgUsers)
      .leftJoin(
        entitlements,
        and(eq(entitlements.orgId, orgUsers.orgId), eq(entitlements.orgUserId, orgUsers.id)),
      )
      .innerJoin(users, eq(users.id, orgUsers.userId))
      .leftJoin(user, eq(user.id, users.externalId))
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.id, id), eq(orgUsers.role, STUDENT_ROLE)))
      .groupBy(orgUsers.orgId, orgUsers.id, users.displayName, users.email, user.image)
      .limit(1);
    return row ? toStudent(row) : null;
  }

  private resolveOrder(sort?: string): SQL[] {
    const descending = sort?.startsWith('-') ?? false;
    const field = sort ? (descending ? sort.slice(1) : sort) : 'name';
    const dir = descending ? desc : asc;
    switch (field) {
      case 'email':
        return [dir(users.email)];
      case 'entitlementCount':
        return [dir(entitlementCountExpr)];
      case 'avgProgress':
        return [dir(avgProgressExpr)];
      case 'joinedAt':
        return [dir(orgUsers.createdAt)];
      case 'name':
      default:
        return [dir(users.displayName)];
    }
  }
}
