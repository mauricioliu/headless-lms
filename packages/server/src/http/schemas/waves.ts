// Waves resource schemas — the Ola surface the Admin Cliente operates.
import { z } from 'zod';
import {
  ingestWaveInputSchema,
  ingestWaveResultSchema,
  waveMemberSchema,
  waveSchema,
} from '@headless-lms/core/schemas';

export const IngestWave = ingestWaveInputSchema;
export type IngestWave = typeof IngestWave._output;

export const WaveView = waveSchema;
export type WaveView = typeof WaveView._output;

export const IngestWaveResult = ingestWaveResultSchema;
export type IngestWaveResult = typeof IngestWaveResult._output;

export const WaveMemberView = waveMemberSchema;
export type WaveMemberView = typeof WaveMemberView._output;

export const WaveDetail = waveSchema.extend({
  members: waveMemberSchema.array(),
});
export type WaveDetail = typeof WaveDetail._output;

export const WaveIdParam = z.object({ id: z.string() });
export type WaveIdParam = z.infer<typeof WaveIdParam>;
