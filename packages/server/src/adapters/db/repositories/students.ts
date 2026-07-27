// students — Drizzle repository (implements the core outbound port).
// A read-model over participations + entitlements: a "student" row in the report
// is any org_users row with role 'student', with or without entitlements (roster
// creation adds zero-entitlement students). Rooted at `org_users` and scoped by
// its org, with entitlements LEFT JOINed in for the aggregated count.
// Name/email/joinedAt come from the participation; the avatar comes from the
// better-auth `user` table, reached via the person row — both LEFT JOINed, since
// a roster entry has no person until an invitation is accepted.
import { and, asc, desc, eq, ilike, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { StudentsReportRepository } from '../../../reporting/students/index.js';
import type { Page, Student, StudentsQuery } from '../../../reporting/students/index.js';
import { orgUsers, users, entitlements } from '../schema/index.js';
import { STUDENT_ROLE } from '../../../core/organizations/index.js';
import { user } from '../../auth/schema.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

const nameExpr = sql<string>`${orgUsers.firstName} || ' ' || ${orgUsers.lastName}`;
const entitlementCountExpr = sql<number>`count(${entitlements.id})`;
// Completion now lives in the progress domain; the students report no longer
// derives a percentage from entitlements. Placeholder until wired to progress.
const avgProgressExpr = sql<number>`0`;
// A roster entry has no person until an invitation is accepted.
const hasAccountExpr = sql<boolean>`${isNotNull(orgUsers.userId)}`;

interface StudentRow {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: Date;
  entitlementCount: number;
  avgProgress: number;
  hasAccount: boolean;
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
    hasAccount: row.hasAccount,
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
      filters.push(
        or(
          ilike(orgUsers.firstName, like),
          ilike(orgUsers.lastName, like),
          ilike(orgUsers.email, like),
        )!,
      );
    }
    const where = and(...filters);

    const [totals] = await this.db
      .select({ total: sql<number>`count(*)` })
      .from(orgUsers)
      .where(where);

    const rows = await this.db
      .select({
        id: orgUsers.id,
        name: nameExpr,
        email: orgUsers.email,
        image: user.image,
        createdAt: orgUsers.createdAt,
        entitlementCount: entitlementCountExpr,
        avgProgress: avgProgressExpr,
        hasAccount: hasAccountExpr,
      })
      .from(orgUsers)
      .leftJoin(
        entitlements,
        and(eq(entitlements.orgId, orgUsers.orgId), eq(entitlements.orgUserId, orgUsers.id)),
      )
      .leftJoin(users, eq(users.id, orgUsers.userId))
      .leftJoin(user, eq(user.id, users.externalId))
      .where(where)
      // Group by the full composite PK (orgId, id): grouping by id alone gives
      // Postgres no functional dependency for the other students columns.
      .groupBy(orgUsers.orgId, orgUsers.id, user.image)
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
        id: orgUsers.id,
        name: nameExpr,
        email: orgUsers.email,
        image: user.image,
        createdAt: orgUsers.createdAt,
        entitlementCount: entitlementCountExpr,
        avgProgress: avgProgressExpr,
        hasAccount: hasAccountExpr,
      })
      .from(orgUsers)
      .leftJoin(
        entitlements,
        and(eq(entitlements.orgId, orgUsers.orgId), eq(entitlements.orgUserId, orgUsers.id)),
      )
      .leftJoin(users, eq(users.id, orgUsers.userId))
      .leftJoin(user, eq(user.id, users.externalId))
      .where(
        and(eq(orgUsers.orgId, orgId), eq(orgUsers.id, id), eq(orgUsers.role, STUDENT_ROLE)),
      )
      .groupBy(orgUsers.orgId, orgUsers.id, user.image)
      .limit(1);
    return row ? toStudent(row) : null;
  }

  private resolveOrder(sort?: string): SQL[] {
    const descending = sort?.startsWith('-') ?? false;
    const field = sort ? (descending ? sort.slice(1) : sort) : 'name';
    const dir = descending ? desc : asc;
    switch (field) {
      case 'email':
        return [dir(orgUsers.email)];
      case 'entitlementCount':
        return [dir(entitlementCountExpr)];
      case 'avgProgress':
        return [dir(avgProgressExpr)];
      case 'joinedAt':
        return [dir(orgUsers.createdAt)];
      case 'name':
      default:
        return [dir(nameExpr)];
    }
  }
}
