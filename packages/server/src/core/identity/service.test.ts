import { describe, it, expect } from 'vitest';
import { IdentityServiceImpl } from './service.js';
import type { AuthAccountWriter, IdentityRepository } from './ports.js';
import type { User } from './model.js';
import type { CreateUserInput } from './types.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';

/** Records the mirror writes so a test can assert the auth side moved — or,
 *  just as importantly, that it was left alone. */
function fakeAuthAccounts() {
  const writes: { externalId: string; email: string }[] = [];
  const authAccounts: AuthAccountWriter = {
    async updateEmail(externalId: string, email: string) {
      writes.push({ externalId, email });
    },
  };
  return { authAccounts, writes };
}

function fakeRepo() {
  const users: User[] = [];
  let n = 0;
  const repo: IdentityRepository = {
    async insertUser(input: CreateUserInput) {
      const row: User = {
        id: input.id ?? `u${++n}`,
        externalId: input.externalId ?? null,
        email: input.email,
        displayName: input.displayName,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      };
      users.push(row);
      return row;
    },
    async updateUser(id: string, input) {
      const i = users.findIndex((r) => r.id === id);
      if (i < 0) {
        return null;
      }
      users[i] = { ...users[i]!, ...input };
      return users[i]!;
    },
    async setExternalId(userId: string, externalId: string) {
      const i = users.findIndex((r) => r.id === userId);
      if (i < 0) {
        return null;
      }
      users[i] = { ...users[i]!, externalId };
      return users[i]!;
    },
    async findUserById(id: string) {
      return users.find((r) => r.id === id) ?? null;
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

describe('IdentityService.provisionUser', () => {
  it('inserts an unlinked person the first time an address is named', async () => {
    const { repo, rows } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    const user = await svc.provisionUser({
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    expect(user).toMatchObject({
      email: 'ada@example.com',
      displayName: 'Ada Lovelace',
      firstName: 'Ada',
      lastName: 'Lovelace',
      // Known to an org is not the same as able to sign in.
      externalId: null,
    });
    expect(rows).toHaveLength(1);
  });

  it('is idempotent — one address is one person', async () => {
    const { repo, rows } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    const first = await svc.provisionUser({ email: 'ada@example.com', firstName: 'Ada' });
    const second = await svc.provisionUser({ email: 'Ada@Example.com', firstName: 'Other' });
    expect(second.id).toBe(first.id);
    expect(rows).toHaveLength(1);
  });

  it('falls back to the address when no name was given', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    const user = await svc.provisionUser({ email: 'ada@example.com' });
    expect(user.displayName).toBe('ada');
  });
});

describe('IdentityService.linkUser', () => {
  it('attaches an auth account to a person provisioned before they had one', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    const person = await svc.provisionUser({ email: 'ada@example.com', firstName: 'Ada' });
    const linked = await svc.linkUser(person.id, 'auth-1');
    expect(linked.externalId).toBe('auth-1');
    expect(await svc.getUserByExternalId('auth-1')).toMatchObject({ id: person.id });
  });

  it('is idempotent for the same account', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    const person = await svc.provisionUser({ email: 'ada@example.com' });
    await svc.linkUser(person.id, 'auth-1');
    await expect(svc.linkUser(person.id, 'auth-1')).resolves.toMatchObject({
      externalId: 'auth-1',
    });
  });

  it('refuses a second, different account — that would merge two humans', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    const person = await svc.provisionUser({ email: 'ada@example.com' });
    await svc.linkUser(person.id, 'auth-1');
    await expect(svc.linkUser(person.id, 'auth-2')).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws when there is no such person', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    await expect(svc.linkUser('nobody', 'auth-1')).rejects.toThrow(/no person/);
  });
});

describe('IdentityService.updateUser', () => {
  it('recomposes the display name from the edited halves', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    const person = await svc.provisionUser({
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    const updated = await svc.updateUser(person.id, { lastName: 'Byron' });
    expect(updated).toMatchObject({
      firstName: 'Ada',
      lastName: 'Byron',
      displayName: 'Ada Byron',
    });
  });

  it('moves the auth account when a linked person changes address', async () => {
    const { repo } = fakeRepo();
    const { authAccounts, writes } = fakeAuthAccounts();
    const svc = new IdentityServiceImpl(repo, undefined, authAccounts);
    const person = await svc.createUser({
      externalId: 'auth-1',
      email: 'old@example.com',
      displayName: 'Ada',
    });

    const updated = await svc.updateUser(person.id, { email: 'new@example.com' });

    expect(updated.email).toBe('new@example.com');
    expect(writes).toEqual([{ externalId: 'auth-1', email: 'new@example.com' }]);
  });

  it('leaves the auth side alone for a person who has no account yet', async () => {
    const { repo } = fakeRepo();
    const { authAccounts, writes } = fakeAuthAccounts();
    const svc = new IdentityServiceImpl(repo, undefined, authAccounts);
    const person = await svc.provisionUser({ email: 'invited@example.com' });

    await svc.updateUser(person.id, { email: 'corrected@example.com' });

    expect(writes).toEqual([]);
  });

  it('does not touch the auth side when only the names change', async () => {
    const { repo } = fakeRepo();
    const { authAccounts, writes } = fakeAuthAccounts();
    const svc = new IdentityServiceImpl(repo, undefined, authAccounts);
    const person = await svc.createUser({
      externalId: 'auth-1',
      email: 'ada@example.com',
      displayName: 'Ada',
    });

    await svc.updateUser(person.id, { firstName: 'Ada', lastName: 'Lovelace' });

    expect(writes).toEqual([]);
  });

  it('refuses an address that already belongs to somebody else', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    await svc.provisionUser({ email: 'taken@example.com' });
    const person = await svc.provisionUser({ email: 'ada@example.com' });

    await expect(svc.updateUser(person.id, { email: 'Taken@Example.com' })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('accepts the address the person already holds — a no-op is not a collision', async () => {
    const { repo } = fakeRepo();
    const { authAccounts, writes } = fakeAuthAccounts();
    const svc = new IdentityServiceImpl(repo, undefined, authAccounts);
    const person = await svc.createUser({
      externalId: 'auth-1',
      email: 'ada@example.com',
      displayName: 'Ada',
    });

    await expect(
      svc.updateUser(person.id, { email: 'Ada@Example.com', firstName: 'Ada' }),
    ).resolves.toMatchObject({ email: 'ada@example.com' });
    expect(writes).toEqual([]);
  });

  it('throws when there is no such person', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    await expect(svc.updateUser('nobody', { firstName: 'A' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
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

describe('IdentityService.getUserByExternalId', () => {
  it('resolves an auth account to its person, or null', async () => {
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo);
    await svc.createUser({ externalId: 'auth-1', email: 'a@b.c', displayName: 'Ada' });
    expect(await svc.getUserByExternalId('auth-1')).toMatchObject({ email: 'a@b.c' });
    expect(await svc.getUserByExternalId('auth-nope')).toBeNull();
  });
});

describe('logging', () => {
  it('distinguishes a registration from a provisioning', async () => {
    const { createCapturingLogger } = await import('../shared/logger.js');
    const { logger, entries } = createCapturingLogger();
    const { repo } = fakeRepo();
    const svc = new IdentityServiceImpl(repo, logger);

    const registered = await svc.createUser({
      externalId: 'auth-1',
      email: 'a@b.c',
      displayName: 'A',
    });
    const provisioned = await svc.provisionUser({ email: 'jane@example.com' });

    expect(entries).toEqual([
      {
        level: 'info',
        msg: 'user registered',
        meta: { userId: registered.id, externalId: 'auth-1' },
      },
      { level: 'info', msg: 'user provisioned', meta: { userId: provisioned.id } },
    ]);
  });
});
