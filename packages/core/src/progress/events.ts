import { progressRecordSchema } from '../types/schemas/index.js';
import { defineEvent, type EventOf, type EventOfValues } from '../shared/ports.js';
import type { NewDomainEvent } from '../shared/ports.js';

export const progressEvents = {
  progressStarted: defineEvent({
    type: 'progress.record.started',
    version: 1,
    data: progressRecordSchema,
  }),
  progressCompleted: defineEvent({
    type: 'progress.record.completed',
    version: 1,
    data: progressRecordSchema,
  }),
};

export type ProgressStarted = EventOf<typeof progressEvents.progressStarted>;
export type ProgressCompleted = EventOf<typeof progressEvents.progressCompleted>;
export type ProgressEvent = EventOfValues<typeof progressEvents>;
export type NewProgressEvent = NewDomainEvent<ProgressEvent>;
