"use client";

import { authClient } from "@/lib/auth/client";
import { acceptInvite } from "@/app/welcome/actions";

/**
 * Accept, then re-read the session so the org the API just stamped replaces the
 * cached copy. Returns an error message, or null once the portal is safe to
 * enter.
 */
export async function acceptAndRefreshSession(token: string): Promise<string | null> {
  const failure = await acceptInvite(token);
  if (failure) return failure.error;
  await authClient.getSession({ query: { disableCookieCache: true } });
  return null;
}
