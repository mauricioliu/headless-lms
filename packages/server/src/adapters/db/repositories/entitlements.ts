import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '../index.js';
import type { EntitlementsRepository } from '../../../core/entitlements/ports.js';
import type {
  ContentRef,
  Entitlement,
  EntitlementStatus,
  EntitlementsQuery,
  GrantEntitlementInput,
  Page,
} from '@headless-lms/types';
import { entitlements } from '../schema/index.js';
import { orgUsers, users } from '../schema/index.js';
import { contentItems, courses, downloads } from '../schema/content.js';
import type { Logger } from '@headless-lms/types';
import { noopLogger } from '../../../core/shared/logger.js';

// CASE expression: revoked beats everything; otherwise an elapsed expiry reads as
// expired; otherwise active.
const derivedStatus = sql<EntitlementStatus>`case
  when ${entitlements.status} = 'revoked' then 'revoked'
  when ${entitlements.expiresAt} is not null and ${entitlements.expiresAt} < now() then 'expired'
  else 'active'
end`;

// Display name of the granted content, whatever its type. One LEFT JOIN per
// concrete content table; exactly one hits per row (type-pinned FKs), so the
// COALESCE picks the single non-null title. Extended per new content type.
const contentTitle = sql<string>`coalesce(${courses.title}, ${downloads.title})`;

// Sortable columns by the client-facing field name. `status` sorts on the derived
// expression so the ordering matches the displayed value; `contentTitle` on the
// coalesced join expression.
const sortColumns = {
  studentName: users.displayName,
  studentEmail: users.email,
  contentTitle,
  status: derivedStatus,
  grantedAt: entitlements.grantedAt,
  expiresAt: entitlements.expiresAt,
  source: entitlements.source,
} as const;

const selection = {
  id: entitlements.id,
  orgUserId: entitlements.orgUserId,
  studentName: users.displayName,
  studentEmail: users.email,
  contentId: entitlements.contentId,
  contentType: contentItems.type,
  contentTitle,
  status: derivedStatus,
  grantedAt: entitlements.grantedAt,
  expiresAt: entitlements.expiresAt,
  source: entitlements.source,
} as const;

interface Row {
  id: string;
  orgUserId: string;
  studentName: string;
  studentEmail: string;
  contentId: string;
  contentType: ContentRef['type'];
  contentTitle: string;
  status: EntitlementStatus;
  grantedAt: Date;
  expiresAt: Date | null;
  source: string;
}

function toEntitlement(row: Row): Entitlement {
  return {
    id: row.id,
    orgUserId: row.orgUserId,
    studentName: row.studentName,
    studentEmail: row.studentEmail,
    content: { id: row.contentId, type: row.contentType, title: row.contentTitle },
    status: row.status,
    grantedAt: row.grantedAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    source: row.source,
  };
}

