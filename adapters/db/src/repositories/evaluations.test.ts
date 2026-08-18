import { describe, it, expect, vi } from 'vitest';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { NotFoundError } from '@headless-lms/core/shared/errors';
import type { ReplaceEvaluationInput } from '@headless-lms/core/evaluation';
import { DrizzleEvaluationRepository } from './evaluations.js';
import { DbQueryError } from './pg-errors.js';

const COURSES_FK = 'evaluations_org_id_course_id_courses_org_id_id_fk';

const input: ReplaceEvaluationInput = {
  cutoff: 70,
  feedbackMode: 'score_only',
  questions: [
    {
      id: 'q1',
      prompt: '¿Pregunta?',
      options: [
        { id: 'o1', text: 'Una' },
        { id: 'o2', text: 'Dos' },
      ],
      correctOptionId: 'o1',
    },
  ],
};

function pgForeignKeyViolation(constraint = COURSES_FK): Error {
  return Object.assign(
    new Error('insert or update on table "evaluations" violates foreign key constraint'),
    { code: '23503', constraint, table: 'evaluations' },
  );
}

function drizzleWrapped(cause: Error): Error {
  return Object.assign(new Error('Failed query: insert into "evaluations"'), {
    cause,
    query: 'insert into "evaluations" ...',
    params: [],
  });
}

function repoFailingWith(err: unknown): DrizzleEvaluationRepository {
  const returning = vi.fn().mockRejectedValue(err);
  const onConflictDoUpdate = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  const db = { insert } as unknown as NodePgDatabase;
  return new DrizzleEvaluationRepository(db);
}

describe('DrizzleEvaluationRepository.replace — course FK race', () => {
  it('maps a raw courses FK violation to NotFoundError', async () => {
    const repo = repoFailingWith(pgForeignKeyViolation());
    const err = await repo
      .replace('org_1', 'course_gone', input)
      .catch((thrown: unknown) => thrown);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).toMatchObject({ resource: 'Course', id: 'course_gone' });
  });

  it('maps the FK violation when drizzle wraps it behind cause', async () => {
    const repo = repoFailingWith(drizzleWrapped(pgForeignKeyViolation()));
    await expect(repo.replace('org_1', 'course_gone', input)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('keeps a FK violation on another constraint internal (DbQueryError)', async () => {
    const repo = repoFailingWith(drizzleWrapped(pgForeignKeyViolation('evaluations_other_fk')));
    await expect(repo.replace('org_1', 'course_gone', input)).rejects.toBeInstanceOf(
      DbQueryError,
    );
  });
});
