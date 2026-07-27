// organizations context — domain entities, DTOs, and events.
// The org is the tenant root that owns all org-scoped data; org users and
// invitations are mirrored from the auth adapter's organization plugin.
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
 * A person's participation in one organization under one role.
 *
 * The single org-scoped actor: staff and learners are the same row shape,
 * distinguished only by `role`. Named `org_users` rather than "membership"
 * because a membership is also a purchasable content type in an LMS.
 */
export interface OrgUser {
  readonly id: string;
  readonly orgId: string;
  /**
   * The identity USER this participation belongs to. NULL for a roster entry an
   * admin created before the person ever logged in; stamped at invite acceptance.
   */
  readonly userId: string | null;
  readonly role: Role;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  /** better-auth member record id — staff only; NULL for students. */
  readonly externalId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Invitation {
  readonly id: string;
  readonly orgId: string;
  readonly email: string;
  readonly role: InviteRole;
  readonly status: string;
  // The identity USER who issued the invitation.
  readonly invitedBy: string;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
}

/** Roles an invitation can carry — staff roles plus the portal student. Never owner. */
export type InviteRole = "admin" | "instructor" | "student";

export type OrganizationId = string;
export type OrgUserId = string;
export type InvitationId = string;

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
  // The participation's own better-auth member id.
  externalId: string;
  // The identity USER this participation belongs to.
  userId: string;
  role: string;
  email: string;
  firstName: string;
  lastName: string;
}

/**
 * An admin adding someone to the org roster before they hold an account.
 * The only way a participation exists with no person behind it — invitations
 * create nothing, they are claimed at acceptance.
 */
export interface CreateParticipantInput {
  orgId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}

/** A request to mint an invitation: domain-owned token, emailed to the invitee. */
export interface CreateInviteInput {
  orgId: string;
  email: string;
  role: InviteRole;
  // The identity USER issuing the invitation.
  inviterUserId: string;
}

/** A token-carrying acceptance: the logged-in account claiming an invitation. */
export interface AcceptInviteInput {
  token: string;
  /** The accepting auth account's id. */
  userExternalId: string;
  /** The accepting account's email — must match the invitation. */
  email: string;
}

/** An invitation was created or re-issued (any role; a resend rotates the token). */
export interface InvitationCreated extends DomainEvent {
  type: "invitation.created";
  invitation: Invitation;
}

/** A pending invitation was canceled (the token dies with it). */
export interface InvitationCanceled extends DomainEvent {
  type: "invitation.canceled";
  invitationId: string;
}

/** An invitation was accepted — the org-user participation was granted. */
export interface InvitationAccepted extends DomainEvent {
  type: "invitation.accepted";
  invitationId: string;
  role: string;
  userExternalId: string;
}

// Participation events. The `student.*` type strings are the published
// automation and integration contract, so they are kept verbatim even though
// the payload is now the unified participation row.

/** A participant was added to the roster (admin creation or portal registration). */
export interface StudentCreated extends DomainEvent {
  type: "student.created";
  student: OrgUser;
}

/** A participant was removed; carries the last known state. */
export interface StudentDeleted extends DomainEvent {
  type: "student.deleted";
  student: OrgUser;
}

/** A pending participant was claimed by an auth account (invite acceptance). */
export interface StudentLinked extends DomainEvent {
  type: "student.linked";
  email: string;
  invitationId: string;
  userExternalId: string;
}

/** Domain events the organizations context emits. */
export type OrganizationEvent =
  | InvitationCreated
  | InvitationCanceled
  | InvitationAccepted
  | StudentCreated
  | StudentDeleted
  | StudentLinked;
