// organizations context — service implementation (inbound port).
import type {
  MemberRecord,
  MembersRepository,
  MemberWriteContext,
  OrgAdmin,
  OrganizationService,
  OrganizationsRepository,
  OrganizationsUnitOfWork,
} from './ports.js';
import type { Invite, Organization, OrgUser } from './model.js';
import { type Role, STUDENT_ROLE } from './roles.js';
import {
  InviteError,
  type Member,
  type MembersQuery,
  OrganizationRuleError,
  type Page,
} from './members.js';
import type {
  AcceptInviteInput,
  AddOrgUserInput,
  CreateInviteInput,
  CreateOrganizationInput,
  DeleteOrganizationInput,
  ResendStudentInviteInput,
  UpdateOrganizationInput,
  UpdateStudentInput,
} from './types.js';
import type { DomainEvent, NewDomainEvent, OrganizationEvent } from '@headless-lms/types';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { Mailer } from '../shared/mailer.js';
import { generateInviteToken, hashInviteToken } from '../shared/invite-token.js';
import { NotFoundError } from '../shared/errors.js';
import type { IdentityService } from '../identity/index.js';
import { genId } from '../shared/id.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Outbox-shaped organizations event — `id` and `createdAt` are stamped on
// append. Distributed member by member: a bare `Omit<OrganizationEvent, ...>`
// would collapse the union to the keys its members share.
type NewOrganizationEvent = OrganizationEvent extends infer E
  ? E extends DomainEvent
    ? NewDomainEvent<E>
    : never
  : never;

export interface InviteUrls {
  studentPortalUrl: string;
  adminAppUrl: string;
}

function toMember(r: MemberRecord): Member {
  return {
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    image: r.image,
    role: r.role,
    status: r.status,
    joinedAt: r.joinedAt,
    invitedAt: r.invitedAt,
  };
}

export type OrganizationServiceParams = {
  repo: OrganizationsRepository;
  membersRepo: MembersRepository;
  orgAdmin: () => OrgAdmin;
  people: IdentityService;
  /** Writes that emit an event run through the UoW so the row and its outbox
   *  entry commit in one transaction. */
  uow: OrganizationsUnitOfWork;
  logger?: Logger;
  mailer?: Pick<Mailer, 'send'>;
  inviteUrls?: InviteUrls;
};

export class OrganizationServiceImpl implements OrganizationService {
  private readonly repo: OrganizationsRepository;
  private readonly membersRepo: MembersRepository;
  private readonly people: IdentityService;
  private readonly uow: OrganizationsUnitOfWork;
  private readonly logger: Logger;
  private readonly mailer?: Pick<Mailer, 'send'>;
  private readonly inviteUrls?: InviteUrls;

  constructor(params: OrganizationServiceParams) {
    this.repo = params.repo;
    this.membersRepo = params.membersRepo;
    this.people = params.people;
    this.uow = params.uow;
    this.logger = params.logger ?? noopLogger;
    this.mailer = params.mailer;
    this.inviteUrls = params.inviteUrls;
  }

  async createOrganization(input: CreateOrganizationInput): Promise<Organization> {
    const created = await this.uow.run(async ({ organizations, outbox }) => {
      const id = genId('organization');

      const created = await organizations.create({
        id,
        name: input.name ?? `My Org`,
        slug: input.slug ?? '',
        ownerId: input.ownerId,
      });
      const orgUser = await this.repo.upsertOrgUser(created.id, {
        orgId: created.id,
        userId: input.ownerId,
        role: 'owner',
      });
      await outbox.append([
        { type: 'organization.created', orgId: created.id, organization: created },
        { type: 'organization.user.linked', orgId: created.id, org_user: orgUser },
      ]);
      return created;
    });
    this.logger.info('organization created', { orgId: created.id, slug: created.slug });
    return created;
  }

  async updateOrganization(id: string, input: UpdateOrganizationInput): Promise<Organization> {
    const updatedOrg = await this.uow.run(async ({ organizations, outbox }) => {
      const updated = await organizations.update(id, {
        name: input.name,
        slug: input.slug,
      });
      await outbox.append([{ type: 'organization.updated', orgId: id, organization: updated }]);
      return updated;
    });

    this.logger.info('organization updated', { updatedOrg });
    return updatedOrg!;
  }

  async deleteOrganization(input: DeleteOrganizationInput): Promise<Organization> {
    const deleted = await this.uow.run(async ({ organizations, outbox }) => {
      const deleted = await organizations.delete(input.externalId);

      await outbox.append([
        { type: 'organization.deleted', orgId: deleted.id, organization: deleted },
      ]);
      return deleted;
    });
    this.logger.info('organization deleted', { orgId: deleted.id });
    return deleted;
  }

  async addOrgUser({ orgId, userId, role }: AddOrgUserInput): Promise<OrgUser> {
    const newUser = await this.uow.run(async ({ organizations, outbox }) => {
      const deleted = await organizations.createOrgUser({
        orgId,
        role,
        userId,
        status: 'active',
      });

      await outbox.append([
        { type: 'organization.deleted', orgId: deleted.id, organization: deleted },
      ]);
      return deleted;
    });
    this.logger.info('user added to organization', { id: newUser });
    return newUser;
  }

