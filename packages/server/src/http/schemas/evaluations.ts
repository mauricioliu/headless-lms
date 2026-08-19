import {
  attemptFeedbackSchema,
  attemptStatusSchema,
  evaluationViewSchema,
  feedbackModeSchema,
  replaceEvaluationInputSchema,
  submitAttemptInputSchema,
} from '@headless-lms/core/schemas';

export const FeedbackMode = feedbackModeSchema;
export const ReplaceEvaluation = replaceEvaluationInputSchema;
export type ReplaceEvaluation = typeof ReplaceEvaluation._output;
export const EvaluationView = evaluationViewSchema;
export type EvaluationView = typeof EvaluationView._output;
export const SubmitEvaluationAttempt = submitAttemptInputSchema;
export type SubmitEvaluationAttempt = typeof SubmitEvaluationAttempt._output;
export const EvaluationAttemptStatus = attemptStatusSchema;
export type EvaluationAttemptStatus = typeof EvaluationAttemptStatus._output;
export const EvaluationAttemptFeedback = attemptFeedbackSchema;
export type EvaluationAttemptFeedback = typeof EvaluationAttemptFeedback._output;
