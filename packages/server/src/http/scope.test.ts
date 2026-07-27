import { describe, it, expect } from 'vitest';
import { resolveScope, NoActiveOrgError } from './scope.js';
import type { Container } from '../app/container.js';
import type { FastifyRequest } from 'fastify';

function container(opts: {
  org?: { id: string; name: string; slug: string } | null;
  user?: { id: string } | null;
  // Keyed `${orgId}:${userId}` — the resolver must ask for a specific org.
  orgUsers?: Record<string, { id: string; orgId: string; role: string }>;
}): Container {
  return {
    organizations: {
      getByExternalId: async () => opts.org ?? null,
      getOrgUser: async (orgId: string, userId: string) =>
        opts.orgUsers?.[`${orgId}:${userId}`] ?? null,
    },
    identity: { getUserByExternalId: async () => opts.user ?? null },
    requestContext: {
      run: (_fields: unknown, fn: () => void) => fn(),
      set: () => {},
      current: () => ({}),
    },
  } as unknown as Container;
}

const req = (authUser: unknown, orgId: string | null = 'ext_org_1') =>
  ({ authUser, orgId }) as unknown as FastifyRequest;

const acme = { id: 'org_1', name: 'Acme', slug: 'acme' };
const owner = { 'org_1:usr_1': { id: 'orm_1', orgId: 'org_1', role: 'owner' } };

describe('resolveScope', () => {
  it('resolves the acting participation for the session active org', async () => {
    const scope = await resolveScope(
      container({ org: acme, user: { id: 'usr_1' }, orgUsers: owner }),
      req({ id: 'ext_1' }),
    );
    expect(scope).toEqual({
      orgId: 'org_1',
      userId: 'usr_1',
      orgUserId: 'orm_1',
      role: 'owner',
      authOrgId: 'ext_org_1',
    });
  });

  it('picks the role held in the active org, not in some other org', async () => {
    const scope = await resolveScope(
      container({
        org: acme,
        user: { id: 'usr_1' },
        orgUsers: {
          'org_other:usr_1': { id: 'orm_other', orgId: 'org_other', role: 'owner' },
          'org_1:usr_1': { id: 'orm_1', orgId: 'org_1', role: 'instructor' },
        },
      }),
      req({ id: 'ext_1' }),
    );
    expect(scope.orgUserId).toBe('orm_1');
    expect(scope.role).toBe('instructor');
  });

  it('rejects a student participation — the back office is staff-only', async () => {
    await expect(
      resolveScope(
        container({
          org: acme,
          user: { id: 'usr_1' },
          orgUsers: { 'org_1:usr_1': { id: 'orm_1', orgId: 'org_1', role: 'student' } },
        }),
        req({ id: 'ext_1' }),
      ),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
  });

  it('throws when the session user participates in no org', async () => {
    await expect(
      resolveScope(container({ org: acme, user: { id: 'usr_1' }, orgUsers: {} }), req({ id: 'ext_1' })),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
  });

  it('throws when the person participates only in a different org', async () => {
    await expect(
      resolveScope(
        container({
          org: acme,
          user: { id: 'usr_1' },
          orgUsers: { 'org_other:usr_1': { id: 'orm_x', orgId: 'org_other', role: 'owner' } },
        }),
        req({ id: 'ext_1' }),
      ),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
  });

  it('throws NoActiveOrgError when there is no session user', async () => {
    await expect(resolveScope(container({ org: acme }), req(undefined))).rejects.toBeInstanceOf(
      NoActiveOrgError,
    );
  });

  it('throws NoActiveOrgError when the session carries no active org', async () => {
    await expect(
      resolveScope(container({ org: acme, user: { id: 'usr_1' }, orgUsers: owner }), req({ id: 'ext_1' }, null)),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
  });

  it('throws NoActiveOrgError when the active org is not found', async () => {
    await expect(
      resolveScope(container({ org: null, user: { id: 'usr_1' }, orgUsers: owner }), req({ id: 'ext_1' })),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
  });

  it('throws NoActiveOrgError when there is no domain user for the session user', async () => {
    await expect(
      resolveScope(container({ org: acme, user: null, orgUsers: owner }), req({ id: 'ext_1' })),
    ).rejects.toBeInstanceOf(NoActiveOrgError);
  });
});
