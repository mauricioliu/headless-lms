import { describe, it, expect } from 'vitest';
import { OrganizationServiceImpl } from './service.js';
import type {
  OrganizationsRepository,
  MembersRepository,
  MemberRecord,
  NewInvitationRow,
  OrgAdmin,
  PersonResolver,
} from './ports.js';
import type { Organization, OrgUser, Invitation } from './model.js';
import { normalizeRole } from './roles.js';
import { OrganizationRuleError } from './members.js';
import type {
  CreateOrganizationInput,
  AddOrgUserInput,
  CreateParticipantInput,
} from './types.js';

// Member-management stubs for tests that only exercise the provisioning/course
// surface. Member-op tests below build their own configurable stubs.
const stubMembersRepo: MembersRepository = {
  async list() {
    return { rows: [], total: 0, page: 1, pageSize: 20 };
  },
  async findByEmail() {
    return null;
  },
  async findById() {
    return null;
  },
};
// Every accepting account has a person row by the time acceptInvite runs — the
// auth adapter provisions one on user creation.
const stubPeople = (displayName = 'Jane Doe'): PersonResolver => ({
  async getUserByExternalId(externalId: string) {
    return { id: `usr_for_${externalId}`, displayName };
  },
});
const stubOrgAdmin = (): OrgAdmin => ({
  async createOrganization() {
    return { externalId: 'org_stub' };
  },
  async setActiveOrganization() {},
  async updateOrganization() {},
  async grantMembership() {},
  async updateRole() {},
  async removeMember() {},
});

function fakeRepo() {
  const orgs: Organization[] = [];
  const members: OrgUser[] = [];
  const invitations: Invitation[] = [];
  const tokenHashes = new Map<string, string>();
  let n = 0;
  const repo: OrganizationsRepository = {
    async create(input: CreateOrganizationInput) {
      const row: Organization = { id: `o${++n}`, createdAt: new Date(0), ...input };
      orgs.push(row);
      return row;
    },
    async updateByExternalId(externalId, input) {
      const i = orgs.findIndex((o) => o.externalId === externalId);
      if (i < 0) {
        return null;
      }
      const updated: Organization = { ...orgs[i]!, name: input.name, slug: input.slug };
      orgs[i] = updated;
      return updated;
    },
    async findById(id: string) {
      return orgs.find((o) => o.id === id) ?? null;
    },
    async findBySlug(slug: string) {
      return orgs.find((o) => o.slug === slug) ?? null;
    },
    async findByExternalId(externalId: string) {
      return orgs.find((o) => o.externalId === externalId) ?? null;
    },
    async upsertOrgUser(orgId: string, input: AddOrgUserInput) {
      const i = members.findIndex((m) => m.orgId === orgId && m.userId === input.userId);
      if (i >= 0) {
        const updated: OrgUser = {
          ...members[i]!,
          externalId: input.externalId,
          role: normalizeRole(input.role),
        };
        members[i] = updated;
        return updated;
      }
      const row: OrgUser = {
        id: `m${++n}`,
        orgId,
        userId: input.userId,
        role: normalizeRole(input.role),
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        externalId: input.externalId,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      };
      members.push(row);
      return row;
    },
    async deleteOrgUserByExternalId(externalId: string) {
      const i = members.findIndex((m) => m.externalId === externalId);
      if (i >= 0) {
        members.splice(i, 1);
      }
    },
    async upsertPendingInvitation(orgId: string, input: NewInvitationRow) {
      const existing = invitations.find(
        (x) => x.orgId === orgId && x.email === input.email && x.status === 'pending',
      );
      if (existing) {
        (existing as { role: string }).role = input.role;
        (existing as { expiresAt: Date | null }).expiresAt = input.expiresAt;
        tokenHashes.set(existing.id, input.tokenHash);
        return existing;
      }
      const row: Invitation = {
        id: `i${++n}`,
        orgId,
        email: input.email,
        role: input.role,
        status: 'pending',
        invitedBy: input.invitedBy,
        expiresAt: input.expiresAt,
        createdAt: new Date(0),
      };
      invitations.push(row);
      tokenHashes.set(row.id, input.tokenHash);
      return row;
    },
    async setInvitationStatus(orgId: string, id: string, status: string) {
      const inv = invitations.find((x) => x.orgId === orgId && x.id === id);
      if (inv) {
        (inv as { status: string }).status = status;
      }
    },
    async findInvitationByTokenHash(tokenHash: string) {
      for (const [id, hash] of tokenHashes) {
        if (hash === tokenHash) {
          return invitations.find((x) => x.id === id) ?? null;
        }
      }
      return null;
    },
    async findOrgUser(orgId: string, userId: string) {
      return members.find((m) => m.orgId === orgId && m.userId === userId) ?? null;
    },
    async findOrgUsersByUser(userId: string) {
      return members.filter((m) => m.userId === userId);
    },
    async findOrgUserById(orgId: string, id: string) {
      return members.find((m) => m.orgId === orgId && m.id === id) ?? null;
    },
    async findOrgUserByEmail(orgId: string, email: string) {
      return members.find((m) => m.orgId === orgId && m.email === email) ?? null;
    },
    async insertPendingOrgUser(input: CreateParticipantInput) {
      const row: OrgUser = {
        id: `m${++n}`,
        orgId: input.orgId,
        userId: null,
        role: input.role,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        externalId: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      };
      members.push(row);
      return row;
    },
    async deleteOrgUser(orgId: string, id: string) {
      const i = members.findIndex((m) => m.orgId === orgId && m.id === id);
      if (i === -1) {
        return false;
      }
      members.splice(i, 1);
      return true;
    },
    async claimOrgUser(orgId: string, email: string, userId: string) {
      let count = 0;
      for (let i = 0; i < members.length; i++) {
        const row = members[i];
        if (row && row.orgId === orgId && row.email === email && row.userId === null) {
          members[i] = { ...row, userId };
          count += 1;
        }
      }
      return count;
    },
  };
  return { repo, orgs, members, invitations };
}

