import { describe, expect, it } from "vitest";

import type { Role } from "./api/types";
import { visibleNav } from "./roles";

describe("v1 Admin Cliente navigation", () => {
  it.each<Role>(["owner", "admin", "instructor"])(
    "does not expose automations to the %s role",
    (role) => {
      expect(visibleNav(role).automations).toBe(false);
    },
  );
});
