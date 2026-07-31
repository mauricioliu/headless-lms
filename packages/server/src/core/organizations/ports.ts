// organizations context — ports.
import type { Organization, OrgUser, Invite } from './model.js';
import type { Member, MembersQuery, Page } from './members.js';
import type { Role } from './roles.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';
import type {
  CreateOrganizationInput,
  NewOrganizationInput,
  UpdateOrganizationInput,
  AddOrgUserInput,
  RemoveOrgUserInput,
  CreateInviteInput,
  AcceptInviteInput,
  InviteRole,
  CreateOrgUserInput,
  ProvisionUserInput,
  ResendStudentInviteInput,
  UpdatePersonInput,
  UpdateStudentInput,
} from './types.js';

/** Inbound HTTP headers carrying the session, forwarded to the auth provider. */
export type AuthHeaders = Record<string, string | string[] | undefined>;

// Capability used by the auth adapter to mirror the organization plugin's
// records (org, members, invites) into the domain. A narrow slice of the
// organization service. The adapter resolves auth user ids to domain USER ids
// before calling, so core stays decoupled from the auth schema.
export interface OrganizationProvisioner {
  createOrg(input: CreateOrganizationInput): Promise<Organization>;
  addOrgUser(input: AddOrgUserInput): Promise<OrgUser>;
  removeOrgUser(input: RemoveOrgUserInput): Promise<void>;
  // Lets the adapter detect whether an org is already mirrored (used to make
  // the creator's orgUser hook resilient to firing before provisioning).
  getByExternalId(externalId: string): Promise<Organization | null>;
  /** The caller's org_users row in a specific org. Null when they hold none. */
  getOrgUser(orgId: string, userId: string): Promise<OrgUser | null>;
  /** Every org this person belongs to, oldest first. */
  getOrgUsersForUser(userId: string): Promise<OrgUser[]>;
  getById(id: string): Promise<Organization | null>;
  /** A person provisioned before they had an account just got one. Announces
   *  `student.linked` — the moment they can actually sign in. */
  markStudentLinked(userId: string, userExternalId: string): Promise<void>;
}

// Inbound port (use cases the service exposes).
export interface OrganizationService extends OrganizationProvisioner {
  // Mints a domain-owned invite (token + row + event, one transaction) and
  // emails the invite link. A pending invite for the same email is re-issued
  // with a fresh token. Throws OrganizationRuleError on rule violations.
  createInvite(input: CreateInviteInput): Promise<Invite>;
  // The invite a valid (pending, unexpired) token points at; null otherwise.
  peekInvite(token: string): Promise<Invite | null>;
  // Token-based acceptance by the logged-in account: links the account to the
  // invite's org under the invited role and returns the new org user.
  acceptInvite(input: AcceptInviteInput): Promise<OrgUser>;
  // Creates a new organization on the caller's behalf and makes it the session's
  // active org. Drives Better Auth (via OrgAdmin); its hooks mirror the org into
  // the domain, which this method then returns.
  createOrganization(headers: AuthHeaders, input: NewOrganizationInput): Promise<Organization>;
  // Updates the caller's active org (name/slug) via Better Auth, then returns the
  // re-read domain org. `authOrgId` is the Better Auth organization id.
  updateOrganization(
    headers: AuthHeaders,
    authOrgId: string,
    input: UpdateOrganizationInput,
  ): Promise<Organization>;

  deleteOrgUser(orgId: string, id: string): Promise<void>;
  // Re-issues the pending student invite for an existing org user, rotating the
  // token and emailing it. Throws NotFoundError when the org user is unknown,
  // OrganizationRuleError when they have already joined.
  resendStudentInvite(input: ResendStudentInviteInput): Promise<void>;
  // Corrects the person behind a student row — the names and the address an
  // admin typed on the invite form. Throws NotFoundError when the org user is
  // unknown, ConflictError when the address is taken. Changing the address of a
  // student who has not accepted kills their pending invite, since the token
  // was minted against the old one.
  updateStudent(input: UpdateStudentInput): Promise<OrgUser>;
  // Resolve an org by its public slug — used by the student portal boundary to
  // map the portal org slug to the tenant org id.
  getBySlug(slug: string): Promise<Organization | null>;
  // Member-management operations (formerly the `team` context). Reads come from
  // the domain mirror; writes go through Better Auth via OrgAdmin.
  listMembers(orgId: string, query: MembersQuery): Promise<Page<Member>>;
  updateMemberRole(ctx: MemberWriteContext, id: string, role: Role): Promise<Member | null>;
  removeMember(ctx: MemberWriteContext, id: string): Promise<boolean>;
}

/** Atomic write scope: tx-bound repo + outbox appender, one transaction. */
export interface OrganizationsWriteScope {
  organizations: OrganizationsRepository;
  outbox: OutboxAppender;
}
export type OrganizationsUnitOfWork = UnitOfWork<OrganizationsWriteScope>;

/** Repo-facing write shape for a freshly minted invite. */
export interface NewInviteRow {
  email: string;
  role: InviteRole;
  invitedBy: string;
  tokenHash: string;
  expiresAt: Date;
}

