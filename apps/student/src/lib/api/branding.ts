import "server-only";

import { Organizations } from "@headless-lms/sdk";

import "./server-call";

/** Fallback when the API can't be asked (unreachable at build/prerender time)
 *  — mirrors the server's own default (see resolveBranding in the container). */
export const DEFAULT_BRAND_NAME = "Nuvora";

export interface Branding {
  brandName: string;
  logoUrl?: string;
}

/**
 * The deployment's branding for pre-session surfaces (login, invite landing):
 * the same config every transactional email reads, exposed publicly by
 * GET /api/learn/branding. Authenticated surfaces theme against the session
 * org instead (learnApi.org). A failure degrades to the default brand rather
 * than taking an unauthenticated page down.
 */
export async function getBranding(): Promise<Branding> {
  try {
    return await Organizations.getLearnBranding();
  } catch {
    return { brandName: DEFAULT_BRAND_NAME };
  }
}
