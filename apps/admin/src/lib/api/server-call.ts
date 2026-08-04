import "server-only";

/**
 * Shared plumbing for server-side SDK calls (RSC reads in `server.ts` and every
 * route's Server Actions). Configures the SDK base URL on import and exposes the
 * per-call cookie-forward header bag, so the boilerplate lives in one place and
 * can't drift between files.
 *
 * The SDK `client` is a module-level singleton shared across all concurrent
 * requests, so the cookie is threaded per-call via the `headers` option — never
 * `client.setConfig` with request state (which would leak cookies between users).
 */

import { cookies } from "next/headers";
import { configureSdk } from "@headless-lms/sdk";
import { redirect } from "next/navigation";

import { API_URL } from "./api-url";
import { requireOrgSession } from "../auth/server-session";
import { ApiError } from "./http";
import { logger } from "@/lib/log";

const log = logger.child({ name: "api" });

export { API_URL };

// baseUrl and error mapping only — the cookie is passed per-call, never on the
// shared client.
//
// The client throws on failure, so no call site unwraps a result envelope. What
// it throws by default is the raw parsed response body; `onError` turns that
// into an `ApiError` carrying the status.
//
// A 401 means the session expired or was never there. That's a routing concern,
// not an application error, so it bounces to /login rather than reaching an
// error boundary or a toast — `redirect` throws, which leaves the SDK's error
// path the same way a returned error would. 403 (authenticated but forbidden)
// still throws: the caller is logged in, just not allowed, so it belongs in an
// error message.
configureSdk({
  baseUrl: API_URL,
  onError: (error, response) => {
    // The API's own body, logged before it is flattened into an ApiError and
    // shown to the user as a generic message.
    log.error({ body: error, status: response?.status, url: response?.url }, "api call failed");
    if (response?.status === 401) redirect("/login");
    // The SDK hands back the parsed response body, which for this API is
    // `{ error, message? }` — prefer that over the bare status so the toast
    // says what actually went wrong.
    const body = error as { message?: string; error?: string } | undefined;
    const status = response?.status ?? 500;
    const message =
      body?.message ?? body?.error ?? response?.statusText ?? `Request failed (${status})`;
    return new ApiError(status, message);
  },
});

/**
 * Per-call header bag forwarding the incoming request's session cookie — and
 * the single place server-side auth is enforced.
 *
 * Every RSC read and Server Action reaches the API through here, so gating on
 * `requireOrgSession()` here means an unauthenticated request can't produce a data
 * call at all, without any route having to remember to ask. `requireOrgSession`
 * is request-cached, so this costs one resolution per request no matter how
 * many calls a page makes.
 */
export async function authHeaders(): Promise<{ headers: { cookie: string } }> {
  await requireOrgSession();
  return { headers: { cookie: (await cookies()).toString() } };
}
