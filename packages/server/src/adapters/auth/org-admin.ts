// OrgAdmin (organizations' member-write port) implemented over Better Auth's
// organization API. Member/invitation writes flow through Better Auth (the source
// of truth); its hooks mirror the change into the domain tables, which the
// organizations members repo reads.
import { fromNodeHeaders } from 'better-auth/node';
import { APIError } from 'better-auth/api';
import {
  OrganizationRuleError,
  type OrgAdmin,
  type MemberWriteContext,
  type Role,
  type NewOrganizationInput,
  type UpdateOrganizationInput,
  type AuthHeaders,
} from '../../core/organizations/index.js';
import type { Auth } from './index.js';

export function createOrgAdmin(auth: Auth): OrgAdmin {
  const headersOf = (ctx: MemberWriteContext) => fromNodeHeaders(ctx.headers);

  // Better Auth's member endpoints key on its own member id, which the domain
  // deliberately does not store — `(org, user)` already identifies the record,
  // so it is looked up here instead of mirrored into org_users.
  const resolveMemberId = async (
    ctx: MemberWriteContext,
    userExternalId: string,
  ): Promise<string> => {
    const res = await auth.api.listMembers({
      query: {
        organizationId: ctx.authOrgId,
        filterField: 'userId',
        filterValue: userExternalId,
        limit: 1,
      },
      headers: headersOf(ctx),
    });
    const memberId = res?.members?.[0]?.id;
    if (!memberId) {
      throw new OrganizationRuleError('That person is no longer a member of this organization');
    }
    return memberId;
  };

  return {
    async createOrganization(
      headers: AuthHeaders,
      input: NewOrganizationInput,
    ): Promise<{ externalId: string }> {
      const org = await auth.api.createOrganization({
        body: { name: input.name, slug: input.slug },
        headers: fromNodeHeaders(headers),
      });
      if (!org) {
        throw new Error('Better Auth did not return the created organization');
      }
      return { externalId: org.id };
    },
    async setActiveOrganization(headers: AuthHeaders, externalId: string): Promise<void> {
      await auth.api.setActiveOrganization({
        body: { organizationId: externalId },
        headers: fromNodeHeaders(headers),
      });
    },
    async updateOrganization(
      headers: AuthHeaders,
      externalId: string,
      input: UpdateOrganizationInput,
    ): Promise<void> {
      try {
        await auth.api.updateOrganization({
          body: { organizationId: externalId, data: { name: input.name, slug: input.slug } },
          headers: fromNodeHeaders(headers),
        });
      } catch (err) {
        // Surface Better Auth validation/permission failures (e.g. slug taken) as
        // a domain rule error the route maps to 409 rather than a raw 500.
        if (err instanceof APIError) {
          throw new OrganizationRuleError(err.message || 'Could not update organization');
        }
        throw err;
      }
    },
    async grantMembership(
      orgExternalId: string,
      userExternalId: string,
      role: string,
    ): Promise<void> {
      // Server-side (no session): the accepted invitation is the authorisation.
      await auth.api.addMember({
        body: { userId: userExternalId, organizationId: orgExternalId, role },
      });
    },
    async updateRole(ctx: MemberWriteContext, userExternalId: string, role: Role): Promise<void> {
      await auth.api.updateMemberRole({
        body: { memberId: await resolveMemberId(ctx, userExternalId), role, organizationId: ctx.authOrgId },
        headers: headersOf(ctx),
      });
    },
    async removeMember(ctx: MemberWriteContext, userExternalId: string): Promise<void> {
      await auth.api.removeMember({
        body: {
          memberIdOrEmail: await resolveMemberId(ctx, userExternalId),
          organizationId: ctx.authOrgId,
        },
        headers: headersOf(ctx),
      });
    },
  };
}
