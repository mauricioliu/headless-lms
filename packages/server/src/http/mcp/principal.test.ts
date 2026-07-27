import { describe, it, expect } from 'vitest';
import { buildPrincipal, PrincipalError, type AccessTokenClaims } from './principal.js';
import type { Container } from '../../app/container.js';

// A person who participates in two organizations — the case that used to be
// either guessed at (oldest membership wins) or refused outright.
const PERSON = { id: 'usr_1', email: 'sam@example.com', displayName: 'Sam' };

const ORGS: Record<string, { id: string; externalId: string }> = {
  org_acme: { id: 'o_acme', externalId: 'org_acme' },
  org_globex: { id: 'o_globex', externalId: 'org_globex' },
};

const PARTICIPATIONS: Record<string, { id: string; orgId: string; role: string }> = {
  o_acme: { id: 'ou_acme', orgId: 'o_acme', role: 'owner' },
  o_globex: { id: 'ou_globex', orgId: 'o_globex', role: 'instructor' },
};

function container(overrides: { participations?: typeof PARTICIPATIONS } = {}): Container {
  const participations = overrides.participations ?? PARTICIPATIONS;
  return {
    identity: {
      getUserByExternalId: async (externalId: string) =>
        externalId === 'auth_1' ? PERSON : null,
    },
    organizations: {
      getByExternalId: async (externalId: string) => ORGS[externalId] ?? null,
      getOrgUser: async (orgId: string) => participations[orgId] ?? null,
    },
  } as unknown as Container;
}

const token = (claims: Partial<AccessTokenClaims>): AccessTokenClaims => ({
  sub: 'auth_1',
  scope: 'courses:read progress:read',
  ...claims,
});

describe('buildPrincipal', () => {
  it('acts in the organization the token names, not one inferred from memberships', async () => {
    const principal = await buildPrincipal(token({ org: 'org_globex' }), container());

    expect(principal.orgId).toBe('o_globex');
    expect(principal.orgUserId).toBe('ou_globex');
    expect(principal.role).toBe('instructor');
  });

  it('resolves a different org from the same person when the token says so', async () => {
    const principal = await buildPrincipal(token({ org: 'org_acme' }), container());

    expect(principal.orgId).toBe('o_acme');
    expect(principal.role).toBe('owner');
  });

  it('refuses a token that names no organization', async () => {
    await expect(buildPrincipal(token({}), container())).rejects.toMatchObject({
      status: 403,
      message: 'token is not bound to an organization',
    });
  });

  it('refuses a token naming an organization that does not exist', async () => {
    await expect(
      buildPrincipal(token({ org: 'org_nope' }), container()),
    ).rejects.toBeInstanceOf(PrincipalError);
  });

  it('refuses when the person does not participate in the org the token names', async () => {
    // The token was minted for acme, but this person's participation there is gone.
    const withoutAcme = { o_globex: PARTICIPATIONS.o_globex! };

    await expect(
      buildPrincipal(token({ org: 'org_acme' }), container({ participations: withoutAcme })),
    ).rejects.toMatchObject({
      status: 403,
      message: 'user does not participate in this organization',
    });
  });

  it('rejects a token with no subject', async () => {
    await expect(
      buildPrincipal({ org: 'org_acme', scope: '' }, container()),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('parses the space-separated scope claim', async () => {
    const principal = await buildPrincipal(token({ org: 'org_acme' }), container());

    expect(principal.scopes).toEqual(['courses:read', 'progress:read']);
  });
});
