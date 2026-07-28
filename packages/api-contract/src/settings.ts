import { z } from "zod";

/** A namespace's values. The owning domain defines the shape; the contract
 *  carries it opaquely so a new namespace needs no contract change. */
export const SettingsValue = z.record(z.string(), z.unknown());
export type SettingsValue = z.infer<typeof SettingsValue>;

/** `stored` is set at this exact scope; `effective` is what applies after
 *  resolving up the scope chain (defaults, org, …, this scope). */
export const NamespaceSettings = z.object({
  stored: SettingsValue,
  effective: SettingsValue,
});
export type NamespaceSettings = z.infer<typeof NamespaceSettings>;

export const ScopeSettings = z.object({
  scopeId: z.string(),
  namespaces: z.record(z.string(), NamespaceSettings),
});
export type ScopeSettings = z.infer<typeof ScopeSettings>;

export const SettingsScopeParam = z.object({ scopeId: z.string() });
export const SettingsNamespaceParam = z.object({
  scopeId: z.string(),
  namespace: z.string(),
});

/** Partial by definition — the server shallow-merges it into the stored value. */
export const PatchSettings = SettingsValue;
