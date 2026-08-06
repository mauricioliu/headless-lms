import { z } from "zod";
import { idSchema, jsonRecordSchema, serializableDateSchema } from "./shared.js";

export const validationSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), errors: z.array(z.string()) }),
]);
export type Validation = z.infer<typeof validationSchema>;

export const connectionSchema = z.object({
  id: idSchema,
  integrationId: idSchema,
  config: jsonRecordSchema,
  active: z.boolean(),
  credentialRef: idSchema,
  createdAt: serializableDateSchema,
  updatedAt: serializableDateSchema,
});
export type Connection = z.output<typeof connectionSchema>;
export type ConnectionInput = z.input<typeof connectionSchema>;

export const connectInputSchema = z.object({
  integrationId: idSchema,
  secrets: jsonRecordSchema,
  config: jsonRecordSchema.optional(),
});
export type ConnectInput = z.input<typeof connectInputSchema>;

export const configureInputSchema = z.object({
  config: jsonRecordSchema.optional(),
  active: z.boolean().optional(),
});
export type ConfigureInput = z.input<typeof configureInputSchema>;
