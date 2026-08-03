// Wires adapters + services in dependency order. Starts nothing.
import {createDb} from '../adapters/db/index.js';
import {DrizzleUnitOfWork} from '../adapters/db/unit-of-work.js';
import {InMemoryEventBus} from '../adapters/events/index.js';
import {PollingOutboxRelay, type PollingOutboxRelayConfig,} from '../adapters/events/outbox-relay.js';
import {InlineAutomationEngine} from '../adapters/workflows/index.js';
import {DrizzleOutboxAppender, DrizzleOutboxStore} from '../adapters/db/repositories/outbox.js';
import {EmailAdapter, StubTemplateRenderer} from '../adapters/email/index.js';
import {
  createRootLogger,
  type LogLevel,
  type PinoInstance,
  requestLogContext,
  type RequestLogContext,
} from '../adapters/logging/index.js';
import {StorageAdapter} from '../adapters/storage/index.js';
import {BetterAuth,} from '../adapters/auth/index.js';
import {DrizzleAuthAccountWriter} from '../adapters/auth/account-writer.js';

import {ContentServiceImpl} from '../core/content/index.js';
import {EntitlementsServiceImpl} from '../core/entitlements/index.js';
import {ProgressServiceImpl} from '../core/progress/index.js';
import {DiscussionServiceImpl} from '../core/discussion/index.js';
import {IdentityServiceImpl} from '../core/identity/index.js';
import {type OrgAdmin, OrganizationServiceImpl} from '../core/organizations/index.js';
import {AssetsServiceImpl} from '../core/assets/index.js';
import {IntegrationsServiceImpl} from '../core/integrations/index.js';
import {AutomationsServiceImpl} from '../core/automations/index.js';
import {loadIntegrations} from './integrations.js';
import {registerNotificationSubscribers} from './notifications.js';
import {StudentsReportServiceImpl} from '../reporting/students/index.js';
import {DashboardReportServiceImpl} from '../reporting/dashboard/index.js';
import {LearnReportServiceImpl} from '../reporting/learn/index.js';
import {Mailer} from '../core/shared/mailer.js';
import {SettingsService} from '../core/shared/settings.js';

import {DrizzleEntitlementsRepository} from '../adapters/db/repositories/entitlements.js';
import {DrizzleProgressRepository} from '../adapters/db/repositories/progress.js';
import {DrizzleDiscussionRepository} from '../adapters/db/repositories/discussion.js';
import {DrizzleIdentityRepository} from '../adapters/db/repositories/identity.js';
import {DrizzleOrganizationsRepository} from '../adapters/db/repositories/organizations.js';
import {DrizzleMembersRepository} from '../adapters/db/repositories/members.js';
import {DrizzleContentRepository} from '../adapters/db/repositories/content.js';
import {DrizzleContentStructureRepository} from '../adapters/db/repositories/structure.js';
import {DrizzleAssetsRepository} from '../adapters/db/repositories/assets.js';
import {DrizzleStudentsRepository} from '../adapters/db/repositories/students.js';
import {DrizzleDashboardRepository} from '../adapters/db/repositories/dashboard.js';
import {DrizzleLearnRepository} from '../adapters/db/repositories/learn.js';
import {DrizzleCredentialStore} from '../adapters/db/repositories/credentials.js';
import {DrizzleSettingsRepository} from '../adapters/db/repositories/settings.js';
import {DrizzleConnectionsRepository} from '../adapters/db/repositories/integrations.js';
import {
  DrizzleAutomationRunsRepository,
  DrizzleAutomationsRepository,
} from '../adapters/db/repositories/automations.js';
import type {
  CredentialStore,
  EmailSender,
  Logger,
  ObjectStorage,
  OutboxRelay,
  TemplateContext,
  TemplateRenderer,
} from '../core/shared/ports.js';
import type {AutomationEngine} from '@headless-lms/types';

/** Installation-supplied ports; an absent slot falls back to a fail-loudly stub. */
export interface AdapterOverrides {
  email?: EmailSender;
  storage?: ObjectStorage;
  /** Resolves email templates to rendered content. Absent → fail-loudly stub. */
  templates?: TemplateRenderer;
  /** Durable automation engine. Absent → InlineAutomationEngine (in-process, one attempt per action). */
  workflows?: AutomationEngine;
}

