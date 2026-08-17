// reporting/students — public surface.
export { StudentsReportServiceImpl } from './service.js';
export type { StudentsReportService, StudentsReportRepository } from './ports.js';
export type {
  Student,
  StudentAnalytics,
  StudentCourseProgress,
  StudentsQuery,
  Page,
} from './model.js';