export class DrizzleEntitlementsRepository implements EntitlementsRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly logger: Logger = noopLogger,
  ) {}

  /** entitlements → org_users + content_items (type) + one LEFT JOIN per
   *  concrete content table (title). */
  private joined(where: SQL | undefined) {
    return this.db
      .select(selection)
      .from(entitlements)
      .innerJoin(
        orgUsers,
        and(eq(orgUsers.orgId, entitlements.orgId), eq(orgUsers.id, entitlements.orgUserId)),
      )
      .innerJoin(users, eq(users.id, orgUsers.userId))
      .innerJoin(
        contentItems,
        and(eq(contentItems.orgId, entitlements.orgId), eq(contentItems.id, entitlements.contentId)),
      )
      .leftJoin(
        courses,
        and(eq(courses.orgId, entitlements.orgId), eq(courses.id, entitlements.contentId)),
      )
      .leftJoin(
        downloads,
        and(eq(downloads.orgId, entitlements.orgId), eq(downloads.id, entitlements.contentId)),
      )
      .where(where);
  }

  async list(orgId: string, query: EntitlementsQuery): Promise<Page<Entitlement>> {
    const conditions: SQL[] = [eq(entitlements.orgId, orgId)];
    if (query.status) {
      conditions.push(sql`${derivedStatus} = ${query.status}`);
    }
    if (query.source) {
      conditions.push(eq(entitlements.source, query.source));
    }
    if (query.orgUserId) {
      conditions.push(eq(entitlements.orgUserId, query.orgUserId));
    }
    if (query.contentId) {
      conditions.push(eq(entitlements.contentId, query.contentId));
    }
    if (query.type) {
      conditions.push(eq(contentItems.type, query.type));
    }
    if (query.search) {
      const pattern = `%${query.search}%`;
      conditions.push(
        or(
          ilike(users.displayName, pattern),
          ilike(users.email, pattern),
          ilike(contentTitle, pattern),
        ) as SQL,
      );
    }
    const where = and(...conditions);

    // Sort: `-field` for descending; default to most-recently granted first.
    let orderBy: SQL;
    if (query.sort) {
      const isDesc = query.sort.startsWith('-');
      const field = (isDesc ? query.sort.slice(1) : query.sort) as keyof typeof sortColumns;
      const col = sortColumns[field] ?? entitlements.grantedAt;
      orderBy = isDesc ? desc(col) : asc(col);
    } else {
      orderBy = desc(entitlements.grantedAt);
    }

    const offset = (query.page - 1) * query.pageSize;

    const rows = await this.joined(where).orderBy(orderBy).limit(query.pageSize).offset(offset);

    const [{ total } = { total: 0 }] = await this.db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(entitlements)
      .innerJoin(
        orgUsers,
        and(eq(orgUsers.orgId, entitlements.orgId), eq(orgUsers.id, entitlements.orgUserId)),
      )
      .innerJoin(
        contentItems,
        and(eq(contentItems.orgId, entitlements.orgId), eq(contentItems.id, entitlements.contentId)),
      )
      .leftJoin(
        courses,
        and(eq(courses.orgId, entitlements.orgId), eq(courses.id, entitlements.contentId)),
      )
      .leftJoin(
        downloads,
        and(eq(downloads.orgId, entitlements.orgId), eq(downloads.id, entitlements.contentId)),
      )
      .where(where);

    return {
      rows: rows.map(toEntitlement),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async insert(orgId: string, input: GrantEntitlementInput): Promise<Entitlement> {
    const [row] = await this.db
      .insert(entitlements)
      .values({
        orgId,
        orgUserId: input.orgUserId,
        contentId: input.contentId,
        status: 'active',
        source: 'manual',
        grantedAt: new Date(),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      })
      .onConflictDoUpdate({
        target: [entitlements.orgId, entitlements.orgUserId, entitlements.contentId],
        set: {
          status: 'active',
          source: 'manual',
          grantedAt: new Date(),
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        },
      })
      .returning({ id: entitlements.id });
    if (!row) {
      throw new Error('failed to insert entitlement');
    }
    const entitlement = await this.findById(orgId, row.id);
    if (!entitlement) {
      throw new Error('failed to read inserted entitlement');
    }
    return entitlement;
  }

  async setStatus(
    orgId: string,
    id: string,
    status: 'active' | 'revoked',
  ): Promise<Entitlement | null> {
    const [row] = await this.db
      .update(entitlements)
      .set({ status })
      .where(and(eq(entitlements.orgId, orgId), eq(entitlements.id, id)))
      .returning({ id: entitlements.id });
    if (!row) {
      return null;
    }
    return this.findById(orgId, row.id);
  }

  private async findById(orgId: string, id: string): Promise<Entitlement | null> {
    const rows = await this.joined(
      and(eq(entitlements.orgId, orgId), eq(entitlements.id, id)),
    ).limit(1);
    const [row] = rows;
    return row ? toEntitlement(row) : null;
  }

  /** Existence check scoped to the course case: same status predicate as
   *  `list` (revoked never counts; an elapsed expiry reads as expired, not
   *  active), joined to content_items and constrained to type = 'course' so a
   *  grant on some other content type can never be mistaken for course access. */
  async hasCourseAccess(orgId: string, orgUserId: string, courseId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: entitlements.id })
      .from(entitlements)
      .innerJoin(
        contentItems,
        and(eq(contentItems.orgId, entitlements.orgId), eq(contentItems.id, entitlements.contentId)),
      )
      .where(
        and(
          eq(entitlements.orgId, orgId),
          eq(entitlements.orgUserId, orgUserId),
          eq(entitlements.contentId, courseId),
          eq(contentItems.type, 'course'),
          sql`${derivedStatus} = 'active'`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
