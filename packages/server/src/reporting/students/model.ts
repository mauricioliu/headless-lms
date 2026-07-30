// reporting/students — read model over identity + entitlements + progress. Framework-free.
import type { OrgUserProfile } from '@headless-lms/types';

export interface Student extends OrgUserProfile {
  entitlementCount: number;
  avgProgress: number;
  joinedAt: string;
  lastActiveAt: string | null;
}

export interface StudentsQuery {
  page: number;
  pageSize: number;
  search?: string | undefined;
  sort?: string | undefined;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}
