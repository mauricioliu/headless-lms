// reporting/courses — service implementation (inbound port).
import type { CourseAnalytics, CourseEnrollmentPoint } from './model.js';
import type { CoursesReportRepository, CoursesReportService } from './ports.js';
import type { Logger } from '../../shared/ports.js';
import { noopLogger } from '../../shared/logger.js';

export type CoursesReportServiceParams = {
  repo: CoursesReportRepository;
  logger?: Logger;
};

export class CoursesReportServiceImpl implements CoursesReportService {
  private readonly repo: CoursesReportRepository;
  private readonly logger: Logger;

  constructor(params: CoursesReportServiceParams) {
    this.repo = params.repo;
    this.logger = params.logger ?? noopLogger;
  }

  analytics(orgId: string, courseId: string): Promise<CourseAnalytics | null> {
    return this.repo.analytics(orgId, courseId);
  }

  enrollments(
    orgId: string,
    courseId: string,
    days: number,
  ): Promise<CourseEnrollmentPoint[] | null> {
    return this.repo.enrollments(orgId, courseId, days);
  }
}
