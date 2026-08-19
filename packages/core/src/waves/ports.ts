// waves context — ports.
import type { Wave, WaveMember } from './model.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';

export interface NewWaveRow {
  id: string;
  name: string;
  courseId: string;
  orgUserIds: string[];
}

/** Outbound port (persistence contract the repository fulfils). */
export interface WaveRepository {
  /** Creates the wave and its membership rows in one write. The org users
   *  referenced must already exist — ingestion provisions them first. */
  insert(orgId: string, input: NewWaveRow): Promise<Wave>;
  findById(orgId: string, id: string): Promise<Wave | null>;
  list(orgId: string): Promise<Wave[]>;
  listMembers(orgId: string, waveId: string): Promise<WaveMember[]>;
}

/** The course an Ola is inscribed in; content owns it, waves only checks it
 *  exists in the org before ingesting. */
export interface WaveCourseReader {
  getCourse(orgId: string, courseId: string): Promise<{ id: string } | null>;
}

export interface WaveTxScope {
  waves: WaveRepository;
  outbox: OutboxAppender;
}

export type WaveUnitOfWork = UnitOfWork<WaveTxScope>;
