// reporting/dashboard — service implementation (inbound port).
import type { EnrollmentPoint, OverviewStats } from './model.js';
import type { DashboardReportRepository, DashboardReportService } from './ports.js';
import type { Logger } from '../../shared/ports.js';
import { noopLogger } from '../../shared/logger.js';

export type DashboardReportServiceParams = {
  repo: DashboardReportRepository;
  logger?: Logger;
};

export class DashboardReportServiceImpl implements DashboardReportService {
  private readonly repo: DashboardReportRepository;
  private readonly logger: Logger;

  constructor(params: DashboardReportServiceParams) {
    this.repo = params.repo;
    this.logger = params.logger ?? noopLogger;
  }

  overview(orgId: string): Promise<OverviewStats> {
    return this.repo.overview(orgId);
  }

  enrollments(orgId: string, days: number): Promise<EnrollmentPoint[]> {
    return this.repo.enrollments(orgId, days);
  }
}
