import type { z } from 'zod';
import type {
  attemptAnswerSchema,
  attemptFeedbackSchema,
  attemptQuestionReviewSchema,
  attemptRecordSchema,
  attemptStatusSchema,
  evaluationOptionSchema,
  evaluationQuestionSchema,
  evaluationQuestionViewSchema,
  evaluationSchema,
  evaluationViewSchema,
  feedbackModeSchema,
  replaceEvaluationInputSchema,
  submitAttemptInputSchema,
} from './schemas/evaluation.js';

export type FeedbackMode = z.output<typeof feedbackModeSchema>;
export type EvaluationOption = z.output<typeof evaluationOptionSchema>;
export type EvaluationQuestion = z.output<typeof evaluationQuestionSchema>;
export type EvaluationQuestionView = z.output<typeof evaluationQuestionViewSchema>;
export type ReplaceEvaluationInput = z.output<typeof replaceEvaluationInputSchema>;
export type Evaluation = z.output<typeof evaluationSchema>;
export type EvaluationView = z.output<typeof evaluationViewSchema>;
export type AttemptAnswer = z.output<typeof attemptAnswerSchema>;
export type SubmitAttemptInput = z.output<typeof submitAttemptInputSchema>;
export type Attempt = z.output<typeof attemptRecordSchema>;
export type AttemptStatus = z.output<typeof attemptStatusSchema>;
export type AttemptQuestionReview = z.output<typeof attemptQuestionReviewSchema>;
export type AttemptFeedback = z.output<typeof attemptFeedbackSchema>;
