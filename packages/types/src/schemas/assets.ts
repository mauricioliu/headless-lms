import { z } from "zod";
import { idSchema } from "./shared.js";

export const assetKindSchema = z.enum(["video", "download", "content"]);
export type AssetKind = z.infer<typeof assetKindSchema>;

export const assetStatusSchema = z.enum(["pending", "ready"]);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

export const assetSchema = z.object({
  id: idSchema,
  key: z.string().trim().min(1),
  kind: assetKindSchema,
  filename: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  size: z.number().int().min(0),
  status: assetStatusSchema,
  uploadedBy: idSchema,
  createdAt: z.string().trim().min(1),
}).strict();
export type Asset = z.infer<typeof assetSchema>;

export const requestUploadInputSchema = z.object({
  uploadedBy: idSchema,
  filename: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  kind: assetKindSchema,
}).strict();
export type RequestUploadInput = z.infer<typeof requestUploadInputSchema>;

export const uploadTicketSchema = z.object({
  asset: assetSchema,
  uploadUrl: z.string().trim().min(1),
  method: z.literal("PUT"),
  expiresInSeconds: z.number().int().positive(),
  headers: z.record(z.string(), z.string()),
}).strict();
export type UploadTicket = z.infer<typeof uploadTicketSchema>;

export const downloadTicketSchema = z.object({
  url: z.string().trim().min(1),
  asset: assetSchema,
}).strict();
export type DownloadTicket = z.infer<typeof downloadTicketSchema>;

export const assetsQuerySchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  search: z.string().optional(),
  sort: z.string().optional(),
  kind: assetKindSchema.optional(),
}).strict();
export type AssetsQuery = z.infer<typeof assetsQuerySchema>;
