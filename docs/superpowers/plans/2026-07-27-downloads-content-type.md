# Downloads Content Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `download` as the second content type in the `content` context — a titled, ordered set of media-library assets an entitled student fetches over short-lived presigned URLs.

**Architecture:** Hexagonal, following the existing course type exactly. `content_items` (the supertype registry) widens to a second type; a `downloads` table shares its PK via a type-pinned composite FK; `download_assets` links to the media library the way `activity_assets` does. Delivery is one stable resource URL per asset that 302s to a freshly-signed URL after an entitlement check. No new service class, no new repository — `ContentService` and `ContentRepository` gain methods.

**Tech Stack:** TypeScript (strict, ESM), Fastify 5, Drizzle ORM + Postgres, zod 4 + `fastify-type-provider-zod`, `@fastify/swagger`, `@hey-api/openapi-ts`, Vitest, Next.js (admin + student apps), MinIO via the `ObjectStorage` port.

## Global Constraints

- Node 22, ESM, strict TypeScript. `tsc` never emits — `tsdown` owns builds.
- Domain entities, DTOs, and domain events are declared **once** in `@headless-lms/types`; `core/content/model.ts` re-exports. Never re-declare a type in core.
- `core/` may not import `adapters/`, `http/`, `app/`, `reporting/`, `fastify`, `pg`, or `drizzle-orm`. Run `pnpm lint` after any cross-layer import change — the boundaries are ESLint-enforced.
- Org-scoped tables use a composite `(org_id, id)` PK with `org_id` → `organizations.id`. Every repository method takes `orgId` and constrains its queries to that tenant.
- Content mutations run inside `ContentUnitOfWork`: the domain write and the outbox append commit in ONE transaction. Services never publish to the bus directly — the outbox relay does.
- `openapi.json` and `packages/sdk/src/generated/` are committed. Regenerate with `pnpm gen:sdk` whenever the contract or routes change. A stale diff is an error.
- `pnpm gen:sdk` boots the real app in-process — **the database must be up**.
- Never add `Co-Authored-By`, "Generated with Claude Code", or any AI-attribution trailer to commit messages or any repo artifact.
- Presigned delivery URL expiry: **300 seconds**, from its own config knob.
- Comments only where necessary, short and concise. Match the surrounding file's comment density.

## Two spec corrections found while reading the code

Both are folded into the tasks below; they supersede the wording in the design doc.

1. **The spec says download slugs are "uniquified per org, as courses do." Courses do not uniquify.** `ContentServiceImpl.create` calls a plain `slugify(input.title)` and inserts; `courses.slug` is unique per org, so a duplicate title raises a Postgres 23505 that nothing catches. Downloads match course behaviour exactly (plain `slugify`) rather than inventing divergent handling. The pre-existing duplicate-title failure is noted at the end of this plan and is not fixed here.
2. **The spec does not mention the transactional outbox.** Course mutations run through `this.uow.run(...)` and append to the outbox in the same transaction. Download mutations do the same — Tasks 5 and 6 show it.

## File Structure

**Create:**
- `packages/server/src/adapters/db/schema/content.ts` — extended, not created (see Modify)
- `packages/api-contract/src/downloads.ts` — Zod schemas for the `Downloads` resource
- `packages/server/src/http/routes/downloads.ts` — back-office CRUD routes
- `apps/admin/src/app/(dashboard)/downloads/{downloads-table,downloads-columns,actions}.tsx|ts`
- `apps/admin/src/app/(dashboard)/downloads/_components/download-form-sheet.tsx`
- `apps/admin/src/app/(dashboard)/downloads/[downloadId]/{layout.tsx,page.tsx}`
- `apps/admin/src/app/(dashboard)/downloads/[downloadId]/{details,assets,access}/page.tsx`
- `apps/admin/src/app/(dashboard)/downloads/[downloadId]/_components/{download-header,download-tabs-nav,download-assets-panel}.tsx`
- `apps/student/src/app/downloads/page.tsx`, `apps/student/src/app/downloads/[downloadId]/page.tsx`

**Modify:**
- `packages/types/src/content.ts` — `ContentType`, `Download`, `DownloadAsset`, inputs, events
- `packages/server/src/adapters/db/schema/content.ts` — registry widening, `downloads`, `download_assets`
- `packages/server/src/core/content/{ports,service,service.test}.ts` — download methods
- `packages/server/src/adapters/db/repositories/content.ts` — their persistence
- `packages/server/src/core/assets/{ports,service}.ts` — per-call expiry on `requestDownload`
- `packages/server/src/reporting/learn/{model,ports,service,service.test}.ts` — `ContentRef`, download reads, signing
- `packages/server/src/adapters/db/repositories/learn.ts` — download entitlement queries
- `packages/server/src/http/routes/learn.ts`, `packages/server/src/http/routes.ts`
- `packages/api-contract/src/{learn,index}.ts`
- `packages/server/src/app/container.ts` — tx scope key, delivery expiry wiring
- `apps/api/src/config.ts` — `deliveryExpirySeconds`
- `apps/admin/src/app/(dashboard)/downloads/page.tsx` — replace the placeholder
- `apps/admin/src/lib/api/server.ts` — `listDownloads`
- `docs/domain/content.md`, `AGENTS.md`

---

## Phase 1 — Types and schema

### Task 1: Declare the download types

**Files:**
- Modify: `packages/types/src/content.ts`
- Modify: `packages/server/src/core/content/model.ts`, `packages/server/src/core/content/types.ts`, `packages/server/src/core/content/events.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ContentType` (widened), `DownloadStatus`, `Download`, `DownloadAsset`, `ListDownloadsQuery`, `CreateDownloadInput`, `UpdateDownloadInput`, `AddDownloadAssetInput`, `ReorderDownloadAssetsInput`, `DownloadCreated`, `DownloadUpdated`, `DownloadDeleted`, `ContentEvent` (widened)

- [ ] **Step 1: Widen `ContentType` and add the download entities**

In `packages/types/src/content.ts`, change the `ContentType` alias and append the new declarations:

```ts
/** The registered content types — every row in the content_items registry is
 *  one of these. Widened per new content type (podcast, membership, …). */
export type ContentType = "course" | "download";

export type DownloadStatus = "draft" | "published";

/** A set of downloadable assets. No structure beyond the ordered set: no
 *  modules, no drip, no progression. */
export interface Download {
  readonly id: string;
  title: string;
  slug: string;
  description: string;
  status: DownloadStatus;
  category: string;
  /** Media-library asset rendered as the download's cover. */
  thumbnailAssetId: string | null;
  /** Derived: number of linked assets. */
  assetCount: number;
  /** Derived: sum of linked asset sizes in bytes. */
  totalSize: number;
  entitledCount: number;
  updatedAt: string;
  createdAt: string;
}

/** One asset linked to a download, in author-defined order. Carries the asset
 *  facts the surface renders so a consumer needs no second lookup. */
export interface DownloadAsset {
  readonly id: string;
  assetId: string;
  seq: number;
  /** Author's label for the asset; null falls back to `filename`. */
  displayName: string | null;
  filename: string;
  contentType: string;
  size: number;
}

export interface ListDownloadsQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  /** Sort field, optionally `-` prefixed for descending (e.g. `-updatedAt`). */
  sort?: string | undefined;
  status?: DownloadStatus | undefined;
  category?: string | undefined;
}

export interface CreateDownloadInput {
  title: string;
  description?: string | undefined;
  category?: string | undefined;
}

export interface UpdateDownloadInput {
  title?: string | undefined;
  description?: string | undefined;
  category?: string | undefined;
  status?: DownloadStatus | undefined;
  thumbnailAssetId?: string | null | undefined;
}

/** `seq` is assigned by the service as max(seq) + 1 — callers never set it. */
export interface AddDownloadAssetInput {
  assetId: string;
  displayName?: string | undefined;
}

/** The COMPLETE ordered set. A list that is not exactly the download's current
 *  asset ids is rejected, so a stale client cannot silently drop a link. */
export interface ReorderDownloadAssetsInput {
  assetIds: string[];
}

export interface DownloadCreated extends DomainEvent {
  type: "download.created";
  download: Download;
}

export interface DownloadUpdated extends DomainEvent {
  type: "download.updated";
  download: Download;
}

/** Carries the pre-delete snapshot — the row is gone once consumers see this. */
export interface DownloadDeleted extends DomainEvent {
  type: "download.deleted";
  download: Download;
}
```

Widen the event union at the bottom of the same file:

```ts
/** Domain events the content context emits. */
export type ContentEvent =
  | CourseCreated
  | CourseUpdated
  | CourseDeleted
  | DownloadCreated
  | DownloadUpdated
  | DownloadDeleted;
```

- [ ] **Step 2: Re-export from core**

`core/content/model.ts`, `types.ts`, and `events.ts` re-export from `@headless-lms/types`. Add the new names to whichever of the three already re-exports its course counterpart — entities and DTOs follow `Course`/`ListCoursesQuery`, events follow `CourseCreated`. Read each file first; they are 6–8 lines each.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @headless-lms/types typecheck && pnpm --filter @headless-lms/server typecheck`
Expected: PASS. `@headless-lms/types` has zero deps, so nothing else can break here.

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/content.ts packages/server/src/core/content/
git commit -m "feat(types): download content type entities and events"
```

---

### Task 2: Schema tables and migration

**Files:**
- Modify: `packages/server/src/adapters/db/schema/content.ts`
- Create: a generated migration under `packages/server/drizzle/`

**Interfaces:**
- Consumes: `Download`, `DownloadAsset` from Task 1
- Produces: `downloads`, `downloadAssets` Drizzle tables; `contentItems.type` accepts `'download'`

- [ ] **Step 1: Widen the registry**

In `adapters/db/schema/content.ts`, change the `contentItems` type column and its check constraint:

```ts
    type: text('type', { enum: ['course', 'download'] }).notNull(),
```

```ts
    // Widened per new content type.
    typeCk: check('content_items_type_check', sql`${t.type} in ('course', 'download')`),
```

- [ ] **Step 2: Add the two tables**

Append to the same file. `assets` is already imported at the top.

```ts
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
```

- [ ] **Step 3: Confirm the schema barrel re-exports them**

Read `adapters/db/schema/index.ts`. If it re-exports `./content.js` wholesale, nothing to do. If it names exports individually, add `downloads` and `downloadAssets`. `drizzle.config.ts` points at this barrel — a table missing here is a table missing from the migration.

