import { evaluationViewSchema } from '../types/schemas/index.js';
import { defineEvent, type EventOf } from '../shared/ports.js';

export const evaluationEvents = {
  replaced: defineEvent({
    type: 'evaluation.replaced',
    version: 1,
    data: evaluationViewSchema,
  }),
} as const;

export type EvaluationReplaced = EventOf<typeof evaluationEvents.replaced>;
