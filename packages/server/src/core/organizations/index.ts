// organizations context — public surface.
export { OrganizationServiceImpl } from './service.js';
export type {
  OrganizationService,
  OrganizationProvisioner,
  MembersRepository,
  MemberRecord,
  MemberWriteContext,
  OrgAdmin,
  AuthHeaders,
} from './ports.js';
export type { Organization, OrgUser, Invitation, CourseAssignment } from './model.js';
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
  canForCourse,
} from './roles.js';
export type { Role, StaffRole, Permission, Capability } from './roles.js';
export type {
  OrganizationId,
  OrgUserId,
  InvitationId,
  CreateOrganizationInput,
  NewOrganizationInput,
  UpdateOrganizationInput,
  AddOrgUserInput,
  CreateInviteInput,
  AcceptInviteInput,
  InviteRole,
  AssignCourseInput,
  CreateParticipantInput,
} from './types.js';