- [ ] **Step 4: Generate the migration**

Run: `pnpm db:generate`
Expected: a new SQL file under `packages/server/drizzle/`. Open it and verify it contains: the `content_items_type_check` drop-and-recreate, `create table "downloads"`, `create table "download_assets"`, and both restrictive `asset_id` foreign keys with **no** `on delete cascade`.

- [ ] **Step 5: Apply it**

Run: `pnpm db:migrate`
Expected: applies cleanly. If the check-constraint rewrite fails because rows violate it, stop — that means a content type exists that this plan does not know about.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/adapters/db/schema/content.ts packages/server/drizzle/
git commit -m "feat(db): downloads and download_assets tables"
```

---

## Phase 2 — Core content context

### Task 3: Rename the tx scope key `courses` → `content`

**Files:**
- Modify: `packages/server/src/core/content/ports.ts:52-55`
- Modify: `packages/server/src/core/content/service.ts:44,54,67`
- Modify: `packages/server/src/core/content/service.test.ts` (the `fakeUow` helper)
- Modify: `packages/server/src/app/container.ts:267`

**Interfaces:**
- Consumes: nothing
- Produces: `ContentTxScope { content: ContentRepository; outbox: OutboxAppender }`

The repository is per bounded context, and it is about to hold downloads as well as courses. The scope key must stop saying `courses`. Pure rename, no behaviour change.

- [ ] **Step 1: Rename in the port**

```ts
export interface ContentTxScope {
  content: ContentRepository;
  outbox: OutboxAppender;
}
```

- [ ] **Step 2: Update the three call sites in `service.ts`**

Each is a destructure in a `uow.run` callback: `async ({ courses, outbox }) =>` becomes `async ({ content, outbox }) =>`, and the three `courses.create(...)` / `courses.update(...)` / `courses.findById(...)` / `courses.delete(...)` calls inside them become `content.*`.

- [ ] **Step 3: Update the container**

`app/container.ts:267`:

```ts
  const contentUow = new DrizzleUnitOfWork(db, (tx) => ({
    content: new DrizzleContentRepository(tx, contentLogger),
    outbox: new DrizzleOutboxAppender(tx, outboxLogger),
  }));
```

- [ ] **Step 4: Update the test helper**

In `core/content/service.test.ts`, `fakeUow` returns `{ run: (fn) => fn({ courses: repo, outbox }) }`. Change the key to `content`.

- [ ] **Step 5: Verify nothing else referenced it**

Run: `grep -rn "courses:" packages/server/src/app packages/server/src/core/content`
Expected: no matches for the tx-scope key. Then `pnpm --filter @headless-lms/server typecheck && pnpm --filter @headless-lms/server test`
Expected: PASS, all existing content tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/core/content/ packages/server/src/app/container.ts
git commit -m "refactor(content): rename tx scope key courses to content"
```

---

### Task 4: Download CRUD on the service — tests first

**Files:**
- Modify: `packages/server/src/core/content/service.test.ts`
- Modify: `packages/server/src/core/content/ports.ts`
- Modify: `packages/server/src/core/content/service.ts`

**Interfaces:**
- Consumes: `Download`, `CreateDownloadInput`, `UpdateDownloadInput`, `ListDownloadsQuery` (Task 1); `ContentTxScope.content` (Task 3)
- Produces: on both `ContentService` and `ContentRepository`:
  - `listDownloads(orgId: string, query: ListDownloadsQuery): Promise<Page<Download>>`
  - `getDownload(orgId: string, id: string): Promise<Download | null>`
  - `createDownload(orgId: string, input: CreateDownloadInput): Promise<Download>` (repo takes a third `slug: string` arg)
  - `updateDownload(orgId: string, id: string, patch: UpdateDownloadInput): Promise<Download>` (repo returns `Download | null`)
  - `removeDownload(orgId: string, id: string): Promise<void>` (repo: `deleteDownload(orgId, id): Promise<boolean>`)

- [ ] **Step 1: Write the failing tests**

Add to `core/content/service.test.ts`. Extend the existing `makeRepo()` factory with the five new `vi.fn()` entries first, then append:

```ts
function makeDownload(over: Partial<Download> = {}): Download {
  return {
    id: 'd1',
    title: 'Workbook',
    slug: 'workbook',
    description: '',
    status: 'draft',
    category: '',
    thumbnailAssetId: null,
    assetCount: 0,
    totalSize: 0,
    entitledCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('downloads', () => {
  it('creates a download with a slugified title and appends download.created', async () => {
    const repo = makeRepo();
    const download = makeDownload({ title: 'My Great Workbook', slug: 'my-great-workbook' });
    vi.mocked(repo.createDownload).mockResolvedValue(download);
    const { uow, appended } = fakeUow(repo);
    const svc = new ContentServiceImpl(repo, makeStructureRepo(), uow);

    const result = await svc.createDownload('o1', { title: 'My Great Workbook' });

    expect(repo.createDownload).toHaveBeenCalledWith(
      'o1',
      { title: 'My Great Workbook' },
      'my-great-workbook',
    );
    expect(result).toEqual(download);
    expect(appended).toEqual([{ type: 'download.created', orgId: 'o1', download }]);
  });

  it('throws NotFoundError when updating a download that does not exist', async () => {
    const repo = makeRepo();
    vi.mocked(repo.updateDownload).mockResolvedValue(null);
    const { uow } = fakeUow(repo);
    const svc = new ContentServiceImpl(repo, makeStructureRepo(), uow);

    await expect(svc.updateDownload('o1', 'missing', { title: 'x' })).rejects.toThrow(NotFoundError);
  });

  it('appends download.deleted carrying the pre-delete snapshot', async () => {
    const repo = makeRepo();
    const download = makeDownload();
    vi.mocked(repo.getDownload).mockResolvedValue(download);
    vi.mocked(repo.deleteDownload).mockResolvedValue(true);
    const { uow, appended } = fakeUow(repo);
    const svc = new ContentServiceImpl(repo, makeStructureRepo(), uow);

    await svc.removeDownload('o1', 'd1');

    expect(appended).toEqual([{ type: 'download.deleted', orgId: 'o1', download }]);
  });

  it('throws NotFoundError when deleting a download that does not exist', async () => {
    const repo = makeRepo();
    vi.mocked(repo.getDownload).mockResolvedValue(null);
    const { uow } = fakeUow(repo);
    const svc = new ContentServiceImpl(repo, makeStructureRepo(), uow);

    await expect(svc.removeDownload('o1', 'missing')).rejects.toThrow(NotFoundError);
    expect(repo.deleteDownload).not.toHaveBeenCalled();
  });
});
```

Import `Download` from `./model.js` at the top of the test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/server/src/core/content/service.test.ts -t "downloads"`
Expected: FAIL — `repo.createDownload is not a function` / TypeScript errors about missing members.

- [ ] **Step 3: Add the port members**

In `core/content/ports.ts`, add to `ContentService`:

```ts
  listDownloads(orgId: string, query: ListDownloadsQuery): Promise<Page<Download>>;
  getDownload(orgId: string, id: string): Promise<Download | null>;
  createDownload(orgId: string, input: CreateDownloadInput): Promise<Download>;
  /** @throws NotFoundError when no download with this id exists in the org. */
  updateDownload(orgId: string, id: string, patch: UpdateDownloadInput): Promise<Download>;
  /** @throws NotFoundError when no download with this id exists in the org. */
  removeDownload(orgId: string, id: string): Promise<void>;
```

and to `ContentRepository`:

```ts
  listDownloads(orgId: string, query: ListDownloadsQuery): Promise<Page<Download>>;
  getDownload(orgId: string, id: string): Promise<Download | null>;
  createDownload(orgId: string, input: CreateDownloadInput, slug: string): Promise<Download>;
  updateDownload(orgId: string, id: string, patch: UpdateDownloadInput): Promise<Download | null>;
  deleteDownload(orgId: string, id: string): Promise<boolean>;
```

Extend the type imports at the top of the file to cover `Download`, `ListDownloadsQuery`, `CreateDownloadInput`, `UpdateDownloadInput`.

- [ ] **Step 4: Implement on the service**

Append to `ContentServiceImpl`, mirroring the course methods exactly:

```ts
  // --- downloads ------------------------------------------------------------

  listDownloads(orgId: string, query: ListDownloadsQuery): Promise<Page<Download>> {
    return this.repo.listDownloads(orgId, query);
  }

  getDownload(orgId: string, id: string): Promise<Download | null> {
    return this.repo.getDownload(orgId, id);
  }

  async createDownload(orgId: string, input: CreateDownloadInput): Promise<Download> {
    const download = await this.uow.run(async ({ content, outbox }) => {
      const created = await content.createDownload(orgId, input, slugify(input.title));
      await outbox.append([{ type: 'download.created', orgId, download: created }]);
      return created;
    });
    this.logger.info('download created', { orgId, downloadId: download.id });
    return download;
  }

  async updateDownload(
    orgId: string,
    id: string,
    patch: UpdateDownloadInput,
  ): Promise<Download> {
    const download = await this.uow.run(async ({ content, outbox }) => {
      const updated = await content.updateDownload(orgId, id, patch);
      if (!updated) {
        throw new NotFoundError('Download', id);
      }
      await outbox.append([{ type: 'download.updated', orgId, download: updated }]);
      return updated;
    });
    this.logger.info('download updated', { orgId, downloadId: id });
    return download;
  }

  async removeDownload(orgId: string, id: string): Promise<void> {
    await this.uow.run(async ({ content, outbox }) => {
      // Snapshot before the delete — the event carries the last known state.
      const download = await content.getDownload(orgId, id);
      if (!download) {
        throw new NotFoundError('Download', id);
      }
      const ok = await content.deleteDownload(orgId, id);
      if (!ok) {
        throw new NotFoundError('Download', id);
      }
      await outbox.append([{ type: 'download.deleted', orgId, download }]);
    });
    this.logger.info('download deleted', { orgId, downloadId: id });
  }
