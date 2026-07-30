"use server";

// Server actions for integration connection mutations.

import { revalidatePath } from "next/cache";
import { Integrations } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";

const PATH = "/settings/integrations";

export async function connectIntegrationAction(input: {
  integrationId: string;
  secrets: Record<string, unknown>;
  config?: Record<string, unknown>;
}): Promise<void> {
  await Integrations.connectIntegration(input, await authHeaders());
  revalidatePath(PATH);
}

export async function configureConnectionAction(
  id: string,
  input: { config?: Record<string, unknown>; active?: boolean },
): Promise<void> {
  await Integrations.configureConnection({ id, ...input }, await authHeaders());
  revalidatePath(PATH);
}

export async function reconnectIntegrationAction(
  id: string,
  secrets: Record<string, unknown>,
): Promise<void> {
  await Integrations.reconnectIntegration({ id, secrets }, await authHeaders());
  revalidatePath(PATH);
}

export async function disconnectIntegrationAction(id: string): Promise<void> {
  await Integrations.disconnectIntegration({ id }, await authHeaders());
  revalidatePath(PATH);
}
