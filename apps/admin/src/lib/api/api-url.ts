import "server-only";

/**
 * The API origin, in its own module so it can be imported without pulling in
 * the SDK client or the auth gate. `server-call.ts` gates on `server-session.ts`,
 * which in turn needs this value — holding it here keeps that a chain instead of
 * a cycle.
 */
export const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
