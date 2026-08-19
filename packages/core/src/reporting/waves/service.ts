// reporting/waves — service implementation (inbound port).
// The repository reads the domains' raw facts; this service is where the
// report's every visible figure is derived — avance against the current
// published structure, the standing Evaluación state, Completado read back
// from progress's own record, and the Ola aggregates.
import type {
  WaveReport,
  WaveReportTotals,
  WaveWorkerEvaluationStatus,
  WaveWorkerFacts,
  WaveWorkerReport,
} from './model.js';
import type { WaveReportRepository, WaveReportService } from './ports.js';
import type { Logger } from '../../shared/ports.js';
import { noopLogger } from '../../shared/logger.js';

/** The standing Evaluación state of one Trabajador. A latest Intento that
 *  passed approves; below 100% avance the rendir gate blocks; at 100% with no
 *  Intento rendered it pends; rendered but not passed, the last Intento stands. */
function evaluationStatus(
  facts: WaveWorkerFacts,
  progress: number,
  hasEvaluation: boolean,
): WaveWorkerEvaluationStatus {
  if (!hasEvaluation) {
    return 'no_evaluation';
  }
  if (facts.latestPassed === true) {
    return 'approved';
  }
  if (progress < 100) {
    return 'blocked';
  }
  return facts.attempts === 0 ? 'pending' : 'last_attempt';
}

/** Avance: completed activity records against the Curso's currently published
 *  activities, rounded to a whole percent. No published structure reads 0. */
function avancePercent(facts: WaveWorkerFacts, publishedActivities: number): number {
  if (publishedActivities === 0) {
    return 0;
  }
  return Math.round((facts.completedActivities / publishedActivities) * 100);
}

export type WaveReportServiceParams = {
  repo: WaveReportRepository;
  logger?: Logger;
};

export class WaveReportServiceImpl implements WaveReportService {
  private readonly repo: WaveReportRepository;
  private readonly logger: Logger;

  constructor(params: WaveReportServiceParams) {
    this.repo = params.repo;
    this.logger = params.logger ?? noopLogger;
  }

  async report(orgId: string, waveId: string): Promise<WaveReport | null> {
    const data = await this.repo.load(orgId, waveId);
    if (!data) {
      return null;
    }

    const workers: WaveWorkerReport[] = data.workers.map((facts) => {
      const progress = avancePercent(facts, data.publishedActivities);
      return {
        orgUserId: facts.orgUserId,
        email: facts.email,
        firstName: facts.firstName,
        lastName: facts.lastName,
        status: facts.status,
        progress,
        evaluationStatus: evaluationStatus(facts, progress, data.hasEvaluation),
        score: facts.latestScore,
        attempts: facts.attempts,
        completed: facts.courseCompletedAt !== null,
      };
    });

    return {
      wave: data.wave,
      course: data.course,
      totals: totalsOf(workers),
      workers,
    };
  }
}

/** Ola aggregates over the workers' standing rows. `avgScore` spans only the
 *  Trabajadores who have rendido (it describes evidence quality, not coverage);
 *  `avgAttempts` spans every member (work spent per inscribed Trabajador). */
function totalsOf(workers: WaveWorkerReport[]): WaveReportTotals {
  const members = workers.length;
  const completed = workers.filter((w) => w.completed).length;
  const attempted = workers.filter((w) => w.attempts > 0);
  const attemptSum = workers.reduce((sum, w) => sum + w.attempts, 0);
  const scoreSum = attempted.reduce((sum, w) => sum + (w.score ?? 0), 0);
  const progressSum = workers.reduce((sum, w) => sum + w.progress, 0);
  return {
    members,
    completed,
    completedRate: members > 0 ? Math.round((completed / members) * 100) : 0,
    avgProgress: members > 0 ? Math.round(progressSum / members) : 0,
    avgScore: attempted.length > 0 ? Math.round(scoreSum / attempted.length) : null,
    avgAttempts: members > 0 ? Math.round((attemptSum / members) * 10) / 10 : 0,
  };
}
