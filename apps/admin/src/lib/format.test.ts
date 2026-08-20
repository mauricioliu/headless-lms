import { describe, expect, it } from "vitest";

import { formatDate, formatNumber, relativeTime } from "./format";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe("es-CL display formatters", () => {
  it("renders past relative time in Spanish", () => {
    expect(relativeTime(new Date(Date.now() - 3 * DAY).toISOString())).toBe("hace 3 días");
    expect(relativeTime(new Date(Date.now() - 5 * MINUTE).toISOString())).toBe("hace 5 minutos");
  });

  it("renders future relative time in Spanish", () => {
    expect(relativeTime(new Date(Date.now() + 2 * 7 * DAY).toISOString())).toBe(
      "dentro de 2 semanas",
    );
    expect(relativeTime(new Date(Date.now() + 4 * HOUR).toISOString())).toBe("dentro de 4 horas");
  });

  it("renders the present without a unit", () => {
    expect(relativeTime(new Date().toISOString())).toBe("ahora mismo");
  });

  it("formats dates es-CL (day month year)", () => {
    expect(formatDate("2026-08-12T15:00:00.000Z")).toMatch(/^\d{1,2} ago 2026$|^12 ago 2026$/);
  });

  it("formats numbers with the es-CL thousands separator", () => {
    expect(formatNumber(1234)).toMatch(/^1\.234$/);
  });
});
