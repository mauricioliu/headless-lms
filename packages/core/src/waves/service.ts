// waves context — service implementation (inbound port).
//
// Ingestion is orchestration, not authority: identity owns the person,
// organizations owns the Trabajador's org link and the invitation, entitlements
// owns the access grant. What waves owns is the group — the Ola row and its
// membership — plus the roster rules that decide who gets an email.
import { NotFoundError } from '../shared/errors.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import { genId } from '../shared/id.js';
import type { IdentityService } from '../identity/index.js';
import type { OrganizationService } from '../organizations/index.js';
import { STUDENT_ROLE } from '../organizations/index.js';
import type { EntitlementsService } from '../entitlements/index.js';
import { waveEvents } from './events.js';
import { parseWorkerCsv } from './csv.js';
import type { IngestWaveResult, Wave, WaveMember, WorkerRow } from './model.js';
import type { WaveCourseReader, WaveRepository, WaveUnitOfWork } from './ports.js';

/** How the grant that inscribes an Ola's Trabajadores is marked. */
export const WAVE_ENTITLEMENT_SOURCE = 'ola';

export interface IngestWaveCommand {
  name: string;
  courseId: string;
  csv: string;
  inviterUserId: string;
}

export interface WaveServiceParams {
  repo: WaveRepository;
  uow: WaveUnitOfWork;
  courses: WaveCourseReader;
  people: IdentityService;
  organizations: OrganizationService;
  entitlements: EntitlementsService;
  logger?: Logger;
}

export class WaveService {
  private readonly repo: WaveRepository;
  private readonly uow: WaveUnitOfWork;
  private readonly courses: WaveCourseReader;
  private readonly people: IdentityService;
  private readonly organizations: OrganizationService;
  private readonly entitlements: EntitlementsService;
  private readonly logger: Logger;

  constructor(params: WaveServiceParams) {
    this.repo = params.repo;
    this.uow = params.uow;
    this.courses = params.courses;
    this.people = params.people;
    this.organizations = params.organizations;
    this.entitlements = params.entitlements;
    this.logger = params.logger ?? noopLogger;
  }

  /** Ingests an Ola from the Empresa Cliente's roster CSV: creates the wave,
   *  provisions each Trabajador, inscribes them in the Curso, and emails an
   *  invitation to every one who is not yet active in the org. The access
   *  token exists only in that email — nothing in the response carries it.
   *  Throws WaveCsvError when the roster is invalid, NotFoundError when the
   *  Curso does not exist in the org. */
  async ingest(orgId: string, command: IngestWaveCommand): Promise<IngestWaveResult> {
    const rows = dedupeByEmail(parseWorkerCsv(command.csv));
    if (!(await this.courses.getCourse(orgId, command.courseId))) {
      throw new NotFoundError('Course', command.courseId);
    }

    const orgUserIds: string[] = [];
    let invited = 0;
    let alreadyActive = 0;
    for (const row of rows) {
      const member = await this.ensureTrabajador(orgId, row, command.inviterUserId);
      if (member.emailed) {
        invited += 1;
      } else {
        alreadyActive += 1;
      }
      await this.entitlements.grant(orgId, {
        orgUserId: member.orgUserId,
        contentId: command.courseId,
        bundleId: null,
        expiresAt: null,
        source: WAVE_ENTITLEMENT_SOURCE,
      });
      orgUserIds.push(member.orgUserId);
    }

    const wave = await this.uow.run(async ({ waves, outbox }) => {
      const created = await waves.insert(orgId, {
        id: genId('wave'),
        name: command.name,
        courseId: command.courseId,
        orgUserIds,
      });
      await outbox.append([waveEvents.created.make({ orgId, data: created })]);
      return created;
    });
    this.logger.info('wave ingested', {
      orgId,
      waveId: wave.id,
      courseId: wave.courseId,
      members: orgUserIds.length,
      invited,
      alreadyActive,
    });
    return { ...wave, invited, alreadyActive };
  }

  async list(orgId: string): Promise<Wave[]> {
    return this.repo.list(orgId);
  }

  async get(orgId: string, id: string): Promise<Wave | null> {
    return this.repo.findById(orgId, id);
  }

  async members(orgId: string, waveId: string): Promise<WaveMember[]> {
    return this.repo.listMembers(orgId, waveId);
  }

  /** Provisions one Trabajador and returns their org user. A Trabajador who is
   *  already active in the org gets no email — their inscription is the
   *  entitlement, and the roster fields on their person are refreshed. Anyone
   *  else gets a (re-)issued invitation: a fresh token exists only in the
   *  email that carries it. */
  private async ensureTrabajador(
    orgId: string,
    row: WorkerRow,
    inviterUserId: string,
  ): Promise<{ orgUserId: string; emailed: boolean }> {
    const person = await this.people.getUserByEmail(row.email);
    const existing = person ? await this.organizations.getOrgUser(orgId, person.id) : null;
    if (person && existing?.status === 'active') {
      await this.people.updateUser(person.id, {
        firstName: row.firstName,
        ...(row.lastName !== null && { lastName: row.lastName }),
        rut: row.rut,
        phone: row.phone,
      });
      return { orgUserId: existing.id, emailed: false };
    }

    await this.organizations.createInvite({
      orgId,
      email: row.email,
      role: STUDENT_ROLE,
      inviterUserId,
      firstName: row.firstName,
      ...(row.lastName !== null && { lastName: row.lastName }),
      rut: row.rut,
      phone: row.phone,
      sendEmail: true,
    });
    const provisioned = await this.people.getUserByEmail(row.email);
    const orgUser = provisioned ? await this.organizations.getOrgUser(orgId, provisioned.id) : null;
    if (!orgUser) {
      throw new Error(`invite for ${row.email} did not provision an org user`);
    }
    return { orgUserId: orgUser.id, emailed: true };
  }
}

/** Within one roster the correo is the identity, so a repeated address is the
 *  same Trabajador — first occurrence wins, later duplicates are dropped. */
function dedupeByEmail(rows: WorkerRow[]): WorkerRow[] {
  const seen = new Map<string, WorkerRow>();
  for (const row of rows) {
    const key = row.email.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, row);
    }
  }
  return [...seen.values()];
}
