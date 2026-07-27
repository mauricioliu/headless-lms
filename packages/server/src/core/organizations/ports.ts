// organizations context — ports.
import type { Organization, OrgUser, Invitation } from './model.js';
import type { Member, MembersQuery, Page } from './members.js';
import type { Role } from './roles.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';
import type {
  CreateOrganizationInput,
  NewOrganizationInput,
  UpdateOrganizationInput,
  AddOrgUserInput,
  CreateInviteInput,
  AcceptInviteInput,
  InviteRole,
  CreateParticipantInput,
} from './types.js';

/** Inbound HTTP headers carrying the session, forwarded to the auth provider. */
export type AuthHeaders = Record<string, string | string[] | undefined>;

// Capability used by the auth adapter to mirror the organization plugin's
// records (org, members, invitations) into the domain. A narrow slice of the
// organization service. The adapter resolves auth user ids to domain USER ids
// before calling, so core stays decoupled from the auth schema.
export interface OrganizationProvisioner {
  createOrg(input: CreateOrganizationInput): Promise<Organization>;
  addOrgUser(input: AddOrgUserInput): Promise<OrgUser>;
  removeOrgUser(externalId: string): Promise<void>;
  // Signup gate: whether this invite token entitles this email to sign up.
  inviteAllowsSignup(token: string, email: string): Promise<boolean>;
  // Lets the adapter detect whether an org is already mirrored (used to make
  // the creator's orgUser hook resilient to firing before provisioning).
  getByExternalId(externalId: string): Promise<Organization | null>;
  /** The caller's participation in a specific org. Null when they hold none. */
  getOrgUser(orgId: string, userId: string): Promise<OrgUser | null>;
  /** Every org this person participates in, oldest first. */
  getOrgUsersForUser(userId: string): Promise<OrgUser[]>;
  getById(id: string): Promise<Organization | null>;
}

// Inbound port (use cases the service exposes).
export interface OrganizationService extends OrganizationProvisioner {
  // Mints a domain-owned invitation (token + row + event, one transaction) and
  // emails the invite link. A pending invitation for the same email is re-issued
  // with a fresh token. Throws OrganizationRuleError on rule violations.
  createInvite(input: CreateInviteInput): Promise<Invitation>;
  // The invitation a valid (pending, unexpired) token points at; null otherwise.
  peekInvite(token: string): Promise<Invitation | null>;
  // Token-based acceptance by the logged-in account: student → links the pending
  // student row (via identity), staff → grants the orgUser. Returns the org
  // the account should act in, for session stamping; null when refused.
  acceptInvite(input: AcceptInviteInput): Promise<{ orgExternalId: string; role: InviteRole } | null>;
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
  // --- Roster (participants) ------------------------------------------------
  // An admin adds someone before they hold an account; the row carries their
  // entitlements until an invitation is accepted and stamps `user_id`.
  createParticipant(input: CreateParticipantInput): Promise<OrgUser>;
  getParticipant(orgId: string, id: string): Promise<OrgUser | null>;
  deleteParticipant(orgId: string, id: string): Promise<void>;
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

/** Repo-facing write shape for a freshly minted invitation. */
export interface NewInvitationRow {
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
  deleteOrgUserByExternalId(externalId: string): Promise<void>;
  /** Inserts a pending invitation, or re-issues the org's existing pending one
   *  for this email (fresh token/expiry/role) — atomic upsert. */
  upsertPendingInvitation(orgId: string, input: NewInvitationRow): Promise<Invitation>;
  setInvitationStatus(orgId: string, id: string, status: string): Promise<void>;
  findInvitationByTokenHash(tokenHash: string): Promise<Invitation | null>;
  /** The person's participation in one org. `(org_id, user_id)` is unique. */
  findOrgUser(orgId: string, userId: string): Promise<OrgUser | null>;
  /** Every org this person participates in, oldest first. */
  findOrgUsersByUser(userId: string): Promise<OrgUser[]>;
  findOrgUserById(orgId: string, id: string): Promise<OrgUser | null>;
  findOrgUserByEmail(orgId: string, email: string): Promise<OrgUser | null>;
  /** Roster entry with no person behind it yet (`user_id` NULL). */
  insertPendingOrgUser(input: CreateParticipantInput): Promise<OrgUser>;
  /** Deletes the participation and its dependent rows; false when none matched. */
  deleteOrgUser(orgId: string, id: string): Promise<boolean>;
  /** Stamps `user_id` onto the org's pending row for this email; rows updated. */
  claimOrgUser(orgId: string, email: string, userId: string): Promise<number>;
}

/** A member row enriched with the ids needed to drive writes. */
export interface MemberRecord extends Member {
  kind: 'member' | 'invitation';
  // better-auth member id (orgUser writes still go through the auth provider).
  memberExternalId: string | null;
  // Domain invitation id (invitations are domain-owned).
  invitationId: string | null;
}

// Outbound: reads the org's members + pending invitations from the domain mirror.
export interface MembersRepository {
  list(orgId: string, query: MembersQuery): Promise<Page<Member>>;
  findByEmail(orgId: string, email: string): Promise<MemberRecord | null>;
  findById(orgId: string, id: string): Promise<MemberRecord | null>;
}

/** Narrow identity-context slice the invite lifecycle needs: resolving the
 *  accepting auth account to its domain person. Declared here (not imported
 *  from identity) so the contexts stay coupled only at composition. */
export interface PersonResolver {
  getUserByExternalId(externalId: string): Promise<{ id: string; displayName: string } | null>;
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
  updateRole(ctx: MemberWriteContext, memberExternalId: string, role: Role): Promise<void>;
  removeMember(ctx: MemberWriteContext, memberExternalId: string): Promise<void>;
}
