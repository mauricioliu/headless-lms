// content tables — the content domain (owns all content types; today: course).
// Course type: Course → Module → Activity, where an Activity is the leaf sitting
// directly in a module. An Activity is UNIFORM content — the domain does not
// categorise it: a `seq`, and an opaque `settings` jsonb blob holding whatever
// that content needs (title, type, body, completion rule, …). Assets are the one
// thing kept OUT of the blob (owned by the assets domain) and linked via the
// many-to-many `activity_assets`. Org-scoped: composite (org_id, id) keys.
import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  primaryKey,
  foreignKey,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type {
  Activity,
  ActivityAsset,
  ContentItem,
  Course,
  Download,
  DownloadAsset,
  Module,
} from '@headless-lms/types/schemas';
import { genId } from '@headless-lms/core/shared/id';
import { organizations } from './organizations.js';
import { assets } from './assets.js';
import type { Expect, NoDrift } from './drift.js';

// The content registry (supertype table): one row per piece of content, any
// type. A concrete content table shares its PK with a registry row (same id)
// and references it via a type-pinned composite FK; the generic entitlements
// table FKs here, so it never changes when a content type is added. Deletes go
// through this table (cascade to the concrete row and the grants).
export const contentItems = pgTable(
  'content_items',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id').notNull(),
    type: text('type', { enum: ['course', 'download'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    // FK target for type-pinned references from concrete content tables.
    typeUq: unique().on(t.orgId, t.id, t.type),
    // Widened per new content type.
    typeCk: check('content_items_type_check', sql`${t.type} in ('course', 'download')`),
  }),
);

export const courses = pgTable(
  'courses',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('course')),
    // Pinned to 'course' so the composite FK below cannot attach this row to a
    // registry row of another content type.
    type: text('type')
      .$type<Course['type']>()
      .notNull()
      .generatedAlwaysAs(sql`'course'`),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    category: text('category').notNull().default(''),
    // Media-library asset rendered as the course's cover. Null = no cover.
    thumbnailAssetId: text('thumbnail_asset_id'),
    // Course-wide delivery toggles (CourseSettings). Modelled, unlike the
    // per-activity blob: a fixed surface the API validates.
    settings: jsonb('settings').$type<Course['settings']>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    slugUq: unique().on(t.orgId, t.slug),
    contentItemFk: foreignKey({
      columns: [t.orgId, t.id, t.type],
      foreignColumns: [contentItems.orgId, contentItems.id, contentItems.type],
    }).onDelete('cascade'),
    // Restrictive, like `activity_assets.assetFk` — the asset is owned by the
    // assets domain and must be unlinked before it can be deleted. MATCH SIMPLE
    // means the constraint is skipped entirely while the thumbnail is null.
    thumbnailAssetFk: foreignKey({
      columns: [t.orgId, t.thumbnailAssetId],
      foreignColumns: [assets.orgId, assets.id],
    }),
  }),
);

export const modules = pgTable(
  'modules',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('module')),
    courseId: text('course_id').notNull(),
    title: text('title').notNull(),
    seq: integer('seq').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    // Modules are part of the course aggregate: deleting the course deletes them.
    courseFk: foreignKey({
      columns: [t.orgId, t.courseId],
      foreignColumns: [courses.orgId, courses.id],
    }).onDelete('cascade'),
    // FK target for the course-pinned reference from activities.
    courseUq: unique().on(t.orgId, t.id, t.courseId),
  }),
);

// The leaf, directly in a module. Uniform content: seq + opaque settings blob.
export const activities = pgTable(
  'activities',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('activity')),
    moduleId: text('module_id').notNull(),
    // Denormalised from the module: the course an activity belongs to is asked
    // for far more often than its module (progress, discussion, entitlements),
    // and the FK below pins the pair, so it cannot disagree with the module.
    courseId: text('course_id').notNull(),
    seq: integer('seq').notNull(),
    // Opaque per-activity blob: title, type, body, completion rule — whatever the
    // content needs. Assets are the one thing kept out of the blob.
    settings: jsonb('settings').$type<Activity['settings']>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    // Course-pinned, like `courses.contentItemFk`: the module reference carries
    // `course_id`, so an activity whose stored course disagrees with its
    // module's is rejected by the database rather than silently rotting.
    moduleFk: foreignKey({
      columns: [t.orgId, t.moduleId, t.courseId],
      foreignColumns: [modules.orgId, modules.id, modules.courseId],
    }).onDelete('cascade'),
    seqUq: unique().on(t.orgId, t.moduleId, t.seq),
  }),
);

