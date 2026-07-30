// organizations context — domain entities, DTOs, and events.
// The org is the tenant root that owns all org-scoped data; org users and
// invites are mirrored from the auth adapter's organization plugin.
// Owner/member/inviter all reference the identity USER (staff), not a student.
import type { DomainEvent } from "./shared.js";

/** Domain roles. The authorization matrix lives in core (roles.ts). */
export type Role = "owner" | "admin" | "instructor" | "student";

export interface Organization {
  readonly id: string;
  // Links to the better-auth organization record owned by the auth adapter.
  readonly externalId: string;
  readonly name: string;
  readonly slug: string;
  // The identity USER who owns the organization (better-auth's creator/owner).
  readonly ownerId: string;
  readonly createdAt: Date;
}

/**
 * Links a user to an organization under one role.
 *
 * The single org-scoped actor: staff and learners are the same row shape,
 * distinguished only by `role`. Named `org_users` rather than "membership"
 * because a membership is also a purchasable content type in an LMS.
 */
export interface OrgUser {
  readonly id: string;
  readonly orgId: string;
  /** The identity USER this row links to the org. */
  readonly userId: string;
  readonly role: Role;
  /** better-auth member record id — staff only; NULL for students. */
  readonly externalId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * One org user, as displayed. `id` is `org_users.id`;
 * `name` and `email` come from the identity USER, `image` from the auth engine's
 * user record.
 */
export interface OrgUserProfile {
  readonly id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface Invite {
  readonly id: string;
  readonly orgId: string;
  readonly email: string;
  readonly role: InviteRole;
  readonly status: string;
  // The identity USER who issued the invite.
  readonly invitedBy: string;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
}

/** Roles an invite can carry — staff roles plus the portal student. Never owner. */
export type InviteRole = "admin" | "instructor" | "student";

export type OrganizationId = string;
export type OrgUserId = string;
export type InviteId = string;

export interface CreateOrganizationInput {
  // Links to the better-auth organization record.
  externalId: string;
  name: string;
  slug: string;
  // The identity USER who owns the organization.
  ownerId: string;
}

// A user-facing request to create a new organization. Unlike
// CreateOrganizationInput (the mirror slice), this carries no externalId/ownerId:
// Better Auth creates the org (inferring the owner from the session) and its
// hooks mirror it into the domain, at which point the service reads it back.
export interface NewOrganizationInput {
  name: string;
  slug: string;
}

// A user-facing request to update the active organization's profile. Applied
// via Better Auth (the source of truth), then mirrored into the domain org row.
export interface UpdateOrganizationInput {
  name: string;
  slug: string;
}

export interface AddOrgUserInput {
  // The owning org's better-auth id (used to locate the domain org).
  orgExternalId: string;
  // The org user's own better-auth member id.
  externalId: string;
  // The identity USER this org user links to the org.
  userId: string;
  role: string;
}


export interface CreateOrgUserInput {
  orgId: string;
  userId: string;
  role: Role;
}

/** A request to mint an invite: domain-owned token, emailed to the invitee. */
export interface CreateInviteInput {
  orgId: string;
  email: string;
  role: InviteRole;
  // The identity USER issuing the invite.
  inviterUserId: string;
}

/** A token-carrying acceptance: the logged-in account claiming an invite. */
export interface AcceptInviteInput {
  token: string;
  /** The accepting auth account's id. */
  userId: string;
  /** The accepting account's email — must match the invite. */
  email: string;
}

/** An invite was created or re-issued (any role; a resend rotates the token). */
export interface InviteCreated extends DomainEvent {
  type: "invite.created";
  invite: Invite;
}

/** A pending invite was canceled (the token dies with it). */
export interface InviteCanceled extends DomainEvent {
  type: "invite.canceled";
  inviteId: string;
}

/** An invite was accepted — the org user was created. */
export interface InviteAccepted extends DomainEvent {
  type: "invite.accepted";
  inviteId: string;
  role: string;
  userExternalId: string;
}

// Org user events. The `student.*` type strings are the published automation
// and integration contract, so they are kept verbatim even though the payload
// is the unified org_users row.

/** A user joined the org (invite redemption or portal registration). */
export interface StudentCreated extends DomainEvent {
  type: "student.created";
  student: OrgUser;
}

/** A user was removed from the org; carries the last known state. */
export interface StudentDeleted extends DomainEvent {
  type: "student.deleted";
  student: OrgUser;
}

/** Domain events the organizations context emits. */
export type OrganizationEvent =
  | InviteCreated
  | InviteCanceled
  | InviteAccepted
  | StudentCreated
  | StudentDeleted;
