// HTTP routes for the automations context: rules that match a trigger (a
// domain event type) against enabled automations and run an ordered list of
// actions, plus the run history each automation accumulates.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  Automation,
  AutomationIdParam,
  AutomationRunsPage,
  AutomationRunsQuery,
  AvailableAction,
  AvailableTriggers,
  CreateAutomationBody,
  ErrorBody,
  UpdateAutomationBody,
} from '../schemas/index.js';
import { NotFoundError, ForbiddenError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { resolveScope, type OrgScope } from '../scope.js';

export async function automationsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const automations = container.automations;
  const tags = ['Automations'];

  // v1 has no activation surface for the Admin Cliente — automations are the
  // operator's own machinery. Non-owner staff never reach the service, HTTP or
  // not (the admin UI hiding the nav is presentation, not the rule).
  const requireOwner = async (scope: OrgScope) => {
    if (scope.role !== 'owner') {
      throw new ForbiddenError('automations are restricted to the organization owner');
    }
  };

  r.route({
    method: 'GET',
    url: '/api/automations',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listAutomations',
      tags,
      summary: 'List automations (owner only)',
      response: { 200: z.array(Automation), 403: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      await requireOwner(scope);
      return automations.list(scope.orgId);
    },
  });

  // Before `/api/automations/:id` — otherwise `:id` would swallow these path segments.
  r.route({
    method: 'GET',
    url: '/api/automations/actions',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listAutomationActions',
      tags,
      summary: 'List the actions automations can use',
      response: { 200: z.array(AvailableAction), 403: ErrorBody },
    },
    handler: async (req) => {
      await requireOwner(await resolveScope(container, req));
      return automations.availableActions();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/automations/triggers',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listAutomationTriggers',
      tags,
      summary: 'List the domain events automations can react to',
      response: { 200: AvailableTriggers, 403: ErrorBody },
    },
    handler: async (req) => {
      await requireOwner(await resolveScope(container, req));
      return automations.availableTriggers();
    },
  });

  r.route({
    method: 'POST',
    url: '/api/automations',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'createAutomation',
      tags,
      summary: 'Create an automation',
      body: CreateAutomationBody,
      response: { 201: Automation, 403: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await requireOwner(scope);
      const automation = await automations.create(scope.orgId, req.body);
      return reply.code(201).send(automation);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/automations/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getAutomation',
      tags,
      summary: 'Get an automation by id',
      params: AutomationIdParam,
      response: { 200: Automation, 404: ErrorBody, 403: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      await requireOwner(scope);
      const automation = await automations.get(scope.orgId, req.params.id);
      if (!automation) {
        throw new NotFoundError('Automation', req.params.id);
      }
      return automation;
    },
  });

  r.route({
    method: 'PATCH',
    url: '/api/automations/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'updateAutomation',
      tags,
      summary: 'Update an automation',
      params: AutomationIdParam,
      body: UpdateAutomationBody,
      response: { 200: Automation, 404: ErrorBody, 403: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      await requireOwner(scope);
      const automation = await automations.update(scope.orgId, req.params.id, req.body);
      if (!automation) {
        throw new NotFoundError('Automation', req.params.id);
      }
      return automation;
    },
  });

  r.route({
    method: 'DELETE',
    url: '/api/automations/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'deleteAutomation',
      tags,
      summary: 'Delete an automation',
      params: AutomationIdParam,
      response: { 204: z.void(), 404: ErrorBody, 403: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      await requireOwner(scope);
      const deleted = await automations.delete(scope.orgId, req.params.id);
      if (!deleted) {
        throw new NotFoundError('Automation', req.params.id);
      }
      return reply.code(204).send();
    },
  });

  r.route({
    method: 'GET',
    url: '/api/automations/:id/runs',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listAutomationRuns',
      tags,
      summary: "List an automation's runs — a deleted automation's runs remain reachable (audit trail)",
      params: AutomationIdParam,
      querystring: AutomationRunsQuery,
      response: { 200: AutomationRunsPage, 403: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      await requireOwner(scope);
      // No existence pre-check: runs deliberately survive automation deletion (audit trail).
      return automations.listRuns(scope.orgId, req.params.id, req.query);
    },
  });
}
