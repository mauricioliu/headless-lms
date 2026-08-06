import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { UnitOfWork } from '@headless-lms/core/shared/ports';
import type { Tx } from './client.js';

export class DrizzleUnitOfWork<Scope> implements UnitOfWork<Scope> {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly makeScope: (tx: Tx) => Scope,
  ) {}

  run<T>(fn: (scope: Scope) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(this.makeScope(tx)));
  }
}
