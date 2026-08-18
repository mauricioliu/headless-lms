import {
  evaluationViewSchema,
  feedbackModeSchema,
  replaceEvaluationInputSchema,
} from '@headless-lms/core/schemas';

export const FeedbackMode = feedbackModeSchema;
export const ReplaceEvaluation = replaceEvaluationInputSchema;
export type ReplaceEvaluation = typeof ReplaceEvaluation._output;
export const EvaluationView = evaluationViewSchema;
export type EvaluationView = typeof EvaluationView._output;
