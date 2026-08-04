// Auth engine → domain. The engine reports what it is about to write to its own
// tables; these hooks mirror that into the domain and hand back what the engine
// should store.
import type { Hooks } from '../adapters/auth/index.js';
import type { IdentityService } from '../core/identity/index.js';
import type { OrganizationService } from '../core/organizations/index.js';

export interface AuthHookDeps {
  identity: IdentityService;
  organizations: OrganizationService;
}

export function createAuthHooks({ identity, organizations }: AuthHookDeps): Hooks {
  return {
    sendResetPassword: async (data) => {
      await identity.sendPasswordReset({
        email: data.user.email,
        url: '',
      });
    },
    sendMagicLink: async ({ email, url }) => {
      await identity.sendMagicLink({
        email,
        url,
      });
    },
    beforeUserCreate: async ({ id, email, name }) => {
      const [firstName, lastName] = name.split(' ');
      await identity.createUser({
        email,
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        id,
        externalId: id,
      });
    },
    beforeCreateSession: async (session) => {
      const person = await identity.getUserByExternalId(session.userId);
      if (!person) {
        return;
      }
      const orgs = await organizations.getOrgUsersForUser(person.id);
      if (orgs.length !== 1) {
        return;
      }
      // TODO - fix, why default to the first?
      const org = await organizations.getById(orgs[0]!.orgId);
      if (!org) {
        return;
      }
      return { data: { ...session, activeOrganizationId: org.externalId } };
    },
    beforeCreateOrganization: async ({ organization: org, user: baUser }) => {
      const domainOrg = await organizations.createOrganization({
        ownerId: baUser.id,
        ...org,
        logo: org.logo ?? undefined,
      });
      return { data: domainOrg };
    },
    beforeUpdateOrganization: async ({ organization }) => {
      await organizations.updateOrganization(organization.id, organization);
    },
    beforeDeleteOrganization: async ({ organization }) => {
      await organizations.deleteOrganization(organization.id);
    },
    afterAddMember: async () => {
      throw new Error('Not implemented');
    },
    afterRemoveMember: async () => {
      throw new Error('Not implemented');
    },
  };
}
