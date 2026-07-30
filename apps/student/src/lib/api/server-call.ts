import "server-only";

/**
 * Shared plumbing for server-side SDK reads. Configures the SDK base URL on
 * import and exposes the per-call cookie-forward header bag.
 *
 * The SDK `client` is a module-level singleton shared across all concurrent
 * requests, so the cookie is threaded per-call via the `headers` option — never
 * `client.setConfig` with request state (which would leak cookies between users).
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { configureSdk } from "@headless-lms/sdk";

import { ApiError, responseMessage, responseStatus } from "./shared";

export const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// The client throws on failure rather than returning a result envelope, so no
// call site unwraps. `onError` turns the raw response body it would otherwise
// throw into an `ApiError` carrying the status.
//
// The Learn API answers 401 when the session doesn't resolve to a portal
// student — a staff login on the shared dev cookie, or a session whose
// student/org rows no longer exist. That's a routing concern, not an application
// error: the session is stale/unlinked, so drop it and send the user back to
// sign in. `redirect` throws, which leaves the SDK's error path the same way a
// returned error would.
configureSdk({
  baseUrl: API_URL,
  onError: (error, response) => {
    if (response?.status === 401) redirect("/login?reset=1");
    return new ApiError(responseStatus(response), responseMessage(error, response));
  },
});

/**
 * Per-call header bag: forwards the session cookie. The org the request is scoped
 * to rides in the session itself (better-auth `activeOrganizationId`, stamped at
 * login) — the API reads it there, so no per-request org header is needed.
 */
export async function authHeaders(): Promise<{ headers: { cookie: string } }> {
  return { headers: { cookie: (await cookies()).toString() } };
}
