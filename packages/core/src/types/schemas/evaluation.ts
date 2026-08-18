import { z } from 'zod';
import { idSchema } from './shared.js';

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
