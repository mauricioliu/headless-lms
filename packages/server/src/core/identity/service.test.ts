import { describe, it, expect } from 'vitest';
import { IdentityServiceImpl } from './service.js';
import type { IdentityRepository } from './ports.js';
import type { User } from './model.js';
import type { CreateUserInput } from './types.js';

function fakeRepo() {
  const users: User[] = [];
  let n = 0;
  const repo: IdentityRepository = {
    async insertUser(input: CreateUserInput) {
      const row: User = { id: `u${++n}`, createdAt: new Date(0), updatedAt: new Date(0), ...input };
      users.push(row);
      return row;
    },
    async findUserByExternalId(externalId: string) {
      return users.find((r) => r.externalId === externalId) ?? null;
    },
    async findUserByEmail(email: string) {
      return users.find((r) => r.email.toLowerCase() === email.toLowerCase()) ?? null;
    },
  };
  return { repo, rows: users };
}

describe('IdentityService.registerUser', () => {
  it('inserts the person on first sight', async () => {
    const { repo, rows } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    const user = await svc.registerUser({
      externalId: 'auth-1',
      email: 'a@b.c',
      displayName: 'Ada Lovelace',
    });
    expect(user.email).toBe('a@b.c');
    expect(rows).toHaveLength(1);
  });

  it('is idempotent — a second call returns the existing row', async () => {
    const { repo, rows } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    const input: CreateUserInput = {
      externalId: 'auth-1',
      email: 'a@b.c',
      displayName: 'Ada Lovelace',
    };
    const first = await svc.registerUser(input);
    const second = await svc.registerUser(input);
    expect(second).toEqual(first);
    expect(rows).toHaveLength(1);
  });
});

describe('IdentityService.getUserByExternalId', () => {
  it('resolves an auth account to its person, or null', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    await svc.registerUser({ externalId: 'auth-1', email: 'a@b.c', displayName: 'Ada' });
    expect(await svc.getUserByExternalId('auth-1')).toMatchObject({ email: 'a@b.c' });
    expect(await svc.getUserByExternalId('auth-nope')).toBeNull();
  });
});

describe('IdentityService.getUserByEmail', () => {
  it('finds the person behind an address regardless of case, or null', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    await svc.createUser({ externalId: 'auth-1', email: 'ada@example.com', displayName: 'Ada' });
    expect(await svc.getUserByEmail('Ada@Example.com')).toMatchObject({ externalId: 'auth-1' });
    expect(await svc.getUserByEmail('nobody@example.com')).toBeNull();
  });
});

describe('logging', () => {
  it('logs registrations at info only when a row is inserted', async () => {
    const { createCapturingLogger } = await import('../shared/logger.js');
    const { logger, entries } = createCapturingLogger();
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo, logger);

    const input: CreateUserInput = { externalId: 'auth-1', email: 'a@b.c', displayName: 'A' };
    const user = await svc.registerUser(input);
    await svc.registerUser(input); // idempotent → no second log

    expect(entries).toEqual([
      { level: 'info', msg: 'user registered', meta: { userId: user.id, externalId: 'auth-1' } },
    ]);
  });
});