// activity ↔ asset: many-to-many (an activity uses many assets; an asset can be
// reused by many activities). Assets owned by the assets domain, tracked here.
export const activityAssets = pgTable(
  'activity_assets',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('activityAsset')),
    activityId: text('activity_id').notNull(),
    assetId: text('asset_id').notNull(),
    seq: integer('seq').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    // The link cascades with its activity; the asset itself is owned by the
    // assets domain and survives (assetFk stays restrictive).
    activityFk: foreignKey({
      columns: [t.orgId, t.activityId],
      foreignColumns: [activities.orgId, activities.id],
    }).onDelete('cascade'),
    assetFk: foreignKey({
      columns: [t.orgId, t.assetId],
      foreignColumns: [assets.orgId, assets.id],
    }),
    activityAssetUq: unique().on(t.orgId, t.activityId, t.assetId),
  }),
);

// A download: an ordered set of media-library assets. Shares its PK with a
// registry row (same id) via the type-pinned composite FK, exactly like courses.
export const downloads = pgTable(
  'downloads',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('download')),
    // Pinned to 'download' so the composite FK below cannot attach this row to
    // a registry row of another content type.
    type: text('type')
      .$type<Download['type']>()
      .notNull()
      .generatedAlwaysAs(sql`'download'`),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    category: text('category').notNull().default(''),
    thumbnailAssetId: text('thumbnail_asset_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    slugUq: unique().on(t.orgId, t.slug),
    contentItemFk: foreignKey({
      columns: [t.orgId, t.id, t.type],
      foreignColumns: [contentItems.orgId, contentItems.id, contentItems.type],
    }).onDelete('cascade'),
    // Restrictive: a thumbnail in use blocks deleting the asset.
    thumbnailFk: foreignKey({
      columns: [t.orgId, t.thumbnailAssetId],
      foreignColumns: [assets.orgId, assets.id],
    }),
  }),
);

// download ↔ asset: the ordered set. Mirrors activity_assets one level
// shallower — a download has no intermediate structure.
export const downloadAssets = pgTable(
  'download_assets',
  {
    orgId: text('org_id')
      .notNull()
      .references(() => organizations.id),
    id: text('id')
      .notNull()
      .$defaultFn(() => genId('downloadAsset')),
    downloadId: text('download_id').notNull(),
    assetId: text('asset_id').notNull(),
    seq: integer('seq').notNull().default(0),
    // Author's label; null falls back to the asset's filename.
    displayName: text('display_name'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.id] }),
    // The link cascades with its download; the asset is owned by the assets
    // domain and survives (assetFk stays restrictive).
    downloadFk: foreignKey({
      columns: [t.orgId, t.downloadId],
      foreignColumns: [downloads.orgId, downloads.id],
    }).onDelete('cascade'),
    assetFk: foreignKey({
      columns: [t.orgId, t.assetId],
      foreignColumns: [assets.orgId, assets.id],
    }),
    // Lets delivery key on asset_id rather than the link row id.
    downloadAssetUq: unique().on(t.orgId, t.downloadId, t.assetId),
  }),
);

type _ContentItemsDrift = Expect<NoDrift<typeof contentItems.$inferSelect, ContentItem>>;
type _CoursesDrift = Expect<NoDrift<typeof courses.$inferSelect, Course>>;
type _ModulesDrift = Expect<NoDrift<typeof modules.$inferSelect, Module>>;
type _ActivitiesDrift = Expect<NoDrift<typeof activities.$inferSelect, Activity>>;
type _ActivityAssetsDrift = Expect<NoDrift<typeof activityAssets.$inferSelect, ActivityAsset>>;
type _DownloadsDrift = Expect<NoDrift<typeof downloads.$inferSelect, Download>>;
type _DownloadAssetsDrift = Expect<NoDrift<typeof downloadAssets.$inferSelect, DownloadAsset>>;