```

Extend the type imports at the top of `service.ts` to match.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/server/src/core/content/service.test.ts`
Expected: PASS, including every pre-existing course test.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/core/content/
git commit -m "feat(content): download CRUD on ContentService"
```

---

### Task 5: Download asset links on the service — tests first

**Files:**
- Modify: `packages/server/src/core/content/service.test.ts`
- Modify: `packages/server/src/core/content/ports.ts`
- Modify: `packages/server/src/core/content/service.ts`

**Interfaces:**
- Consumes: `DownloadAsset`, `AddDownloadAssetInput` (Task 1)
- Produces: on `ContentService` and `ContentRepository`:
  - `listDownloadAssets(orgId, downloadId): Promise<DownloadAsset[]>`
  - `addDownloadAsset(orgId, downloadId, input): Promise<DownloadAsset[]>`
  - `removeDownloadAsset(orgId, downloadId, assetId): Promise<DownloadAsset[]>`
  - `renameDownloadAsset(orgId, downloadId, assetId, displayName: string | null): Promise<DownloadAsset[]>`
  - `reorderDownloadAssets(orgId, downloadId, assetIds: string[]): Promise<DownloadAsset[]>`

Every mutator returns the full ordered list, matching how the course structure methods return `Module[]`. These are structure edits, not aggregate-root writes — they do not emit events, exactly as module and activity edits do not.

- [ ] **Step 1: Write the failing tests**

Extend `makeRepo()` with the five new `vi.fn()` entries, then append:

```ts
function makeDownloadAsset(over: Partial<DownloadAsset> = {}): DownloadAsset {
  return {
    id: 'da1',
    assetId: 'a1',
    seq: 0,
    displayName: null,
    filename: 'workbook.pdf',
    contentType: 'application/pdf',
    size: 1024,
    ...over,
  };
}

describe('download assets', () => {
  it('rejects a reorder whose ids are not exactly the current set', async () => {
    const repo = makeRepo();
    vi.mocked(repo.listDownloadAssets).mockResolvedValue([
      makeDownloadAsset({ id: 'da1', assetId: 'a1', seq: 0 }),
      makeDownloadAsset({ id: 'da2', assetId: 'a2', seq: 1 }),
    ]);
    const { uow } = fakeUow(repo);
    const svc = new ContentServiceImpl(repo, makeStructureRepo(), uow);

    // Drops a2 — a stale client must not be able to silently unlink it.
    await expect(svc.reorderDownloadAssets('o1', 'd1', ['a1'])).rejects.toThrow(
      /does not match/i,
    );
    expect(repo.reorderDownloadAssets).not.toHaveBeenCalled();
  });

  it('rejects a reorder containing an id not in the download', async () => {
    const repo = makeRepo();
    vi.mocked(repo.listDownloadAssets).mockResolvedValue([
      makeDownloadAsset({ id: 'da1', assetId: 'a1', seq: 0 }),
    ]);
    const { uow } = fakeUow(repo);
    const svc = new ContentServiceImpl(repo, makeStructureRepo(), uow);

    await expect(svc.reorderDownloadAssets('o1', 'd1', ['a1', 'a9'])).rejects.toThrow(
      /does not match/i,
    );
  });

  it('accepts a reorder that is a permutation of the current set', async () => {
    const repo = makeRepo();
    const reordered = [
      makeDownloadAsset({ id: 'da2', assetId: 'a2', seq: 0 }),
      makeDownloadAsset({ id: 'da1', assetId: 'a1', seq: 1 }),
    ];
    vi.mocked(repo.listDownloadAssets).mockResolvedValue([
      makeDownloadAsset({ id: 'da1', assetId: 'a1', seq: 0 }),
      makeDownloadAsset({ id: 'da2', assetId: 'a2', seq: 1 }),
    ]);
    vi.mocked(repo.reorderDownloadAssets).mockResolvedValue(reordered);
    const { uow } = fakeUow(repo);
    const svc = new ContentServiceImpl(repo, makeStructureRepo(), uow);

    const result = await svc.reorderDownloadAssets('o1', 'd1', ['a2', 'a1']);

    expect(repo.reorderDownloadAssets).toHaveBeenCalledWith('o1', 'd1', ['a2', 'a1']);
    expect(result).toEqual(reordered);
  });

  it('adds an asset and returns the ordered list', async () => {
    const repo = makeRepo();
    const list = [makeDownloadAsset()];
    vi.mocked(repo.addDownloadAsset).mockResolvedValue(list);
    const { uow } = fakeUow(repo);
    const svc = new ContentServiceImpl(repo, makeStructureRepo(), uow);

    const result = await svc.addDownloadAsset('o1', 'd1', { assetId: 'a1' });

    expect(repo.addDownloadAsset).toHaveBeenCalledWith('o1', 'd1', { assetId: 'a1' });
    expect(result).toEqual(list);
  });
});
```

Import `DownloadAsset` from `./model.js`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/server/src/core/content/service.test.ts -t "download assets"`
Expected: FAIL — `svc.reorderDownloadAssets is not a function`.

- [ ] **Step 3: Add the port members**

Add the five signatures from the Interfaces block to both `ContentService` and `ContentRepository` in `ports.ts`. The repository takes the same arguments as the service for all five.

- [ ] **Step 4: Implement on the service**

```ts
  listDownloadAssets(orgId: string, downloadId: string): Promise<DownloadAsset[]> {
    return this.repo.listDownloadAssets(orgId, downloadId);
  }

  async addDownloadAsset(
    orgId: string,
    downloadId: string,
    input: AddDownloadAssetInput,
  ): Promise<DownloadAsset[]> {
    const assets = await this.repo.addDownloadAsset(orgId, downloadId, input);
    this.logger.info('download asset added', { orgId, downloadId, assetId: input.assetId });
    return assets;
  }

  async removeDownloadAsset(
    orgId: string,
    downloadId: string,
    assetId: string,
  ): Promise<DownloadAsset[]> {
    const assets = await this.repo.removeDownloadAsset(orgId, downloadId, assetId);
    this.logger.info('download asset removed', { orgId, downloadId, assetId });
    return assets;
  }

  async renameDownloadAsset(
    orgId: string,
    downloadId: string,
    assetId: string,
    displayName: string | null,
  ): Promise<DownloadAsset[]> {
    const assets = await this.repo.renameDownloadAsset(orgId, downloadId, assetId, displayName);
    this.logger.info('download asset renamed', { orgId, downloadId, assetId });
    return assets;
  }

  /** The caller must send the COMPLETE ordered set — a partial list would
   *  silently unlink whatever it omitted. */
  async reorderDownloadAssets(
    orgId: string,
    downloadId: string,
    assetIds: string[],
  ): Promise<DownloadAsset[]> {
    const current = await this.repo.listDownloadAssets(orgId, downloadId);
    const currentIds = new Set(current.map((a) => a.assetId));
    const sameSize = currentIds.size === assetIds.length;
    if (!sameSize || !assetIds.every((id) => currentIds.has(id))) {
      throw new ConflictError("Ordered asset ids does not match the download's current assets");
    }
    const assets = await this.repo.reorderDownloadAssets(orgId, downloadId, assetIds);
    this.logger.debug('download assets reordered', { orgId, downloadId });
    return assets;
  }
```

`new Set(assetIds).size !== assetIds.length` is covered by the two checks combined: a duplicate id makes `assetIds.length` exceed `currentIds.size`, so `sameSize` fails.

`core/shared/errors.ts` exports exactly two classes: `NotFoundError` and `ConflictError`. There is no `ValidationError`. Use `ConflictError` — the HTTP layer maps it to 409, which is right for a stale client sending an asset set that no longer matches. Import it beside the existing `NotFoundError` import in `service.ts`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/server/src/core/content/service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/core/content/
git commit -m "feat(content): download asset link operations"
```

---

### Task 6: Drizzle persistence for downloads

**Files:**
- Modify: `packages/server/src/adapters/db/repositories/content.ts`

**Interfaces:**
- Consumes: every `ContentRepository` member added in Tasks 4 and 5; `downloads`, `downloadAssets` tables (Task 2)
- Produces: `DrizzleContentRepository` implementing them

- [ ] **Step 1: Add the derived-count expressions**

Append near the existing `moduleCountExpr` block. The same Drizzle qualification caveat documented there applies — interpolate the TABLE and append the column name.

```ts
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
```

Extend the imports at the top: `downloads`, `downloadAssets` from `../schema/content.js`; `assets` from `../schema/assets.js`; `Download`, `DownloadAsset`, `DownloadStatus` from the core model; `ListDownloadsQuery`, `CreateDownloadInput`, `UpdateDownloadInput`, `AddDownloadAssetInput` from core types.

- [ ] **Step 2: Implement the CRUD methods**

Append to `DrizzleContentRepository`. `listDownloads` mirrors `list` exactly — same search/sort/paginate shape, against `downloads` and `downloadSortColumns`, searching `title` and `category`.

```ts
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
```

- [ ] **Step 3: Implement the asset-link methods**

```ts
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
```

- [ ] **Step 4: Typecheck and run the suite**

Run: `pnpm --filter @headless-lms/server typecheck && pnpm --filter @headless-lms/server test`
Expected: PASS.

- [ ] **Step 5: Lint the boundaries**

Run: `pnpm lint`
Expected: PASS. This repository imports `core/content/ports` only — if it flags an import, the layering is wrong.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/adapters/db/repositories/content.ts
git commit -m "feat(db): drizzle persistence for downloads and their assets"
```

---

## Phase 3 — Delivery and signing

### Task 7: Per-call expiry on asset downloads

**Files:**
- Modify: `packages/server/src/core/assets/ports.ts`
- Modify: `packages/server/src/core/assets/service.ts:83-99`
- Modify: `apps/api/src/config.ts:34-35`

**Interfaces:**
- Consumes: `ObjectStorage.presignDownload` (already accepts `expiresInSeconds`)
- Produces: `AssetsService.requestDownload(orgId, id, filename?, expiresInSeconds?): Promise<DownloadTicket | null>`; `ServerConfig.deliveryExpirySeconds: number`

Today `requestDownload` inherits the adapter default, so raising `STORAGE_DOWNLOAD_EXPIRY` for an unrelated reason would silently extend the life of paywalled links. Entitled delivery gets its own knob.

- [ ] **Step 1: Widen the port**

In `core/assets/ports.ts`:

```ts
  /** Short-lived presigned URL to download/serve the asset. `expiresInSeconds`
   *  overrides the adapter default — entitled delivery passes its own. */
  requestDownload(
    orgId: string,
    id: string,
    filename?: string,
    expiresInSeconds?: number,
  ): Promise<DownloadTicket | null>;
```

- [ ] **Step 2: Thread it through the service**

In `core/assets/service.ts`, change the signature and the `presignDownload` call:

