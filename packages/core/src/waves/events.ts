import { waveSchema } from '../types/schemas/index.js';
import { defineEvent, type EventOf } from '../shared/ports.js';

export const waveEvents = {
  created: defineEvent({
    type: 'wave.created',
    version: 1,
    data: waveSchema,
  }),
} as const;

export type WaveCreated = EventOf<typeof waveEvents.created>;