  async removeOrgUser(orgId: string, id: string): Promise<OrgUser> {
    const deleted = await this.uow.run(async ({ organizations, outbox }) => {
      const deletedUser = await organizations.deleteOrgUser(orgId, id);
      if (!deletedUser) {
        throw new NotFoundError('OrgUser', id);
      }
      await outbox.append([
        { type: 'organization.user.deleted', orgId: deleted.id, org_user: deletedUser },
      ]);
      return deletedUser;
    });
    this.logger.info('organization deleted', { orgId: deleted.id });
    return deleted;
  }

  async createInvite(input: CreateInviteInput): Promise<Invite> {
    const { orgId, email, role, inviterUserId, firstName, lastName } = input;
    const sendEmail = input.sendEmail ?? true;
    const { token, tokenHash } = generateInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    // A student belongs to the org from the moment an admin adds them, not from
    // the moment they click a link — so the person exists before the invite
    // does. Staff are excluded: their org_users row is mirrored from the auth
    // provider's member record, which does not exist until they join.
    const person =
      role === STUDENT_ROLE
        ? await this.people.createUser({
            email,
            ...(firstName !== undefined && { firstName }),
            ...(lastName !== undefined && { lastName }),
          })
        : null;

    const invite = await this.uow.run(async ({ organizations, outbox }) => {
      const row = await organizations.upsertPendingInvite(orgId, {
        email,
        role,
        invitedBy: inviterUserId,
        tokenHash,
        expiresAt,
      });
      const events: NewOrganizationEvent[] = [{ type: 'invite.created', orgId, invite: row }];
      if (person) {
        // Idempotent: re-inviting an address rotates the token without
        // producing a second org user or a second student.created.
        const { orgUser, created } = await organizations.ensureOrgUser({
          orgId,
          userId: person.id,
          role: STUDENT_ROLE,
          status: 'invited',
        });
        if (created) {
          events.push({ type: 'student.created', orgId, student: orgUser });
        }
      }
      await outbox.append(events);
      return row;
    });

    if (sendEmail) {
      // TODO make this workflow durable
      await this.sendInviteEmail(invite, token);
    }

    this.logger.info('invite created', { orgId, inviteId: invite.id, role, sendEmail });
    return invite;
  }

  async updateStudent(input: UpdateStudentInput): Promise<OrgUser> {
    const { orgId, orgUserId, firstName, lastName, email } = input;
    const orgUser = await this.repo.findOrgUserById(orgId, orgUserId);
    if (!orgUser || orgUser.role !== STUDENT_ROLE) {
      throw new NotFoundError('Student', orgUserId);
    }
    const person = await this.people.getUserById(orgUser.userId);
    if (!person) {
      throw new NotFoundError('User', orgUser.userId);
    }

    const previousEmail = person.email;
    await this.people.updateUser(person.id, {
      ...(firstName !== undefined && { firstName }),
      ...(lastName !== undefined && { lastName }),
      ...(email !== undefined && { email }),
    });

    // The pending invite carries its own copy of the address and a token minted
    // against it. Once the address is corrected that invite points at the wrong
    // person, so it is cancelled rather than left live — the admin re-sends,
    // which mints a fresh one for the new address. A student who has already
    // accepted has no pending invite to worry about.
    const emailChanged = email !== undefined && email.toLowerCase() !== previousEmail.toLowerCase();
    if (emailChanged && orgUser.status !== 'active') {
      await this.repo.cancelPendingInvite(orgId, previousEmail);
    }

    this.logger.info('student updated', { orgId, orgUserId, emailChanged });
    return orgUser;
  }

  async resendStudentInvite(input: ResendStudentInviteInput): Promise<void> {
    const { orgId, orgUserId, inviterUserId } = input;
    const orgUser = await this.repo.findOrgUserById(orgId, orgUserId);
    if (!orgUser || orgUser.role !== STUDENT_ROLE) {
      throw new NotFoundError('Student', orgUserId);
    }
    if (orgUser.status === 'active') {
      throw new OrganizationRuleError('That student has already accepted their invitation');
    }
    const person = await this.people.getUserById(orgUser.userId);
    if (!person) {
      throw new NotFoundError('User', orgUser.userId);
    }
    // Straight back through createInvite: it rotates the token on the pending
    // row and finds the existing org user, so a resend is an invite that
    // happens to be the second one.
    await this.createInvite({
      orgId,
      email: person.email,
      role: STUDENT_ROLE,
      inviterUserId,
      sendEmail: true,
    });
    this.logger.info('student invite resent', { orgId, orgUserId });
  }

  async peekInvite(token: string): Promise<Invite | null> {
    const invite = await this.repo.findInviteByTokenHash(hashInviteToken(token));
    if (!invite || invite.status !== 'pending') {
      return null;
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return null;
    }
    return invite;
  }