```ts
  async requestDownload(
    orgId: string,
    id: string,
    filename?: string,
    expiresInSeconds?: number,
  ): Promise<DownloadTicket | null> {
    const asset = await this.repo.findById(orgId, id);
    if (!asset) {
      return null;
    }
    const url = await this.storage.presignDownload({
      key: asset.key,
      downloadFilename: filename ?? asset.filename,
      ...(expiresInSeconds === undefined ? {} : { expiresInSeconds }),
    });
    return { url, asset };
  }
```

The conditional spread matters: passing `expiresInSeconds: undefined` explicitly would defeat the adapter's `?? this.downloadExpiry` fallback under `exactOptionalPropertyTypes`.

- [ ] **Step 3: Add the config knob**

`apps/api/src/config.ts`, beside the existing storage expiries:

```ts
    deliveryExpirySeconds: Number(process.env.DELIVERY_URL_EXPIRY ?? 300),
```

Place it wherever the surrounding `ServerConfig` shape puts non-storage settings — read the file and follow its grouping. Add the matching field to the `ServerConfig` type where it is declared.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @headless-lms/server typecheck && pnpm --filter api typecheck`
Expected: PASS. The existing `requestDownload` callers pass three arguments or fewer, so the new optional parameter is source-compatible.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/core/assets/ apps/api/src/config.ts
git commit -m "feat(assets): per-call expiry on presigned downloads"
```

---

### Task 8: Generalize `CourseRef` to `ContentRef`

**Files:**
- Modify: `packages/server/src/reporting/learn/model.ts:7-10`
- Modify: `packages/server/src/reporting/learn/ports.ts`
- Modify: `packages/server/src/reporting/learn/service.ts`
- Modify: `packages/server/src/reporting/learn/service.test.ts`
- Modify: `packages/server/src/adapters/db/repositories/learn.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ContentRef { orgId: string; contentId: string }`

Rename with call-site churn, no behaviour change. `LearnReportServiceImpl` reads `ref.courseId` in every course method; each becomes `ref.contentId`.

- [ ] **Step 1: Rename the type**

`reporting/learn/model.ts`:

```ts
/** An active-entitlement pointer: the org + content item a student may consume. */
export interface ContentRef {
  orgId: string;
  contentId: string;
}
```

- [ ] **Step 2: Update the reader port**

`reporting/learn/ports.ts` — `activeRefs` and `activeRef` now return `ContentRef[]` / `ContentRef | null`. Keep their names and parameters unchanged.

- [ ] **Step 3: Update the service**

In `reporting/learn/service.ts`, every `ref.courseId` becomes `ref.contentId`. There are four: in `listCourses` (via `refs.map`), `getCourse`, `listModules`, and `courseProgress`. `listCourses` currently maps `refs.map((ref) => this.content.get(ref.orgId, ref.courseId))` — change the property only.

- [ ] **Step 4: Update the Drizzle reader**

In `adapters/db/repositories/learn.ts`, both selects project `courseId: entitlements.contentId`. Rename the projected key to `contentId`, and change the imported type from `CourseRef` to `ContentRef`.

- [ ] **Step 5: Update the tests**

`reporting/learn/service.test.ts` imports `CourseRef` and builds refs with `courseId`. Rename both.

- [ ] **Step 6: Verify the rename is total**

Run: `grep -rn "CourseRef\|courseId:" packages/server/src/reporting packages/server/src/adapters/db/repositories/learn.ts`
Expected: no `CourseRef`, no `courseId:` object key. (`courseId` as a *parameter* name on the service methods is fine and stays.)

Then: `pnpm --filter @headless-lms/server test packages/server/src/reporting`
Expected: PASS, all pre-existing learn tests green.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/reporting/learn/ packages/server/src/adapters/db/repositories/learn.ts
git commit -m "refactor(learn): generalize CourseRef to ContentRef"
```

---

### Task 9: Download entitlement queries on the learn reader

**Files:**
- Modify: `packages/server/src/reporting/learn/ports.ts`
- Modify: `packages/server/src/adapters/db/repositories/learn.ts`

**Interfaces:**
- Consumes: `ContentRef` (Task 8); `downloads`, `downloadAssets` tables (Task 2)
- Produces: on `LearnEntitlementReader`:
  - `activeDownloadRefs(orgId, orgUserId): Promise<ContentRef[]>`
  - `activeDownloadRef(orgId, orgUserId, downloadId): Promise<ContentRef | null>`
  - `downloadHasAsset(orgId, downloadId, assetId): Promise<boolean>`

- [ ] **Step 1: Add the port members**

```ts
export interface LearnEntitlementReader {
  activeRefs(orgId: string, orgUserId: string): Promise<ContentRef[]>;
  activeRef(orgId: string, orgUserId: string, courseId: string): Promise<ContentRef | null>;
  /** Active, non-expired grants to PUBLISHED downloads, scoped to the org. */
  activeDownloadRefs(orgId: string, orgUserId: string): Promise<ContentRef[]>;
  activeDownloadRef(
    orgId: string,
    orgUserId: string,
    downloadId: string,
  ): Promise<ContentRef | null>;
  /** Whether this asset is linked to this download. The paywall's second gate. */
  downloadHasAsset(orgId: string, downloadId: string, assetId: string): Promise<boolean>;
}
```

- [ ] **Step 2: Implement on the Drizzle reader**

The inner join to `downloads` restricts to download grants without an explicit type filter — the same trick the course queries use.

```ts
  private downloadFilters(orgId: string, orgUserId: string): SQL {
    return and(
      eq(entitlements.orgId, orgId),
      eq(entitlements.orgUserId, orgUserId),
      eq(entitlements.status, 'active'),
      or(isNull(entitlements.expiresAt), gt(entitlements.expiresAt, sql`now()`))!,
      eq(downloads.status, 'published'),
    )!;
  }

  async activeDownloadRefs(orgId: string, orgUserId: string): Promise<ContentRef[]> {
    return this.db
      .select({ orgId: entitlements.orgId, contentId: entitlements.contentId })
      .from(entitlements)
      .innerJoin(
        downloads,
        and(eq(downloads.orgId, entitlements.orgId), eq(downloads.id, entitlements.contentId)),
      )
      .where(this.downloadFilters(orgId, orgUserId));
  }

  async activeDownloadRef(
    orgId: string,
    orgUserId: string,
    downloadId: string,
  ): Promise<ContentRef | null> {
    const [row] = await this.db
      .select({ orgId: entitlements.orgId, contentId: entitlements.contentId })
      .from(entitlements)
      .innerJoin(
        downloads,
        and(eq(downloads.orgId, entitlements.orgId), eq(downloads.id, entitlements.contentId)),
      )
      .where(and(this.downloadFilters(orgId, orgUserId), eq(entitlements.contentId, downloadId)))
      .limit(1);
    return row ?? null;
  }

  async downloadHasAsset(orgId: string, downloadId: string, assetId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: downloadAssets.id })
      .from(downloadAssets)
      .where(
        and(
          eq(downloadAssets.orgId, orgId),
          eq(downloadAssets.downloadId, downloadId),
          eq(downloadAssets.assetId, assetId),
        ),
      )
      .limit(1);
    return row !== undefined;
  }
```

Add `downloads` and `downloadAssets` to the schema import at the top of the file.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @headless-lms/server typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/reporting/learn/ports.ts packages/server/src/adapters/db/repositories/learn.ts
git commit -m "feat(learn): download entitlement queries"
```

---

### Task 10: The signing path — tests first

**Files:**
- Modify: `packages/server/src/reporting/learn/service.test.ts`
- Modify: `packages/server/src/reporting/learn/ports.ts`
- Modify: `packages/server/src/reporting/learn/service.ts`
- Modify: `packages/server/src/app/container.ts`

**Interfaces:**
- Consumes: `activeDownloadRefs`, `activeDownloadRef`, `downloadHasAsset` (Task 9); `ContentService.getDownload`, `listDownloadAssets` (Tasks 4–5); `AssetsService.requestDownload` with expiry (Task 7)
- Produces: on `LearnReportService`:
  - `listDownloads(orgId, orgUserId): Promise<Download[]>`
  - `getDownload(orgId, orgUserId, downloadId): Promise<{ download: Download; assets: DownloadAsset[] } | null>`
  - `downloadAssetUrl(orgId, orgUserId, downloadId, assetId): Promise<{ url: string; filename: string } | null>`

`LearnReportServiceImpl`'s constructor gains two parameters: `assets: AssetsService` and `deliveryExpirySeconds: number`.

- [ ] **Step 1: Write the failing tests**

Append to `reporting/learn/service.test.ts`:

```ts
function fakeReader(over: Partial<LearnEntitlementReader> = {}): LearnEntitlementReader {
  return {
    activeRefs: async () => [],
    activeRef: async () => null,
    activeDownloadRefs: async () => [],
    activeDownloadRef: async () => null,
    downloadHasAsset: async () => false,
    ...over,
  };
}

function fakeAssets(captured: { expiry?: number; filename?: string } = {}): AssetsService {
  return {
    requestUpload: async () => {
      throw new Error('not used');
    },
    confirm: async () => null,
    list: async () => ({ rows: [], total: 0, page: 1, pageSize: 20 }),
    get: async () => null,
    requestDownload: async (_orgId, _id, filename, expiresInSeconds) => {
      captured.expiry = expiresInSeconds;
      captured.filename = filename;
      return { url: 'https://storage.example/signed', asset: {} as never };
    },
    remove: async () => false,
  };
}

describe('download delivery', () => {
  const download = { id: 'd1', status: 'published' } as never;

  it('returns null when the student has no entitlement', async () => {
    const svc = new LearnReportServiceImpl(
      fakeReader(),
      fakeContent({ getDownload: async () => download }),
      fakeProgress([]),
      fakeAssets(),
      300,
    );

    expect(await svc.downloadAssetUrl('o1', 'stu_1', 'd1', 'a1')).toBeNull();
  });

  it('returns null when the asset belongs to a different download', async () => {
    const svc = new LearnReportServiceImpl(
      fakeReader({
        activeDownloadRef: async () => ({ orgId: 'o1', contentId: 'd1' }),
        downloadHasAsset: async () => false,
      }),
      fakeContent({ getDownload: async () => download }),
      fakeProgress([]),
      fakeAssets(),
      300,
    );

    expect(await svc.downloadAssetUrl('o1', 'stu_1', 'd1', 'a_other')).toBeNull();
  });

  it('signs with the configured expiry and the display name', async () => {
    const captured: { expiry?: number; filename?: string } = {};
    const svc = new LearnReportServiceImpl(
      fakeReader({
        activeDownloadRef: async () => ({ orgId: 'o1', contentId: 'd1' }),
        downloadHasAsset: async () => true,
      }),
      fakeContent({
        getDownload: async () => download,
        listDownloadAssets: async () => [
          {
            id: 'da1',
            assetId: 'a1',
            seq: 0,
            displayName: 'Chapter One',
            filename: 'ch1.pdf',
            contentType: 'application/pdf',
            size: 10,
          },
        ],
      }),
      fakeProgress([]),
      fakeAssets(captured),
      300,
    );

    const result = await svc.downloadAssetUrl('o1', 'stu_1', 'd1', 'a1');

    expect(result?.url).toBe('https://storage.example/signed');
    expect(captured.expiry).toBe(300);
    expect(captured.filename).toBe('Chapter One');
  });

  it('falls back to the asset filename when there is no display name', async () => {
    const captured: { expiry?: number; filename?: string } = {};
    const svc = new LearnReportServiceImpl(
      fakeReader({
        activeDownloadRef: async () => ({ orgId: 'o1', contentId: 'd1' }),
        downloadHasAsset: async () => true,
      }),
      fakeContent({
        getDownload: async () => download,
        listDownloadAssets: async () => [
          {
            id: 'da1',
            assetId: 'a1',
            seq: 0,
            displayName: null,
            filename: 'ch1.pdf',
            contentType: 'application/pdf',
            size: 10,
          },
        ],
      }),
      fakeProgress([]),
      fakeAssets(captured),
      300,
    );

    await svc.downloadAssetUrl('o1', 'stu_1', 'd1', 'a1');

    expect(captured.filename).toBe('ch1.pdf');
  });
});
```

