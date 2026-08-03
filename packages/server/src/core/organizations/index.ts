// organizations context — public surface.
export { OrganizationServiceImpl } from './service.js';
export { OrganizationAdminServiceImpl } from './admin-service.js';
export type {
  OrganizationService,
  OrganizationAdminService,
  OrganizationProvisioner,
  MembersRepository,
  MemberRecord,
  MemberWriteContext,
  OrgAdmin,
  AuthHeaders,
} from './ports.js';
export type { Organization, OrgUser, Invite } from './model.js';
export { OrganizationRuleError } from './members.js';
export type { Member, MemberStatus, MembersQuery, Page } from './members.js';
export {
  ROLES,
  STAFF_ROLES,
  STUDENT_ROLE,
  isRole,
  isStaffRole,
  parseRole,
  normalizeRole,
  capability,
} from './roles.js';
export type { Role, StaffRole, Permission, Capability } from './roles.js';
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
  ResendStudentInviteInput,
  UpdatePersonInput,
  UpdateStudentInput,
  CreateOrganizationInput,
  UpdateOrganizationInput,
  DeleteOrganizationInput,
  LinkOrgUserInput,
  UnlinkOrgUserInput,
} from './types.js';
