/**
 * Next's server-side error hook. It fires for every error thrown in a Server
 * Component, Server Action, route handler or proxy, and it is the only place
 * the full error survives: what reaches the browser in production is redacted
 * down to `error.digest`, which `app/error.tsx` renders as `ref:`. Matching
 * that ref to a line here is how a reported error gets diagnosed.
 */

import type { Instrumentation } from "next";

import { logger } from "@/lib/log";

const log = logger.child({ name: "request" });

// `redirect()` and `notFound()` are control flow, not failures — Next signals
// them as errors carrying these digests.
function isControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown })?.digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_HTTP_ERROR_FALLBACK;404")
  );
}

export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  if (isControlFlow(err)) return;
  log.error(
    {
      err,
      path: request.path,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
    },
    "server error",
  );
};
