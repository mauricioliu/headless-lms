// reporting/students — ports.
import type { Page, Student, StudentAnalytics, StudentsQuery } from './model.js';

export interface StudentsReportService {
  list(orgId: string, query: StudentsQuery): Promise<Page<Student>>;
  get(orgId: string, id: string): Promise<Student | null>;
  analytics(orgId: string, id: string): Promise<StudentAnalytics | null>;
}

export interface StudentsReportRepository {
  list(orgId: string, query: StudentsQuery): Promise<Page<Student>>;
  findById(orgId: string, id: string): Promise<Student | null>;
  analytics(orgId: string, id: string): Promise<StudentAnalytics | null>;
}
