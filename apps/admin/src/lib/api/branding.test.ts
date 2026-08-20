import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@headless-lms/sdk", () => ({
  configureSdk: vi.fn(),
  Organizations: { getLearnBranding: vi.fn() },
}));

import { Organizations } from "@headless-lms/sdk";
import { DEFAULT_BRAND_NAME, getBranding } from "./branding";

const getLearnBranding = vi.mocked(Organizations.getLearnBranding);

describe("getBranding (admin pre-session surfaces)", () => {
  beforeEach(() => {
    getLearnBranding.mockReset();
  });

  it("reads the same public branding contract the student app reads", async () => {
    getLearnBranding.mockResolvedValue({ brandName: "Minera Los Andes" });
    await expect(getBranding()).resolves.toEqual({ brandName: "Minera Los Andes" });
  });

  it("degrades to the default brand — never the upstream product name", async () => {
    getLearnBranding.mockRejectedValue(new Error("fetch failed"));
    await expect(getBranding()).resolves.toEqual({ brandName: DEFAULT_BRAND_NAME });
    expect(DEFAULT_BRAND_NAME).not.toContain("LMS");
    expect(DEFAULT_BRAND_NAME).not.toContain("Headless");
  });
});
