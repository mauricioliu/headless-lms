import "server-only";

/**
 * Pino, wired the same way as `packages/server` — JSON lines to stdout, `err`
 * serialization, level from `LOG_LEVEL`. The dev script pipes through
 * `pino-pretty`, which passes Next's own non-JSON output through untouched.
 *
 * Modules bind their own name: `const log = logger.child({ name: "auth" })`.
 *
 * Server-only: a browser bundle should not carry a logger. Client components
 * report through the `error.tsx` boundaries, whose `digest` is the key back
 * into these lines.
 */

import { pino, stdSerializers } from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  serializers: { err: stdSerializers.err },
  base: { app: "admin" },
});
