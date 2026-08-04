import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  DownloadAssetParams,
  DownloadIdParam,
  ErrorBody,
  LearnDownload,
  LearnDownloads,
} from '../../schemas/index.js';
import { NotFoundError } from '../../../core/shared/errors.js';
import type { Container } from '../../../app/container.js';
import { UnauthorizedError } from '../../plugins/auth.js';

export async function learnDownloadsRoutes(
  app: FastifyInstance,
  container: Container,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const learn = container.reporting.learn;

  r.route({
    method: 'GET',
    url: '/api/learn/downloads',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'listLearnDownloads',
      tags: ['Learn'],
      summary: 'Downloads the student is actively entitled to',
      response: { 200: LearnDownloads },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      return learn.listDownloads(req.orgId, orgUser.id);
    },
  });

  r.route({
    method: 'GET',
    url: '/api/learn/downloads/:downloadId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getLearnDownload',
      tags: ['Learn'],
      summary: 'One entitled download and its ordered assets',
      params: DownloadIdParam,
      response: { 200: LearnDownload, 404: ErrorBody },
    },
    handler: async (req) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      const result = await learn.getDownload(req.orgId, orgUser.id, req.params.downloadId);
      if (!result) {
        throw new NotFoundError('Download', req.params.downloadId);
      }
      return result;
    },
  });

  // One stable, resolvable URL per asset. Drops into an <a href download> in
  // any frontend — no JS, no SDK, no CORS preflight. The signed target is
  // minted per request and short-lived.
  r.route({
    method: 'GET',
    url: '/api/learn/downloads/:downloadId/assets/:assetId',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getLearnDownloadAsset',
      tags: ['Learn'],
      summary: 'Redirect to a short-lived signed URL for an entitled asset',
      params: DownloadAssetParams,
      response: { 302: z.void(), 404: ErrorBody },
    },
    handler: async (req, reply) => {
      const orgUser = await container.organizations.getOrgUser(req.orgId, req.userId);
      if (!orgUser) {
        throw new UnauthorizedError();
      }
      const signed = await learn.downloadAssetUrl(
        req.orgId,
        orgUser.id,
        req.params.downloadId,
        req.params.assetId,
      );
      if (!signed) {
        // Always 404, never 403 — a 403 confirms the resource exists to
        // someone not entitled to it.
        throw new NotFoundError('Download asset', req.params.assetId);
      }
      return reply
        .header('cache-control', 'no-store')
        .header('referrer-policy', 'no-referrer')
        .redirect(signed.url, 302);
    },
  });
}
