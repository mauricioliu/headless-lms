"use server";

// Server actions for connected-app mutations.

import { revalidatePath } from "next/cache";
import { ConnectedApps } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";

export async function revokeConnectedAppAction(id: string): Promise<void> {
  await ConnectedApps.revokeConnectedApp({ id }, await authHeaders());
  revalidatePath("/settings/apps");
}
