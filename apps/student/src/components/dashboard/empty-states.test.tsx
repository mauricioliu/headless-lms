import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

import { FilterEmpty, LibraryEmpty } from "./empty-states";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("dashboard empty states (seam 2: rendered route surface, español)", () => {
  it("LibraryEmpty speaks Spanish in the tú register", () => {
    const html = renderToString(<LibraryEmpty />);
    expect(html).toContain("Tu biblioteca está vacía");
    expect(html).toContain("Todavía no tienes cursos asignados.");
  });

  it("FilterEmpty speaks Spanish and keeps a way out", () => {
    const html = renderToString(<FilterEmpty showAllHref="/?filter=all" />);
    expect(html).toContain("Nada por aquí por ahora");
    expect(html).toContain("Ningún curso coincide con este filtro.");
    expect(html).toContain("Ver todos los cursos");
  });
});
