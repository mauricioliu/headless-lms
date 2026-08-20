import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SetPasswordView } from "./set-password-view";

/** Strips React's SSR text-node markers so interpolated copy asserts as one
 *  string. */
function render(screen: React.ReactElement): string {
  return renderToString(screen).replaceAll("<!-- -->", "");
}

describe("admin set-password (reset landing)", () => {
  it("renders the new-password form for a valid token, in Spanish", () => {
    const html = render(<SetPasswordView token="tok_123" />);
    expect(html).toContain("Elegir contraseña nueva");
    expect(html).toContain("Contraseña nueva");
    expect(html).toContain("Confirmar contraseña");
    expect(html).toContain("Guardar contraseña");
  });

  it("renders an invalid/expired link state without a form", () => {
    const html = render(<SetPasswordView token={null} />);
    expect(html).toContain("Enlace no válido");
    expect(html).toContain("El enlace expiró o ya se usó");
    expect(html).not.toContain("Guardar contraseña");
  });

  it("never addresses the Admin Cliente as tú", () => {
    const html = render(<SetPasswordView token="tok_123" />);
    expect(html).not.toMatch(/\btu\b|\btus\b/);
  });
});
