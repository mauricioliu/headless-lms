import { describe, expect, it } from "vitest";

import AutomationsLayout from "./layout";

describe("v1 Admin Cliente automations route", () => {
  it("serves 404 for direct navigation", () => {
    expect(() => AutomationsLayout({ children: null })).toThrowError(
      expect.objectContaining({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }),
    );
  });
});
