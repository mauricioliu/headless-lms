import { z } from "zod";
import { domainEventSchema, idSchema, jsonRecordSchema, serializableDateSchema } from "./shared.js";

export const automationTriggerSchema = z.string().trim().min(1);
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;

export const automationActionSchema = z.object({
  type: z.string().trim().min(1),
  input: jsonRecordSchema,
});
export type AutomationAction = z.infer<typeof automationActionSchema>;

export const automationSchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().optional(),
  trigger: automationTriggerSchema,
  actions: z.array(automationActionSchema),
  enabled: z.boolean(),
});
export type Automation = z.infer<typeof automationSchema>;

export const createAutomationInputSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  trigger: automationTriggerSchema,
  actions: z.array(automationActionSchema),
});
export type CreateAutomationInput = z.infer<typeof createAutomationInputSchema>;

export const updateAutomationInputSchema = createAutomationInputSchema.partial().extend({
  enabled: z.boolean().optional(),
});
export type UpdateAutomationInput = z.infer<typeof updateAutomationInputSchema>;

export const automationRunsQuerySchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  status: z.enum(["running", "completed", "failed"]).optional(),
  sort: z.string().optional(),
});
export type AutomationRunsQuery = z.infer<typeof automationRunsQuerySchema>;

export const automationRunStatusSchema = z.enum(["running", "completed", "failed"]);
export type AutomationRunStatus = z.infer<typeof automationRunStatusSchema>;

export const automationActionResultSchema = z.object({
  index: z.number().int().min(0),
  type: z.string().trim().min(1),
  status: z.enum(["completed", "failed"]),
  error: z.string().optional(),
});
export type AutomationActionResult = z.infer<typeof automationActionResultSchema>;

export const automationRunSchema = z.object({
  id: idSchema,
  orgId: idSchema,
  automationId: idSchema,
  trigger: automationTriggerSchema,
  event: domainEventSchema,
  status: automationRunStatusSchema,
  actionResults: z.array(automationActionResultSchema),
  startedAt: serializableDateSchema,
  finishedAt: serializableDateSchema.nullable(),
});
export type AutomationRun = z.output<typeof automationRunSchema>;
export type AutomationRunInput = z.input<typeof automationRunSchema>;

export const availableActionSchema = z.object({
  type: z.string().trim().min(1),
  description: z.string(),
  inputSchema: jsonRecordSchema,
  source: z.string(),
});
export type AvailableAction = z.infer<typeof availableActionSchema>;
export type AvailableActions = AvailableAction[];

export const availableTriggersSchema = z.object({
  triggers: z.array(z.object({ type: z.string().trim().min(1), description: z.string() })),
});
export type AvailableTriggers = z.infer<typeof availableTriggersSchema>;
