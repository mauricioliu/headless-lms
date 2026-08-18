// Shared contract primitives reused across resource contracts.
import { z } from "zod";

/** Fails typecheck when a schema and its domain type drift apart. */
export type Matches<A, _B extends A> = true;

export const ValidationIssue = z.object({
  path: z.string(),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof ValidationIssue>;

/** Uniform error envelope returned by every non-2xx response. */
export const ErrorBody = z.object({
  error: z.string(),
  message: z.string().optional(),
  /** Server-side correlation id — quote it to find the matching API log line. */
  requestId: z.string().optional(),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export const ValidationErrorBody = ErrorBody.extend({
  issues: z.array(ValidationIssue),
});
export type ValidationErrorBody = z.infer<typeof ValidationErrorBody>;

export function validationErrorBody(error: Error): ValidationErrorBody {
  const validation = (
    error as Error & {
      validation?: Array<{
        instancePath?: string;
        message?: string;
        params?: { issue?: { path?: PropertyKey[]; message?: string } };
      }>;
    }
  ).validation;
  return {
    error: 'validation_error',
    message: error.message,
    issues: (validation ?? []).map((item) => {
      const issue = item.params?.issue;
      return {
        path:
          issue?.path?.map(String).join('.') ??
          item.instancePath?.replace(/^\//, '').replaceAll('/', '.') ??
          '',
        message: issue?.message ?? item.message ?? 'Invalid value',
      };
    }),
  };
}

/**
 * Common list query for page-based collections. `z.coerce` because query-string
 * values arrive as strings; defaults make the params optional for callers.
 */
export const ListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  /** Sort field, optionally prefixed with `-` for descending (e.g. `-updatedAt`). */
  sort: z.string().optional(),
});
export type ListQuery = z.infer<typeof ListQuery>;

/** Wrap a row schema into the standard paginated envelope. */
export function paginated<T extends z.ZodTypeAny>(row: T) {
  return z.object({
    rows: z.array(row),
    total: z.number().int(),
    page: z.number().int(),
    pageSize: z.number().int(),
  });
}

/** All four org roles. `members.ts` exports a staff-only three-value `Role`;
 *  this is the full set, used wherever a learner can also appear. */
export const OrgRole = z.enum(["owner", "admin", "instructor", "student"]);
export type OrgRole = z.infer<typeof OrgRole>;

/** Mirrors UserProfile in @headless-lms/core/types — keyed on the auth user id. */
export const UserProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
});
export type UserProfileSchema = z.infer<typeof UserProfileSchema>;

/** Mirrors OrgUserProfile in @headless-lms/core/types — keyed on org_users.id. */
export const OrgUserProfileSchema = z.object({
  id: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string(),
  image: z.string().nullable(),
});
export type OrgUserProfileSchema = z.infer<typeof OrgUserProfileSchema>;
