// HTTP routes for the per-Ola report (reporting/waves): the JSON read the
// admin surface renders and the CSV export the Admin Cliente hands to their
// compliance office. Aggregates only — the per-Intento detail stays in the
// append-only registro and never travels here.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ErrorBody, WaveIdParam, WaveReport } from '../schemas/index.js';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { Container } from '../../app/container.js';
import { resolveScope } from '../scope.js';
import type {
  WaveReport as Report,
  WaveWorkerEvaluationStatus,
} from '@headless-lms/core/reporting/waves';

const EVALUATION_LABELS: Record<WaveWorkerEvaluationStatus, string> = {
  approved: 'Aprobada',
  last_attempt: 'Último intento',
  pending: 'Pendiente',
  blocked: 'Bloqueada',
  no_evaluation: 'Sin evaluación',
};

/** RFC 4180: quote a field when it carries the delimiter, a quote or a
 *  newline; a quote inside doubles itself. */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

/** The export's rows carry exactly the table's columns, values and all:
 *  Trabajador, Avance %, Evaluación, Puntaje % (empty when never rendida),
 *  Intentos. */
export function waveReportCsv(report: Report): string {
  const header = ['Trabajador', 'Avance', 'Evaluación', 'Puntaje', 'Intentos'];
  const nameOf = (w: Report['workers'][number]) =>
    [w.firstName, w.lastName].filter(Boolean).join(' ') || w.email;
  const lines = [
    header,
    ...report.workers.map((w) => [
      nameOf(w),
      `${w.progress}%`,
      EVALUATION_LABELS[w.evaluationStatus],
      w.score === null ? '' : `${w.score}%`,
      String(w.attempts),
    ]),
  ];
  return `${lines.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`;
}

/** A download-safe filename: the Ola's name, accent-stripped and slugified,
 *  falling back to the id when nothing printable remains. */
function csvFilename(name: string, id: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `reporte-ola-${slug || id}.csv`;
}

export async function waveReportRoutes(app: FastifyInstance, container: Container): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const tags = ['Waves'];

  r.route({
    method: 'GET',
    url: '/api/waves/:id/report',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'getWaveReport',
      tags,
      summary: 'The per-Ola report: one aggregate row per Trabajador plus Ola totals',
      description:
        'Aggregates only: per Trabajador avance, standing Evaluación state, latest-Intento puntaje, submitted intentos and Completado (progress-owned), plus the Ola totals the >80% Completado gate is read from. The per-Intento detail lives in the append-only registro and never travels here.',
      params: WaveIdParam,
      response: { 200: WaveReport, 404: ErrorBody },
    },
    handler: async (req) => {
      const scope = await resolveScope(container, req);
      const report = await container.reporting.waves.report(scope.orgId, req.params.id);
      if (!report) {
        throw new NotFoundError('Wave', req.params.id);
      }
      return report;
    },
  });

  r.route({
    method: 'GET',
    url: '/api/waves/:id/report.csv',
    preHandler: app.requireOrgSession,
    schema: {
      operationId: 'exportWaveReportCsv',
      tags,
      summary: 'Export the per-Ola report as CSV (the table columns, per Trabajador)',
      description:
        'Comma-delimited CSV, RFC 4180 quoting, headers in Spanish identical to the table columns: Trabajador, Avance, Evaluación, Puntaje, Intentos. One row per Trabajador with aggregates only — no respuestas, no per-Intento detail.',
      params: WaveIdParam,
      response: {
        200: {
          description: 'The CSV export, one row per Trabajador',
          content: { 'text/csv': { schema: z.string() } },
        },
        404: ErrorBody,
      },
    },
    handler: async (req, reply) => {
      const scope = await resolveScope(container, req);
      const report = await container.reporting.waves.report(scope.orgId, req.params.id);
      if (!report) {
        throw new NotFoundError('Wave', req.params.id);
      }
      return reply
        .header(
          'content-disposition',
          `attachment; filename="${csvFilename(report.wave.name, report.wave.id)}"`,
        )
        .type('text/csv; charset=utf-8')
        .send(waveReportCsv(report));
    },
  });
}