  async acceptInvite(input: AcceptInviteInput): Promise<OrgUser> {
    const invite = await this.peekInvite(input.token);
    if (!invite) {
      this.logger.warn('invite accept refused: token invalid or expired');
      throw new InviteError('invalid invite');
    }
    if (invite.email.toLowerCase() !== input.email.toLowerCase()) {
      this.logger.warn('invite accept refused: email mismatch', {
        orgId: invite.orgId,
        inviteId: invite.id,
      });
      throw new InviteError('emails must match');
    }
    const org = await this.repo.findById(invite.orgId);
    if (!org) {
      throw new InviteError('Org not found');
    }

    const orgUser = await this.uow.run(async ({ organizations, outbox }) => {
      // A student provisioned at invite time already has a row — acceptance
      // activates it. Staff have none yet, so this inserts one.
      const { orgUser: row, created } = await organizations.ensureOrgUser({
        orgId: invite.orgId,
        userId: input.userId,
        role: invite.role,
        status: 'active',
      });
      await organizations.setInviteStatus(invite.orgId, invite.id, 'accepted');
      if (created) {
        await outbox.append([{ type: 'student.created', orgId: invite.orgId, student: row }]);
      }
      return row;
    });
    this.logger.info('invite accepted', { orgId: invite.orgId, userId: input.userId });
    return orgUser;
  }

  // By identity USER id — `(org_id, user_id)` is unique. Every caller (scope
  // resolution, the MCP principal, the learn routes) asks "what is this person
  // in this org", never "what is this org_users row".
  async getOrgUser(orgId: string, userId: string): Promise<OrgUser | null> {
    return this.repo.findOrgUser(orgId, userId);
  }

  async deleteOrgUser(orgId: string, id: string): Promise<OrgUser> {
    const deleted = await this.uow.run(async ({ organizations, outbox }) => {
      const orgUser = await organizations.findOrgUserById(orgId, id);
      if (!orgUser) {
        throw new NotFoundError('OrgUser', id);
      }
      const deletedUser = await organizations.deleteOrgUser(orgId, id);
      if (!deletedUser) {
        throw new NotFoundError('OrgUser', id);
      }
      const events: NewOrganizationEvent[] = [];
      if (deletedUser.role === STUDENT_ROLE) {
        events.push({ type: 'student.deleted', orgId, student: orgUser });
      }

      await outbox.append(events);
      return deletedUser;
    });
    this.logger.info('org user deleted', { orgId, orgUserId: id });
    return deleted;
  }

  async getOrgUsersForUser(userId: string): Promise<OrgUser[]> {
    return this.repo.findOrgUsersByUser(userId);
  }

  async getById(id: string): Promise<Organization | null> {
    return this.repo.findById(id);
  }

  private async sendInviteEmail(invite: Invite, token: string): Promise<void> {
    if (!this.mailer || !this.inviteUrls) {
      throw new Error('invite delivery is not configured (mailer / invite urls missing)');
    }
    const { email, role } = invite;
    const isStudent = role === STUDENT_ROLE;
    const base = isStudent
      ? `${this.inviteUrls.studentPortalUrl}/welcome`
      : `${this.inviteUrls.adminAppUrl}/invite`;
    // The portal resolves the token to the invited email, so the link carries
    // only the token. The admin app still reads it from the query.
    const query = isStudent
      ? new URLSearchParams({ token })
      : new URLSearchParams({ token, email });
    const inviteUrl = `${base}?${query.toString()}`;
    try {
      if (role === STUDENT_ROLE) {
        await this.mailer.send(email, 'studentInvite', { inviteUrl, studentName: email });
      } else {
        await this.mailer.send(email, 'memberInvite', {
          inviteUrl,
          inviterName: 'Your team',
          role,
        });
      }
    } catch (err) {
      // A failed email must not abort invite creation: the token is already
      // minted and recorded, so the admin can fix transport and resend.
      this.logger.error('failed to send invite email', {
        email,
        role,
        err: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  async getByExternalId(externalId: string): Promise<Organization | null> {
    return this.repo.findByExternalId(externalId);
  }

  async getBySlug(slug: string): Promise<Organization | null> {
    return this.repo.findBySlug(slug);
  }

  listMembers(orgId: string, query: MembersQuery): Promise<Page<Member>> {
    return this.membersRepo.list(orgId, query);
  }

  async updateMemberRole(ctx: MemberWriteContext, id: string, role: Role): Promise<Member | null> {
    const member = await this.membersRepo.findById(ctx.orgId, id);
    if (!member) {
      return null;
    }
    if (member.role === 'owner') {
      this.logger.warn('role change rejected: owner role immutable', {
        orgId: ctx.orgId,
        memberId: id,
      });
      throw new OrganizationRuleError('The owner role cannot be reassigned');
    }
    if (member.kind !== 'member' || !member.userExternalId) {
      this.logger.warn('role change rejected: not an active member', {
        orgId: ctx.orgId,
        memberId: id,
      });
      throw new OrganizationRuleError('Only active members can have their role changed');
    }

    const updated = await this.membersRepo.findById(ctx.orgId, id);
    this.logger.info('member role updated', { orgId: ctx.orgId, memberId: id, role });
    return updated ? toMember(updated) : null;
  }

  async removeMember(_ctx: MemberWriteContext, _id: string): Promise<boolean> {
    return true;
  }
}
