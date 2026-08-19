import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";

import { AuthShell, AuthHeading } from "./auth-shell";

describe("AuthShell (seam 2: rendered route surface, español + marca)", () => {
  it("shows the Empresa Cliente's brand, not the substrate's name", () => {
    const html = renderToString(
      <AuthShell brandName="Minera Los Andes">
        <AuthHeading title="Recibiste una invitación">Crea tu cuenta.</AuthHeading>
      </AuthShell>,
    );
    expect(html).toContain("Minera Los Andes");
    expect(html).not.toContain("Headless LMS");
  });

  it("keeps Nuvora as a service credit only", () => {
    const html = renderToString(
      <AuthShell brandName="Minera Los Andes">
        <AuthHeading title="Iniciar sesión" />
      </AuthShell>,
    );
    expect(html).toContain("Plataforma de cursos por Nuvora");
  });

  it("speaks Spanish in the tú register on the showcase panel", () => {
    const html = renderToString(
      <AuthShell brandName="Minera Los Andes">
        <AuthHeading title="Iniciar sesión" />
      </AuthShell>,
    );
    expect(html).toContain("Tus cursos, en un solo lugar tranquilo.");
    expect(html).toContain("Retoma justo donde lo dejaste.");
  });
});
