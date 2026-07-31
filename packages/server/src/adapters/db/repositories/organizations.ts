// organizations — Drizzle repository (implements the core outbound port).
import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { NewInviteRow, OrganizationsRepository } from '../../../core/organizations/ports.js';
import type { Invite, Organization, OrgUser } from '../../../core/organizations/model.js';
import { normalizeRole, parseRole } from '../../../core/organizations/index.js';
import type {
  AddOrgUserInput,
  CreateOrganizationInput,
  CreateOrgUserInput,
  UpdateOrganizationInput,
} from '../../../core/organizations/types.js';
import { invites, organizations, orgUsers } from '../schema/organizations.js';
import { progressRecords } from '../schema/progress.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';
import { ConflictError } from '../../../core/shared/errors.js';
import { isUniqueViolation } from './pg-errors.js';

const INVITE_STATUSES = ['pending', 'accepted', 'rejected', 'canceled'] as const;
type InviteStatus = (typeof INVITE_STATUSES)[number];
const toStatus = (s: string): InviteStatus =>
  (INVITE_STATUSES as readonly string[]).includes(s) ? (s as InviteStatus) : 'pending';

// The Invite DTO deliberately omits token_hash — the row shape flows into
// domain events, and the hash must never leave the persistence layer.
function toInvite(row: typeof invites.$inferSelect): Invite {
  return {
    id: row.id,
    orgId: row.orgId,
    email: row.email,
    role: row.role,
    status: row.status,
    invitedBy: row.invitedBy,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export class DrizzleOrganizationsRepository implements OrganizationsRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  async create(input: CreateOrganizationInput): Promise<Organization> {
    const [row] = await this.db
      .insert(organizations)
      .values({
        externalId: input.externalId,
        name: input.name,
        slug: input.slug,
        ownerId: input.ownerId,
      })
      .returning();
    if (!row) {
      throw new Error('failed to insert organization');
    }
    return row;
  }

  async updateByExternalId(
    externalId: string,
    input: UpdateOrganizationInput,
  ): Promise<Organization | null> {
    const [row] = await this.db
      .update(organizations)
      .set({ name: input.name, slug: input.slug })
      .where(eq(organizations.externalId, externalId))
      .returning();
    return row ?? null;
  }

  async findById(id: string): Promise<Organization | null> {
    const [row] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByExternalId(externalId: string): Promise<Organization | null> {
    const [row] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.externalId, externalId))
      .limit(1);
    return row ?? null;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const [row] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);
    return row ?? null;
  }

  // Mirrors better-auth's member record onto the org user. The row usually
  // already exists — invite acceptance creates it, and only then does the
  // auth-side member get added — so this reconciles the role on `(org, user)`,
  // which is also what makes a re-fired hook idempotent.
  async upsertOrgUser(orgId: string, input: AddOrgUserInput): Promise<OrgUser> {
    const role = normalizeRole(input.role);
    const [row] = await this.db
      .insert(orgUsers)
      .values({ orgId, userId: input.userId, role })
      .onConflictDoUpdate({ target: [orgUsers.orgId, orgUsers.userId], set: { role } })
      .returning();
    if (!row) {
      throw new Error('failed to upsert orgUser');
    }
    return { ...row, role: parseRole(row.role) };
  }

  async upsertPendingInvite(orgId: string, input: NewInviteRow): Promise<Invite> {
    const [row] = await this.db
      .insert(invites)
      .values({
        orgId,
        email: input.email,
        role: input.role,
        status: 'pending',
        invitedBy: input.invitedBy,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      })
      .onConflictDoUpdate({
        target: [invites.orgId, invites.email],
        targetWhere: sql`${invites.status} = 'pending'`,
        set: {
          role: input.role,
          invitedBy: input.invitedBy,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        },
      })
      .returning();
    if (!row) {
      throw new Error('failed to upsert invite');
    }
    return toInvite(row);
  }

  async setInviteStatus(orgId: string, id: string, status: string): Promise<void> {
    await this.db
      .update(invites)
      .set({ status: toStatus(status) })
      .where(and(eq(invites.orgId, orgId), eq(invites.id, id)));
  }

  async findInviteByTokenHash(tokenHash: string): Promise<Invite | null> {
    const [row] = await this.db
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, tokenHash))
      .limit(1);
    return row ? toInvite(row) : null;
  }

  async findOrgUser(orgId: string, userId: string): Promise<OrgUser | null> {
    const [row] = await this.db
      .select()
      .from(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.userId, userId)))
      .limit(1);
    return row ? { ...row, role: parseRole(row.role) } : null;
  }

  // Every organization this person belongs to. What the org switcher lists;
  // callers with no active org decide for themselves what to do when there is
  // more than one.
  async findOrgUsersByUser(userId: string): Promise<OrgUser[]> {
    const rows = await this.db
      .select()
      .from(orgUsers)
      .where(eq(orgUsers.userId, userId))
      .orderBy(orgUsers.createdAt);
    return rows.map((row) => ({ ...row, role: parseRole(row.role) }));
  }

  async findOrgUserById(orgId: string, id: string): Promise<OrgUser | null> {
    const [row] = await this.db
      .select()
      .from(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.id, id)))
      .limit(1);
    return row ? { ...row, role: parseRole(row.role) } : null;
  }

  // Throws ConflictError when the person already holds a row in this org —
  // `(org_id, user_id)` is unique. Translating here keeps core free of Postgres
  // error codes; the service treats it as a refusal.
  async createOrgUser(input: CreateOrgUserInput): Promise<OrgUser> {
    try {
      const [row] = await this.db
        .insert(orgUsers)
        .values({
          orgId: input.orgId,
          userId: input.userId,
          role: input.role,
          status: input.status ?? 'active',
        })
        .returning();
      if (!row) {
        throw new Error('failed to insert org user');
      }
      return { ...row, role: parseRole(row.role) };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('That account already belongs to this organization');
      }
      throw err;
    }
  }

  // Insert-or-promote on `(org_id, user_id)`. `created` is what the caller
  // needs to fire student.created exactly once across an invite and the
  // acceptance that follows it. Promotion is one-way — an 'active' row is
  // never demoted back to 'invited' by a re-invite.
  async ensureOrgUser(input: CreateOrgUserInput): Promise<{ orgUser: OrgUser; created: boolean }> {
    const status = input.status ?? 'active';
    const [inserted] = await this.db
      .insert(orgUsers)
      .values({
        orgId: input.orgId,
        userId: input.userId,
        role: input.role,
        status,
      })
      .onConflictDoNothing({ target: [orgUsers.orgId, orgUsers.userId] })
      .returning();
    if (inserted) {
      return { orgUser: { ...inserted, role: parseRole(inserted.role) }, created: true };
    }

    const where = and(eq(orgUsers.orgId, input.orgId), eq(orgUsers.userId, input.userId));
    // Only an acceptance writes. A re-invite asks for 'invited' against a row
    // that already exists, and has nothing to say about it.
    const [existing] =
      status === 'active'
        ? await this.db.update(orgUsers).set({ status }).where(where).returning()
        : await this.db.select().from(orgUsers).where(where).limit(1);
    if (!existing) {
      throw new Error('failed to ensure org user');
    }
    return { orgUser: { ...existing, role: parseRole(existing.role) }, created: false };
  }

  async findStudentOrgUsers(userId: string): Promise<OrgUser[]> {
    const rows = await this.db
      .select()
      .from(orgUsers)
      .where(and(eq(orgUsers.userId, userId), eq(orgUsers.role, 'student')))
      .orderBy(orgUsers.createdAt);
    return rows.map((row) => ({ ...row, role: parseRole(row.role) }));
  }

  async cancelPendingInvite(orgId: string, email: string): Promise<Invite | null> {
    const [row] = await this.db
      .update(invites)
      .set({ status: 'canceled' })
      .where(
        and(
          eq(invites.orgId, orgId),
          sql`lower(${invites.email}) = lower(${email})`,
          eq(invites.status, 'pending'),
        ),
      )
      .returning();
    return row ? toInvite(row) : null;
  }

  async deleteOrgUser(orgId: string, id: string): Promise<boolean> {
    // progress_records is deleted first so the org user's FK has nothing
    // pointing at it when the row goes.
    await this.db
      .delete(progressRecords)
      .where(and(eq(progressRecords.orgId, orgId), eq(progressRecords.orgUserId, id)));
    const rows = await this.db
      .delete(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.id, id)))
      .returning({ id: orgUsers.id });
    return rows.length > 0;
  }
}
