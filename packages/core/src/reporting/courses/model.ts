// reporting/courses — per-course analytics read model. Framework-free.
// Cohort = students with an effective-active entitlement to the course;
// every figure below is computed against that cohort.

export interface CourseActivityEngagement {
  activityId: string;
  title: string;
  moduleId: string;
  moduleTitle: string;
  started: number;
  completed: number;
}

export interface CourseAnalytics {
  enrolled: number;
  started: number;
  completed: number;
  /** Mean of each cohort member's completed-activities percentage (0–100). */
  avgProgress: number;
  activities: CourseActivityEngagement[];
}

export interface CourseEnrollmentPoint {
  date: string;
  count: number;
}