`fakeContent` does not exist yet — the existing tests construct a `ContentService` inline. Add a `fakeContent(over: Partial<ContentService> = {}): ContentService` helper that returns `vi.fn()`-free stubs for every `ContentService` member (they all reject or return empty by default) spread with `over`, and refactor the existing tests' inline content stub to use it. Import `AssetsService` from `../../core/assets/index.js` and `LearnEntitlementReader` from `./index.js`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run packages/server/src/reporting/learn/service.test.ts -t "download delivery"`
Expected: FAIL — the constructor takes three arguments, `downloadAssetUrl` is not a function.

- [ ] **Step 3: Add the port members**

In `reporting/learn/ports.ts`, add to `LearnReportService`:

```ts
  listDownloads(orgId: string, orgUserId: string): Promise<Download[]>;
  getDownload(
    orgId: string,
    orgUserId: string,
    downloadId: string,
  ): Promise<{ download: Download; assets: DownloadAsset[] } | null>;
  /** Entitlement-gated. Returns null (→ 404) for every failure — never 403,
   *  which would confirm the resource exists to someone not entitled to it. */
  downloadAssetUrl(
    orgId: string,
    orgUserId: string,
    downloadId: string,
    assetId: string,
  ): Promise<{ url: string; filename: string } | null>;
```

Re-export `Download` and `DownloadAsset` from `reporting/learn/model.ts` alongside the existing `Course`/`Module` re-export.

- [ ] **Step 4: Implement**

Extend the constructor and append the methods:

```ts
export class LearnReportServiceImpl implements LearnReportService {
  constructor(
    private readonly reader: LearnEntitlementReader,
    private readonly content: ContentService,
    private readonly progress: ProgressService,
    private readonly assets: AssetsService,
    private readonly deliveryExpirySeconds: number,
    private readonly logger: Logger = noopLogger,
  ) {}
```

```ts
  async listDownloads(orgId: string, orgUserId: string): Promise<Download[]> {
    const refs = await this.reader.activeDownloadRefs(orgId, orgUserId);
    const rows = await Promise.all(
      refs.map((ref) => this.content.getDownload(ref.orgId, ref.contentId)),
    );
    return rows.filter((d): d is Download => d !== null && d.status === 'published');
  }

  async getDownload(
    orgId: string,
    orgUserId: string,
    downloadId: string,
  ): Promise<{ download: Download; assets: DownloadAsset[] } | null> {
    const ref = await this.reader.activeDownloadRef(orgId, orgUserId, downloadId);
    if (!ref) {
      return null;
    }
    const download = await this.content.getDownload(ref.orgId, downloadId);
    if (!download || download.status !== 'published') {
      return null;
    }
    const assets = await this.content.listDownloadAssets(ref.orgId, downloadId);
    return { download, assets };
  }

  /** The paywall. Two gates, in order: an active entitlement to a published
   *  download, then the asset actually belonging to that download — so a
   *  student entitled to X cannot reach an asset of Y by swapping the id. */
  async downloadAssetUrl(
    orgId: string,
    orgUserId: string,
    downloadId: string,
    assetId: string,
  ): Promise<{ url: string; filename: string } | null> {
    const ref = await this.reader.activeDownloadRef(orgId, orgUserId, downloadId);
    if (!ref) {
      return null;
    }
    const linked = await this.reader.downloadHasAsset(ref.orgId, downloadId, assetId);
    if (!linked) {
      this.logger.warn('download asset not linked', { orgId, downloadId, assetId });
      return null;
    }
    const links = await this.content.listDownloadAssets(ref.orgId, downloadId);
    const link = links.find((l) => l.assetId === assetId);
    if (!link) {
      return null;
    }
    const filename = link.displayName ?? link.filename;
    const ticket = await this.assets.requestDownload(
      ref.orgId,
      assetId,
      filename,
      this.deliveryExpirySeconds,
    );
    if (!ticket) {
      return null;
    }
    // Never log the signed URL — it is a bearer capability.
    this.logger.info('download asset signed', { orgId, downloadId, assetId });
    return { url: ticket.url, filename };
  }
```

Import `AssetsService` from `../../core/assets/index.js` and `Download`, `DownloadAsset` from `./model.js`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/server/src/reporting/learn/service.test.ts`
Expected: PASS, including every pre-existing course test.

- [ ] **Step 6: Wire the container**

In `app/container.ts`, find the `LearnReportServiceImpl` construction and pass the two new arguments — the already-constructed `assets` service and `config.deliveryExpirySeconds` — before the logger.

Run: `pnpm --filter @headless-lms/server typecheck && pnpm --filter api typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/reporting/learn/ packages/server/src/app/container.ts
git commit -m "feat(learn): entitlement-gated presigned download delivery"
```

---

## Phase 4 — HTTP, contract, SDK

### Task 11: API contract schemas

**Files:**
- Create: `packages/api-contract/src/downloads.ts`
- Modify: `packages/api-contract/src/learn.ts`, `packages/api-contract/src/index.ts`

**Interfaces:**
- Consumes: nothing (Zod is the source of truth; it mirrors the Task 1 types)
- Produces: `Download`, `DownloadAsset`, `DownloadsQuery`, `DownloadsPage`, `CreateDownload`, `UpdateDownload`, `AddDownloadAsset`, `RenameDownloadAsset`, `ReorderDownloadAssets`, `DownloadIdParam`, `DownloadAssetParams`, `LearnDownloads`, `LearnDownload`

- [ ] **Step 1: Read the course contract first**

Read `packages/api-contract/src/content.ts`. Mirror its conventions exactly — how it builds the page wrapper, how it declares query defaults, whether it uses `z.iso.datetime()` or `z.string()` for timestamps. The steps below assume the course file's shape; where it differs, the course file wins.

- [ ] **Step 2: Write the schemas**

```ts
// Downloads resource schemas — a content type whose whole structure is an
// ordered set of media-library assets.
import { z } from "zod";

export const DownloadStatus = z.enum(["draft", "published"]);
export type DownloadStatus = z.infer<typeof DownloadStatus>;

export const Download = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  description: z.string(),
  status: DownloadStatus,
  category: z.string(),
  thumbnailAssetId: z.string().nullable(),
  assetCount: z.number().int(),
  totalSize: z.number().int(),
  entitledCount: z.number().int(),
  updatedAt: z.string(),
  createdAt: z.string(),
});
export type Download = z.infer<typeof Download>;

export const DownloadAsset = z.object({
  id: z.string(),
  assetId: z.string(),
  seq: z.number().int(),
  displayName: z.string().nullable(),
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int(),
});
export type DownloadAsset = z.infer<typeof DownloadAsset>;

export const DownloadsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sort: z.string().optional(),
  status: DownloadStatus.optional(),
  category: z.string().optional(),
});
export type DownloadsQuery = z.infer<typeof DownloadsQuery>;

export const DownloadsPage = z.object({
  rows: z.array(Download),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type DownloadsPage = z.infer<typeof DownloadsPage>;

export const CreateDownload = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
});
export type CreateDownload = z.infer<typeof CreateDownload>;

export const UpdateDownload = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  status: DownloadStatus.optional(),
  thumbnailAssetId: z.string().nullable().optional(),
});
export type UpdateDownload = z.infer<typeof UpdateDownload>;

export const AddDownloadAsset = z.object({
  assetId: z.string(),
  displayName: z.string().optional(),
});
export type AddDownloadAsset = z.infer<typeof AddDownloadAsset>;

export const RenameDownloadAsset = z.object({
  displayName: z.string().nullable(),
});
export type RenameDownloadAsset = z.infer<typeof RenameDownloadAsset>;

/** The COMPLETE ordered set — a partial list is rejected. */
export const ReorderDownloadAssets = z.object({
  assetIds: z.array(z.string()),
});
export type ReorderDownloadAssets = z.infer<typeof ReorderDownloadAssets>;

export const DownloadIdParam = z.object({ downloadId: z.string() });
export type DownloadIdParam = z.infer<typeof DownloadIdParam>;

export const DownloadAssetParams = z.object({
  downloadId: z.string(),
  assetId: z.string(),
});
export type DownloadAssetParams = z.infer<typeof DownloadAssetParams>;
```

- [ ] **Step 3: Add the learn schemas**

In `packages/api-contract/src/learn.ts`:

```ts
import { Download, DownloadAsset } from "./downloads.js";

/** Downloads the authenticated student is actively entitled to (published only). */
export const LearnDownloads = z.array(Download);
export type LearnDownloads = z.infer<typeof LearnDownloads>;

