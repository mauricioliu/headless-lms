export type {
  ProgressTargetType,
} from "./schemas/progress.js";
import type { ProgressTargetType } from "./schemas/progress.js";

export type ProgressId = string;

export interface ProgressRecord {
  readonly id: string;
  readonly orgId: string;
  readonly orgUserId: string;
  readonly targetType: ProgressTargetType;
  readonly targetId: string;
  startedAt: string;
  position: unknown | null;
  completedAt: string | null;
}

export interface ProgressTarget {
  orgUserId: string;
  targetType: ProgressTargetType;
  targetId: string;
}

export interface ProgressReportItem {
  asset?: string;
  completed?: boolean;
  [key: string]: unknown;
}

export interface ReportProgressInput {
  orgUserId: string;
  activityId: string;
  reports: ProgressReportItem[];
}
