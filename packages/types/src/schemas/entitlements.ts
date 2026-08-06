import { z } from "zod";
import { idSchema } from "./shared.js";

export const entitlementStatusSchema = z.enum(["active", "revoked"]);
export type EntitlementStatus = z.infer<typeof entitlementStatusSchema>;

export const entitlementSchema = z.object({
  orgId: idSchema,
  id: idSchema,
  orgUserId: idSchema,
  contentId: idSchema,
  status: entitlementStatusSchema,
  source: z.string(),
  grantedAt: z.coerce.date(),
  expiresAt: z.coerce.date().nullable(),
}).strict();
export type Entitlement = z.output<typeof entitlementSchema>;
export type EntitlementInput = z.input<typeof entitlementSchema>;

export const entitlementsQuerySchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  search: z.string().optional(),
  sort: z.string().optional(),
  status: z.enum(["active", "expired", "revoked"]).optional(),
  source: z.string().optional(),
  orgUserId: idSchema.optional(),
  contentId: idSchema.optional(),
  type: z.enum(["course", "download"]).optional(),
}).strict();
export type EntitlementsQuery = z.infer<typeof entitlementsQuerySchema>;

export const grantEntitlementInputSchema = z.object({
  orgUserId: idSchema,
  contentId: idSchema,
  expiresAt: z.coerce.date().nullable(),
}).strict();
export type GrantEntitlementInput = z.output<typeof grantEntitlementInputSchema>;
