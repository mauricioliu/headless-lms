// organizations context — DTOs, owned by @headless-lms/types.
export type {
  OrganizationId,
  OrgUserId,
  InviteId,
  CreateOrganizationInput,
  NewOrganizationInput,
  UpdateOrganizationInput,
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
