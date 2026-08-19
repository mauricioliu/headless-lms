// reporting/waves — per-Ola report read model. Framework-free.
// Aggregates only: each Trabajador's avance, standing Evaluación state and
// Completado, plus the Ola-level figures the >80% operational gate is read
// from. The per-Intento detail stays in the append-only registro — it never
// enters this model.
import type {
  WaveReport,
  WaveReportTotals,
  WaveWorkerEvaluationStatus,
  WaveWorkerReport,
} from '../../types/index.js';

export type { WaveReport, WaveReportTotals, WaveWorkerEvaluationStatus, WaveWorkerReport };

/** Raw facts one Trabajador's row derives from. The repository reads them
 *  across waves, progress and evaluation attempts; this service derives every
 *  figure the report shows. */
export interface WaveWorkerFacts {
  orgUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: 'invited' | 'active';
  /** Activity records completed against the Curso's published activities. */
  completedActivities: number;
  /** The Completado conjunction as progress recorded it (course-level record),
   *  or null while not Completado. */
  courseCompletedAt: Date | null;
  /** Submitted Intentos for the Curso. */
  attempts: number;
  /** Score and pass flag of the latest submitted Intento; null = never rendida. */
  latestScore: number | null;
  latestPassed: boolean | null;
}

/** Everything the aggregation needs, read fresh from the domains' data. */
export interface WaveReportData {
  wave: { id: string; name: string; courseId: string; createdAt: Date };
  course: { id: string; title: string; status: 'draft' | 'published' };
  /** Whether the Curso carries an Evaluación (the Completado gate). */
  hasEvaluation: boolean;
  /** Denominator of the avance: the Curso's currently published activities. */
  publishedActivities: number;
  workers: WaveWorkerFacts[];
}
