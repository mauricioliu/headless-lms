import { z } from "zod";
import type { DomainEvent, EventMetadata, JsonValue } from "../shared.js";

export const idSchema: z.ZodString = z.string().trim().min(1);

export const isoDateStringSchema = z.string().trim().min(1);

export const serializableDateSchema = z.union([
  z.date().transform((value) => value.toISOString()),
  isoDateStringSchema,
]);

export const jsonValueSchema: z.ZodType<JsonValue, unknown> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const jsonRecordSchema = z.record(z.string(), jsonValueSchema);

export const eventMetadataSchema: z.ZodType<EventMetadata> = z.record(z.string(), jsonValueSchema);

export const domainEventSchema: z.ZodType<DomainEvent> = z.object({
  type: z.string().trim().min(1),
  version: z.number().int().positive(),
  id: idSchema,
  orgId: idSchema,
  subject: idSchema,
  occurredAt: isoDateStringSchema,
  data: jsonValueSchema,
  metadata: eventMetadataSchema.optional(),
});
