// organizations context — service implementation (inbound port).
import type {
  AuthHeaders,
  MemberRecord,
  MembersRepository,
  MemberWriteContext,
  OrgAdmin,
  OrganizationService,
  OrganizationsRepository,
  OrganizationsUnitOfWork,
  PersonResolver,
} from './ports.js';
import type { Invitation, Organization, OrgUser } from './model.js';
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
  NewOrganizationInput,
  UpdateOrganizationInput,
} from './types.js';
import type { Logger, OutboxAppender } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { Mailer } from '../shared/mailer.js';
import { generateInviteToken, hashInviteToken } from '../shared/invite-token.js';
import { NotFoundError } from '../shared/errors.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface InviteUrls {
  studentPortalUrl: string;
  adminAppUrl: string;
}

function toMember(r: MemberRecord): Member {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    image: r.image,
    role: r.role,
    status: r.status,
    joinedAt: r.joinedAt,
    invitedAt: r.invitedAt,
  };
}

const noopOutbox: OutboxAppender = { append: async () => {} };

export class OrganizationServiceImpl implements OrganizationService {
  /** Writes that emit an event run through the UoW so the row and its outbox
   *  entry commit in one transaction. Absent (tests) → passthrough, no events. */
  private readonly uow: OrganizationsUnitOfWork;

  constructor(
    private readonly repo: OrganizationsRepository,
    private readonly membersRepo: MembersRepository,
    private readonly orgAdmin: () => OrgAdmin,
    private readonly people: PersonResolver,
    uow?: OrganizationsUnitOfWork,
    private readonly logger: Logger = noopLogger,
    private readonly mailer?: Pick<Mailer, 'send'>,
    private readonly inviteUrls?: InviteUrls,
  ) {
    this.uow = uow ?? { run: (fn) => fn({ organizations: repo, outbox: noopOutbox }) };
  }

  async createOrg(input: CreateOrganizationInput): Promise<Organization> {
    const existing = await this.repo.findByExternalId(input.externalId);
    if (existing) {
      return existing;
    }
    const created = await this.repo.create(input);
    this.logger.info('organization mirrored', { orgId: created.id, externalId: input.externalId });
    return created;
  }

  // User-facing create: drive Better Auth to create the org (it infers the owner
  // from the session) and make it active, then read back the org its hooks
  // mirrored into the domain. Mirrors the write-then-read shape of inviteMember.
  async createOrganization(
    headers: AuthHeaders,
    input: NewOrganizationInput,
  ): Promise<Organization> {
    const { externalId } = await this.orgAdmin().createOrganization(headers, input);
    await this.orgAdmin().setActiveOrganization(headers, externalId);
    const org = await this.repo.findByExternalId(externalId);
    if (!org) {
      throw new Error('organization did not propagate to the domain mirror');
    }
    this.logger.info('organization created', { orgId: org.id, slug: org.slug });
    return org;
  }

  // User-facing update: drive Better Auth to update the active org, then mirror
  // the new name/slug into the domain row and return it. Mirrors createOrganization.
  async updateOrganization(
    headers: AuthHeaders,
    authOrgId: string,
    input: UpdateOrganizationInput,
  ): Promise<Organization> {
    await this.orgAdmin().updateOrganization(headers, authOrgId, input);
    const org = await this.repo.updateByExternalId(authOrgId, input);
    if (!org) {
      throw new Error('organization did not propagate to the domain mirror');
    }
    this.logger.info('organization updated', { orgId: org.id });
    return org;
  }

  async addOrgUser(input: AddOrgUserInput): Promise<OrgUser> {
    const org = await this.requireOrg(input.orgExternalId);
    const orgUser = await this.repo.upsertOrgUser(org.id, input);
    this.logger.info('orgUser added', { orgId: org.id });
    return orgUser;
  }

  async removeOrgUser(externalId: string): Promise<void> {
    await this.repo.deleteOrgUserByExternalId(externalId);
    this.logger.info('orgUser removed', { externalId });
  }


  async createInvite(input: CreateInviteInput): Promise<Invitation> {
    const { orgId, email, role, inviterUserId } = input;
    const { token, tokenHash } = generateInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const invitation = await this.uow.run(async ({ organizations, outbox }) => {
      const row = await organizations.upsertPendingInvitation(orgId, {
        email,
        role,
        invitedBy: inviterUserId,
        tokenHash,
        expiresAt,
      });
      await outbox.append([{ type: 'invite.created', orgId, invite: row }]);
      return row;
    });

    // TODO make this workflow durable
    await this.sendInviteEmail(invitation, token);

    this.logger.info('invite created', { orgId, invitationId: invitation.id, role });
    return invitation;
  }

