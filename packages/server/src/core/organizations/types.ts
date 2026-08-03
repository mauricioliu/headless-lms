// organizations context — DTOs, owned by @headless-lms/types.
import type { Organization } from '@headless-lms/types';

export type {
  OrganizationId,
  OrgUserId,
  InviteId,
  NewOrganizationInput,
  AddOrgUserInput,
  RemoveOrgUserInput,
  CreateInviteInput,
  AcceptInviteInput,
  InviteRole,
  CreateOrgUserInput,
  OrgUserStatus,
} from '@headless-lms/types';
// The identity slice organizations needs to name someone with no account yet.
export type { ProvisionUserInput } from '@headless-lms/types';

export interface CreateOrganizationInput {
  externalId?: string;
  name?: string;
  slug?: string;
  logo?: string;
  ownerExternalId: string;
}

export type UpdateOrganizationInput = Partial<Omit<Organization, 'createdAt,updatedAt'>>;

/** An org the auth engine deleted, named by its id. */
export interface DeleteOrganizationMirrorInput {
  externalId: string;
}

/** A membership the auth engine granted, named by its ids. */
export interface LinkOrgUserInput {
  orgExternalId: string;
  userExternalId: string;
  role: string;
}

/** A membership the auth engine revoked, named by its ids. */
export interface UnlinkOrgUserInput {
  orgExternalId: string;
  userExternalId: string;
}

/** The person fields this context can correct through the identity slice. */
export interface UpdatePersonInput {
  firstName?: string;
  lastName?: string;
  email?: string;
}

/** Correct the person behind a student row, from the admin's students screen. */
export interface UpdateStudentInput extends UpdatePersonInput {
  orgId: string;
  /** `org_users.id` — the student as the admin app knows them. */
  orgUserId: string;
}

/** Re-issue the pending student invite behind an org_users row. */
export interface ResendStudentInviteInput {
  orgId: string;
  /** `org_users.id` — the student as the admin app knows them. */
  orgUserId: string;
  /** The identity USER re-issuing it. */
  inviterUserId: string;
}
