// organizations — Drizzle repository (implements the core outbound port).
import { eq, and, sql, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { OrganizationsRepository } from '../../../core/organizations/ports.js';
import type {
  Organization,
  OrgUser,
  Invitation,
} from '../../../core/organizations/model.js';
import { parseRole, normalizeRole } from '../../../core/organizations/index.js';
import type { NewInvitationRow } from '../../../core/organizations/ports.js';
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  AddOrgUserInput,
  CreateParticipantInput,
} from '../../../core/organizations/types.js';
import {
  organizations,
  orgUsers,
  invitations,
} from '../schema/organizations.js';
import { progressRecords } from '../schema/progress.js';
import type { Logger } from '../../../core/shared/ports.js';
import { noopLogger } from '../../../core/shared/logger.js';
import { ConflictError } from '../../../core/shared/errors.js';
import { isUniqueViolation } from './pg-errors.js';

const INVITATION_STATUSES = ['pending', 'accepted', 'rejected', 'canceled'] as const;
type InvitationStatus = (typeof INVITATION_STATUSES)[number];
const toStatus = (s: string): InvitationStatus =>
  (INVITATION_STATUSES as readonly string[]).includes(s) ? (s as InvitationStatus) : 'pending';

// The Invitation DTO deliberately omits token_hash — the row shape flows into
// domain events, and the hash must never leave the persistence layer.
function toInvitation(row: typeof invitations.$inferSelect): Invitation {
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

  // Mirrors better-auth's member record onto the participation. The row usually
  // already exists — invite acceptance claims or creates it, and only then does
  // the auth-side member get added — so this stamps `external_id` onto it
  // rather than inserting a second participation for the same person.
  async upsertOrgUser(orgId: string, input: AddOrgUserInput): Promise<OrgUser> {
    const [claimed] = await this.db
      .update(orgUsers)
      .set({ externalId: input.externalId, role: normalizeRole(input.role) })
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.userId, input.userId)))
      .returning();
    if (claimed) {
      return { ...claimed, role: parseRole(claimed.role) };
    }
    // No participation yet: org creation mirrors the creator's membership
    // before any invite flow has run.
    const [inserted] = await this.db
      .insert(orgUsers)
      .values({
        orgId,
        userId: input.userId,
        role: normalizeRole(input.role),
        externalId: input.externalId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
      })
      .onConflictDoNothing({ target: orgUsers.externalId })
      .returning();
    if (inserted) {
      return { ...inserted, role: parseRole(inserted.role) };
    }
    // Already mirrored (hook fired more than once) — return the existing row.
    const [existing] = await this.db
      .select()
      .from(orgUsers)
      .where(eq(orgUsers.externalId, input.externalId))
      .limit(1);
    if (!existing) {
      throw new Error('failed to upsert orgUser');
    }
    return { ...existing, role: parseRole(existing.role) };
  }

  async deleteOrgUserByExternalId(externalId: string): Promise<void> {
    await this.db.delete(orgUsers).where(eq(orgUsers.externalId, externalId));
  }

  async upsertPendingInvitation(orgId: string, input: NewInvitationRow): Promise<Invitation> {
    const [row] = await this.db
      .insert(invitations)
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
        target: [invitations.orgId, invitations.email],
        targetWhere: sql`${invitations.status} = 'pending'`,
        set: {
          role: input.role,
          invitedBy: input.invitedBy,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        },
      })
      .returning();
    if (!row) {
      throw new Error('failed to upsert invitation');
    }
    return toInvitation(row);
  }

  async setInvitationStatus(orgId: string, id: string, status: string): Promise<void> {
    await this.db
      .update(invitations)
      .set({ status: toStatus(status) })
      .where(and(eq(invitations.orgId, orgId), eq(invitations.id, id)));
  }

  async findInvitationByTokenHash(tokenHash: string): Promise<Invitation | null> {
    const [row] = await this.db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, tokenHash))
      .limit(1);
    return row ? toInvitation(row) : null;
  }

  async findOrgUser(orgId: string, userId: string): Promise<OrgUser | null> {
    const [row] = await this.db
      .select()
      .from(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.userId, userId)))
      .limit(1);
    return row ? { ...row, role: parseRole(row.role) } : null;
  }

  // Every organization this person participates in. What the org switcher
  // lists; callers with no active org decide for themselves what to do when
  // there is more than one.
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

  async findOrgUserByEmail(orgId: string, email: string): Promise<OrgUser | null> {
    const [row] = await this.db
      .select()
      .from(orgUsers)
      .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.email, email)))
      .limit(1);
    return row ? { ...row, role: parseRole(row.role) } : null;
  }

  async insertPendingOrgUser(input: CreateParticipantInput): Promise<OrgUser> {
    try {
      const [row] = await this.db
        .insert(orgUsers)
        .values({
          orgId: input.orgId,
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          role: input.role,
        })
        .returning();
      if (!row) {
        throw new Error('failed to insert org user');
      }
      return { ...row, role: parseRole(row.role) };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('A participant with this email already exists');
      }
      throw err;
    }
  }

  async deleteOrgUser(orgId: string, id: string): Promise<boolean> {
    // progress_records is deleted first so the participation's FK has nothing
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

  // Throws ConflictError when the person already holds a participation in this
  // org — `(org_id, user_id)` is unique. Translating here keeps core free of
  // Postgres error codes; the service treats it as a refusal.
  async claimOrgUser(orgId: string, email: string, userId: string): Promise<number> {
    try {
      const rows = await this.db
        .update(orgUsers)
        .set({ userId })
        .where(and(eq(orgUsers.orgId, orgId), eq(orgUsers.email, email), isNull(orgUsers.userId)))
        .returning({ id: orgUsers.id });
      return rows.length;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('That account already belongs to this organization');
      }
      throw err;
    }
  }
}
