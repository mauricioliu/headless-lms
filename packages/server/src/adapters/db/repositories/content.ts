// content — Drizzle repository for the course aggregate root (implements the core
// outbound `ContentRepository` port). Org-scoped: every method takes the domain
// `organizations.id` and constrains its queries to that tenant. The `Course`
// model carries DERIVED fields (module / activity / enrolled counts) computed via
// correlated subqueries.
import { eq, and, sql, count, asc, desc, ilike, or, type SQL, type AnyColumn } from 'drizzle-orm';
import type { DbExecutor } from '../index.js';
import type { ContentRepository } from '../../../core/content/ports.js';
import type {
  Course,
  CourseStatus,
  Download,
  DownloadAsset,
  DownloadStatus,
} from '../../../core/content/model.js';
import type {
  AddDownloadAssetInput,
  CreateCourseInput,
  CreateDownloadInput,
  ListCoursesQuery,
  ListDownloadsQuery,
  Page,
  UpdateCourseInput,
  UpdateDownloadInput,
} from '../../../core/content/types.js';
import {
  contentItems,
  courses,
  modules,
  activities,
  downloads,
  downloadAssets,
} from '../schema/content.js';
import { entitlements } from '../schema/entitlements.js';
import { assets } from '../schema/assets.js';
import { genId } from '../../../core/shared/id.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';

// Derived counts as correlated subqueries against the current `courses` row.
// NOTE: Drizzle does NOT table-qualify a Column interpolated into a raw `sql`
// template (`${modules.orgId}` renders bare `"org_id"`), which collides with the
// outer `courses.org_id` and yields a 42702 "ambiguous column" error. Qualify
// every reference explicitly by interpolating the TABLE (`${modules}` → "modules")
// and appending the column name.
const moduleCountExpr = sql<number>`(
  select count(*)::int from ${modules}
  where ${modules}.org_id = ${courses}.org_id and ${modules}.course_id = ${courses}.id
)`;

const activityCountExpr = sql<number>`(
  select count(*)::int from ${activities}
  inner join ${modules}
    on ${modules}.org_id = ${activities}.org_id and ${modules}.id = ${activities}.module_id
  where ${modules}.org_id = ${courses}.org_id
    and ${modules}.course_id = ${courses}.id
)`;

const enrolledCountExpr = sql<number>`(
  select count(*)::int from ${entitlements}
  where ${entitlements}.org_id = ${courses}.org_id
    and ${entitlements}.content_id = ${courses}.id
    and ${entitlements}.status = 'active'
    and (${entitlements}.expires_at is null or ${entitlements}.expires_at >= now())
)`;

const selection = {
  id: courses.id,
  title: courses.title,
  slug: courses.slug,
  description: courses.description,
  status: courses.status,
  category: courses.category,
  moduleCount: moduleCountExpr,
  activityCount: activityCountExpr,
  enrolledCount: enrolledCountExpr,
  createdAt: courses.createdAt,
  updatedAt: courses.updatedAt,
};

type CourseRow = {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: string;
  category: string;
  moduleCount: number;
  activityCount: number;
  enrolledCount: number;
  createdAt: Date;
  updatedAt: Date;
};

