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
