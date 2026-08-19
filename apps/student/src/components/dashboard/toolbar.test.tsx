import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

import { Toolbar } from "./toolbar";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const props = { filter: "all", sort: "recent", layout: "grid" } as const;

function render(): string {
  return renderToString(<Toolbar {...props} />);
}

describe("Toolbar (seam 2: rendered route surface, español)", () => {
  it("labels the filters in Spanish", () => {
    const html = render();
    expect(html).toContain("Todos");
    expect(html).toContain("En progreso");
    expect(html).toContain("Completados");
  });

  it("labels the sort options in Spanish while the option values stay ASCII", () => {
    const html = render();
    expect(html).toContain("Ordenar");
    expect(html).toContain("Acceso más reciente");
    expect(html).toContain("Avance");
    expect(html).toContain("Título (A–Z)");
    expect(html).toContain('value="recent"');
    expect(html).toContain('value="progress"');
    expect(html).toContain('value="title"');
  });

  it("labels the layout toggle in Spanish", () => {
    const html = render();
    expect(html).toContain("Cuadrícula");
    expect(html).toContain("Lista");
  });
});
