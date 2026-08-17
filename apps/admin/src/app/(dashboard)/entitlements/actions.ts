"use server";

// Server actions for entitlement mutations (also used by the student detail view).

import { revalidatePath } from "next/cache";
import { Entitlements } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import type { EntitlementGrant } from "@/lib/api/types";

/** A grant targets exactly one of: a single content item or a bundle. */
export interface GrantEntitlementInput {
  orgUserId: string;
  contentId?: string | null;
  bundleId?: string | null;
  expiresAt: string | null;
}

export async function grantEntitlementAction(
  input: GrantEntitlementInput,
): Promise<EntitlementGrant> {
  const entitlement = await Entitlements.grantEntitlement(input, await authHeaders());
  revalidatePath("/entitlements");
  revalidatePath(`/students/${input.orgUserId}`);
  return entitlement;
}

/**
 * Revoke/reinstate — the targeted status write behind the row actions and the
 * confirm dialog. `revoke` → `revoked`, `reinstate` → `active`, matching the
 * former `revoke/reinstate` client mutations.
 */
export async function setEntitlementStatusAction(
  id: string,
  action: "revoke" | "reinstate",
): Promise<EntitlementGrant> {
  const status: EntitlementGrant["status"] = action === "revoke" ? "revoked" : "active";
  const entitlement = await Entitlements.setEntitlementStatus({ id, status }, await authHeaders());
  revalidatePath("/entitlements");
  revalidatePath(`/students/${entitlement.orgUserId}`);
  return entitlement;
}