  async peekInvite(token: string): Promise<Invitation | null> {
    const invitation = await this.repo.findInvitationByTokenHash(hashInviteToken(token));
    if (!invitation || invitation.status !== 'pending') {
      return null;
    }
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      return null;
    }
    return invitation;
  }

  async inviteAllowsSignup(token: string, email: string): Promise<boolean> {
    const invitation = await this.peekInvite(token);
    return invitation !== null && invitation.email.toLowerCase() === email.toLowerCase();
  }

  async acceptInvite(
    input: AcceptInviteInput,
  ): Promise<OrgUser> {
    const invite = await this.peekInvite(input.token);
    if (!invite) {
      this.logger.warn('invite accept refused: token invalid or expired');
      throw new InviteError('invalid invite');
    }

    const org = await this.repo.findById(invite.orgId);
    if (!org) {
      throw new InviteError('Org not found');
    }

    this.logger.info('invite accepted', {
      orgId: invite.orgId,
      userId: input.userId,
    });
    const orgUser = await this.repo.createOrgUser({
      orgId: invite.orgId,
      userId: input.userId,
      role: invite.role,
    });
    return orgUser;
  }


  async getOrgUser(orgId: string, id: string): Promise<OrgUser | null> {
    return this.repo.findOrgUserById(orgId, id);
  }

  async deleteParticipant(orgId: string, id: string): Promise<void> {
    await this.uow.run(async ({ organizations, outbox }) => {
      // Snapshot before the delete — the event carries the last known state.
      const participant = await organizations.findOrgUserById(orgId, id);
      if (!participant) {
        throw new NotFoundError('Participant', id);
      }
      const ok = await organizations.deleteOrgUser(orgId, id);
      if (!ok) {
        throw new NotFoundError('Participant', id);
      }
      await outbox.append([{ type: 'student.deleted', orgId, student: participant }]);
    });
    this.logger.info('participant deleted', { orgId, orgUserId: id });
  }

  async getOrgUsersForUser(userId: string): Promise<OrgUser[]> {
    return this.repo.findOrgUsersByUser(userId);
  }

  async getById(id: string): Promise<Organization | null> {
    return this.repo.findById(id);
  }

  private async sendInviteEmail(invitation: Invitation, token: string): Promise<void> {
    if (!this.mailer || !this.inviteUrls) {
      throw new Error('invite delivery is not configured (mailer / invite urls missing)');
    }
    const { email, role } = invitation;
    const base =
      role === STUDENT_ROLE
        ? `${this.inviteUrls.studentPortalUrl}/welcome`
        : `${this.inviteUrls.adminAppUrl}/invite`;
    const query = new URLSearchParams({ token, email });
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
    if (member.kind !== 'member' || !member.memberExternalId) {
      this.logger.warn('role change rejected: not an active member', {
        orgId: ctx.orgId,
        memberId: id,
      });
      throw new OrganizationRuleError('Only active members can have their role changed');
    }
    await this.orgAdmin().updateRole(ctx, member.memberExternalId, role);
    const updated = await this.membersRepo.findById(ctx.orgId, id);
    this.logger.info('member role updated', { orgId: ctx.orgId, memberId: id, role });
    return updated ? toMember(updated) : null;
  }

  async removeMember(ctx: MemberWriteContext, id: string): Promise<boolean> {
    const member = await this.membersRepo.findById(ctx.orgId, id);
    if (!member) {
      return false;
    }
    if (member.role === 'owner') {
      this.logger.warn('member removal rejected: owner cannot be removed', {
        orgId: ctx.orgId,
        memberId: id,
      });
      throw new OrganizationRuleError('The owner cannot be removed');
    }
    if (member.kind === 'member' && member.memberExternalId) {
      await this.orgAdmin().removeMember(ctx, member.memberExternalId);
    } else if (member.kind === 'invitation' && member.invitationId) {
      const invitationId = member.invitationId;
      await this.uow.run(async ({ organizations, outbox }) => {
        await organizations.setInvitationStatus(ctx.orgId, invitationId, 'canceled');
        await outbox.append([{ type: 'invitation.canceled', orgId: ctx.orgId, invitationId }]);
      });
    }
    this.logger.info('member removed', { orgId: ctx.orgId, memberId: id });
    return true;
  }

  private async requireOrg(externalId: string): Promise<Organization> {
    const org = await this.repo.findByExternalId(externalId);
    if (!org) {
      throw new Error(`unknown organization for externalId ${externalId}`);
    }
    return org;
  }
}
