import "server-only";

/**
 * Host-side asset URL broker (the editor contract's `resolveAssetUrl`).
 *
 * Media nodes persist a durable `assetId`; whichever surface renders them
 * (preview, editor initial value) hands this broker to the plugin, and each
 * node mints a fresh presigned URL for itself via the existing download-url
 * brokering — access stays time-limited and org-scoped, and the host never
 * inspects the plugin's config shape.
 */

import { unstable_rethrow } from "next/navigation";
import { Assets } from "@headless-lms/sdk";

import { ApiError } from "./http";
import { authHeaders } from "./server-call";

/** Fresh presigned URL for an asset, or null when the asset no longer exists. */
export async function resolveAssetUrl(assetId: string): Promise<string | null> {
  try {
    const ticket = await Assets.requestAssetDownload({ id: assetId }, await authHeaders());
    return ticket.url;
  } catch (e) {
    // A 401 redirects by throwing, so let Next's control-flow errors pass.
    unstable_rethrow(e);
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
