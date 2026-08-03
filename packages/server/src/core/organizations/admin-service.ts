// organizations context — caller-driven org CRUD (inbound port).
//
// The organization provider is the system of record: every write lands there
// first, and its callbacks mirror the result into the domain through the
// provisioner. This service therefore holds no mirror writes of its own — it
// drives the provider and reads the row back. Swapping Better Auth for another
// provider means supplying a different OrgAdmin at container assembly; nothing
// here changes.
import type {
  AuthHeaders,
  OrgAdmin,
  OrganizationAdminService,
  OrganizationsRepository,
} from './ports.js';
import type { Organization } from './model.js';
import type { NewOrganizationInput, UpdateOrganizationInput } from './types.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';

export type OrganizationAdminServiceParams = {
  /** Lazy: the provider wrapper is built from the auth instance, which is
   *  assembled after the services it calls back into. */
  provider: () => OrgAdmin;
  /** Reads back what the provider's callbacks mirrored. */
  repo: OrganizationsRepository;
  logger?: Logger;
};

export class OrganizationAdminServiceImpl implements OrganizationAdminService {
  private readonly provider: () => OrgAdmin;
  private readonly repo: OrganizationsRepository;
  private readonly logger: Logger;

  constructor(params: OrganizationAdminServiceParams) {
    this.provider = params.provider;
    this.repo = params.repo;
    this.logger = params.logger ?? noopLogger;
  }

  async create(headers: AuthHeaders, input: NewOrganizationInput): Promise<Organization> {
    const { externalId } = await this.provider().createOrganization(headers, input);
    await this.provider().setActiveOrganization(headers, externalId);
    return this.readBack(externalId);
  }

  async update(
    headers: AuthHeaders,
    externalId: string,
    input: UpdateOrganizationInput,
  ): Promise<Organization> {
    await this.provider().updateOrganization(headers, externalId, input);
    return this.readBack(externalId);
  }

  async delete(headers: AuthHeaders, externalId: string): Promise<void> {
    await this.provider().deleteOrganization(headers, externalId);
    this.logger.info('organization deleted', { externalId });
  }

  // The provider runs its callbacks before returning, so the mirror is already
  // written by the time we get here. A miss means the callback never fired.
  private async readBack(externalId: string): Promise<Organization> {
    const org = await this.repo.findByExternalId(externalId);
    if (!org) {
      throw new Error('organization did not propagate to the domain mirror');
    }
    return org;
  }
}
