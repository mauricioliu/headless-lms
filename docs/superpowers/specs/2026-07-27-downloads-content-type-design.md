# Downloads — a second content type

**Status:** approved, ready for planning
**Date:** 2026-07-27

## Summary

Add `download` as the second content type in the `content` context: a titled, ordered set of media-library assets that an entitled student can fetch over short-lived presigned URLs. No structure beyond the ordered set — no modules, no activities, no drip, no unlock rules, no progression.

This is deliberately additive. `entitlements`, `progress`, and the `assets` context need no schema changes; the `content_items` registry is the extension point they already hang off.

## Decisions

| Decision | Choice |
|---|---|
| Publish state | `status` draft/published, mirroring `courses` |
| Bulk zip ("Download All") | Not built. Per-asset delivery only. Nothing in the schema blocks adding it later — it is an added route plus a job, not a data change. |
| Build scope | Full vertical slice: backend, contract, SDK, admin authoring UI, student surface |
| Thumbnail | `thumbnail_asset_id` on `downloads`, nullable, referencing the media library. Courses stay without one. |
| Context layout | One `ContentService`, one `ContentRepository`. Repository per bounded context, not per content type. |
| Join table name | `download_assets` — it links assets, and they are assets |
| Delivery contract | One stable resource URL per asset, 302 to a freshly-signed URL on every hit |

### Why one service, not two

`core/content/` keeps the flat file contract AGENTS.md specifies — `service.ts`, `model.ts`, `types.ts`, `events.ts`, `ports.ts`, `index.ts`, `service.test.ts`. `ContentService` gains the download methods; `ContentRepository` gains their persistence. No new service class, no new repository, no sub-folders. The repository boundary is the bounded context.

### Why 302, not JSON

The API is headless; a frontend may be a Next app, a funnel builder, an email, or a webview. The only capability all of them share is rendering a link. A redirect makes the Download CTA a plain anchor:

```html
<a href="https://api.../learn/downloads/{downloadId}/assets/{assetId}" download>Download</a>
```

No JS, no SDK, no fetch-then-navigate, no CORS preflight. A JSON body would require a scripted client holding a session — the coupling a headless API should not impose on its consumers.

The stable URL is safe to persist in a page, an email, or a CMS field. What it resolves to is short-lived and re-authorized on every click, so nothing durable ever contains a credential.

Top-level GET navigation carries `SameSite=Lax` cookies, so the session reaches the API cross-origin. If the API is not same-site with the frontend, the session cookie must be `SameSite=None; Secure`.

## Schema

`packages/server/src/adapters/db/schema/content.ts`.

### `content_items`

Widen the type enum and the check constraint to `('course','download')`. Nothing else about the registry changes — `entitlements` FKs it and inherits downloads for free.

### `downloads`

Mirrors `courses`:

- `org_id` → `organizations.id`, `id` (`genId('download')`), composite `(org_id, id)` PK
- `type` — generated always as `'download'`, pinning the composite FK to `content_items (org_id, id, type)`, `onDelete: cascade`
- `title`, `slug` (unique per org), `description` (default `''`), `status` (`draft`|`published`, default `draft`), `category` (default `''`)
- `thumbnail_asset_id` — nullable, composite FK to `assets (org_id, id)`, **restrictive**: a thumbnail in use blocks deleting the asset
- `created_at`, `updated_at`

### `download_assets`

The `activity_assets` shape, one level shallower:

- `org_id`, `id` (`genId('downloadAsset')`), composite `(org_id, id)` PK
- `download_id` — composite FK to `downloads`, `onDelete: cascade` (links belong to the download's aggregate)
- `asset_id` — composite FK to `assets`, **restrictive** (the asset is media-library-owned and survives)
- `seq` — integer, ordering within the download
- `display_name` — nullable; falls back to the asset's `filename`
- Unique on `(org_id, download_id, asset_id)` — which is what lets the delivery route key on `asset_id` rather than the link row id

## Types

`packages/types/src/content.ts`, declared once and re-exported by `core/content/model.ts`:

- `ContentType` widens to `'course' | 'download'` — `entitlements`' `ContentRef` inherits this with no edit
- `DownloadStatus = 'draft' | 'published'`
- `Download` — id, title, slug, description, status, category, `thumbnailAssetId: string | null`, `assetCount`, `totalSize`, `updatedAt`, `createdAt`
- `DownloadAsset` — id, assetId, seq, `displayName: string | null`, plus the asset facts the UI renders (filename, contentType, size)
- `ListDownloadsQuery` (page, pageSize, search, sort, status, category — mirroring `ListCoursesQuery`)
- `CreateDownloadInput` (title, optional description, optional category), `UpdateDownloadInput` (all optional: title, description, category, status, thumbnailAssetId)
- `AddDownloadAssetInput` — `{ assetId, displayName?: string }`. `seq` is assigned by the service as `max(seq) + 1` within the download; callers never set it. Reordering is its own operation.
- `ReorderDownloadAssetsInput` — `{ assetIds: string[] }`, the complete ordered set. The service rejects a list that is not exactly the download's current asset ids, so a stale client cannot silently drop a link.
- Events: `DownloadCreated`, `DownloadUpdated`, `DownloadDeleted`, folded into `ContentEvent`

`assetCount` and `totalSize` are derived at read time by joining `download_assets` → `assets`. Never stored.

## Core — `core/content/`

`ContentService` and `ContentRepository` (both in `ports.ts`) gain:

- `listDownloads(orgId, query)` → `Page<Download>`
- `getDownload(orgId, id)` → `Download | null`
- `createDownload(orgId, input)` / `updateDownload(orgId, id, input)` / `deleteDownload(orgId, id)`
- `listDownloadAssets(orgId, downloadId)` → `DownloadAsset[]`, ordered by `seq`
- `addDownloadAsset(orgId, downloadId, input)` / `removeDownloadAsset(orgId, downloadId, assetId)`
- `renameDownloadAsset(orgId, downloadId, assetId, displayName)`
- `reorderDownloadAssets(orgId, downloadId, assetIds)`

Creating a download inserts the `content_items` registry row and the `downloads` row in one transaction, mirroring how courses are created. Slug is derived from the title and uniquified per org, as courses do.

`deleteDownload` deletes through `content_items`, so the cascade removes the `downloads` row, its `download_assets` links, and the entitlement grants — while the assets themselves survive, because their FK is restrictive.

Events publish on the shared bus exactly as the course events do.

## Delivery and signing — `reporting/learn/`

One service, one reader. `LearnReportService` and `LearnEntitlementReader` gain download methods; `DrizzleLearnRepository` implements them. No parallel classes.

`CourseRef` generalizes to a `ContentRef` carrying `{ orgId, contentId }`. This is a rename with call-site churn, not a behaviour change: `LearnReportServiceImpl` and `DrizzleLearnRepository` currently read `ref.courseId` in every course method, and each becomes `ref.contentId`. The course queries are otherwise untouched.

The reader's download queries inner-join `downloads` instead of `courses`, which restricts to download grants without an explicit type filter — the same trick the course reader already uses.

### Reader additions

- `activeDownloadRefs(orgId, orgUserId)` — active, non-expired grants whose content row is a **published** download
- `activeDownloadRef(orgId, orgUserId, downloadId)` — the same, for one download

"Active" excludes revoked and expired; expiry is derived from `expires_at` at read time, no row flip. Every query is bounded by `entitlements.org_id`, so no cross-org grant resolves.

### Service additions

- `listDownloads(orgId, orgUserId)` → `Download[]`
- `getDownload(orgId, orgUserId, downloadId)` → `Download | null` (with its ordered assets)
- `downloadAssetUrl(orgId, orgUserId, downloadId, assetId)` → `string | null`

### The signing path

`downloadAssetUrl` runs, in order, and stops at the first failure:

1. `activeDownloadRef(orgId, orgUserId, downloadId)` — an active entitlement to a published download. Null → `null` → **404**.
2. The `(download_id, asset_id)` pair exists in `download_assets`. Null → `null` → **404**. This is the step that matters: a student entitled to download X cannot reach an asset of download Y by swapping the id, and an arbitrary media-library asset id is not reachable at all.
3. Only then `AssetsService.requestDownload(orgId, assetId, displayName, expiresInSeconds)` mints the presigned GET.

Always 404, never 403 — a 403 confirms the resource exists to someone not entitled to it.

### Expiry

`AssetsService.requestDownload` currently takes no expiry and inherits the adapter default, so `STORAGE_DOWNLOAD_EXPIRY` raised for an unrelated reason would silently extend the life of paywalled links. Fix:

- Add `expiresInSeconds?: number` to `requestDownload` in `core/assets/ports.ts` and thread it to `storage.presignDownload`. The `ObjectStorage` port and the MinIO adapter already accept a per-call expiry — neither changes.
- Add a delivery-specific knob: `apps/api/src/config.ts` gains `deliveryExpirySeconds: Number(process.env.DELIVERY_URL_EXPIRY ?? 300)`, threaded through `createContainer` into the learn service.

300 seconds. Expiry is validated when the transfer begins, not throughout, so a five-minute window does not truncate a large file mid-download, and a leaked URL dies in minutes.

### Response hardening

- `Content-Disposition: attachment` with `display_name` (falling back to the asset filename), so nothing renders inline from the storage origin
- `Cache-Control: no-store` on the redirect — it is a bearer capability, not a document
- `Referrer-Policy: no-referrer`, so the storage origin never receives the referring URL
- The signed URL is never logged. Log the asset id and the outcome.

## HTTP — `packages/server/src/http/routes/`

All routes in this codebase are **`/api/`-prefixed** (`/api/courses`, `/api/learn/courses`). The paths below omit the prefix for readability; the real URLs carry it, including the delivery URL an anchor points at.

**`downloads.ts`** (new, tag `Downloads`, inside the session-guarded plugin):

| Method | Path |
|---|---|
| GET | `/downloads` |
| POST | `/downloads` |
| GET | `/downloads/:downloadId` |
| PATCH | `/downloads/:downloadId` |
| DELETE | `/downloads/:downloadId` |
| GET | `/downloads/:downloadId/assets` |
| POST | `/downloads/:downloadId/assets` |
| PATCH | `/downloads/:downloadId/assets/:assetId` (rename) |
| DELETE | `/downloads/:downloadId/assets/:assetId` |
| PUT | `/downloads/:downloadId/assets/order` |

**`learn.ts`** (existing, extended):

| Method | Path | Response |
|---|---|---|
| GET | `/learn/downloads` | `Download[]` |
| GET | `/learn/downloads/:downloadId` | `Download` with ordered assets |
| GET | `/learn/downloads/:downloadId/assets/:assetId` | **302** to the signed URL |

Register `downloads.ts` in `http/routes.ts` inside the session-guarded plugin.

The 302 route declares `response: { 302: ..., 404: ... }` so `@fastify/swagger` documents it. The exact zod declaration for a bodyless 302 under `fastify-type-provider-zod` needs verifying during implementation — response validation runs on declared statuses.

## Contract and SDK

`packages/api-contract/src/downloads.ts` (new): `Download`, `DownloadAsset`, `DownloadsQuery`, `DownloadsPage`, `CreateDownload`, `UpdateDownload`, `AddDownloadAsset`, `RenameDownloadAsset`, `ReorderDownloadAssets`, `DownloadIdParam`, `DownloadAssetParams`. Export from `index.ts`.

`packages/api-contract/src/learn.ts`: `LearnDownloads`, `LearnDownload`, `LearnDownloadAssetParams`.

Then `pnpm gen:sdk` (database must be up — `gen:openapi` boots the real app). A `Downloads` class appears in the SDK; `openapi.json` and `src/generated/` are committed.

## Admin UI — `apps/admin`

`app/(dashboard)/downloads/page.tsx` is currently a placeholder behind the Content › Downloads nav entry. Replace it, mirroring the courses surface:

- `downloads/page.tsx`, `downloads-table.tsx`, `downloads-columns.tsx`, `actions.ts`, `_components/download-form-sheet.tsx`
- `downloads/[downloadId]/` with `layout.tsx`, `_components/download-header.tsx`, `download-tabs-nav.tsx`
- `[downloadId]/details/page.tsx` — title, description, status, category, thumbnail picker
- `[downloadId]/assets/page.tsx` — ordered asset list with add, rename, remove, reorder. The route segment is `assets` to match the table and the API; the visible tab label is "Files", which is the word an author expects.
- `[downloadId]/access/page.tsx` — entitlement grants, mirroring the course access tab

Adding an asset reuses the media library: pick an existing asset, or upload via the existing `media/upload-to-storage.ts` flow and link the result. Downloads never own an upload path of their own.

## Student UI — `apps/student`

`app/downloads/page.tsx` lists entitled downloads; `app/downloads/[downloadId]/page.tsx` renders the title, description, thumbnail, and the ordered asset list. Each row is a plain anchor to `/learn/downloads/{id}/assets/{assetId}` with the `download` attribute — no click handler, no SDK call.

The CTA renders only for an entitled session, which the page already knows because the detail response listed the assets. A public pre-purchase landing page points its CTA at checkout, not at this URL; the API stays out of funnel routing.

## Testing

- `core/content/service.test.ts` — download CRUD, slug uniqueness, asset link add/remove/rename/reorder, registry row created and cascaded on delete, events published
- `reporting/learn/service.test.ts` — the signing path: no entitlement → null; expired entitlement → null; revoked → null; draft download → null; asset belonging to a different download → null; happy path returns a URL and passes the configured expiry through
- Cross-org: a valid download id from another org resolves to null on every read
- Route tests: 404 shape on each failure, 302 `Location` and the three hardening headers on success

The mismatched-asset and cross-org cases are the ones that must not regress — they are the paywall.

## Docs

- `docs/domain/content.md` — move Download from "future types" into the built list, and record that it has no progression and no gating rules
- `AGENTS.md` — note that `ContentType` now has two members and that `content_items` is widened per type