const orgInput: CreateOrganizationInput = {
  externalId: 'org_1',
  name: 'Acme',
  slug: 'acme',
  ownerId: 's1',
};

describe('OrganizationService', () => {
  it('provisions an org and is idempotent on the auth org id', async () => {
    const { repo, orgs } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubPeople());
    const first = await svc.createOrg(orgInput);
    const second = await svc.createOrg(orgInput);
    expect(second.id).toBe(first.id);
    expect(orgs).toHaveLength(1);
  });

  it('resolves the org by auth id when mirroring a orgUser', async () => {
    const { repo, members } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubPeople());
    const org = await svc.createOrg(orgInput);
    const m = await svc.addOrgUser({
      orgExternalId: 'org_1',
      externalId: 'mem_1',
      userId: 's2',
      role: 'member',
      email: 'member@example.com',
      firstName: 'Mem',
      lastName: 'Ber',
    });
    expect(m.orgId).toBe(org.id);
    expect(members).toHaveLength(1);
  });

  it('throws when mirroring against an unknown org', async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubPeople());
    await expect(
      svc.addOrgUser({
        orgExternalId: 'missing',
        externalId: 'mem_1',
        userId: 's2',
        role: 'member',
      email: 'member@example.com',
      firstName: 'Mem',
      lastName: 'Ber',
      }),
    ).rejects.toThrow(/unknown organization/);
  });

  it('stores the orgUser role as a domain Role', async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubPeople());
    await svc.createOrg(orgInput);
    const m = await svc.addOrgUser({
      orgExternalId: 'org_1',
      externalId: 'mem_1',
      userId: 's2',
      role: 'instructor',
      email: 'member@example.com',
      firstName: 'Mem',
      lastName: 'Ber',
    });
    expect(m.role).toBe('instructor');
  });

  it("normalizes Better Auth's member role to instructor on mirror", async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubPeople());
    await svc.createOrg(orgInput);
    const m = await svc.addOrgUser({
      orgExternalId: 'org_1',
      externalId: 'mem_x',
      userId: 's3',
      role: 'member',
      email: 'member@example.com',
      firstName: 'Mem',
      lastName: 'Ber',
    });
    expect(m.role).toBe('instructor');
  });

  it('collapses a multi-role mirror to the highest-privilege role', async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubPeople());
    await svc.createOrg(orgInput);
    const m = await svc.addOrgUser({
      orgExternalId: 'org_1',
      externalId: 'mem_y',
      userId: 's4',
      role: 'admin,instructor',
      email: 'member@example.com',
      firstName: 'Mem',
      lastName: 'Ber',
    });
    expect(m.role).toBe('admin');
  });

  it('getOrgUserByUser returns the orgUser for a known user', async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubPeople());
    const org = await svc.createOrg(orgInput);
    await svc.addOrgUser({
      orgExternalId: 'org_1',
      externalId: 'mem_1',
      userId: 's2',
      role: 'instructor',
      email: 'member@example.com',
      firstName: 'Mem',
      lastName: 'Ber',
    });
    const m = await svc.getOrgUser(org.id, 's2');
    expect(m).not.toBeNull();
    expect(m!.orgId).toBe(org.id);
    expect(m!.role).toBe('instructor');
  });

  it('getOrgUser returns null for an unknown user', async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubPeople());
    const org = await svc.createOrg(orgInput);
    expect(await svc.getOrgUser(org.id, 'no-such-user')).toBeNull();
  });

  it('getOrgUser scopes to the org, so one person can hold different roles', async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubPeople());
    const a = await svc.createOrg(orgInput);
    const b = await svc.createOrg({
      externalId: 'org_2',
      name: 'Beta',
      slug: 'beta',
      ownerId: 's1',
    });
    await svc.addOrgUser({
      orgExternalId: 'org_1',
      externalId: 'mem_a',
      userId: 's2',
      role: 'owner',
      email: 'both@example.com',
      firstName: 'Both',
      lastName: 'Orgs',
    });
    await svc.addOrgUser({
      orgExternalId: 'org_2',
      externalId: 'mem_b',
      userId: 's2',
      role: 'instructor',
      email: 'both@example.com',
      firstName: 'Both',
      lastName: 'Orgs',
    });
    expect((await svc.getOrgUser(a.id, 's2'))!.role).toBe('owner');
    expect((await svc.getOrgUser(b.id, 's2'))!.role).toBe('instructor');
    expect(await svc.getOrgUsersForUser('s2')).toHaveLength(2);
  });

  const inviteUrls = { studentPortalUrl: 'http://localhost:8002', adminAppUrl: 'http://localhost:8001' };

  function capturingMailer() {
    const sent: Array<{ to: string; id: string; payload: Record<string, unknown> }> = [];
    const mailer = {
      send: async (to: string, id: string, payload: Record<string, unknown>) => {
        sent.push({ to, id, payload });
      },
    };
    const lastToken = () => {
      const url = sent.at(-1)?.payload.inviteUrl as string;
      return new URL(url).searchParams.get('token') ?? '';
    };
    return { mailer: mailer as never, sent, lastToken };
  }

  function inviteHarness(over?: {
    people?: PersonResolver;
    membersRepo?: MembersRepository;
    orgAdmin?: OrgAdmin;
  }) {
    const fake = fakeRepo();
    const { mailer, sent, lastToken } = capturingMailer();
    const svc = new OrganizationServiceImpl(
      fake.repo,
      over?.membersRepo ?? stubMembersRepo,
      () => over?.orgAdmin ?? stubOrgAdmin(),
      over?.people ?? stubPeople(),
      undefined,
      undefined,
      mailer,
      inviteUrls,
    );
    return { ...fake, svc, sent, lastToken };
  }

  it('createInvite mints a pending staff invitation and mails the admin link', async () => {
    const h = inviteHarness();
    const org = await h.svc.createOrg(orgInput);
    const invitation = await h.svc.createInvite({
      orgId: org.id,
      email: 'sam@example.com',
      role: 'instructor',
      inviterUserId: 'usr_1',
    });
    expect(invitation.status).toBe('pending');
    expect(h.invitations).toHaveLength(1);
    expect(h.sent[0]?.id).toBe('memberInvite');
    const url = h.sent[0]?.payload.inviteUrl as string;
    expect(url.startsWith('http://localhost:8001/invite?token=')).toBe(true);
    expect(h.lastToken().length).toBeGreaterThan(20);
  });

  it('createInvite re-issues a pending invitation with a fresh token (resend)', async () => {
    const h = inviteHarness();
    const org = await h.svc.createOrg(orgInput);
    const first = await h.svc.createInvite({
      orgId: org.id,
      email: 'jane@example.com',
      role: 'student',
      inviterUserId: 'usr_1',
    });
    const firstToken = h.lastToken();
    const second = await h.svc.createInvite({
      orgId: org.id,
      email: 'jane@example.com',
      role: 'student',
      inviterUserId: 'usr_1',
    });
    expect(second.id).toBe(first.id);
    expect(h.invitations).toHaveLength(1);
    expect(h.lastToken()).not.toBe(firstToken);
    expect(await h.svc.peekInvite(firstToken)).toBeNull();
    expect(await h.svc.peekInvite(h.lastToken())).not.toBeNull();
  });

  it('createInvite creates no participation — the token carries everything', async () => {
    const h = inviteHarness();
    const org = await h.svc.createOrg(orgInput);
    await h.svc.createInvite({
      orgId: org.id,
      email: 'nobody@example.com',
      role: 'student',
      inviterUserId: 'usr_1',
    });
    expect(h.members).toHaveLength(0);
  });

  it('createInvite refuses an email that already participates', async () => {
    const h = inviteHarness();
    const org = await h.svc.createOrg(orgInput);
    await h.svc.addOrgUser({
      orgExternalId: 'org_1',
      externalId: 'mem_1',
      userId: 'usr_9',
      role: 'instructor',
      email: 'taken@example.com',
      firstName: 'Taken',
      lastName: 'Seat',
    });
    await expect(
      h.svc.createInvite({
        orgId: org.id,
        email: 'taken@example.com',
        role: 'instructor',
        inviterUserId: 'usr_1',
      }),
    ).rejects.toBeInstanceOf(OrganizationRuleError);
  });

  it('createInvite mails the student template with the portal welcome link', async () => {
    const h = inviteHarness();
    const org = await h.svc.createOrg(orgInput);
    await h.svc.createInvite({
      orgId: org.id,
      email: 'jane@example.com',
      role: 'student',
      inviterUserId: 'usr_1',
    });
    expect(h.sent[0]?.id).toBe('studentInvite');
    const url = h.sent[0]?.payload.inviteUrl as string;
    expect(url.startsWith('http://localhost:8002/welcome?token=')).toBe(true);
  });

  it('acceptInvite grants the orgUser for a pending staff invitation', async () => {
    const grants: Array<{ org: string; user: string; role: string }> = [];
    const orgAdmin: OrgAdmin = {
      ...stubOrgAdmin(),
      async grantMembership(orgExternalId, userExternalId, role) {
        grants.push({ org: orgExternalId, user: userExternalId, role });
      },
    };
    const h = inviteHarness({ orgAdmin });
    const org = await h.svc.createOrg(orgInput);
    await h.svc.createInvite({ orgId: org.id, email: 'sam@example.com', role: 'instructor', inviterUserId: 'usr_1' });
    const result = await h.svc.acceptInvite({
      token: h.lastToken(),
      email: 'sam@example.com',
      userExternalId: 'usr_ext_1',
    });
    expect(grants).toEqual([{ org: 'org_1', user: 'usr_ext_1', role: 'instructor' }]);
    expect(result?.orgExternalId).toBe('org_1');
    expect(h.invitations[0]?.status).toBe('accepted');
  });

  it('acceptInvite refuses a canceled invitation — no grant', async () => {
    const grants: string[] = [];
    const orgAdmin: OrgAdmin = {
      ...stubOrgAdmin(),
      async grantMembership(orgExternalId) {
        grants.push(orgExternalId);
      },
    };
    const h = inviteHarness({ orgAdmin });
    const org = await h.svc.createOrg(orgInput);
    const invitation = await h.svc.createInvite({
      orgId: org.id,
      email: 'sam@example.com',
      role: 'instructor',
      inviterUserId: 'usr_1',
    });
    await h.repo.setInvitationStatus(org.id, invitation.id, 'canceled');
    const result = await h.svc.acceptInvite({
      token: h.lastToken(),
      email: 'sam@example.com',
      userExternalId: 'usr_ext_1',
    });
    expect(grants).toEqual([]);
    expect(result).toBeNull();
    expect(h.invitations[0]?.status).toBe('canceled');
  });

  it('acceptInvite refuses an email mismatch', async () => {
    const h = inviteHarness();
    const org = await h.svc.createOrg(orgInput);
    await h.svc.createInvite({ orgId: org.id, email: 'sam@example.com', role: 'instructor', inviterUserId: 'usr_1' });
    const result = await h.svc.acceptInvite({
      token: h.lastToken(),
      email: 'other@example.com',
      userExternalId: 'usr_ext_1',
    });
    expect(result).toBeNull();
    expect(h.invitations[0]?.status).toBe('pending');
  });

  it('acceptInvite claims the admin-built roster entry, keeping its id', async () => {
    const h = inviteHarness();
    const org = await h.svc.createOrg(orgInput);
    const roster = await h.svc.createParticipant({
      orgId: org.id,
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      role: 'student',
    });
    expect(roster.userId).toBeNull();
    await h.svc.createInvite({
      orgId: org.id,
      email: 'jane@example.com',
      role: 'student',
      inviterUserId: 'usr_1',
    });
    const result = await h.svc.acceptInvite({
      token: h.lastToken(),
      email: 'jane@example.com',
      userExternalId: 'usr_ext_9',
    });
    expect(result?.orgExternalId).toBe(org.externalId);
    expect(h.invitations[0]?.status).toBe('accepted');
    // Same row, now claimed — entitlements granted against it survive.
    expect(h.members).toHaveLength(1);
    expect(h.members[0]!.id).toBe(roster.id);
    expect(h.members[0]!.userId).toBe('usr_for_usr_ext_9');
  });

  it('acceptInvite creates the participation when no roster entry exists', async () => {
    const h = inviteHarness({ people: stubPeople('Ada Lovelace') });
    const org = await h.svc.createOrg(orgInput);
    await h.svc.createInvite({
      orgId: org.id,
      email: 'ada@example.com',
      role: 'instructor',
      inviterUserId: 'usr_1',
    });
    const result = await h.svc.acceptInvite({
      token: h.lastToken(),
      email: 'ada@example.com',
      userExternalId: 'usr_ext_3',
    });
    expect(result?.role).toBe('instructor');
    expect(h.members).toHaveLength(1);
    expect(h.members[0]).toMatchObject({
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'instructor',
      userId: 'usr_for_usr_ext_3',
    });
  });

  it('acceptInvite refuses when the account has no domain person', async () => {
    const people: PersonResolver = {
      async getUserByExternalId() {
        return null;
      },
    };
    const h = inviteHarness({ people });
    const org = await h.svc.createOrg(orgInput);
    await h.svc.createInvite({
      orgId: org.id,
      email: 'jane@example.com',
      role: 'student',
      inviterUserId: 'usr_1',
    });
    const result = await h.svc.acceptInvite({
      token: h.lastToken(),
      email: 'jane@example.com',
      userExternalId: 'usr_ext_9',
    });
    expect(result).toBeNull();
    expect(h.invitations[0]?.status).toBe('pending');
  });

  it('acceptInvite of an unknown token grants nothing', async () => {
    const h = inviteHarness();
    await h.svc.createOrg(orgInput);
    const result = await h.svc.acceptInvite({
      token: 'nope',
      email: 'x@example.com',
      userExternalId: 'usr_x',
    });
    expect(result).toBeNull();
  });

  it('peekInvite treats an expired invitation as invalid', async () => {
    const h = inviteHarness();
    const org = await h.svc.createOrg(orgInput);
    await h.svc.createInvite({ orgId: org.id, email: 'sam@example.com', role: 'instructor', inviterUserId: 'usr_1' });
    const token = h.lastToken();
    (h.invitations[0] as { expiresAt: Date | null }).expiresAt = new Date(0);
    expect(await h.svc.peekInvite(token)).toBeNull();
    expect(await h.svc.inviteAllowsSignup(token, 'sam@example.com')).toBe(false);
  });

  it('inviteAllowsSignup matches the invited email case-insensitively', async () => {
    const h = inviteHarness();
    const org = await h.svc.createOrg(orgInput);
    await h.svc.createInvite({ orgId: org.id, email: 'Jane@Example.com', role: 'student', inviterUserId: 'usr_1' });
    expect(await h.svc.inviteAllowsSignup(h.lastToken(), 'jane@example.com')).toBe(true);
    expect(await h.svc.inviteAllowsSignup(h.lastToken(), 'other@example.com')).toBe(false);
  });

  it('creates an org via OrgAdmin, sets it active, then returns the mirrored org', async () => {
    const { repo } = fakeRepo();
    const calls: string[] = [];
    const orgAdmin: OrgAdmin = {
      ...stubOrgAdmin(),
      async createOrganization(_headers, input) {
        calls.push('create');
        // Simulate Better Auth's afterCreateOrganization mirroring the org.
        await repo.create({
          externalId: 'org_new',
          name: input.name,
          slug: input.slug,
          ownerId: 's1',
        });
        return { externalId: 'org_new' };
      },
      async setActiveOrganization(_headers, externalId) {
        calls.push(`setActive:${externalId}`);
      },
    };
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, () => orgAdmin, stubPeople());
    const org = await svc.createOrganization({}, { name: 'New', slug: 'new' });
    expect(org.externalId).toBe('org_new');
    expect(org.slug).toBe('new');
    expect(calls).toEqual(['create', 'setActive:org_new']);
  });

  it('throws when the created org does not propagate to the domain mirror', async () => {
    const { repo } = fakeRepo();
    const orgAdmin: OrgAdmin = {
      ...stubOrgAdmin(),
      async createOrganization() {
        return { externalId: 'ghost' };
      },
    };
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, () => orgAdmin, stubPeople());
    await expect(svc.createOrganization({}, { name: 'X', slug: 'x' })).rejects.toThrow(
      /did not propagate/,
    );
  });

  it('updates the active org via OrgAdmin, then returns the re-read mirror row', async () => {
    const { repo } = fakeRepo();
    await repo.create({ externalId: 'org_1', name: 'Old', slug: 'old', ownerId: 's1' });
    const calls: string[] = [];
    const orgAdmin: OrgAdmin = {
      ...stubOrgAdmin(),
      async updateOrganization(_headers, externalId) {
        calls.push(`update:${externalId}`);
      },
    };
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, () => orgAdmin, stubPeople());
    const org = await svc.updateOrganization({}, 'org_1', { name: 'New', slug: 'new' });
    expect(calls).toEqual(['update:org_1']);
    expect(org.name).toBe('New');
    expect(org.slug).toBe('new');
    // The mirror row reflects the update.
    expect(await repo.findByExternalId('org_1')).toMatchObject({ name: 'New', slug: 'new' });
  });

  it('throws when the org to update is missing from the domain mirror', async () => {
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubPeople());
    await expect(svc.updateOrganization({}, 'ghost', { name: 'New', slug: 'new' })).rejects.toThrow(
      /did not propagate/,
    );
  });
});

