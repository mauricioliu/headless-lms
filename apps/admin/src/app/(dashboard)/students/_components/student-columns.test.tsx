import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { flexRender } from "@tanstack/react-table";

import { studentColumns } from "./student-columns";
import type { Student } from "@/lib/api/types";

const row: Student = {
  id: "ou_1",
  firstName: "Juana",
  lastName: "Pérez",
  email: "juana.perez@faena.test",
  image: null,
  status: "invited",
  entitlementCount: 2,
  avgProgress: 45.5,
  joinedAt: new Date().toISOString(),
  lastActiveAt: new Date().toISOString(),
};

/** Renders every header + the identity/action cells of a fixed row, as text. */
function renderColumns(): string {
  let html = "";
  const render = (node: unknown) => renderToString(node as React.ReactElement);
  const stubColumn = {
    getCanSort: () => false,
    getCanHide: () => false,
    getIsSorted: () => false,
    toggleSorting: () => {},
    toggleVisibility: () => {},
  };
  const columns = studentColumns(
    () => {},
    () => {},
  );
  for (const col of columns) {
    if (typeof col.header === "function") {
      html += render(
        flexRender(col.header, {
          column: stubColumn as never,
          header: {} as never,
          table: {} as never,
        }),
      );
    }
    if (col.id === "actions" && col.cell) {
      html += render(
        flexRender(col.cell, {
          column: stubColumn as never,
          row: { original: row, getIsSelected: () => false } as never,
          getValue: (() => undefined) as never,
          table: {} as never,
          renderValue: (() => undefined) as never,
        } as never),
      );
    }
  }
  return html;
}

describe("Trabajadores table columns (Admin Cliente surface)", () => {
  it("labels the person Trabajador — never Student/estudiante", () => {
    const html = renderColumns();
    expect(html).toContain("Trabajador");
    expect(html).not.toContain("Student");
    expect(html).not.toContain("Estudiante");
    expect(html).not.toContain("Estudiantes");
  });

  it("labels the rest of the surface in Spanish", () => {
    const html = renderColumns();
    expect(html).toContain("Accesos");
    expect(html).toContain("Avance promedio");
    expect(html).toContain("Agregado");
    expect(html).toContain("Última actividad");
  });

  it("never addresses the Admin Cliente as tú", () => {
    const html = renderColumns();
    expect(html).not.toMatch(/\btu\b|\btus\b/);
  });
});