/** One entitled download plus its ordered assets. */
export const LearnDownload = z.object({
  download: Download,
  assets: z.array(DownloadAsset),
});
export type LearnDownload = z.infer<typeof LearnDownload>;
```

- [ ] **Step 4: Export from the barrel**

Add `export * from "./downloads.js";` to `packages/api-contract/src/index.ts`, following whatever form the existing exports use.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @headless-lms/api-contract typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api-contract/src/
git commit -m "feat(api-contract): downloads resource schemas"
```

---

### Task 12: Back-office download routes

**Files:**
- Create: `packages/server/src/http/routes/downloads.ts`
- Modify: `packages/server/src/http/routes.ts`

**Interfaces:**
- Consumes: `ContentService` download methods (Tasks 4–5); Task 11 schemas
- Produces: the `Downloads`-tagged routes listed below

Routes in this codebase are **`/api/`-prefixed**, declared with `r.route({...})` (not `r.get(...)`), carry an `operationId` and `summary`, guard with `preHandler: app.requireSession`, and get their org from `resolveScope(container, req)` — two arguments. A missing row **throws `NotFoundError`**; the central error handler maps it. 404 bodies use `ErrorBody`; 204 uses `z.void()`.

- [ ] **Step 1: Write the file header and the first four routes**

```ts
// HTTP routes for the download content type. Request + response are validated
// against the shared contract schemas by the Zod type provider, and
// @fastify/swagger reads the same schemas to build the OpenAPI spec.
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AddDownloadAsset,
  Download,
  DownloadAsset,
  DownloadAssetParams,
  DownloadIdParam,
  DownloadsPage,
  DownloadsQuery,
  CreateDownload,
  ErrorBody,
  RenameDownloadAsset,
  ReorderDownloadAssets,
  UpdateDownload,
} from '@headless-lms/api-contract';
import { z } from 'zod';
import type { Container } from '../../app/container.js';
import { NotFoundError } from '../../core/shared/errors.js';
import { resolveScope } from '../scope.js';

export async function downloadsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const content = container.content;

  r.route({
    method: 'GET',
    url: '/api/downloads',
    preHandler: app.requireSession,
    schema: {
      operationId: 'listDownloads',
      tags: ['Downloads'],
      summary: 'List downloads',
      querystring: DownloadsQuery,
      response: { 200: DownloadsPage },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.listDownloads(scope.orgId, req.query);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/downloads/:downloadId',
    preHandler: app.requireSession,
    schema: {
      operationId: 'getDownload',
      tags: ['Downloads'],
      summary: 'Get a download by id',
      params: DownloadIdParam,
      response: { 200: Download, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const download = await content.getDownload(scope.orgId, req.params.downloadId);
      if (!download) {
        throw new NotFoundError('Download', req.params.downloadId);
      }
      return download;
    },
  });

  r.route({
    method: 'POST',
    url: '/api/downloads',
    preHandler: app.requireSession,
    schema: {
      operationId: 'createDownload',
      tags: ['Downloads'],
      summary: 'Create a download',
      body: CreateDownload,
      response: { 201: Download },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const download = await content.createDownload(scope.orgId, req.body);
      return reply.code(201).send(download);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/downloads/:downloadId',
    preHandler: app.requireSession,
    schema: {
      operationId: 'updateDownload',
      tags: ['Downloads'],
      summary: 'Update a download',
      params: DownloadIdParam,
      body: UpdateDownload,
      response: { 200: Download, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.updateDownload(scope.orgId, req.params.downloadId, req.body);
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/downloads/:downloadId',
    preHandler: app.requireSession,
    schema: {
      operationId: 'deleteDownload',
      tags: ['Downloads'],
      summary: 'Delete a download',
      params: DownloadIdParam,
      response: { 204: z.void(), 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await content.removeDownload(scope.orgId, req.params.downloadId);
      return reply.code(204).send();
    },
  });
```

- [ ] **Step 2: Write the five asset-link routes**

All five return the complete ordered list, so they share `response: { 200: z.array(DownloadAsset), 404: ErrorBody }`.

```ts
  r.route({
    method: 'GET',
    url: '/api/downloads/:downloadId/assets',
    preHandler: app.requireSession,
    schema: {
      operationId: 'listDownloadAssets',
      tags: ['Downloads'],
      summary: "List a download's assets in order",
      params: DownloadIdParam,
      response: { 200: z.array(DownloadAsset), 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.listDownloadAssets(scope.orgId, req.params.downloadId);
    },
  });

  r.route({
    method: 'POST',
    url: '/api/downloads/:downloadId/assets',
    preHandler: app.requireSession,
    schema: {
      operationId: 'addDownloadAsset',
      tags: ['Downloads'],
      summary: 'Link a media-library asset to a download',
      params: DownloadIdParam,
      body: AddDownloadAsset,
      response: { 200: z.array(DownloadAsset), 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.addDownloadAsset(scope.orgId, req.params.downloadId, req.body);
    },
  });

  // Static segment before the parameterised sibling. Fastify's radix router
  // prefers static either way; the ordering documents the intent.
  r.route({
    method: 'PUT',
    url: '/api/downloads/:downloadId/assets/order',
    preHandler: app.requireSession,
    schema: {
      operationId: 'reorderDownloadAssets',
      tags: ['Downloads'],
      summary: 'Reorder a download\'s assets (send the complete set)',
      params: DownloadIdParam,
      body: ReorderDownloadAssets,
      response: { 200: z.array(DownloadAsset), 404: ErrorBody, 409: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.reorderDownloadAssets(
        scope.orgId,
        req.params.downloadId,
        req.body.assetIds,
      );
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/downloads/:downloadId/assets/:assetId',
    preHandler: app.requireSession,
    schema: {
      operationId: 'renameDownloadAsset',
      tags: ['Downloads'],
      summary: "Set an asset's display name within a download",
      params: DownloadAssetParams,
      body: RenameDownloadAsset,
      response: { 200: z.array(DownloadAsset), 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.renameDownloadAsset(
        scope.orgId,
        req.params.downloadId,
        req.params.assetId,
        req.body.displayName,
      );
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/downloads/:downloadId/assets/:assetId',
    preHandler: app.requireSession,
    schema: {
      operationId: 'removeDownloadAsset',
      tags: ['Downloads'],
      summary: 'Unlink an asset from a download (the asset itself survives)',
      params: DownloadAssetParams,
      response: { 200: z.array(DownloadAsset), 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return content.removeDownloadAsset(
        scope.orgId,
        req.params.downloadId,
        req.params.assetId,
      );
    },
  });
}
```

- [ ] **Step 3: Register the plugin**

In `http/routes.ts`, add the import beside the others and the call beside `coursesRoutes`:

```ts
import { downloadsRoutes } from './routes/downloads.js';
```
```ts
    await downloadsRoutes(instance, container);
```

- [ ] **Step 4: Verify the routes are mounted**

Run: `pnpm --filter @headless-lms/server typecheck`, then `pnpm --filter api dev`, then in a second shell:

