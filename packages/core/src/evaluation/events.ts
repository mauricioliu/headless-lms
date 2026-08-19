import {
  attemptAnswerSchema,
  evaluationViewSchema,
  serializableDateSchema,
} from '../types/schemas/index.js';
import { z } from 'zod';
import { defineEvent, type EventOf } from '../shared/ports.js';

export const evaluationEvents = {
  replaced: defineEvent({
    type: 'evaluation.replaced',
    version: 1,
    data: evaluationViewSchema,
  }),
  attemptGraded: defineEvent({
    type: 'evaluation.attempt.graded',
    version: 1,
    data: z
      .object({
        courseId: evaluationViewSchema.shape.courseId,
        orgUserId: z.string().trim().min(1),
        attemptNumber: z.number().int().min(1),
        submittedAt: serializableDateSchema,
        answers: z.array(attemptAnswerSchema),
        score: z.number().int().min(0).max(100),
        cutoff: z.number().int().min(1).max(100),
        passed: z.boolean(),
      })
      .strict(),
  }),
} as const;

export type EvaluationReplaced = EventOf<typeof evaluationEvents.replaced>;
export type EvaluationAttemptGraded = EventOf<typeof evaluationEvents.attemptGraded>;
