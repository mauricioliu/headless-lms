import type { z } from 'zod';
import type {
  evaluationOptionSchema,
  evaluationQuestionSchema,
  evaluationQuestionViewSchema,
  evaluationSchema,
  evaluationViewSchema,
  feedbackModeSchema,
  replaceEvaluationInputSchema,
} from './schemas/evaluation.js';

export type FeedbackMode = z.output<typeof feedbackModeSchema>;
export type EvaluationOption = z.output<typeof evaluationOptionSchema>;
export type EvaluationQuestion = z.output<typeof evaluationQuestionSchema>;
export type EvaluationQuestionView = z.output<typeof evaluationQuestionViewSchema>;
export type ReplaceEvaluationInput = z.output<typeof replaceEvaluationInputSchema>;
export type Evaluation = z.output<typeof evaluationSchema>;
export type EvaluationView = z.output<typeof evaluationViewSchema>;