// Member-management operations (formerly the `team` context). Writes go through
// Better Auth (OrgAdmin); reads come from the domain mirror (MembersRepository).
describe('OrganizationService — member management', () => {
  const ctx = { orgId: 'o1', authOrgId: 'org_1', headers: {} };

  function memberRecord(over: Partial<MemberRecord> & { id: string }): MemberRecord {
    return {
      name: 'X',
      email: 'x@example.com',
      image: null,
      role: 'instructor',
      status: 'active',
      joinedAt: '2026-01-01T00:00:00Z',
      invitedAt: null,
      kind: 'member',
      memberExternalId: `auth-${over.id}`,
      invitationId: null,
      ...over,
    };
  }

  /** Configurable members repo + a spy OrgAdmin. */
  function harness(records: MemberRecord[]) {
    const calls: string[] = [];
    const membersRepo: MembersRepository = {
      async list() {
        return { rows: records, total: records.length, page: 1, pageSize: 20 };
      },
      async findByEmail(_orgId, email) {
        return records.find((r) => r.email.toLowerCase() === email.toLowerCase()) ?? null;
      },
      async findById(_orgId, id) {
        return records.find((r) => r.id === id) ?? null;
      },
    };
    const orgAdmin: OrgAdmin = {
      async createOrganization() {
        return { externalId: 'org_stub' };
      },
      async setActiveOrganization() {},
      async updateOrganization() {
        calls.push('updateOrganization');
      },
      async grantMembership() {
        calls.push('grantMembership');
      },
      async updateRole() {
        calls.push('updateRole');
      },
      async removeMember() {
        calls.push('removeMember');
      },
    };
    const { repo, invitations } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, membersRepo, () => orgAdmin, stubPeople());
    return { svc, calls, repo, invitations };
  }

  it('refuses to reassign the owner role', async () => {
    const { svc, calls } = harness([memberRecord({ id: 'm1', role: 'owner' })]);
    await expect(svc.updateMemberRole(ctx, 'm1', 'admin')).rejects.toThrow(OrganizationRuleError);
    expect(calls).not.toContain('updateRole');
  });

  it('refuses to remove the owner', async () => {
    const { svc, calls } = harness([memberRecord({ id: 'm1', role: 'owner' })]);
    await expect(svc.removeMember(ctx, 'm1')).rejects.toThrow(OrganizationRuleError);
    expect(calls).not.toContain('removeMember');
  });

  it("updates a non-owner member's role via OrgAdmin", async () => {
    const { svc, calls } = harness([memberRecord({ id: 'm1', role: 'instructor' })]);
    await svc.updateMemberRole(ctx, 'm1', 'admin');
    expect(calls).toContain('updateRole');
  });

  it('removeMember cancels a pending invitation without touching the auth provider', async () => {
    const records: MemberRecord[] = [];
    const { svc, calls, repo, invitations } = harness(records);
    const invitation = await repo.upsertPendingInvitation('o1', {
      email: 'x@example.com',
      role: 'instructor',
      invitedBy: 'user_1',
      tokenHash: 'hash-1',
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    });
    records.push(
      memberRecord({
        id: invitation.id,
        role: 'instructor',
        kind: 'invitation',
        status: 'invited',
        memberExternalId: null,
        invitationId: invitation.id,
      }),
    );
    const removed = await svc.removeMember(ctx, invitation.id);
    expect(removed).toBe(true);
    expect(invitations[0]?.status).toBe('canceled');
    expect(calls).not.toContain('removeMember');
  });

  it('returns false when removing an unknown member', async () => {
    const { svc } = harness([]);
    expect(await svc.removeMember(ctx, 'nope')).toBe(false);
  });
});

describe('logging', () => {
  it('logs the org mirror write once (idempotent re-run stays silent)', async () => {
    const { createCapturingLogger } = await import('../shared/logger.js');
    const { logger, entries } = createCapturingLogger();
    const { repo } = fakeRepo();
    const svc = new OrganizationServiceImpl(repo, stubMembersRepo, stubOrgAdmin, stubPeople(), undefined, logger);

    const org = await svc.createOrg(orgInput);
    await svc.createOrg(orgInput);

    const infos = entries.filter((e) => e.level === 'info' && e.msg === 'organization mirrored');
    expect(infos).toHaveLength(1);
    expect(infos[0]?.meta).toMatchObject({ orgId: org.id, externalId: 'org_1' });
  });
});