function toCourse(row: CourseRow): Course {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    status: row.status as CourseStatus,
    category: row.category,
    moduleCount: Number(row.moduleCount),
    activityCount: Number(row.activityCount),
    enrolledCount: Number(row.enrolledCount),
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

// Columns/expressions a caller may sort by. Default falls back to createdAt desc.
const sortColumns: Record<string, AnyColumn | SQL> = {
  title: courses.title,
  slug: courses.slug,
  status: courses.status,
  category: courses.category,
  createdAt: courses.createdAt,
  updatedAt: courses.updatedAt,
  moduleCount: moduleCountExpr,
  activityCount: activityCountExpr,
  enrolledCount: enrolledCountExpr,
};

// Derived counts for downloads, same correlated-subquery shape as the course
// expressions above.
const assetCountExpr = sql<number>`(
  select count(*)::int from ${downloadAssets}
  where ${downloadAssets}.org_id = ${downloads}.org_id
    and ${downloadAssets}.download_id = ${downloads}.id
)`;

const totalSizeExpr = sql<number>`(
  select coalesce(sum(${assets}.size), 0)::bigint from ${downloadAssets}
  inner join ${assets}
    on ${assets}.org_id = ${downloadAssets}.org_id and ${assets}.id = ${downloadAssets}.asset_id
  where ${downloadAssets}.org_id = ${downloads}.org_id
    and ${downloadAssets}.download_id = ${downloads}.id
)`;

const downloadEntitledCountExpr = sql<number>`(
  select count(*)::int from ${entitlements}
  where ${entitlements}.org_id = ${downloads}.org_id
    and ${entitlements}.content_id = ${downloads}.id
    and ${entitlements}.status = 'active'
    and (${entitlements}.expires_at is null or ${entitlements}.expires_at >= now())
)`;

const downloadSelection = {
  id: downloads.id,
  title: downloads.title,
  slug: downloads.slug,
  description: downloads.description,
  status: downloads.status,
  category: downloads.category,
  thumbnailAssetId: downloads.thumbnailAssetId,
  assetCount: assetCountExpr,
  totalSize: totalSizeExpr,
  entitledCount: downloadEntitledCountExpr,
  createdAt: downloads.createdAt,
  updatedAt: downloads.updatedAt,
};

const downloadSortColumns: Record<string, AnyColumn | SQL> = {
  title: downloads.title,
  slug: downloads.slug,
  status: downloads.status,
  category: downloads.category,
  createdAt: downloads.createdAt,
  updatedAt: downloads.updatedAt,
  assetCount: assetCountExpr,
  totalSize: totalSizeExpr,
  entitledCount: downloadEntitledCountExpr,
};

function toDownload(row: {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: string;
  category: string;
  thumbnailAssetId: string | null;
  assetCount: number;
  totalSize: number | string;
  entitledCount: number;
  createdAt: Date;
  updatedAt: Date;
}): Download {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    status: row.status as DownloadStatus,
    category: row.category,
    thumbnailAssetId: row.thumbnailAssetId,
    assetCount: Number(row.assetCount),
    // sum() returns bigint, which pg hands back as a string.
    totalSize: Number(row.totalSize),
    entitledCount: Number(row.entitledCount),
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toDownloadAsset(row: {
  id: string;
  assetId: string;
  seq: number;
  displayName: string | null;
  filename: string;
  contentType: string;
  size: number;
}): DownloadAsset {
  return {
    id: row.id,
    assetId: row.assetId,
    seq: row.seq,
    displayName: row.displayName,
    filename: row.filename,
    contentType: row.contentType,
    size: Number(row.size),
  };
}

export class DrizzleContentRepository implements ContentRepository {
  constructor(
    private readonly db: DbExecutor,
    private readonly logger: Logger = noopLogger,
  ) {}

  async list(orgId: string, query: ListCoursesQuery): Promise<Page<Course>> {
    const conditions: SQL[] = [eq(courses.orgId, orgId)];
    if (query.status) {
      conditions.push(eq(courses.status, query.status));
    }
    if (query.category) {
      conditions.push(eq(courses.category, query.category));
    }

    const search = query.search?.trim();
    if (search) {
      const like = `%${search}%`;
      const match = or(ilike(courses.title, like), ilike(courses.category, like));
      if (match) {
        conditions.push(match);
      }
    }

    const where = and(...conditions);

    // Resolve sort: `-` prefix = desc, default createdAt desc.
    let sortKey = 'createdAt';
    let direction: 'asc' | 'desc' = 'desc';
    if (query.sort) {
      const isDesc = query.sort.startsWith('-');
      const key = isDesc ? query.sort.slice(1) : query.sort;
      if (key in sortColumns) {
        sortKey = key;
        direction = isDesc ? 'desc' : 'asc';
      }
    }
    const sortExpr = sortColumns[sortKey] ?? courses.createdAt;
    const orderBy = direction === 'desc' ? desc(sortExpr) : asc(sortExpr);

    const rows = await this.db
      .select(selection)
      .from(courses)
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const [totalRow] = await this.db.select({ value: count() }).from(courses).where(where);

    return {
      rows: rows.map(toCourse),
      total: totalRow?.value ?? 0,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findById(orgId: string, id: string): Promise<Course | null> {
    const [row] = await this.db
      .select(selection)
      .from(courses)
      .where(and(eq(courses.orgId, orgId), eq(courses.id, id)))
      .limit(1);
    return row ? toCourse(row) : null;
  }

  async create(orgId: string, input: CreateCourseInput, slug: string): Promise<Course> {
    // Registry row + concrete row share one id. Both inserts run on the same
    // executor — mutations reach this repository tx-bound (ContentUnitOfWork),
    // so they commit or roll back together.
    const id = genId('course');
    await this.db.insert(contentItems).values({ orgId, id, type: 'course' });
    const [inserted] = await this.db
      .insert(courses)
      .values({
        orgId,
        id,
        title: input.title,
        slug,
        description: input.description ?? '',
        category: input.category ?? '',
      })
      .returning({ id: courses.id });
    if (!inserted) {
      throw new Error('failed to insert course');
    }
    const created = await this.findById(orgId, inserted.id);
    if (!created) {
      throw new Error('failed to load created course');
    }
    return created;
  }

  async update(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) {
      set.title = patch.title;
    }
    if (patch.description !== undefined) {
      set.description = patch.description;
    }
    if (patch.category !== undefined) {
      set.category = patch.category;
    }
    if (patch.status !== undefined) {
      set.status = patch.status;
    }

    const [updated] = await this.db
      .update(courses)
      .set(set)
      .where(and(eq(courses.orgId, orgId), eq(courses.id, id)))
      .returning({ id: courses.id });
    if (!updated) {
      return null;
    }
    return this.findById(orgId, id);
  }

  async delete(orgId: string, id: string): Promise<boolean> {
    // Deletes go through the registry: cascades to the course row and its
    // entitlements in one statement. Never delete from `courses` directly —
    // that would strand the registry row.
    const deleted = await this.db
      .delete(contentItems)
      .where(
        and(eq(contentItems.orgId, orgId), eq(contentItems.id, id), eq(contentItems.type, 'course')),
      )
      .returning({ id: contentItems.id });
    return deleted.length > 0;
  }

  // --- downloads --------------------------------------------------------

  async listDownloads(orgId: string, query: ListDownloadsQuery): Promise<Page<Download>> {
    const conditions: SQL[] = [eq(downloads.orgId, orgId)];
    if (query.status) {
      conditions.push(eq(downloads.status, query.status));
    }
    if (query.category) {
      conditions.push(eq(downloads.category, query.category));
    }

    const search = query.search?.trim();
    if (search) {
      const like = `%${search}%`;
      const match = or(ilike(downloads.title, like), ilike(downloads.category, like));
      if (match) {
        conditions.push(match);
      }
    }

    const where = and(...conditions);

    // Resolve sort: `-` prefix = desc, default createdAt desc.
    let sortKey = 'createdAt';
    let direction: 'asc' | 'desc' = 'desc';
    if (query.sort) {
      const isDesc = query.sort.startsWith('-');
      const key = isDesc ? query.sort.slice(1) : query.sort;
      if (key in downloadSortColumns) {
        sortKey = key;
        direction = isDesc ? 'desc' : 'asc';
      }
    }
    const sortExpr = downloadSortColumns[sortKey] ?? downloads.createdAt;
    const orderBy = direction === 'desc' ? desc(sortExpr) : asc(sortExpr);

    const rows = await this.db
      .select(downloadSelection)
      .from(downloads)
      .where(where)
      .orderBy(orderBy)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);

    const [totalRow] = await this.db.select({ value: count() }).from(downloads).where(where);

    return {
      rows: rows.map(toDownload),
      total: totalRow?.value ?? 0,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getDownload(orgId: string, id: string): Promise<Download | null> {
    const [row] = await this.db
      .select(downloadSelection)
      .from(downloads)
      .where(and(eq(downloads.orgId, orgId), eq(downloads.id, id)))
      .limit(1);
    return row ? toDownload(row) : null;
  }

  async createDownload(
    orgId: string,
    input: CreateDownloadInput,
    slug: string,
  ): Promise<Download> {
    // Registry row + concrete row share one id, same as courses. Both inserts
    // run on the same executor — mutations reach this repository tx-bound.
    const id = genId('download');
    await this.db.insert(contentItems).values({ orgId, id, type: 'download' });
    await this.db.insert(downloads).values({
      orgId,
      id,
      title: input.title,
      slug,
      description: input.description ?? '',
      category: input.category ?? '',
    });
    const created = await this.getDownload(orgId, id);
    if (!created) {
      throw new Error('failed to load created download');
    }
    return created;
  }

  async updateDownload(
    orgId: string,
    id: string,
    patch: UpdateDownloadInput,
  ): Promise<Download | null> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) {
      set.title = patch.title;
    }
    if (patch.description !== undefined) {
      set.description = patch.description;
    }
    if (patch.category !== undefined) {
      set.category = patch.category;
    }
    if (patch.status !== undefined) {
      set.status = patch.status;
    }
    if (patch.thumbnailAssetId !== undefined) {
      set.thumbnailAssetId = patch.thumbnailAssetId;
    }

    const [updated] = await this.db
      .update(downloads)
      .set(set)
      .where(and(eq(downloads.orgId, orgId), eq(downloads.id, id)))
      .returning({ id: downloads.id });
    if (!updated) {
      return null;
    }
    return this.getDownload(orgId, id);
  }

  async deleteDownload(orgId: string, id: string): Promise<boolean> {
    // Through the registry, so the cascade reaches the download row, its asset
    // links, and the grants. Never delete from `downloads` directly.
    const deleted = await this.db
      .delete(contentItems)
      .where(
        and(
          eq(contentItems.orgId, orgId),
          eq(contentItems.id, id),
          eq(contentItems.type, 'download'),
        ),
      )
      .returning({ id: contentItems.id });
    return deleted.length > 0;
  }

  async listDownloadAssets(orgId: string, downloadId: string): Promise<DownloadAsset[]> {
    const rows = await this.db
      .select({
        id: downloadAssets.id,
        assetId: downloadAssets.assetId,
        seq: downloadAssets.seq,
        displayName: downloadAssets.displayName,
        filename: assets.filename,
        contentType: assets.contentType,
        size: assets.size,
      })
      .from(downloadAssets)
      .innerJoin(
        assets,
        and(eq(assets.orgId, downloadAssets.orgId), eq(assets.id, downloadAssets.assetId)),
      )
      .where(and(eq(downloadAssets.orgId, orgId), eq(downloadAssets.downloadId, downloadId)))
      .orderBy(asc(downloadAssets.seq));
    return rows.map(toDownloadAsset);
  }

  async addDownloadAsset(
    orgId: string,
    downloadId: string,
    input: AddDownloadAssetInput,
  ): Promise<DownloadAsset[]> {
    const [maxRow] = await this.db
      .select({ maxSeq: sql<number | null>`max(${downloadAssets.seq})` })
      .from(downloadAssets)
      .where(and(eq(downloadAssets.orgId, orgId), eq(downloadAssets.downloadId, downloadId)));
    const nextSeq = (maxRow?.maxSeq ?? -1) + 1;
    await this.db.insert(downloadAssets).values({
      orgId,
      downloadId,
      assetId: input.assetId,
      seq: nextSeq,
      displayName: input.displayName ?? null,
    });
    return this.listDownloadAssets(orgId, downloadId);
  }

  async removeDownloadAsset(
    orgId: string,
    downloadId: string,
    assetId: string,
  ): Promise<DownloadAsset[]> {
    await this.db
      .delete(downloadAssets)
      .where(
        and(
          eq(downloadAssets.orgId, orgId),
          eq(downloadAssets.downloadId, downloadId),
          eq(downloadAssets.assetId, assetId),
        ),
      );
    return this.listDownloadAssets(orgId, downloadId);
  }

  async renameDownloadAsset(
    orgId: string,
    downloadId: string,
    assetId: string,
    displayName: string | null,
  ): Promise<DownloadAsset[]> {
    await this.db
      .update(downloadAssets)
      .set({ displayName })
      .where(
        and(
          eq(downloadAssets.orgId, orgId),
          eq(downloadAssets.downloadId, downloadId),
          eq(downloadAssets.assetId, assetId),
        ),
      );
    return this.listDownloadAssets(orgId, downloadId);
  }

  async reorderDownloadAssets(
    orgId: string,
    downloadId: string,
    assetIds: string[],
  ): Promise<DownloadAsset[]> {
    // The service has already verified this is exactly the current set.
    for (const [seq, assetId] of assetIds.entries()) {
      await this.db
        .update(downloadAssets)
        .set({ seq })
        .where(
          and(
            eq(downloadAssets.orgId, orgId),
            eq(downloadAssets.downloadId, downloadId),
            eq(downloadAssets.assetId, assetId),
          ),
        );
    }
    return this.listDownloadAssets(orgId, downloadId);
  }
}
