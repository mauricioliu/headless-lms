import { z } from "zod";
import { contentTypeSchema } from "./content.js";
import { idSchema, serializableDateSchema } from "./shared.js";

export const entitlementStatusSchema = z.enum(["active", "expired", "revoked"]);
export type EntitlementStatus = z.infer<typeof entitlementStatusSchema>;

export const contentRefSchema = z.object({
  id: idSchema,
  type: contentTypeSchema,
  title: z.string(),
});
export type ContentRef = z.infer<typeof contentRefSchema>;

export const entitlementSchema = z.object({
  id: idSchema,
  orgUserId: idSchema,
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().email(),
  content: contentRefSchema,
  status: entitlementStatusSchema,
  grantedAt: serializableDateSchema,
  expiresAt: serializableDateSchema.nullable(),
  source: z.string(),
});
export type Entitlement = z.output<typeof entitlementSchema>;
export type EntitlementInput = z.input<typeof entitlementSchema>;

export const entitlementsQuerySchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  search: z.string().optional(),
  sort: z.string().optional(),
  status: entitlementStatusSchema.optional(),
  source: z.string().optional(),
  orgUserId: idSchema.optional(),
  contentId: idSchema.optional(),
  type: contentTypeSchema.optional(),
});
export type EntitlementsQuery = z.infer<typeof entitlementsQuerySchema>;

export const grantEntitlementInputSchema = z.object({
  orgUserId: idSchema,
  contentId: idSchema,
  expiresAt: serializableDateSchema.nullable(),
});
export type GrantEntitlementInput = z.input<typeof grantEntitlementInputSchema>;
