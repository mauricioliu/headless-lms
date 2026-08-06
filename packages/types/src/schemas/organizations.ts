import { z } from "zod";
import { idSchema, serializableDateSchema } from "./shared.js";

export const roleSchema = z.enum(["owner", "admin", "instructor", "student"]);
export type Role = z.infer<typeof roleSchema>;

export const orgUserStatusSchema = z.enum(["invited", "active"]);
export type OrgUserStatus = z.infer<typeof orgUserStatusSchema>;

export const inviteRoleSchema = z.enum(["admin", "instructor", "student"]);
export type InviteRole = z.infer<typeof inviteRoleSchema>;

export const organizationSchema = z.object({
  id: idSchema,
  externalId: idSchema.nullable().optional(),
  name: z.string(),
  slug: z.string(),
  ownerId: idSchema,
  createdAt: serializableDateSchema,
  updatedAt: serializableDateSchema,
});
export type Organization = z.output<typeof organizationSchema>;
export type OrganizationInput = z.input<typeof organizationSchema>;

export const orgUserSchema = z.object({
  id: idSchema,
  orgId: idSchema,
  userId: idSchema,
  role: roleSchema,
  status: orgUserStatusSchema,
  createdAt: serializableDateSchema,
  updatedAt: serializableDateSchema,
});
export type OrgUser = z.output<typeof orgUserSchema>;
export type OrgUserInput = z.input<typeof orgUserSchema>;

export const orgUserProfileSchema = z.object({
  id: idSchema,
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().email(),
  image: z.string().nullable(),
});
export type OrgUserProfile = z.infer<typeof orgUserProfileSchema>;

export const inviteSchema = z.object({
  id: idSchema,
  orgId: idSchema,
  email: z.string().email(),
  role: inviteRoleSchema,
  status: z.string(),
  invitedBy: idSchema,
  expiresAt: serializableDateSchema.nullable(),
  createdAt: serializableDateSchema,
});
export type Invite = z.output<typeof inviteSchema>;
export type InviteInput = z.input<typeof inviteSchema>;

export const newOrganizationInputSchema = z.object({
  name: z.string(),
  slug: z.string(),
  logo: z.string().optional(),
});
export type NewOrganizationInput = z.infer<typeof newOrganizationInputSchema>;

export const addOrgUserInputSchema = z.object({
  orgId: idSchema,
  userId: idSchema,
  role: roleSchema,
});
export type AddOrgUserInput = z.infer<typeof addOrgUserInputSchema>;

export const createOrgUserInputSchema = z.object({
  orgId: idSchema,
  userId: idSchema,
  role: roleSchema,
  status: orgUserStatusSchema.optional(),
});
export type CreateOrgUserInput = z.infer<typeof createOrgUserInputSchema>;

export const createInviteInputSchema = z.object({
  orgId: idSchema,
  email: z.string().email(),
  role: inviteRoleSchema,
  inviterUserId: idSchema,
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  sendEmail: z.boolean().optional(),
});
export type CreateInviteInput = z.infer<typeof createInviteInputSchema>;

export const acceptInviteInputSchema = z.object({
  token: z.string().trim().min(1),
  userId: idSchema,
  email: z.string().email(),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteInputSchema>;
