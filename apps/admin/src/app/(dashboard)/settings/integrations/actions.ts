"use server";

// Server actions for integration connection mutations.

import { revalidatePath } from "next/cache";
import { Integrations, type JsonValueInput } from "@headless-lms/sdk";

import { authHeaders } from "@/lib/api/server-call";

const PATH = "/settings/integrations";

export async function connectIntegrationAction(input: {
  integrationId: string;
  secrets: Record<string, JsonValueInput>;
  config?: Record<string, JsonValueInput>;
}): Promise<void> {
  await Integrations.connectIntegration(input, await authHeaders());
  revalidatePath(PATH);
}

export async function configureConnectionAction(
  id: string,
  input: { config?: Record<string, JsonValueInput>; active?: boolean },
): Promise<void> {
  await Integrations.configureConnection({ id, ...input }, await authHeaders());
  revalidatePath(PATH);
}

export async function reconnectIntegrationAction(
  id: string,
  secrets: Record<string, JsonValueInput>,
): Promise<void> {
  await Integrations.reconnectIntegration({ id, secrets }, await authHeaders());
  revalidatePath(PATH);
}

export async function disconnectIntegrationAction(id: string): Promise<void> {
  await Integrations.disconnectIntegration({ id }, await authHeaders());
  revalidatePath(PATH);
}
