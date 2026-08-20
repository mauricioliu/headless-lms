import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LoginView } from "./login-view";
import { ForgotPasswordForm } from "./forgot-password";

/** Strips React's SSR text-node markers so interpolated copy asserts as one
 *  string. */
function render(screen: React.ReactElement): string {
  return renderToString(screen).replaceAll("<!-- -->", "");
}

const BRAND = "Minera Los Andes";

describe("admin login (Admin Cliente register)", () => {
  it("renders in Spanish with the Empresa Cliente brand and no signup link", () => {
    const html = render(<LoginView brandName={BRAND} />);
    expect(html).toContain(BRAND);
    expect(html).toContain("Iniciar sesión");
    expect(html).toContain("Correo");
    expect(html).toContain("Contraseña");
    // Public signup stays English and unlinked from the Admin Cliente login.
    expect(html).not.toContain("signup");
    expect(html).not.toContain("Create an account");
  });

  it("never addresses the Admin Cliente as tú", () => {
    const html = render(<LoginView brandName={BRAND} />);
    expect(html).not.toMatch(/\btu\b|\btus\b|Olvidaste|Bienvenido de nuevo/);
  });

  it("offers the password-reset entry point", () => {
    const html = render(<LoginView brandName={BRAND} />);
    expect(html).toContain("¿Olvidó la contraseña?");
  });

  it("shows Nuvora only as a service credit, never the wordmark", () => {
    const html = render(<LoginView brandName={BRAND} />);
    expect(html).toContain("Plataforma de cursos por Nuvora");
    expect(html).not.toContain("Headless LMS");
    expect(html).not.toContain("HeadlessLms");
  });
});

describe("admin forgot-password", () => {
  it("renders in Spanish without register", () => {
    const html = render(<ForgotPasswordForm onBack={() => {}} />);
    expect(html).toContain("Restablecer contraseña");
    expect(html).toContain("Enviar enlace");
    expect(html).not.toMatch(/\btu\b|\btus\b/);
  });
});
