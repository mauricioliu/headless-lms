// reporting/learn — ports.
import type { Course, Module, CourseRef, CourseProgressView } from './model.js';

/**
 * Inbound: the student-scoped read use-cases. Scoped by `(orgId, orgUserId)` —
 * the portal org resolved at the boundary. `null` ⇒ not enrolled (→ 404).
 */
export interface LearnReportService {
  listCourses(orgId: string, orgUserId: string): Promise<Course[]>;
  getCourse(orgId: string, orgUserId: string, courseId: string): Promise<Course | null>;
  listModules(orgId: string, orgUserId: string, courseId: string): Promise<Module[] | null>;
  courseProgress(
    orgId: string,
    orgUserId: string,
    courseId: string,
  ): Promise<CourseProgressView | null>;
}

/**
 * Outbound: the student's active, non-expired course entitlements in PUBLISHED
 * courses, scoped to the portal org. Implemented by a Drizzle read repo; the
 * service resolves each ref against the content service for the full
 * Course/Module payload.
 */
export interface LearnEntitlementReader {
  activeRefs(orgId: string, orgUserId: string): Promise<CourseRef[]>;
  activeRef(orgId: string, orgUserId: string, courseId: string): Promise<CourseRef | null>;
}
