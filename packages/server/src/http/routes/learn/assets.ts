import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AssetIdParam,
  DownloadTicket,
  ErrorBody,
  RequestDownload,
} from '@headless-lms/api-contract';
import { NotFoundError } from '../../../core/shared/errors.js';
import type { Container } from '../../../app/container.js';
import { resolveStudentScope } from '../../student-scope.js';

export async function learnAssetsRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Content embeds assets by stable `assetId`; the URL persisted at authoring
  // time is a long-expired presign. The student surface mints a fresh
  // short-lived ticket here, scoped to the session's portal org.
  r.route({
    method: 'POST',
    url: '/api/learn/assets/:id/download-url',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'requestLearnAssetDownload',
      tags: ['Learn'],
      summary: 'Get a short-lived presigned URL to serve an asset to the student',
      params: AssetIdParam,
      body: RequestDownload,
      response: { 200: DownloadTicket, 401: ErrorBody, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveStudentScope(container, req);
      const ticket = await container.assets.requestDownload(
        scope.orgId,
        req.params.id,
        req.body.filename,
      );
      if (!ticket) {
        throw new NotFoundError('Asset', req.params.id);
      }
      return ticket;
    },
  });
}
