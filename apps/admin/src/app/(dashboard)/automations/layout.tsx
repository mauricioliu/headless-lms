import type { ReactNode } from "react";

import { requireAutomationsSurface } from "@/lib/auth/server-session";

// v1 valve: while `visibleNav(...).automations` is false this serves 404 for
// the whole section — list, new, editor, and anything added under it later —
// mirroring the nav. The pages stay intact; reopening the flag (and remounting
// the mutation routes, see packages/server routes.ts) restores the feature.
export default async function AutomationsLayout({ children }: { children: ReactNode }) {
  await requireAutomationsSurface();
  return children;
}