export interface BuildContainerOptions {
  /** Installation's plugins folder, scanned by loadIntegrations. Absent → no integrations. */
  pluginsDir?: string;
  adapters?: AdapterOverrides;
}

export interface Config {
  databaseUrl: string;
  authBaseURL: string;
  authSecret: string;
  trustedOrigins: string[];
  /** Branding threaded into every email template. Default: brandName "Headless LMS", baseUrl = adminAppUrl.
   *  (studentPortalUrl is composed in from the top-level config field.) */
  emailBranding?: Omit<TemplateContext, 'studentPortalUrl'>;
  /** base64-encoded 32-byte key for the credential store (CREDENTIAL_STORE_KEY). */
  credentialStoreKey: string;
  /** Parent domain for cross-subdomain session cookies (e.g. ".example.com"); undefined → host-only cookie. */
  cookieDomain?: string;
  /** Mark session cookies Secure (set behind HTTPS / in production). */
  secureCookies?: boolean;
  /** Student portal origin — invite links for students, and the origin whose signups are invite-gated. */
  studentPortalUrl: string;
  /** Admin app origin — invite links for staff. */
  adminAppUrl: string;
  /** Transactional-outbox relay tuning. All optional — see OUTBOX_DEFAULTS. */
  outbox?: OutboxConfig;
  /** Log level for the process-wide logger (HTTP + domain + relay). Default "info". */
  logging?: LoggingConfig;
  /** Presigned URL lifetime for entitled download delivery, seconds. Mirrors
   *  ServerConfig.deliveryExpirySeconds — createContainer threads it through. */
  deliveryExpirySeconds: number;
}

/** Tuning for the transactional-outbox relay. Every field is optional; the
 *  container resolves against OUTBOX_DEFAULTS. */
export interface OutboxConfig {
  /** Master switch for the same-process relay. Default true. */
  enabled?: boolean;
  /** Idle delay between polls. Default 1000. */
  pollIntervalMs?: number;
  /** Max rows fetched/dispatched per tick. Default 100. */
  batchSize?: number;
}

export const OUTBOX_DEFAULTS: PollingOutboxRelayConfig = {
  enabled: true,
  pollIntervalMs: 1000,
  batchSize: 100,
};

export function resolveOutboxConfig(config: OutboxConfig = {}): PollingOutboxRelayConfig {
  const overrides = Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  );
  return { ...OUTBOX_DEFAULTS, ...overrides };
}

/** Logging tuning. Optional; resolved against LOGGING_DEFAULTS. */
export interface LoggingConfig {
  /** Minimum level emitted. Default "info". */
  level?: LogLevel;
}

export const LOGGING_DEFAULTS: Required<LoggingConfig> = { level: 'info' };

export function resolveLoggingConfig(config: LoggingConfig = {}): Required<LoggingConfig> {
  return { level: config.level ?? LOGGING_DEFAULTS.level };
}

export interface Container {
  auth: BetterAuth;
  /** Public origin better-auth is mounted on. */
  authBaseURL: string;
  // Org Provider
  orgProvider: OrgAdmin;

