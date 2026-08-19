// waves — Drizzle repository (implements the core outbound port).
import { and, asc, count, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Logger } from "@headless-lms/core/shared/ports";
import { noopLogger } from "@headless-lms/core/shared/logger";
import type { Wave, WaveMember } from "@headless-lms/core/waves";
import type { NewWaveRow, WaveRepository } from "@headless-lms/core/waves";
import { orgUsers, users, waveMembers, waves } from "../schema/index.js";
import { translateDbErrors } from "./pg-errors.js";

function toWave(row: typeof waves.$inferSelect, memberCount: number): Wave {
  return {
    orgId: row.orgId,
    id: row.id,
    name: row.name,
    courseId: row.courseId,
    memberCount,
    createdAt: row.createdAt,
  };
}

export class DrizzleWaveRepository implements WaveRepository {
  constructor(
    private readonly db: NodePgDatabase,
    private readonly logger: Logger = noopLogger,
  ) {}

  /** Both statements land in the caller's transaction — the wave row and its
   *  membership appear together (the service runs this inside its uow). */
  async insert(orgId: string, input: NewWaveRow): Promise<Wave> {
    const [row] = await this.db
      .insert(waves)
      .values({ orgId, id: input.id, name: input.name, courseId: input.courseId })
      .returning();
    if (!row) {
      throw new Error("failed to insert wave");
    }
    if (input.orgUserIds.length > 0) {
      await this.db
        .insert(waveMembers)
        .values(
          input.orgUserIds.map((orgUserId) => ({
            orgId,
            waveId: input.id,
            orgUserId,
          })),
        )
        .onConflictDoNothing();
    }
    this.logger.debug("wave.insert", { orgId, waveId: input.id });
    return toWave(row, input.orgUserIds.length);
  }

  async findById(orgId: string, id: string): Promise<Wave | null> {
    const [row] = await this.db
      .select({ wave: waves, memberCount: count(waveMembers.orgUserId) })
      .from(waves)
      .leftJoin(waveMembers, eq(waveMembers.waveId, waves.id))
      .where(and(eq(waves.orgId, orgId), eq(waves.id, id)))
      .groupBy(waves.orgId, waves.id);
    if (!row) {
      return null;
    }
    return toWave(row.wave, Number(row.memberCount));
  }

  async list(orgId: string): Promise<Wave[]> {
    const rows = await this.db
      .select({ wave: waves, memberCount: count(waveMembers.orgUserId) })
      .from(waves)
      .leftJoin(waveMembers, eq(waveMembers.waveId, waves.id))
      .where(eq(waves.orgId, orgId))
      .groupBy(waves.orgId, waves.id)
      .orderBy(asc(waves.createdAt));
    return rows.map((row) => toWave(row.wave, Number(row.memberCount)));
  }

  async listMembers(orgId: string, waveId: string): Promise<WaveMember[]> {
    const rows = await this.db
      .select({
        waveId: waveMembers.waveId,
        orgUserId: waveMembers.orgUserId,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        status: orgUsers.status,
        rut: users.rut,
        phone: users.phone,
      })
      .from(waveMembers)
      .innerJoin(
        orgUsers,
        and(eq(orgUsers.orgId, waveMembers.orgId), eq(orgUsers.id, waveMembers.orgUserId)),
      )
      .innerJoin(users, eq(users.id, orgUsers.userId))
      .where(and(eq(waveMembers.orgId, orgId), eq(waveMembers.waveId, waveId)))
      .orderBy(asc(users.email));
    return rows;
  }
}
translateDbErrors(DrizzleWaveRepository);
