import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@headless-lms/sdk", () => ({
  configureSdk: vi.fn(),
  Organizations: { getLearnBranding: vi.fn() },
}));

import { Organizations } from "@headless-lms/sdk";
import { DEFAULT_BRAND_NAME, getBranding } from "./branding";

const getLearnBranding = vi.mocked(Organizations.getLearnBranding);

describe("getBranding", () => {
  beforeEach(() => {
    getLearnBranding.mockReset();
  });

  it("returns the config-derived brand token from the API", async () => {
    getLearnBranding.mockResolvedValue({ brandName: "Minera Los Andes" });
    await expect(getBranding()).resolves.toEqual({ brandName: "Minera Los Andes" });
  });

  it("degrades to the default brand when the API is unreachable", async () => {
    getLearnBranding.mockRejectedValue(new Error("fetch failed"));
    await expect(getBranding()).resolves.toEqual({ brandName: DEFAULT_BRAND_NAME });
    expect(DEFAULT_BRAND_NAME).not.toContain("LMS");
  });
});
