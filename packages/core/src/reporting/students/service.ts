// reporting/students — service implementation (inbound port).
import type { Page, Student, StudentAnalytics, StudentsQuery } from './model.js';
import type { StudentsReportRepository, StudentsReportService } from './ports.js';
import type { Logger } from '../../shared/ports.js';
import { noopLogger } from '../../shared/logger.js';

export type StudentsReportServiceParams = {
  repo: StudentsReportRepository;
  logger?: Logger;
};

export class StudentsReportServiceImpl implements StudentsReportService {
  private readonly repo: StudentsReportRepository;
  private readonly logger: Logger;

  constructor(params: StudentsReportServiceParams) {
    this.repo = params.repo;
    this.logger = params.logger ?? noopLogger;
  }

  list(orgId: string, query: StudentsQuery): Promise<Page<Student>> {
    return this.repo.list(orgId, query);
  }

  get(orgId: string, id: string): Promise<Student | null> {
    return this.repo.findById(orgId, id);
  }

  analytics(orgId: string, id: string): Promise<StudentAnalytics | null> {
    return this.repo.analytics(orgId, id);
  }
}
