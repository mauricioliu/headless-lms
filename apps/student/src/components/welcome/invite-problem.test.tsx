import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";

import { InviteProblem } from "./invite-problem";

describe("InviteProblem (seam 2: rendered route surface, español)", () => {
  it("renders the terminal invite state in Spanish", () => {
    const html = renderToString(
      <InviteProblem message="Este enlace de invitación no es válido o ya expiró." />,
    );
    expect(html).toContain("Invitación no encontrada");
    expect(html).toContain("Este enlace de invitación no es válido o ya expiró.");
    expect(html).toContain(
      "Pide al administrador de tus cursos que te envíe una nueva invitación.",
    );
  });
});
