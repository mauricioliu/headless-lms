import { describe, expect, it } from "vitest";

import type { Role } from "./api/types";
import { visibleNav } from "./roles";
import { navForRole } from "@/components/app-shell/nav";

describe("v1 Admin Cliente navigation", () => {
  it.each<Role>(["owner", "admin", "instructor"])(
    "does not expose automations to the %s role",
    (role) => {
      expect(visibleNav(role).automations).toBe(false);
    },
  );

  it.each<Role>(["owner", "admin"])(
    "drops Overview from the %s nav — Olas is the Admin Cliente's home",
    (role) => {
      expect(visibleNav(role).overview).toBe(false);
      expect(navForRole(role).some((item) => item.key === "overview")).toBe(false);
    },
  );

  it.each<Role>(["owner", "admin"])("leads the %s nav with Olas and Trabajadores", (role) => {
    const keys = navForRole(role).map((item) => item.key);
    expect(keys.slice(0, 2)).toEqual(["waves", "students"]);
    expect(keys.slice(2)).toEqual(["courses", "media", "settings"]);
  });

  it("labels the manager's surface Trabajadores, never Students", () => {
    const labels = navForRole("admin").map((item) => item.label);
    expect(labels).toContain("Trabajadores");
    expect(labels).not.toContain("Students");
  });

  it("keeps Overview for instructors (the Operador's authoring home)", () => {
    expect(visibleNav("instructor").overview).toBe(true);
    expect(navForRole("instructor").some((item) => item.key === "overview")).toBe(true);
  });
});
