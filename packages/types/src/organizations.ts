export type {
  Role,
  OrgUserProfile,
  OrgUserStatus,
  InviteRole,
  NewOrganizationInput,
  AddOrgUserInput,
  CreateOrgUserInput,
  CreateInviteInput,
  AcceptInviteInput,
} from "./schemas/organizations.js";
import type {
  InviteRole,
  OrgUserStatus,
  Role,
} from "./schemas/organizations.js";

export interface Organization {
  readonly id: string;
  readonly externalId?: string | null;
  readonly name: string;
  readonly slug: string;
  readonly ownerId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OrgUser {
  readonly id: string;
  readonly orgId: string;
  readonly userId: string;
  readonly role: Role;
  readonly status: OrgUserStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface Invite {
  readonly id: string;
  readonly orgId: string;
  readonly email: string;
  readonly role: InviteRole;
  readonly status: string;
  readonly invitedBy: string;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
}

export type OrganizationId = string;
export type OrgUserId = string;
export type InviteId = string;

export interface CreateOrganizationInput {
  externalId?: string;
  name?: string;
  slug?: string;
  logo?: string;
  ownerId: string;
}
