import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TableEmpty, TableError, TableForbidden } from "./states";
import { Pagination } from "./pagination";

/** Strips React's SSR text-node markers so interpolated copy asserts as one
 *  string. */
function render(screen: React.ReactElement): string {
  return renderToString(screen).replaceAll("<!-- -->", "");
}

describe("data-table chrome (shared, es per ADR 0002)", () => {
  it("empty state renders Spanish, filtered or not", () => {
    expect(render(<TableEmpty colSpan={2} title="Aún no hay Trabajadores" />)).toContain(
      "Aún no hay Trabajadores",
    );
    expect(render(<TableEmpty colSpan={2} title="x" filtered />)).toContain("Sin resultados");
    expect(render(<TableEmpty colSpan={2} title="x" filtered />)).toContain(
      "Ajuste la búsqueda o los filtros.",
    );
  });

  it("error state renders Spanish with a retry action", () => {
    const html = render(<TableError colSpan={2} onRetry={() => {}} />);
    expect(html).toContain("No se pudieron cargar los datos");
    expect(html).toContain("Reintentar");
  });

  it("forbidden state renders Spanish", () => {
    const html = render(<TableForbidden colSpan={2} />);
    expect(html).toContain("No tiene acceso a esto");
  });

  it("pagination renders Spanish range, rows and page labels", () => {
    const html = render(
      <Pagination
        page={2}
        pageSize={10}
        total={35}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />,
    );
    expect(html).toContain("11");
    expect(html).toMatch(/>20<\/span> de /);
    expect(html).toMatch(/>35<\/span>/);
    expect(html).toContain("Filas");
    expect(html).toContain("Página 2 de 4");
  });
});
