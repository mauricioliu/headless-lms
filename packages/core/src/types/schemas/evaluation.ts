import { z } from 'zod';
import { idSchema, isoDateStringSchema } from './shared.js';

export const feedbackModeSchema = z.enum(['score_only', 'answer_review']);

export const evaluationOptionSchema = z
  .object({
    id: idSchema,
    text: z.string().min(1),
  })
  .strict();

const evaluationQuestionFields = {
  id: idSchema,
  prompt: z.string().min(1),
  options: z.array(evaluationOptionSchema).min(2).max(6),
};

export const evaluationQuestionSchema = z
  .object({
    ...evaluationQuestionFields,
    correctOptionId: idSchema,
  })
  .strict()
  .superRefine((question, ctx) => {
    const optionIds = question.options.map((option) => option.id);
    if (new Set(optionIds).size !== optionIds.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Option ids must be unique' });
    }
    if (!optionIds.includes(question.correctOptionId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['correctOptionId'],
        message: 'Correct option must belong to its question',
      });
    }
  });

export const evaluationQuestionViewSchema = z.object(evaluationQuestionFields).strict();

export const replaceEvaluationInputSchema = z
  .object({
    cutoff: z.number().int().min(1).max(100).default(70),
    feedbackMode: feedbackModeSchema.default('score_only'),
    questions: z.array(evaluationQuestionSchema).min(1).max(100),
  })
  .strict()
  .superRefine((evaluation, ctx) => {
    const ids = evaluation.questions.flatMap((question) => [
      question.id,
      ...question.options.map((option) => option.id),
    ]);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['questions'],
        message: 'Question and option ids must be unique',
      });
    }
  });

export const evaluationSchema = replaceEvaluationInputSchema.extend({ courseId: idSchema });

export const evaluationViewSchema = z
  .object({
    courseId: idSchema,
    cutoff: z.number().int().min(1).max(100),
    feedbackMode: feedbackModeSchema,
    questions: z.array(evaluationQuestionViewSchema),
  })
  .strict();

export const attemptAnswerSchema = z
  .object({
    questionId: idSchema,
    optionId: idSchema,
  })
  .strict();
export type AttemptAnswer = z.output<typeof attemptAnswerSchema>;

export const submitAttemptInputSchema = z
  .object({
    answers: z.array(attemptAnswerSchema).min(1).max(100),
  })
  .strict()
  .superRefine((input, ctx) => {
    const ids = input.answers.map((answer) => answer.questionId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['answers'],
        message: 'Each question may be answered once',
      });
    }
  });

export const attemptRecordSchema = z
  .object({
    orgId: idSchema,
    courseId: idSchema,
    orgUserId: idSchema,
    attemptNumber: z.number().int().min(1),
    startedAt: z.coerce.date(),
    submittedAt: z.coerce.date().nullable(),
    answers: z.array(attemptAnswerSchema).nullable(),
    score: z.number().int().min(0).max(100).nullable(),
    cutoff: z.number().int().min(1).max(100).nullable(),
    passed: z.boolean().nullable(),
  })
  .strict();

export const attemptStatusSchema = z
  .object({
    attemptNumber: z.number().int().min(1),
    startedAt: isoDateStringSchema,
    submittedAt: isoDateStringSchema.nullable(),
    score: z.number().int().min(0).max(100).nullable(),
    cutoff: z.number().int().min(1).max(100).nullable(),
    passed: z.boolean().nullable(),
  })
  .strict();

export const attemptQuestionReviewSchema = z
  .object({
    questionId: idSchema,
    prompt: z.string().min(1),
    options: z.array(evaluationOptionSchema),
    selectedOptionId: idSchema,
    correct: z.boolean(),
  })
  .strict();

export const attemptFeedbackSchema = attemptStatusSchema
  .extend({
    feedbackMode: feedbackModeSchema,
    questions: z.array(attemptQuestionReviewSchema).optional(),
  })
  .strict();
