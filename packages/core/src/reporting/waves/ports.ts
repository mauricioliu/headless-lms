// reporting/waves — ports.
import type { WaveReport, WaveReportData } from './model.js';

export interface WaveReportService {
  /** The per-Ola report for the Admin Cliente, or null when the Ola does not
   *  exist in the org. */
  report(orgId: string, waveId: string): Promise<WaveReport | null>;
}

export interface WaveReportRepository {
  /** Reads the report's raw facts across waves, progress and evaluation
   *  attempts — the one read allowed to cross contexts. */
  load(orgId: string, waveId: string): Promise<WaveReportData | null>;
}
