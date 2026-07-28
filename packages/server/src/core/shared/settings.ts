// Cross-cutting settings: storage, scoping and resolution for every domain's
// configuration. This module owns none of the configuration itself — it never
// interprets a value. A domain owns its namespace and the meaning of what is in
// it; settings stores it, merges it along a scope chain, and hands it back.
//
// Not a bounded context: it is a leaf every context may import, and it imports
// no context.

/** A namespace's values at one scope. Shape is the owning domain's business. */
export type SettingsValue = Record<string, unknown>;

/** One stored row: what a domain has set at one scope. */
export interface SettingsRecord {
  namespace: string;
  scopeId: string;
  value: SettingsValue;
}

/**
 * Expands a scope id to its chain, outermost first, innermost last —
 * e.g. an activity → [orgId, courseId, activityId]. Supplied by composition,
 * because hierarchy is the owning domain's knowledge, not this module's.
 */
export type ScopeChainResolver = (orgId: string, scopeId: string) => Promise<string[]>;

/** Per-namespace defaults, applied under everything the chain resolves. */
export type SettingsDefaults = Record<string, SettingsValue>;

export interface SettingsRepository {
  /** Rows for the given scopes, optionally narrowed to one namespace. */
  find(orgId: string, scopeIds: string[], namespace?: string): Promise<SettingsRecord[]>;
  /** Shallow-merges the patch into the row's value, inserting when absent. */
  patch(
    orgId: string,
    namespace: string,
    scopeId: string,
    patch: SettingsValue,
  ): Promise<SettingsRecord>;
}

/** Stored (set at this exact scope) alongside effective (resolved up the chain). */
export interface ResolvedSettings {
  stored: SettingsValue;
  effective: SettingsValue;
}

/**
 * A namespace-bound view of the store. Contexts receive one of these rather
 * than the service, so a context is structurally incapable of reading or
 * writing another domain's namespace — there is no argument to pass.
 */
export interface NamespacedSettings {
  readonly namespace: string;
  /** Values set at this exact scope, with nothing inherited. */
  get(orgId: string, scopeId: string): Promise<SettingsValue>;
  /** Values that apply here: defaults, then each scope in the chain, nearest wins per key. */
  resolve(orgId: string, scopeId: string): Promise<SettingsValue>;
  patch(orgId: string, scopeId: string, patch: SettingsValue): Promise<SettingsValue>;
}

/** Merge in order, nearest last. Shallow at the top-level key: patching a nested
 *  object replaces it whole, so callers send the full sub-object they edit. */
function merge(layers: SettingsValue[]): SettingsValue {
  return Object.assign({}, ...layers) as SettingsValue;
}

export class SettingsService {
  constructor(
    private readonly repo: SettingsRepository,
    private readonly resolveChain: ScopeChainResolver,
    private readonly defaults: SettingsDefaults = {},
  ) {}

  async get(orgId: string, namespace: string, scopeId: string): Promise<SettingsValue> {
    const rows = await this.repo.find(orgId, [scopeId], namespace);
    return rows[0]?.value ?? {};
  }

  async resolve(orgId: string, namespace: string, scopeId: string): Promise<SettingsValue> {
    const chain = await this.resolveChain(orgId, scopeId);
    const rows = await this.repo.find(orgId, chain, namespace);
    const byScope = new Map(rows.map((row) => [row.scopeId, row.value]));
    const layers = chain.map((id) => byScope.get(id) ?? {});
    return merge([this.defaults[namespace] ?? {}, ...layers]);
  }

  /** Every namespace present at this scope or above it, stored + effective. */
  async resolveAll(orgId: string, scopeId: string): Promise<Record<string, ResolvedSettings>> {
    const chain = await this.resolveChain(orgId, scopeId);
    const rows = await this.repo.find(orgId, chain);

    const namespaces = new Set([...Object.keys(this.defaults), ...rows.map((r) => r.namespace)]);
    const out: Record<string, ResolvedSettings> = {};

    for (const namespace of namespaces) {
      const inNamespace = rows.filter((row) => row.namespace === namespace);
      const byScope = new Map(inNamespace.map((row) => [row.scopeId, row.value]));
      out[namespace] = {
        stored: byScope.get(scopeId) ?? {},
        effective: merge([
          this.defaults[namespace] ?? {},
          ...chain.map((id) => byScope.get(id) ?? {}),
        ]),
      };
    }
    return out;
  }

  async patch(
    orgId: string,
    namespace: string,
    scopeId: string,
    patch: SettingsValue,
  ): Promise<SettingsValue> {
    const row = await this.repo.patch(orgId, namespace, scopeId, patch);
    return row.value;
  }

  /** Bind the service to one namespace for injection into that domain's service. */
  for(namespace: string): NamespacedSettings {
    return {
      namespace,
      get: (orgId, scopeId) => this.get(orgId, namespace, scopeId),
      resolve: (orgId, scopeId) => this.resolve(orgId, namespace, scopeId),
      patch: (orgId, scopeId, patch) => this.patch(orgId, namespace, scopeId, patch),
    };
  }
}
