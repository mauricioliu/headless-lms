// Downloads resource schemas — a content type whose whole structure is an
// ordered set of media-library assets. The Fastify routes validate
// requests/responses against these, the OpenAPI spec is built from them, and
// the frontend SDK is generated off that spec.
import { z } from "zod";
import { ListQuery, paginated } from "./shared.js";

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

/** One asset linked to a download, in author-defined order. */
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

export const CreateDownload = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  category: z.string().default(""),
});
export type CreateDownload = z.infer<typeof CreateDownload>;

export const UpdateDownload = CreateDownload.partial().extend({
  status: DownloadStatus.optional(),
  thumbnailAssetId: z.string().nullable().optional(),
});
export type UpdateDownload = z.infer<typeof UpdateDownload>;

export const DownloadsQuery = ListQuery.extend({
  status: DownloadStatus.optional(),
  category: z.string().optional(),
});
export type DownloadsQuery = z.infer<typeof DownloadsQuery>;

export const DownloadsPage = paginated(Download);
export type DownloadsPage = z.infer<typeof DownloadsPage>;

/** `seq` is assigned by the service as max(seq) + 1 — never accepted here. */
export const AddDownloadAsset = z.object({
  assetId: z.string(),
  displayName: z.string().optional(),
});
export type AddDownloadAsset = z.infer<typeof AddDownloadAsset>;

/** `null` restores the `filename` fallback. */
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