  // Domains
  identity: IdentityServiceImpl;
  organizations: OrganizationServiceImpl;
  content: ContentServiceImpl;
  entitlements: EntitlementsServiceImpl;
  progress: ProgressServiceImpl;
  discussion: DiscussionServiceImpl;
  assets: AssetsServiceImpl;
  integrations: IntegrationsServiceImpl;
  automations: AutomationsServiceImpl;
  /** Cross-cutting settings store. Not a context — a leaf every context may use;
   *  inject `settings.for('<namespace>')` into a service, never the service itself. */
  settings: SettingsService;
  // Reporting read layer (composed cross-context reads; owns no domain rules).
  reporting: {
    students: StudentsReportServiceImpl;
    dashboard: DashboardReportServiceImpl;
    learn: LearnReportServiceImpl;
  };
  storage: ObjectStorage;
  mailer: Mailer;
  /** Shared secure credential store — encrypted at rest, org-scoped, decrypt at point of use. */
  credentials: CredentialStore;
  /** The outbox relay — constructed but NEVER started by the container; the
   *  installation's entry point starts it after listen (gen-openapi must not
   *  poll). buildServer stops it onClose. */
  outboxRelay: OutboxRelay;
  /** The automation engine — constructed but NEVER started by the container;
   *  the installation's entry point starts it after listen (gen-openapi must
   *  not run a worker). buildServer stops it onClose. */
  automationEngine: AutomationEngine;
  /** Root logger port — components receive children bound with { name }. */
  logger: Logger;
  /** The raw pino root; buildServer hands it to Fastify so HTTP shares the stream. */
  loggerInstance: PinoInstance;
  /** Request-scoped log correlation; the HTTP layer enters it per request. */
  requestContext: RequestLogContext;
  /** Stamps the caller's session with an active org (invite acceptance). */
  stampSessionActiveOrg: (
    headers: Record<string, string | string[] | undefined>,
    orgExternalId: string,
  ) => Promise<boolean>;
}

