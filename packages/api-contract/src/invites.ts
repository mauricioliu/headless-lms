// Invites resource schemas — domain-owned invitations (staff + student).
import { z } from "zod";

/** Roles an invitation can carry. Never owner. */
export const InviteRole = z.enum(["admin", "instructor", "student"]);
export type InviteRole = z.infer<typeof InviteRole>;

export const Invite = z.object({
  id: z.string(),
  email: z.string(),
  role: InviteRole,
  status: z.string(),
  expiresAt: z.date().nullable(),
  createdAt: z.date(),
});
export type Invitation = z.infer<typeof Invite>;

export const CreateInvite = z.object({
  email: z.email(),
  role: InviteRole,
});
export type CreateInvite = z.infer<typeof CreateInvite>;

export const ActivateInvite = z.object({ token: z.string().min(1) });
export type ActivateInvite = z.infer<typeof ActivateInvite>;

/** accepted → consumed for the current session; auth-required → sign up/in first.
 *  accountExists says which of the two: the invitee's email already has an
 *  account (sign in to link it) or it does not (create one). */
export const ActivateInviteResult = z.object({
  status: z.enum(["accepted", "auth-required"]),
  email: z.string(),
  role: InviteRole,
  accountExists: z.boolean(),
});
export type ActivateInviteResult = z.infer<typeof ActivateInviteResult>;

export const ResolveInvite = z.object({ token: z.string().min(1) });
export type ResolveInvite = z.infer<typeof ResolveInvite>;

/** Everything the invite landing page needs to decide what to render, resolved
 *  before it renders. `accountExists` never reaches the browser — the app's
 *  server component uses it to pick the form, then discards it. */
export const ResolveInviteResult = z.object({
  email: z.string(),
  accountExists: z.boolean(),
});
export type ResolveInviteResult = z.infer<typeof ResolveInviteResult>;

/** Redeem: mints the session and accepts the invite in one request. `name` is
 *  required only when no account exists yet (the sign-up branch). The email is
 *  never sent — it is read from the invitation row, so it cannot be steered. */
export const RedeemInvite = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
  name: z.string().min(1).optional(),
});
export type RedeemInvite = z.infer<typeof RedeemInvite>;

export const RedeemInviteResult = z.object({ status: z.literal("accepted") });
export type RedeemInviteResult = z.infer<typeof RedeemInviteResult>;

export const AcceptInvite = z.object({ token: z.string().min(1) });
export type AcceptInvite = z.infer<typeof AcceptInvite>;

export const AcceptInviteResult = z.object({

});
export type AcceptInviteResult = z.infer<typeof AcceptInviteResult>;
