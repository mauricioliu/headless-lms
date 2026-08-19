import { describe, expect, it } from "vitest";

import { dateLabel, formatBytes, greeting, initials, relativeTime } from "./format";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h);

describe("dateLabel (es-CL)", () => {
  it("renders the weekday and the long month date", () => {
    expect(dateLabel(at(2026, 7, 14))).toBe("viernes · 14 de agosto");
  });

  it("renders another weekday correctly", () => {
    expect(dateLabel(at(2026, 2, 1))).toBe("domingo · 1 de marzo");
  });
});

describe("greeting (es-CL)", () => {
  it("greets by local hour", () => {
    expect(greeting(at(2026, 7, 12, 8))).toBe("Buenos días");
    expect(greeting(at(2026, 7, 12, 14))).toBe("Buenas tardes");
    expect(greeting(at(2026, 7, 12, 21))).toBe("Buenas noches");
  });
});

describe("relativeTime (es)", () => {
  it("covers the compact ages a comment byline uses", () => {
    const now = Date.now();
    expect(relativeTime(new Date(now - 5_000).toISOString())).toBe("ahora mismo");
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString())).toBe("hace 5 min");
    expect(relativeTime(new Date(now - 3 * 3_600_000).toISOString())).toBe("hace 3 h");
    expect(relativeTime(new Date(now - 5 * 86_400_000).toISOString())).toBe("hace 5 d");
  });

  it("falls back to a plain es-CL date once it stops being news", () => {
    const old = new Date(2026, 0, 8, 12);
    expect(relativeTime(old.toISOString())).toMatch(/8 ene|08 ene/);
  });

  it("returns empty string for an unparseable timestamp", () => {
    expect(relativeTime("not-a-date")).toBe("");
  });
});

describe("initials", () => {
  it("keeps its behaviour untouched by the sweep", () => {
    expect(initials("Camila Reyes")).toBe("CR");
    expect(initials("Roberto")).toBe("R");
  });
});

describe("formatBytes", () => {
  it("keeps its technical units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(4.2 * 1024 * 1024)).toBe("4.2 MB");
  });
});
