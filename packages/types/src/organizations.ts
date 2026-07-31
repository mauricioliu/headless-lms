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
  /** `invited` until the person accepts; `active` from then on. */
  readonly status: OrgUserStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** A student exists in the org from the moment they are invited, so the row
 *  outlives the invite that produced it and carries its own state. */
export type OrgUserStatus = "invited" | "active";

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
  // The identity USER this org user links to the org.
  userId: string;
  role: string;
}

/** The mirror of an auth-side member removal. Keyed the same way as the add:
 *  the auth org plus the identity USER, not a mirrored member id. */
export interface RemoveOrgUserInput {
  orgExternalId: string;
  userId: string;
}


export interface CreateOrgUserInput {
  orgId: string;
  userId: string;
  role: Role;
  /** Defaults to `active` — staff paths create rows that are already joined. */
  status?: OrgUserStatus;
}

/** A request to mint an invite: domain-owned token, emailed to the invitee. */
export interface CreateInviteInput {
  orgId: string;
  email: string;
  role: InviteRole;
  // The identity USER issuing the invite.
  inviterUserId: string;
  /** Student invites provision the person up front, so the admin's entry
   *  becomes their name. Ignored for staff. */
  firstName?: string;
  lastName?: string;
  /** False creates every record as normal and skips only the email. */
  sendEmail?: boolean;
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

/** A student provisioned at invite time attached an auth account. This, not
 *  `student.created`, is the moment they can sign in. */
export interface StudentLinked extends DomainEvent {
  type: "student.linked";
  /** The identity USER now linked. */
  userId: string;
  /** The auth account it was linked to. */
  userExternalId: string;
}

/** Domain events the organizations context emits. */
export type OrganizationEvent =
  | InviteCreated
  | InviteCanceled
  | InviteAccepted
  | StudentCreated
  | StudentDeleted
  | StudentLinked;
