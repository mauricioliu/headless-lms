// reporting/students — read model over identity + entitlements + progress. Framework-free.
import type { OrgUserProfile, OrgUserStatus } from '../../types/index.js';

export interface Student extends OrgUserProfile {
  /** As typed on the invite form. `name` is the composed rendering name and
   *  drifts once the person edits their own profile; these are what the admin
   *  edits. Null for anyone who arrived by self-signup. */
  firstName: string | null;
  lastName: string | null;
  entitlementCount: number;
  avgProgress: number;
  /** `invited` until they accept — the admin added them, they have not arrived. */
  status: OrgUserStatus;
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
