// reporting/dashboard — ports.
import type { EnrollmentPoint, OverviewStats } from './model.js';

export interface DashboardReportService {
  overview(orgId: string): Promise<OverviewStats>;
  enrollments(orgId: string, days: number): Promise<EnrollmentPoint[]>;
}

export interface DashboardReportRepository {
  overview(orgId: string): Promise<OverviewStats>;
  enrollments(orgId: string, days: number): Promise<EnrollmentPoint[]>;
}