// Outbound port (persistence contract the repository fulfils).
export interface OrganizationsRepository {
  create(input: CreateOrganizationInput): Promise<Organization>;
  updateByExternalId(
    externalId: string,
    input: UpdateOrganizationInput,
  ): Promise<Organization | null>;
  findById(id: string): Promise<Organization | null>;
  findByExternalId(externalId: string): Promise<Organization | null>;
  findBySlug(slug: string): Promise<Organization | null>;
  upsertOrgUser(orgId: string, input: AddOrgUserInput): Promise<OrgUser>;
  /** Inserts a pending invite, or re-issues the org's existing pending one
   *  for this email (fresh token/expiry/role) — atomic upsert. */
  upsertPendingInvite(orgId: string, input: NewInviteRow): Promise<Invite>;
  setInviteStatus(orgId: string, id: string, status: string): Promise<void>;
  findInviteByTokenHash(tokenHash: string): Promise<Invite | null>;
  /** The person's row in one org. `(org_id, user_id)` is unique. */
  findOrgUser(orgId: string, userId: string): Promise<OrgUser | null>;
  /** Every org this person belongs to, oldest first. */
  findOrgUsersByUser(userId: string): Promise<OrgUser[]>;
  findOrgUserById(orgId: string, id: string): Promise<OrgUser | null>;
  /** Links a user to the org under a role. Throws ConflictError when they
   *  already hold a row there. */
  createOrgUser(input: CreateOrgUserInput): Promise<OrgUser>;
  /** createOrgUser, but idempotent on `(org_id, user_id)`: an existing row is
   *  promoted to the requested status rather than refused. `created` says
   *  whether a row appeared, so `student.created` fires exactly once. */
  ensureOrgUser(input: CreateOrgUserInput): Promise<{ orgUser: OrgUser; created: boolean }>;
  /** Every org this person is a student in — the scope of `student.linked`. */
  findStudentOrgUsers(userId: string): Promise<OrgUser[]>;
  /** Kills the org's pending invite for an address, if any. */
  cancelPendingInvite(orgId: string, email: string): Promise<Invite | null>;
  /** Deletes the org user and its dependent rows; false when none matched. */
  deleteOrgUser(orgId: string, id: string): Promise<boolean>;
}

/** A member row enriched with the ids needed to drive writes. */
export interface MemberRecord extends Member {
  kind: 'member' | 'invite';
  // The person's better-auth user id. Member writes go through the auth
  // provider, which locates its own member record from this plus the auth org.
  userExternalId: string | null;
  // Domain invite id (invites are domain-owned).
  inviteId: string | null;
}

// Outbound: reads the org's members + pending invites from the domain mirror.
export interface MembersRepository {
  list(orgId: string, query: MembersQuery): Promise<Page<Member>>;
  findByEmail(orgId: string, email: string): Promise<MemberRecord | null>;
  findById(orgId: string, id: string): Promise<MemberRecord | null>;
}

/** The person as this context reads them back after a correction. */
export interface PersonRecord {
  id: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
}

/** Narrow identity-context slice the invite lifecycle needs: resolving the
 *  accepting auth account to its domain person, naming someone who has no
 *  account at all yet, and correcting the person behind a student row.
 *  Declared here (not imported from identity) so the contexts stay coupled
 *  only at composition. */
export interface PersonResolver {
  getUserByExternalId(externalId: string): Promise<{ id: string; displayName: string } | null>;
  getUserById(id: string): Promise<PersonRecord | null>;
  provisionUser(input: ProvisionUserInput): Promise<{ id: string; displayName: string }>;
  /** Throws ConflictError when the address already belongs to someone else. */
  updateUser(id: string, input: UpdatePersonInput): Promise<PersonRecord>;
}

/** Context for a write: domain org (reads/rules) + auth org & session (writes). */
export interface MemberWriteContext {
  orgId: string;
  authOrgId: string;
  headers: Record<string, string | string[] | undefined>;
}

/** Outbound: org orgUser writes, fulfilled by the auth provider (Better Auth). */
export interface OrgAdmin {
  // Creates an org (owner inferred from the session) and returns its auth id.
  createOrganization(
    headers: AuthHeaders,
    input: NewOrganizationInput,
  ): Promise<{ externalId: string }>;
  // Marks an org as the session's active organization.
  setActiveOrganization(headers: AuthHeaders, externalId: string): Promise<void>;
  // Updates an org's profile (name/slug). Throws OrganizationRuleError on a
  // conflict (e.g. slug already taken) so the route can map it to 409.
  updateOrganization(
    headers: AuthHeaders,
    externalId: string,
    input: UpdateOrganizationInput,
  ): Promise<void>;
  // Grants a orgUser server-side when an accepted invitation is honoured
  // (no acting session — the invitee's acceptance IS the authorisation).
  grantMembership(orgExternalId: string, userExternalId: string, role: string): Promise<void>;
  // Both take the person's auth USER id; the adapter resolves the auth member
  // record from it, so nothing about auth's member ids leaks into the domain.
  updateRole(ctx: MemberWriteContext, userExternalId: string, role: Role): Promise<void>;
  removeMember(ctx: MemberWriteContext, userExternalId: string): Promise<void>;
}
