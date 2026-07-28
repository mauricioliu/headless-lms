// HTTP routes for the cross-cutting settings store. One flat resource for every
// scope and every namespace — adding a domain's settings, or a new content
// type, adds no route here.
//
// `scopeId` is any entity id the settings attach to; the org id addresses
// org-wide defaults. The server expands it to its scope chain and resolves
// nearest-wins, so the caller never passes the chain.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ErrorBody,
  NamespaceSettings,
  PatchSettings,
  ScopeSettings,
  SettingsNamespaceParam,
  SettingsScopeParam,
} from '@headless-lms/api-contract';
import type { Container } from '../../app/container.js';

/** Resolve the session's active org to the domain org id, or 400 and return null. */
async function resolveOrgId(
  req: FastifyRequest,
  reply: FastifyReply,
  container: Container,
): Promise<string | null> {
  if (!req.orgId) {
    await reply.code(400).send({ error: 'no_active_org', message: 'No active organization' });
    return null;
  }
  const org = await container.organizations.getByExternalId(req.orgId);
  if (!org) {
    await reply.code(400).send({ error: 'no_active_org', message: 'Organization not provisioned' });
    return null;
  }
  return org.id;
}

export async function settingsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const settings = container.settings;
  const tags = ['Settings'];

  // Every namespace that applies at this scope — what the settings surface reads.
  r.route({
    method: 'GET',
    url: '/api/settings/:scopeId',
    preHandler: app.requireSession,
    schema: {
      operationId: 'getScopeSettings',
      tags,
      summary: 'Resolved settings for a scope, across every namespace',
      params: SettingsScopeParam,
      response: { 200: ScopeSettings, 400: ErrorBody, 401: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply, container);
      if (!orgId) {
        return;
      }
      const { scopeId } = req.params;
      return reply.send({
        scopeId,
        namespaces: await settings.resolveAll(orgId, scopeId),
      });
    },
  });

  r.route({
    method: 'GET',
    url: '/api/settings/:scopeId/:namespace',
    preHandler: app.requireSession,
    schema: {
      operationId: 'getNamespaceSettings',
      tags,
      summary: "Resolved settings for one domain's namespace at a scope",
      params: SettingsNamespaceParam,
      response: { 200: NamespaceSettings, 400: ErrorBody, 401: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply, container);
      if (!orgId) {
        return;
      }
      const { scopeId, namespace } = req.params;
      const [stored, effective] = await Promise.all([
        settings.get(orgId, namespace, scopeId),
        settings.resolve(orgId, namespace, scopeId),
      ]);
      return reply.send({ stored, effective });
    },
  });

  // PATCH, not PUT: the body is merged into the stored value, not a replacement.
  // A scope with nothing set has no row — this upserts rather than 404s, since
  // absence means "inherits everything", not "not found".
  r.route({
    method: 'PATCH',
    url: '/api/settings/:scopeId/:namespace',
    preHandler: app.requireSession,
    schema: {
      operationId: 'patchNamespaceSettings',
      tags,
      summary: "Merge values into one domain's namespace at a scope",
      params: SettingsNamespaceParam,
      body: PatchSettings,
      response: { 200: NamespaceSettings, 400: ErrorBody, 401: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgId = await resolveOrgId(req, reply, container);
      if (!orgId) {
        return;
      }
      const { scopeId, namespace } = req.params;
      const stored = await settings.patch(orgId, namespace, scopeId, req.body);
      const effective = await settings.resolve(orgId, namespace, scopeId);
      return reply.send({ stored, effective });
    },
  });
}
