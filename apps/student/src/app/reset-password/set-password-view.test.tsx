import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SetPasswordView } from "./set-password-view";

/** Strips React's SSR text-node markers so interpolated copy asserts as one
 *  string. */
function render(screen: React.ReactElement): string {
  return renderToString(screen).replaceAll("<!-- -->", "");
}

describe("student set-password (reset landing)", () => {
  it("renders the new-password form for a valid token, in Spanish", () => {
    const html = render(<SetPasswordView brandName="Minera Los Andes" token="tok_123" />);
    expect(html).toContain("Minera Los Andes");
    expect(html).toContain("Elegir contraseña nueva");
    expect(html).toContain("Contraseña nueva");
    expect(html).toContain("Guardar contraseña");
  });

  it("renders an invalid/expired link state without a form", () => {
    const html = render(<SetPasswordView brandName="Minera Los Andes" token={null} />);
    expect(html).toContain("Enlace no válido");
    expect(html).not.toContain("Guardar contraseña");
  });

  it("keeps the portal's tú register", () => {
    const html = render(<SetPasswordView brandName="Minera Los Andes" token="tok_123" />);
    expect(html).toContain("Elige la contraseña para entrar al portal");
    expect(html).not.toContain("Inténtelo");
    expect(html).not.toContain("Elija");
  });
});
