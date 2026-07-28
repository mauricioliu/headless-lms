// content context — domain entities, DTOs, and events.
//
// Aggregate shape (mirrors the frozen schema):
//   Course → Module → ordered Activity. An Activity is the leaf sitting directly
//   in a module: UNIFORM content the domain does not categorise — a `seq` and an
//   opaque `settings` blob holding whatever the content needs (title, type, body,
//   completion rule, …). Assets are the one thing kept OUT of the blob (owned by
//   the assets domain) and surfaced here as `Activity.assetIds`.

import type { DomainEvent } from "./shared.js";

/** The registered content types — every row in the content_items registry is
 *  one of these. Widened per new content type (podcast, membership, …). */
export type ContentType = "course" | "download";

export type CourseStatus = "draft" | "published";

/** Course-wide delivery settings. Stored as a jsonb blob, always read back
 *  complete — missing keys fall back to their defaults. */
export interface CourseSettings {
  /** Students may download a text transcript for every video in the course. */
  transcriptDownloads: boolean;
}

export interface Course {
  readonly id: string;
  title: string;
  slug: string;
  description: string;
  status: CourseStatus;
  category: string;
  settings: CourseSettings;
  moduleCount: number;
  activityCount: number;
  enrolledCount: number;
  updatedAt: string;
  createdAt: string;
}

/** The leaf, directly in a module. Uniform content: seq + opaque settings blob. */
export interface Activity {
  readonly id: string;
  moduleId: string;
  seq: number;
  /** Opaque per-activity blob (title, type, body, completion rule, …). Not modelled. */
  settings: unknown;
  /** Media-library assets backing this activity (activity_assets), ordered. */
  assetIds: string[];
}

export interface Module {
  readonly id: string;
  courseId: string;
  title: string;
  seq: number;
  activities: Activity[];
}

/** Upsert payload for an activity: opaque settings + its ordered asset links. */
export interface SaveActivityInput {
  settings?: unknown;
  assetIds?: string[];
}

export interface ListCoursesQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  /** Sort field, optionally `-` prefixed for descending (e.g. `-updatedAt`). */
  sort?: string | undefined;
  status?: CourseStatus | undefined;
  category?: string | undefined;
}

export interface CreateCourseInput {
  title: string;
  description?: string | undefined;
  category?: string | undefined;
}

export interface UpdateCourseInput {
  title?: string | undefined;
  description?: string | undefined;
  category?: string | undefined;
  status?: CourseStatus | undefined;
  /** Merged over the stored settings — keys left out keep their value. */
  settings?: Partial<CourseSettings> | undefined;
}

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

// --- Domain events (published on the shared EventBus) -----------------------

export interface CourseCreated extends DomainEvent {
  type: "course.created";
  course: Course;
}

export interface CourseUpdated extends DomainEvent {
  type: "course.updated";
  course: Course;
}

/** Carries the pre-delete snapshot — the row is gone once consumers see this. */
export interface CourseDeleted extends DomainEvent {
  type: "course.deleted";
  course: Course;
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

/** Domain events the content context emits. */
export type ContentEvent =
  | CourseCreated
  | CourseUpdated
  | CourseDeleted
  | DownloadCreated
  | DownloadUpdated
  | DownloadDeleted;
