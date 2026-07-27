import { describe, it, expect } from 'vitest';
import { resolveStudentScope, NoStudentError } from './student-scope.js';
import type { Container } from '../app/container.js';
import type { FastifyRequest } from 'fastify';

function container(opts: {
  person?: { id: string } | null;
  participation?: { id: string; role: string } | null;
  org?: { id: string; name: string; slug: string } | null;
}): Container {
  return {
    organizations: {
      getByExternalId: async () => opts.org ?? null,
      getOrgUser: async () => opts.participation ?? null,
    },
    identity: { getUserByExternalId: async () => opts.person ?? null },
  } as unknown as Container;
}

// The session carries the org (activeOrganizationId → req.orgId), stamped at login.
const req = (authUser: unknown, orgId: string | null = 'ext_org_1') =>
  ({ authUser, orgId }) as unknown as FastifyRequest;

const acme = { id: 'org_1', name: 'Acme', slug: 'acme' };
const person = { id: 'usr_1' };
const student = { id: 'orm_1', role: 'student' };

describe('resolveStudentScope', () => {
  it('resolves { orgUserId, orgId, org } from the session user + session org', async () => {
    const scope = await resolveStudentScope(
      container({ person, participation: student, org: acme }),
      req({ id: 'ext_1' }),
    );
    expect(scope).toEqual({ orgUserId: 'orm_1', orgId: 'org_1', org: acme });
  });

  it('throws NoStudentError when there is no session user', async () => {
    await expect(
      resolveStudentScope(container({ org: acme }), req(undefined)),
    ).rejects.toBeInstanceOf(NoStudentError);
  });

  it('throws NoStudentError when the session carries no org', async () => {
    await expect(
      resolveStudentScope(container({ person, participation: student }), req({ id: 'ext_1' }, null)),
    ).rejects.toBeInstanceOf(NoStudentError);
  });

  it('throws NoStudentError when the session org is not found', async () => {
    await expect(
      resolveStudentScope(container({ person, participation: student, org: null }), req({ id: 'ext_1' })),
    ).rejects.toBeInstanceOf(NoStudentError);
  });

  it('throws NoStudentError when there is no domain person for the account', async () => {
    await expect(
      resolveStudentScope(container({ person: null, org: acme }), req({ id: 'ext_x' })),
    ).rejects.toBeInstanceOf(NoStudentError);
  });

  it('throws NoStudentError when the person does not participate in the org', async () => {
    await expect(
      resolveStudentScope(container({ person, participation: null, org: acme }), req({ id: 'ext_x' })),
    ).rejects.toBeInstanceOf(NoStudentError);
  });

  it('throws NoStudentError when the participation is staff, not a learner', async () => {
    await expect(
      resolveStudentScope(
        container({ person, participation: { id: 'orm_2', role: 'instructor' }, org: acme }),
        req({ id: 'ext_1' }),
      ),
    ).rejects.toBeInstanceOf(NoStudentError);
  });
});
