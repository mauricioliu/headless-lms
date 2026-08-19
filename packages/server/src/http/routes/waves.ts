// HTTP routes for waves: ingesting an Ola from the Empresa Cliente's roster
// CSV and reading the Olas back. Ingestion provisions the Trabajadores, sends
// each one's invitation, and inscribes them in the Curso — the manual re-invite
// of an individual Trabajador lives with the student it operates on
// (POST /api/students/:id/invite/resend).
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ErrorBody,
  IngestWave,
  IngestWaveResult,
  WaveDetail,
  WaveIdParam,
  WaveView,
} from '../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { resolveScope } from '../scope.js';

export async function wavesRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const waves = container.waves;
  const tags = ['Waves'];

  r.route({
    method: 'POST',
    url: '/api/waves',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'ingestWave',
      tags,
      summary: 'Ingest an Ola from a roster CSV (RUT, nombre, teléfono, correo)',
      description:
        'Creates the Ola, provisions a Trabajador per CSV row, inscribes each one in the Curso, and emails an invitation to every Trabajador not yet active. The access token exists only in that email. The correo is the identity; RUT and teléfono are stored roster data that never authenticates.',
      body: IngestWave,
      response: { 201: IngestWaveResult, 400: ErrorBody, 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const result = await waves.ingest(scope.orgId, {
        ...req.body,
        inviterUserId: scope.userId,
      });
      return reply.code(201).send(result);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/waves',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listWaves',
      tags,
      summary: 'List the organization Olas',
      response: { 200: z.array(WaveView) },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      return waves.list(scope.orgId);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/waves/:id',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getWave',
      tags,
      summary: 'Get an Ola with its Trabajadores',
      params: WaveIdParam,
      response: { 200: WaveDetail, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const wave = await waves.get(scope.orgId, req.params.id);
      if (!wave) {
        throw new NotFoundError('Wave', req.params.id);
      }
      const members = await waves.members(scope.orgId, req.params.id);
      return { ...wave, members };
    },
  });
}
