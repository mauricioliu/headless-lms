import { z } from 'zod';
import { emailSchema, idSchema } from './shared.js';

/** One parsed CSV row of an Ola roster: RUT, nombre, teléfono, correo. The
 *  correo is the identity — everything else is stored roster data. `nombre` is
 *  split on its first whitespace into first/last name, mirroring how the auth
 *  signup hook splits a display name. */
export const workerRowSchema = z
  .object({
    rut: z.string().trim().min(1),
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1).nullable(),
    phone: z.string().trim().min(1),
    email: emailSchema,
  })
  .strict();
export type WorkerRow = z.output<typeof workerRowSchema>;

export const waveSchema = z
  .object({
    orgId: idSchema,
    id: idSchema,
    name: z.string().trim().min(1),
    courseId: idSchema,
    memberCount: z.number().int().min(0),
    createdAt: z.coerce.date(),
  })
  .strict();
export type Wave = z.output<typeof waveSchema>;

/** A member of an Ola as the admin reads them back: the Trabajador's org user
 *  with the roster data stored on the person. */
export const waveMemberSchema = z
  .object({
    waveId: idSchema,
    orgUserId: idSchema,
    email: emailSchema,
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    status: z.enum(['invited', 'active']),
    rut: z.string().nullable(),
    phone: z.string().nullable(),
  })
  .strict();
export type WaveMember = z.output<typeof waveMemberSchema>;

export const ingestWaveInputSchema = z
  .object({
    name: z.string().trim().min(1),
    courseId: idSchema,
    csv: z.string().min(1),
  })
  .strict();
export type IngestWaveInput = z.input<typeof ingestWaveInputSchema>;

export const ingestWaveResultSchema = waveSchema.extend({
  /** Trabajadores a fresh invitation email was sent to (new or still pending). */
  invited: z.number().int().min(0),
  /** Trabajadores already active in the org — inscribed and entitled, no email. */
  alreadyActive: z.number().int().min(0),
});
export type IngestWaveResult = z.output<typeof ingestWaveResultSchema>;

/** Estado de la Evaluación de un Trabajador en el reporte de una Ola, as the
 *  Admin Cliente reads it. `last_attempt` = rendida but the latest Intento did
 *  not pass (there is no failed state — intentos are unlimited, the last one
 *  stands); `blocked` = avance below 100% (the rendir gate); `no_evaluation` =
 *  the Curso carries no Evaluación (no gate: Completado is avance 100% alone). */
export const waveWorkerEvaluationStatusSchema = z.enum([
  'approved',
  'last_attempt',
  'pending',
  'blocked',
  'no_evaluation',
]);
export type WaveWorkerEvaluationStatus = z.output<typeof waveWorkerEvaluationStatusSchema>;

/** One Trabajador's row in the per-Ola report: aggregates only — the per-Intento
 *  detail lives in the append-only registro and never travels here. */
export const waveWorkerReportSchema = z
  .object({
    orgUserId: idSchema,
    email: emailSchema,
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    status: z.enum(['invited', 'active']),
    /** Avance against the Curso's current published structure, 0–100. */
    progress: z.number().int().min(0).max(100),
    evaluationStatus: waveWorkerEvaluationStatusSchema,
    /** Puntaje of the latest Intento — the one that stands. null = never rendida. */
    score: z.number().int().min(0).max(100).nullable(),
    /** Submitted Intentos (an open Intento is not a rendición yet). */
    attempts: z.number().int().min(0),
    /** Completado = avance 100% + Evaluación aprobada — progress's own fact,
     *  read back here, never recomputed. */
    completed: z.boolean(),
  })
  .strict();
export type WaveWorkerReport = z.output<typeof waveWorkerReportSchema>;

/** Ola-level aggregates the operational >80% Completado gate is read from. */
export const waveReportTotalsSchema = z
  .object({
    members: z.number().int().min(0),
    completed: z.number().int().min(0),
    /** Completado rate, 0–100. */
    completedRate: z.number().int().min(0).max(100),
    /** Mean avance across the Ola, 0–100. */
    avgProgress: z.number().int().min(0).max(100),
    /** Mean of the standing puntaje over Trabajadores who have rendido;
     *  null when nobody has. */
    avgScore: z.number().int().min(0).max(100).nullable(),
    /** Total submitted Intentos ÷ members, one decimal. */
    avgAttempts: z.number().min(0),
  })
  .strict();
export type WaveReportTotals = z.output<typeof waveReportTotalsSchema>;

/** The per-Ola report the Admin Cliente operates: wave + Curso context, Ola
 *  aggregates, and one row per Trabajador. Computed on demand — reporting owns
 *  no records. */
export const waveReportSchema = z
  .object({
    wave: waveSchema.pick({ id: true, name: true, courseId: true, createdAt: true }),
    course: z.object({
      id: idSchema,
      title: z.string(),
      status: z.enum(['draft', 'published']),
    }),
    totals: waveReportTotalsSchema,
    workers: z.array(waveWorkerReportSchema),
  })
  .strict();
export type WaveReport = z.output<typeof waveReportSchema>;