export async function buildContainer(
  config: Config,
  options?: BuildContainerOptions,
): Promise<Container> {
  const { instance: loggerInstance, logger } = createRootLogger(
    resolveLoggingConfig(config.logging).level,
  );
  // One child per domain — a context's service and repositories share it.

  const contentLogger = logger.child({ name: 'content' });
  const entitlementsLogger = logger.child({ name: 'entitlements' });
  const progressLogger = logger.child({ name: 'progress' });
  const discussionLogger = logger.child({ name: 'discussion' });
  const assetsLogger = logger.child({ name: 'assets' });
  const integrationsLogger = logger.child({ name: 'integrations' });
  const automationsLogger = logger.child({ name: 'automations' });
  const reportingLogger = logger.child({ name: 'reporting' });
  const outboxLogger = logger.child({ name: 'outbox' });

  // Outbound adapters
  const db = createDb(config.databaseUrl);
  const email = options?.adapters?.email ?? new EmailAdapter(logger.child({ name: 'email' }));
  const storage: ObjectStorage =
    options?.adapters?.storage ?? new StorageAdapter(logger.child({ name: 'storage' }));
  const templates =
    options?.adapters?.templates ?? new StubTemplateRenderer(logger.child({ name: 'email' }));
  const automationEngine: AutomationEngine =
    options?.adapters?.workflows ?? new InlineAutomationEngine();
  const mailer = new Mailer(templates, email, {
    ...(config.emailBranding ?? { brandName: 'Headless LMS', baseUrl: config.adminAppUrl }),
    studentPortalUrl: config.studentPortalUrl,
  });

  /*
   * Identity
   */
  const identityUoW = new DrizzleUnitOfWork(db, (tx) => ({
    identity: new DrizzleIdentityRepository(tx, logger.child({ name: 'identity' })),
    outbox: new DrizzleOutboxAppender(tx, logger.child({ name: 'identity' })),
  }));
  const identity = new IdentityServiceImpl({
    repo: new DrizzleIdentityRepository(db, logger.child({ name: 'identity_repo' })),
    logger: logger.child({ name: 'identity' }),
    authAccounts: new DrizzleAuthAccountWriter(db, logger.child({ name: 'identity' })),
    uow: identityUoW,
    mailer,
  });

  /*
   * Organization
   */
  const organizationsUow = new DrizzleUnitOfWork(db, (tx) => ({
    organizations: new DrizzleOrganizationsRepository(tx, logger.child({ name: 'org' })),
    outbox: new DrizzleOutboxAppender(tx, logger.child({ name: 'org' })),
  }));
  const organizations = new OrganizationServiceImpl({
    repo: new DrizzleOrganizationsRepository(db, logger.child({ name: 'org' })),
    membersRepo: new DrizzleMembersRepository(db, logger.child({ name: 'org' })),
    people: identity,
    uow: organizationsUow,
    logger: logger.child({ name: 'org' }),
    mailer,
    inviteUrls: { studentPortalUrl: config.studentPortalUrl, adminAppUrl: config.adminAppUrl },
  });

  /*
   * Settings
   */
  const settings = new SettingsService(
    new DrizzleSettingsRepository(db, logger.child({ name: 'settings' })),
  );
  // Content: reads on the root db; course writes + outbox append in one tx.
  const contentUow = new DrizzleUnitOfWork(db, (tx) => ({
    content: new DrizzleContentRepository(tx, contentLogger),
    outbox: new DrizzleOutboxAppender(tx, outboxLogger),
  }));
  const content = new ContentServiceImpl({
    repo: new DrizzleContentRepository(db, contentLogger),
    structureRepo: new DrizzleContentStructureRepository(db, contentLogger),
    uow: contentUow,
    settings,
    logger: contentLogger,
  });
  // Entitlements: reads on the root db; writes + outbox append in one tx.
  const entitlementsUow = new DrizzleUnitOfWork(db, (tx) => ({
    entitlements: new DrizzleEntitlementsRepository(tx, entitlementsLogger),
    outbox: new DrizzleOutboxAppender(tx, outboxLogger),
  }));
  const entitlements = new EntitlementsServiceImpl({
    repo: new DrizzleEntitlementsRepository(db, entitlementsLogger),
    uow: entitlementsUow,
    logger: entitlementsLogger,
  });
  // Progress: report writes + outbox append in one tx; content supplies the
  // structure and completion rules the service evaluates against.
  const progressUow = new DrizzleUnitOfWork(db, (tx) => ({
    progress: new DrizzleProgressRepository(tx, progressLogger),
    outbox: new DrizzleOutboxAppender(tx, outboxLogger),
  }));
  const progress = new ProgressServiceImpl({
    repo: new DrizzleProgressRepository(db, progressLogger),
    content,
    uow: progressUow,
    logger: progressLogger,
  });

  const discussion = new DiscussionServiceImpl({
    repo: new DrizzleDiscussionRepository(db, discussionLogger),
    access: entitlements,
    content: content,
    uow: new DrizzleUnitOfWork(db, (tx) => ({
      discussion: new DrizzleDiscussionRepository(tx, discussionLogger),
      outbox: new DrizzleOutboxAppender(tx, outboxLogger),
    })),
    settings,
    logger: discussionLogger,
  });
  const assets = new AssetsServiceImpl({
    storage,
    repo: new DrizzleAssetsRepository(db, assetsLogger),
    logger: assetsLogger,
  });

  const reporting = {
    students: new StudentsReportServiceImpl({
      repo: new DrizzleStudentsRepository(db, reportingLogger),
      logger: reportingLogger,
    }),
    dashboard: new DashboardReportServiceImpl({
      repo: new DrizzleDashboardRepository(db, reportingLogger),
      logger: reportingLogger,
    }),
    learn: new LearnReportServiceImpl({
      reader: new DrizzleLearnRepository(db, reportingLogger),
      content,
      progress,
      assets,
      deliveryExpirySeconds: config.deliveryExpirySeconds,
      logger: reportingLogger,
    }),
  };

  const credentialStore = new DrizzleCredentialStore(
    db,
    config.credentialStoreKey,
    integrationsLogger,
  );
  // The integrations this deployment supports: the installation's declared
  // plugins folder (directory name = integration id), loaded at startup.
  // Connect/configure reject undeclared ids and validate config with the
  // integration's own schema. No folder → no integrations.
  const integrationsRegistry = await loadIntegrations(options?.pluginsDir, integrationsLogger);
  // Integrations: credential + connection writes + outbox append in one tx
  // (a tx-bound credential store instance shares the scope's transaction).
  const integrationsUow = new DrizzleUnitOfWork(db, (tx) => ({
    connections: new DrizzleConnectionsRepository(tx, integrationsLogger),
    credentials: new DrizzleCredentialStore(tx, config.credentialStoreKey, integrationsLogger),
    outbox: new DrizzleOutboxAppender(tx, outboxLogger),
  }));
  const integrations = new IntegrationsServiceImpl({
    registry: integrationsRegistry,
    repo: new DrizzleConnectionsRepository(db, integrationsLogger),
    uow: integrationsUow,
    logger: integrationsLogger,
  });

  // Automations: run writes + outbox append in one tx; the engine drives
  // execution (register below), integrations supplies the loaded
  // integrations' actions for `available`.
  const automationsUow = new DrizzleUnitOfWork(db, (tx) => ({
    automations: new DrizzleAutomationsRepository(tx, automationsLogger),
    runs: new DrizzleAutomationRunsRepository(tx, automationsLogger),
    outbox: new DrizzleOutboxAppender(tx, automationsLogger),
  }));
  const automations = new AutomationsServiceImpl({
    repo: new DrizzleAutomationsRepository(db, automationsLogger),
    runsRepo: new DrizzleAutomationRunsRepository(db, automationsLogger),
    uow: automationsUow,
    engine: automationEngine,
    mailer,
    integrations,
    logger: automationsLogger,
  });
  automationEngine.register(automations);

  const eventBus = new InMemoryEventBus();
  registerNotificationSubscribers(eventBus, mailer);
  // handle() never throws — the EventBus fans out to every subscriber
  // sequentially, and a rejection here would break sibling subscribers.
  eventBus.subscribeAll((event) => automations.handle(event));
  const outboxConfig = resolveOutboxConfig(config.outbox);
  const outboxRelay = new PollingOutboxRelay(
    new DrizzleOutboxStore(db, outboxLogger),
    eventBus,
    outboxConfig,
    outboxLogger,
  );

  /*
   * Auth Adapter
   */
  const auth = new BetterAuth({
    db,
    baseUrl: config.authBaseURL,
    secret: config.authSecret,
    trustedOrigins: config.trustedOrigins,
    hooks: {
      sendResetPassword: async (data) => {
        await identity.sendPasswordReset({
          email: data.user.email,
          url: '',
        });
      },
      sendMagicLink: async ({ email, url }) => {
        await identity.sendMagicLink({
          email,
          url,
        });
      },
      beforeUserCreate: async ({ id, email, name }) => {
        const [firstName, lastName] = name.split(' ');
        await identity.createUser({
          email,
          ...(firstName !== undefined && { firstName }),
          ...(lastName !== undefined && { lastName }),
          id,
          externalId: id,
        });
      },
      beforeCreateSession: async (session) => {
        const person = await identity.getUserByExternalId(session.userId);
        if (!person) {
          return;
        }
        const orgs = await organizations.getOrgUsersForUser(person.id);
        if (orgs.length !== 1) {
          return;
        }
        // TODO - fix, why default to the first?
        const org = await organizations.getById(orgs[0]!.orgId);
        if (!org) {
          return;
        }
        return { data: { ...session, activeOrganizationId: org.externalId } };
      },
      beforeCreateOrganization: async ({ organization: org, user: baUser }) => {
        const domainOrg = await organizations.createOrganization({
          ownerId: baUser.id,
          ...org,
          logo: org.logo ?? undefined,
        });
        return { data: domainOrg };
      },
      beforeUpdateOrganization: async ({ organization }) => {
        await organizations.updateOrganization(organization.id, organization);
      },
      beforeDeleteOrganization: async ({ organization }) => {
        await organizations.deleteOrganization(organization.id);
      },
      afterAddMember: async () => {
        throw new Error('Not implemented');
      },
      afterRemoveMember: async () => {
        throw new Error('Not implemented');
      },
    },
    logger: logger.child({ name: 'auth' }),
    cookieDomain: config.cookieDomain,
    secureCookies: config.secureCookies,
  });

  return {
    auth,
    authBaseURL: config.authBaseURL,
    identity,
    organizations,
    // Better Auth owns org writes; the same instance fulfils the OrgAdmin port.
    orgProvider: auth,
    content,
    entitlements,
    progress,
    discussion,
    assets,
    integrations,
    automations,
    settings,
    reporting,
    storage,
    mailer,
    credentials: credentialStore,
    outboxRelay,
    automationEngine,
    logger,
    loggerInstance,
    requestContext: requestLogContext,
    stampSessionActiveOrg: (headers, orgExternalId) =>
      auth.stampActiveOrganization(headers, orgExternalId),
  };
}
