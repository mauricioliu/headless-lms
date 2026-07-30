"use server";

// Server actions for entitlement mutations (also used by the student detail view).

import { revalidatePath } from "next/cache";
import { Entitlements } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";
import type { Entitlement } from "@/lib/api/types";

export interface GrantEntitlementInput {
  orgUserId: string;
  contentId: string;
  expiresAt: string | null;
}

export async function grantEntitlementAction(input: GrantEntitlementInput): Promise<Entitlement> {
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
): Promise<Entitlement> {
  const status: Entitlement["status"] = action === "revoke" ? "revoked" : "active";
  const entitlement = await Entitlements.setEntitlementStatus({ id, status }, await authHeaders());
  revalidatePath("/entitlements");
  return entitlement;
}