```bash
curl -s localhost:8000/docs/json | grep -o '"/api/downloads[^"]*"' | sort -u
```
Expected: all seven distinct paths listed. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/http/routes/downloads.ts packages/server/src/http/routes.ts
git commit -m "feat(http): back-office download routes"
```

---

### Task 13: Student learn routes and the 302

**Files:**
- Modify: `packages/server/src/http/routes/learn.ts`

**Interfaces:**
- Consumes: `LearnReportService.listDownloads`, `getDownload`, `downloadAssetUrl` (Task 10); `LearnDownloads`, `LearnDownload`, `DownloadAssetParams` (Task 11)
- Produces: three routes under `/learn`

Learn routes are `/api/learn/...` and resolve their scope with **`resolveStudentScope(container, req)`** — not `resolveScope`. Follow the existing routes in the file.

- [ ] **Step 1: Add the two read routes**

```ts
  r.route({
    method: 'GET',
    url: '/api/learn/downloads',
    preHandler: app.requireSession,
    schema: {
      operationId: 'listLearnDownloads',
      tags: ['Learn'],
      summary: 'Downloads the student is actively entitled to',
      response: { 200: LearnDownloads },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      return container.learn.listDownloads(scope.orgId, scope.orgUserId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/learn/downloads/:downloadId',
    preHandler: app.requireSession,
    schema: {
      operationId: 'getLearnDownload',
      tags: ['Learn'],
      summary: 'One entitled download and its ordered assets',
      params: DownloadIdParam,
      response: { 200: LearnDownload, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      const result = await container.learn.getDownload(
        scope.orgId,
        scope.orgUserId,
        req.params.downloadId,
      );
      if (!result) {
        throw new NotFoundError('Download', req.params.downloadId);
      }
      return result;
    },
  });
```

Match how the file already reaches the learn service — read its opening lines and use the same local binding rather than `container.learn` if one exists.

- [ ] **Step 2: Add the redirect route**

```ts
  // One stable, resolvable URL per asset. Drops into an <a href download> in
  // any frontend — no JS, no SDK, no CORS preflight. The signed target is
  // minted per request and lives `deliveryExpirySeconds`.
  r.route({
    method: 'GET',
    url: '/api/learn/downloads/:downloadId/assets/:assetId',
    preHandler: app.requireSession,
    schema: {
      operationId: 'getLearnDownloadAsset',
      tags: ['Learn'],
      summary: 'Redirect to a short-lived signed URL for an entitled asset',
      params: DownloadAssetParams,
      response: { 302: z.void(), 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveStudentScope(container, req);
      const signed = await container.learn.downloadAssetUrl(
        scope.orgId,
        scope.orgUserId,
        req.params.downloadId,
        req.params.assetId,
      );
      if (!signed) {
        // Always 404, never 403 — a 403 confirms the resource exists to
        // someone not entitled to it.
        throw new NotFoundError('Download asset', req.params.assetId);
      }
      return reply
        .header('cache-control', 'no-store')
        .header('referrer-policy', 'no-referrer')
        .redirect(signed.url, 302);
    },
  });
```

Add `DownloadIdParam`, `DownloadAssetParams`, `LearnDownloads`, `LearnDownload` to the file's `@headless-lms/api-contract` import.

- [ ] **Step 3: Verify the 302 response schema compiles**

`fastify-type-provider-zod` runs response validation on declared statuses, and a bodyless redirect is the awkward case. `z.void()` is what the codebase already uses for the 204 on `DELETE /api/courses/:id`, so it is the right first attempt.

Run: `pnpm --filter api dev`.

If startup throws a schema-compilation error on the 302, drop the `302` key and declare only `404: ErrorBody` — an undeclared status skips response validation, which is correct for a body-less redirect. Leave a one-line comment saying why. Do not disable response validation on the other routes to work around it.

- [ ] **Step 4: Manually verify the redirect and its headers**

With the dev server running and a session cookie for a student entitled to a published download:

```bash
curl -s -D - -o /dev/null \
  -H "cookie: <session cookie>" \
  "localhost:8000/api/learn/downloads/<downloadId>/assets/<assetId>"
```

Expected: `HTTP/1.1 302`, a `location:` header pointing at the storage host, `cache-control: no-store`, `referrer-policy: no-referrer`.

Then repeat with an `assetId` belonging to a *different* download.
Expected: `HTTP/1.1 404`. This is the paywall — if it returns 302, stop and fix Task 10 before continuing.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/http/routes/learn.ts
git commit -m "feat(http): entitlement-gated download delivery redirect"
```

---

### Task 14: Regenerate the SDK

**Files:**
- Modify: `packages/sdk/openapi.json`, `packages/sdk/src/generated/` (both generated, both committed)

**Interfaces:**
- Consumes: Tasks 11–13
- Produces: `Downloads` SDK class with `listDownloads`, `createDownload`, `getDownload`, `updateDownload`, `deleteDownload`, `listDownloadAssets`, `addDownloadAsset`, `renameDownloadAsset`, `removeDownloadAsset`, `reorderDownloadAssets`

- [ ] **Step 1: Ensure the database is up**

`gen:openapi` boots the real app in-process and reads env via `--env-file`. No port is bound, but the DB connection is real.

- [ ] **Step 2: Regenerate**

Run: `pnpm gen:sdk`
Expected: `packages/sdk/openapi.json` and `packages/sdk/src/generated/` change.

- [ ] **Step 3: Verify the class exists**

Run: `grep -rn "class Downloads" packages/sdk/src/generated/`
Expected: one match.

- [ ] **Step 4: Build the SDK**

Run: `pnpm --filter @headless-lms/sdk build && pnpm --filter @headless-lms/sdk typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/
git commit -m "chore(sdk): regenerate for downloads resource"
```

---

## Phase 5 — Admin UI

### Task 15: Server data access and mutations

**Files:**
- Modify: `apps/admin/src/lib/api/server.ts`
- Create: `apps/admin/src/app/(dashboard)/downloads/actions.ts`

**Interfaces:**
- Consumes: the `Downloads` SDK class (Task 14)
- Produces: `serverApi.listDownloads(params)`; server actions `createDownloadAction`, `updateDownloadAction`, `setDownloadPublishedAction`, `deleteDownloadAction`, `addDownloadAssetAction`, `renameDownloadAssetAction`, `removeDownloadAssetAction`, `reorderDownloadAssetsAction`

- [ ] **Step 1: Add the list reader**

Read `apps/admin/src/lib/api/server.ts` and add `listDownloads` beside `listCourses`, following its exact shape (it forwards the cookie and unwraps the page).

- [ ] **Step 2: Write the server actions**

```ts
"use server";

// Server actions for download mutations.

import { revalidatePath } from "next/cache";
import { Downloads } from "@headless-lms/sdk";

import { ensureConfigured, authHeaders, unwrap, expectOk } from "@/lib/api/server-call";
import type { Download, DownloadAsset } from "@/lib/api/types";

/** Download-level writes surface on both the list and that download's page. */
function revalidateDownload(): void {
  revalidatePath("/downloads");
  revalidatePath("/downloads/[downloadId]", "page");
}

export interface DownloadInput {
  title: string;
  category?: string;
  description?: string;
}

export async function createDownloadAction(input: DownloadInput): Promise<Download> {
  ensureConfigured();
  const download = unwrap(
    await Downloads.createDownload({
      body: { title: input.title, description: input.description, category: input.category },
      ...(await authHeaders()),
    }),
  );
  revalidateDownload();
  return download;
}

export async function updateDownloadAction(
  downloadId: string,
  patch: DownloadInput & { status?: Download["status"]; thumbnailAssetId?: string | null },
): Promise<Download> {
  ensureConfigured();
  const download = unwrap(
    await Downloads.updateDownload({
      path: { downloadId },
      body: {
        title: patch.title,
        description: patch.description,
        category: patch.category,
        status: patch.status,
        thumbnailAssetId: patch.thumbnailAssetId,
      },
      ...(await authHeaders()),
    }),
  );
  revalidateDownload();
  return download;
}

export async function setDownloadPublishedAction(
  downloadId: string,
  status: Download["status"],
): Promise<void> {
  ensureConfigured();
  unwrap(
    await Downloads.updateDownload({
      path: { downloadId },
      body: { status },
      ...(await authHeaders()),
    }),
  );
  revalidateDownload();
}

export async function deleteDownloadAction(downloadId: string): Promise<void> {
  ensureConfigured();
  expectOk(await Downloads.deleteDownload({ path: { downloadId }, ...(await authHeaders()) }));
  revalidateDownload();
}

export async function addDownloadAssetAction(
  downloadId: string,
  assetId: string,
  displayName?: string,
): Promise<DownloadAsset[]> {
  ensureConfigured();
  const assets = unwrap(
    await Downloads.addDownloadAsset({
      path: { downloadId },
      body: { assetId, displayName },
      ...(await authHeaders()),
    }),
  );
  revalidateDownload();
  return assets;
}

export async function renameDownloadAssetAction(
  downloadId: string,
  assetId: string,
  displayName: string | null,
): Promise<DownloadAsset[]> {
  ensureConfigured();
  const assets = unwrap(
    await Downloads.renameDownloadAsset({
      path: { downloadId, assetId },
      body: { displayName },
      ...(await authHeaders()),
    }),
  );
  revalidateDownload();
  return assets;
}

export async function removeDownloadAssetAction(
  downloadId: string,
  assetId: string,
): Promise<DownloadAsset[]> {
  ensureConfigured();
  const assets = unwrap(
    await Downloads.removeDownloadAsset({
      path: { downloadId, assetId },
      ...(await authHeaders()),
    }),
  );
  revalidateDownload();
  return assets;
}

export async function reorderDownloadAssetsAction(
  downloadId: string,
  assetIds: string[],
): Promise<DownloadAsset[]> {
  ensureConfigured();
  const assets = unwrap(
    await Downloads.reorderDownloadAssets({
      path: { downloadId },
      body: { assetIds },
      ...(await authHeaders()),
    }),
  );
  revalidateDownload();
  return assets;
}
```

Add `Download` and `DownloadAsset` to `apps/admin/src/lib/api/types.ts` following how `Course` is re-exported there.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter admin typecheck`
Expected: PASS. If the SDK's generated parameter names differ (e.g. `id` rather than `downloadId`), match the generated signature — it is the source of truth.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/lib/api/ "apps/admin/src/app/(dashboard)/downloads/actions.ts"
git commit -m "feat(admin): download server actions"
```

---

### Task 16: Downloads list page

**Files:**
- Modify: `apps/admin/src/app/(dashboard)/downloads/page.tsx` (replace the placeholder)
- Create: `apps/admin/src/app/(dashboard)/downloads/downloads-table.tsx`
- Create: `apps/admin/src/app/(dashboard)/downloads/downloads-columns.tsx`
- Create: `apps/admin/src/app/(dashboard)/downloads/_components/download-form-sheet.tsx`

**Interfaces:**
- Consumes: `serverApi.listDownloads`, the Task 15 actions
- Produces: the Content › Downloads list surface

- [ ] **Step 1: Read the three course equivalents**

Read `courses/page.tsx`, `courses/courses-table.tsx`, `courses/courses-columns.tsx`, and `courses/_components/course-form-sheet.tsx`. The downloads versions are structurally identical — only the columns, the entity name, and the actions differ. Follow them rather than inventing.

- [ ] **Step 2: Replace the placeholder page**

```tsx
import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { parseListParams } from "@/lib/table/parse-list-params";

import { DownloadsTable } from "./downloads-table";

// Downloads list page: reads URL params, fetches server-side, renders the table.
export default async function DownloadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseListParams(sp, {
    pageSize: 20,
    initialSort: [{ id: "updatedAt", desc: true }],
  });

  const dataPromise = serverApi.listDownloads(params);
  await requireAuth(dataPromise);
  const { rows, total } = await dataPromise;

  return <DownloadsTable rows={rows} total={total} params={params} />;
}
```

- [ ] **Step 3: Write the columns**

Mirror `courses-columns.tsx`. The columns are: **Title** (links to `/downloads/{id}`), **Category**, **Status** (the same published/draft badge courses use), **Files** (`assetCount`), **Size** (`totalSize` rendered with the byte formatter the media library already uses — find it with `grep -rn "formatBytes\|prettyBytes" apps/admin/src`), **Entitled** (`entitledCount`), **Updated** (`updatedAt`). The row action menu offers Edit, Publish/Unpublish (`setDownloadPublishedAction`), and Delete (`deleteDownloadAction`).

If no byte formatter exists, add one to the shared util module the table helpers live in rather than defining it inline in the columns file.

- [ ] **Step 4: Write the table and form sheet**

`downloads-table.tsx` mirrors `courses-table.tsx`, passing the download columns and wiring the "New download" button to `download-form-sheet.tsx`. The form sheet mirrors `course-form-sheet.tsx` with fields Title, Description, Category, calling `createDownloadAction` or `updateDownloadAction`.

- [ ] **Step 5: Verify in the browser**

Run: `pnpm dev`, open `localhost:8001/downloads`.
Expected: an empty table (not the placeholder), a working "New download" button, and a created download appearing in the list.

- [ ] **Step 6: Commit**

```bash
git add "apps/admin/src/app/(dashboard)/downloads/"
git commit -m "feat(admin): downloads list surface"
```

---

### Task 17: Download detail shell and details tab

**Files:**
- Create: `apps/admin/src/app/(dashboard)/downloads/[downloadId]/layout.tsx`
- Create: `apps/admin/src/app/(dashboard)/downloads/[downloadId]/page.tsx`
- Create: `apps/admin/src/app/(dashboard)/downloads/[downloadId]/details/page.tsx`
- Create: `apps/admin/src/app/(dashboard)/downloads/[downloadId]/_components/download-header.tsx`
- Create: `apps/admin/src/app/(dashboard)/downloads/[downloadId]/_components/download-tabs-nav.tsx`

**Interfaces:**
- Consumes: `updateDownloadAction`, `setDownloadPublishedAction`, `deleteDownloadAction`
- Produces: the three-tab shell (Files / Details / Access) and the details form

- [ ] **Step 1: Read the course equivalents**

Read `courses/[courseId]/layout.tsx`, `_components/course-header.tsx`, `_components/course-tabs-nav.tsx`, and `courses/[courseId]/details/page.tsx`. Mirror them.

- [ ] **Step 2: Build the shell**

`layout.tsx` fetches the download server-side, renders `DownloadHeader` (title, status badge, publish toggle, delete) and `DownloadTabsNav`, then the tab's children.

The tabs are **Files** (`/downloads/{id}/assets`), **Details** (`/downloads/{id}/details`), **Access** (`/downloads/{id}/access`). The route segment is `assets` to match the table and the API; the visible label is "Files", which is the word an author expects.

`page.tsx` at `[downloadId]` redirects to `./assets` — the files list is the surface an author wants first, exactly as the course builder opens on content.

- [ ] **Step 3: Build the details tab**

A form over Title, Description, Category, and the thumbnail. Submitting calls `updateDownloadAction`. The thumbnail control reuses the media library picker — find it with `grep -rn "asset-preview-sheet\|AssetPicker" apps/admin/src` and follow whatever the media page already uses; if no reusable picker exists, render the current thumbnail plus a button that opens the same upload flow `media/upload-to-storage.ts` provides, then call `updateDownloadAction({ thumbnailAssetId })` with the resulting asset id.

- [ ] **Step 4: Verify in the browser**

Open a download from the list.
Expected: the shell renders, tabs navigate, the details form saves and the header title updates.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/src/app/(dashboard)/downloads/[downloadId]/"
git commit -m "feat(admin): download detail shell and details tab"
```

---

### Task 18: Files tab

**Files:**
- Create: `apps/admin/src/app/(dashboard)/downloads/[downloadId]/assets/page.tsx`
- Create: `apps/admin/src/app/(dashboard)/downloads/[downloadId]/_components/download-assets-panel.tsx`

**Interfaces:**
- Consumes: `addDownloadAssetAction`, `renameDownloadAssetAction`, `removeDownloadAssetAction`, `reorderDownloadAssetsAction`
- Produces: the ordered asset management surface

- [ ] **Step 1: Build the panel**

A client component taking the ordered `DownloadAsset[]` as its initial state. Each row shows the display name (falling back to `filename`), the content type, and the formatted size, with a drag handle and an overflow menu offering **Rename** and **Remove**.

- **Add** opens the media library picker (same control as the thumbnail in Task 17) and calls `addDownloadAssetAction`. Adding never uploads through a download-specific path — downloads own no upload flow of their own.
- **Rename** opens a dialog with a single Name field, calling `renameDownloadAssetAction`. An emptied field sends `null`, restoring the filename fallback.
- **Remove** calls `removeDownloadAssetAction`. Use the app's existing confirm dialog component, not `window.confirm` — a native dialog blocks.
- **Reorder** calls `reorderDownloadAssetsAction` with the complete new order. The server rejects a partial list, so always send every id.

Each action replaces local state with the returned array, which is already ordered.

- [ ] **Step 2: Build the page**

Server component: fetch the download's assets, render `DownloadAssetsPanel` with them.

- [ ] **Step 3: Verify in the browser**

Add two assets, rename one, drag to reorder, reload the page.
Expected: the order persists, the rename persists, and removing one leaves the other.

- [ ] **Step 4: Commit**

```bash
git add "apps/admin/src/app/(dashboard)/downloads/[downloadId]/"
git commit -m "feat(admin): download files tab"
```

---

### Task 19: Access tab

**Files:**
- Create: `apps/admin/src/app/(dashboard)/downloads/[downloadId]/access/page.tsx`

**Interfaces:**
- Consumes: the existing entitlements SDK surface
- Produces: grant management for a download

- [ ] **Step 1: Read the course access tab**

Read `courses/[courseId]/access/page.tsx`. Entitlements are generic over content type — the same component and the same `Entitlements` SDK calls work, filtered by `contentId`.

- [ ] **Step 2: Build the page**

Mirror the course access tab, passing the download id as the content id. If that page's components are course-specific in their prop names or copy, extract the shared piece into `apps/admin/src/components/` rather than duplicating it — this is the second consumer, which is where the abstraction earns itself.

- [ ] **Step 3: Verify in the browser**

Grant a student access to a download, confirm the row appears, revoke it.
Expected: both operations succeed and the list refreshes.

- [ ] **Step 4: Commit**

```bash
git add "apps/admin/src/app/(dashboard)/downloads/[downloadId]/access/" apps/admin/src/components/
git commit -m "feat(admin): download access tab"
```

---

## Phase 6 — Student UI

### Task 20: Student downloads surface

**Files:**
- Create: `apps/student/src/app/downloads/page.tsx`
- Create: `apps/student/src/app/downloads/[downloadId]/page.tsx`

**Interfaces:**
- Consumes: `GET /learn/downloads`, `GET /learn/downloads/:downloadId` (Task 13)
- Produces: the entitled-downloads list and detail with the download CTA

- [ ] **Step 1: Read the student courses surface**

Read `apps/student/src/app/courses/[courseId]/page.tsx` and the student app's `page.tsx`. Follow how they fetch (session-forwarded server components) and how they render an empty state.

- [ ] **Step 2: Build the list page**

Fetch `/learn/downloads`, render a card per download: thumbnail if present, title, description, and `assetCount` / formatted `totalSize`. Empty state when the student is entitled to none.

- [ ] **Step 3: Build the detail page with the CTA**

Fetch `/learn/downloads/{downloadId}`, 404 when null. Render the title, description, thumbnail, and the ordered asset list. **Each row's CTA is a plain anchor** — no click handler, no SDK call:

```tsx
<a
  href={`${apiBaseUrl}/api/learn/downloads/${download.id}/assets/${asset.assetId}`}
  download
  className="..."
>
  Download
</a>
```

This is the whole point of the 302: the link works with no JS, so any frontend — a funnel builder, an email, a webview — can deliver the file with nothing but an href. Do not replace it with a fetch-then-navigate handler.

`apiBaseUrl` comes from the same env the student app already uses to configure the SDK — read `apps/student/src/lib/` to find it. It must be an absolute URL, since the anchor points at the API host, not the Next app.

- [ ] **Step 4: Verify end to end**

With a student entitled to a published download holding at least one asset: open the detail page and click Download.
Expected: the file downloads with the display name as its filename.

Then unpublish the download in admin and reload.
Expected: the detail page 404s. Republish, then revoke the entitlement.
Expected: 404 again. These two are the paywall behaving correctly.

- [ ] **Step 5: Commit**

```bash
git add apps/student/src/app/downloads/
git commit -m "feat(student): entitled downloads surface"
```

---

## Phase 7 — Documentation

### Task 21: Update the domain doc and AGENTS.md

**Files:**
- Modify: `docs/domain/content.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the content domain doc**

In `docs/domain/content.md`, move **Download** out of "Future types the domain will hold" and into the "Today" list:

```markdown
- **Download** — an ordered set of files; access and retrieval, no progression.
```

Under "Other types", replace the download mention with its actual model: a download owns an ordered set of asset links and nothing else — no drip, no unlock, no completion. Update "Build state" to say the course and download types are built and persisted.

Keep it in domain vocabulary. No table names, no route paths, no TypeScript — those belong in `AGENTS.md` and the code.

- [ ] **Step 2: Update AGENTS.md**

In the API contract section's resource-tag list, add `Downloads`. In the architecture section, note that `content_items` is widened per content type and that `ContentType` now has two members.

- [ ] **Step 3: Full verification**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS across all workspaces.

Run: `git status --short`
Expected: only the doc changes outstanding. If `packages/sdk/openapi.json` is dirty, the contract drifted after Task 14 — regenerate and commit that separately.

- [ ] **Step 4: Commit**

```bash
git add docs/domain/content.md AGENTS.md
git commit -m "docs: downloads is a built content type"
```

---

## Notes for the implementer

### The existing `/api/learn/assets/:id/download-url` bypasses this paywall

`http/routes/learn.ts:107-130` already exposes, to any authenticated student:

```ts
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      const ticket = await container.assets.requestDownload(
        scope.orgId,
        req.params.id,
        req.body.filename,
      );
```

The only checks are a valid session and that the asset belongs to the caller's org. **There is no entitlement check.** Any student who learns an asset id gets a signed URL for it.

That predates this work — it exists so a course activity can refresh the long-expired presign persisted at authoring time. But it means the entitlement gate built in Task 10 is bypassable the moment a download's asset id is known, and `GET /api/learn/downloads/:downloadId` returns exactly those ids to anyone entitled to *any* download. So an entitled student can read asset ids from their own download and, if they ever obtain another download's ids, fetch them through this route.

This plan does not change that route — narrowing it needs its own design, because course activities depend on the current behaviour and the fix has to keep them working. **Do not treat Task 13 as delivering a complete paywall until this route is addressed.** Raise it before starting Phase 3.

### The two tests that must never regress

Both are in Task 10: an asset belonging to a different download must not resolve, and a revoked or expired entitlement must not resolve. If a refactor makes either awkward, change the refactor.

### Repository SQL has no automated coverage

`adapters/db/repositories/*.test.ts` use hand-built fake executors (`vi.fn()` chains), not a live database — see `outbox.test.ts`. So the entitlement filters in Task 9 (`status = 'active'`, `expires_at`, `downloads.status = 'published'`) cannot be unit-tested in this codebase's current style. They are covered only by the manual checks in Task 13 Step 4 and Task 20 Step 4. Run those; do not skip them because the suite is green.

**Duplicate titles raise an unhandled 500.** `ContentServiceImpl.create` slugifies without uniquifying, and `courses.slug` / `downloads.slug` are unique per org, so two courses (or two downloads) with the same title in one org produce a Postgres 23505 that no layer catches. `adapters/db/repositories/pg-errors.ts` already exports `isUniqueViolation` for exactly this, unused on this path. This plan reproduces the existing behaviour for downloads rather than diverging. Fixing it for both types is a separate change worth making.

**`ContentRepository` and `CourseRepository` carry a standing TODO** to merge into one port (`core/content/ports.ts:42-43`). This plan adds downloads to `ContentRepository`, which makes that split slightly odder — the content-context repo now holds courses and downloads while a second port holds course structure. That merge is out of this plan's path and should not be attempted mid-way through it.
