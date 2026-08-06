import { z } from "zod";
import { idSchema, jsonValueSchema, serializableDateSchema } from "./shared.js";

export const progressTargetTypeSchema = z.enum(["activity", "module", "course"]);
export type ProgressTargetType = z.infer<typeof progressTargetTypeSchema>;

export const progressRecordSchema = z.object({
  id: idSchema,
  orgId: idSchema,
  orgUserId: idSchema,
  targetType: progressTargetTypeSchema,
  targetId: idSchema,
  startedAt: serializableDateSchema,
  position: jsonValueSchema.nullable(),
  completedAt: serializableDateSchema.nullable(),
});
export type ProgressRecord = z.output<typeof progressRecordSchema>;
export type ProgressRecordInput = z.input<typeof progressRecordSchema>;

export const progressTargetSchema = z.object({
  orgUserId: idSchema,
  targetType: progressTargetTypeSchema,
  targetId: idSchema,
});
export type ProgressTarget = z.infer<typeof progressTargetSchema>;

export const progressReportItemSchema = z.object({
  asset: z.string().optional(),
  completed: z.boolean().optional(),
}).catchall(jsonValueSchema);
export type ProgressReportItem = z.infer<typeof progressReportItemSchema>;

export const reportProgressInputSchema = z.object({
  orgUserId: idSchema,
  activityId: idSchema,
  reports: z.array(progressReportItemSchema),
});
export type ReportProgressInput = z.infer<typeof reportProgressInputSchema>;
