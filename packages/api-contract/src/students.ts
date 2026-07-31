// Students resource schemas.
import { z } from "zod";
import { ListQuery, paginated, OrgUserProfileSchema } from "./shared.js";

export const OrgUserStatus = z.enum(["invited", "active"]);
export type OrgUserStatus = z.infer<typeof OrgUserStatus>;

export const Student = OrgUserProfileSchema.extend({
  /** As typed on the invite form. `name` is the composed rendering name; these
   *  are the fields the admin edits. Null for anyone who self-signed-up. */
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  entitlementCount: z.number().int(),
  /** 0–100, averaged across active entitlements. */
  avgProgress: z.number().int(),
  /** `invited` means an admin added them and they have not accepted yet. */
  status: OrgUserStatus,
  joinedAt: z.string(),
  lastActiveAt: z.string().nullable(),
});
export type Student = z.infer<typeof Student>;

export const StudentsQuery = ListQuery;
export type StudentsQuery = z.infer<typeof StudentsQuery>;

export const StudentsPage = paginated(Student);
export type StudentsPage = z.infer<typeof StudentsPage>;

export const StudentIdParam = z.object({ id: z.string() });
export type StudentIdParam = z.infer<typeof StudentIdParam>;

// Every field is a correction to what an admin typed, so all three are sent
// together — the form edits the whole profile, not one attribute at a time.
export const UpdateStudentBody = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().email(),
});
export type UpdateStudentBody = z.infer<typeof UpdateStudentBody>;
