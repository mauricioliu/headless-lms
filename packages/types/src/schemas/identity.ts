import { z } from "zod";
import { idSchema, serializableDateSchema } from "./shared.js";

export const userSchema = z.object({
  id: idSchema,
  externalId: idSchema.nullable(),
  email: z.string().email(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  createdAt: serializableDateSchema,
  updatedAt: serializableDateSchema,
});
export type User = z.output<typeof userSchema>;
export type UserInput = z.input<typeof userSchema>;

export const createUserInputSchema = z.object({
  id: idSchema.optional(),
  externalId: idSchema.optional(),
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const provisionUserInputSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});
export type ProvisionUserInput = z.infer<typeof provisionUserInputSchema>;

export const updateUserInputSchema = z.object({
  externalId: idSchema.optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
