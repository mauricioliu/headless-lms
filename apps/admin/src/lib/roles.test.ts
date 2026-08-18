import { describe, expect, it } from "vitest";

import type { Role } from "./api/types";
import { visibleNav } from "./roles";

// Ticket #18 — the v1 Client Admin surface does not expose automations for any
// role. `visibleNav().automations` is the shared valve: it hides the nav item
// and (via `requireAutomationsSurface`) 404s the whole automations section.
describe("v1 Admin Cliente navigation", () => {
  it.each<Role>(["owner", "admin", "instructor"])(
    "does not expose automations to the %s role",
    (role) => {
      expect(visibleNav(role).automations).toBe(false);
    },
  );
});
