// HTTP routes for the organizations resource: creating an org, managing its
// members (/api/organizations/members) and its invites
// (/api/organizations/invites — mint, activate, accept). Member reads come
// from the domain mirror; org/member writes go through Better Auth (the org
// provider). Invite activation is the one route an invitee reaches without a
// session, exported separately (`organizationsPublicRoutes`) so it registers
// outside the session guard; the activation cookie lives and dies here.
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AcceptInvite,
  AcceptInviteResult,
  CreateInvite,
  CreateOrganization,
  ErrorBody,
  Invite,
  Member,
  MemberIdParam,
  MembersPage,
  MembersQuery,
  Organization,
  UpdateMemberRole,
  UpdateOrganization,
} from '@headless-lms/api-contract';
import type { MemberWriteContext } from '../../core/organizations/index.js';
import { NotFoundError } from '../../core/shared/errors.js';
import type { Container } from '../../app/container.js';
import { resolveScope } from '../scope.js';

export async function organizationsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const organizations = container.organizations;
  const tags = ['Organizations'];

  // Create a new organization on the caller's behalf and make it their active
  // org. This is the API's own front door for org creation — it drives Better
  // Auth internally, so callers use the typed SDK, not the auth namespace. No
  // resolveScope here: the caller has no active org yet, only a session.
  r.route({
    method: 'POST',
    url: '/api/organizations',
    // Session only: a first-time signup has no active org yet, so requiring one
    // here would 401 the very call that produces it.
    preHandler: app.requireSession,
    schema: {
      operationId: 'createOrganization',
      tags,
      summary: 'Create an organization and make it active',
      body: CreateOrganization,
      response: { 201: Organization },
    },
    handler: async (req, reply) => {
      const org = await organizations.createOrganization(req.headers, req.body);
      return reply.code(201).send({
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.createdAt.toISOString(),
      });
    },
  });

  // Update the caller's active organization (name/slug). Writes go through Better
  // Auth, which enforces the caller's org-update permission (owner/admin).
  r.route({
    method: 'PATCH',
    url: '/api/organizations',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateOrganization',
      tags,
      summary: 'Update the active organization',
      body: UpdateOrganization,
      response: { 200: Organization, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const org = await organizations.updateOrganization(req.headers, scope.authOrgId, req.body);
      return reply.send({
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.createdAt.toISOString(),
      });
    },
  });

  r.route({
    method: 'GET',
    url: '/api/organizations/members',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listMembers',
      tags,
      summary: 'List organization members',
      querystring: MembersQuery,
      response: { 200: MembersPage },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return organizations.listMembers(scope.orgId, req.query);
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/organizations/members/:id/role',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateMemberRole',
      tags,
      summary: "Change a member's role",
      params: MemberIdParam,
      body: UpdateMemberRole,
      response: { 200: Member, 404: ErrorBody, 409: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const ctx: MemberWriteContext = {
        orgId: scope.orgId,
        authOrgId: scope.authOrgId,
        headers: req.headers,
      };
      const member = await organizations.updateMemberRole(ctx, req.params.id, req.body.role);
      if (!member) {
        throw new NotFoundError('Member', req.params.id);
      }
      return member;
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/organizations/members/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'removeMember',
      tags,
      summary: 'Remove an organization member',
      params: MemberIdParam,
      response: { 204: z.void(), 404: ErrorBody, 409: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const ctx: MemberWriteContext = {
        orgId: scope.orgId,
        authOrgId: scope.authOrgId,
        headers: req.headers,
      };
      const removed = await organizations.removeMember(ctx, req.params.id);
      if (!removed) {
        throw new NotFoundError('Member', req.params.id);
      }
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/organizations/invites',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createInvite',
      tags,
      summary: 'Invite a member or student into the active organization',
      body: CreateInvite,
      response: { 201: Invite, 409: ErrorBody },
    },
    handler: async (req) => {
      const invite = await organizations.createInvite({
        orgId: req.orgId,
        inviterUserId: req.authUser.id,
        email: req.body.email,
        role: req.body.role,
      });

      req.log.debug({ invite }, 'created invite');
      return invite;
    },
  });

  r.route({
    method: 'POST',
    url: '/api/organizations/invites/accept',
    preHandler: app.requireSession,
    schema: {
      operationId: 'acceptInvite',
      tags,
      summary: 'Accept an invitation with the logged-in account',
      body: AcceptInvite,
      response: { 200: AcceptInviteResult, 400: ErrorBody },
    },
    handler: async (req) => {
      const accepted = await container.organizations.acceptInvite({
        token: req.body.token,
        userId: req.authUser.id,
        email: req.authUser.email,
      });

      req.log.info({ accepted }, 'accepted invite');
      return {};
    },
  });
}
