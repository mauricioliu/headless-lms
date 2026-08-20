import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { CreateAccountForm, InviteView, SignInForm } from "./invite-view";
import { signUp, signIn } from "@/lib/auth/client";

vi.mock("@/lib/auth/client", () => ({
  signUp: { email: vi.fn() },
  signIn: { email: vi.fn() },
  authClient: { getSession: vi.fn() },
}));

/** Strips React's SSR text-node markers so interpolated copy asserts as one
 *  string. */
function render(screen: React.ReactElement): string {
  return renderToString(screen).replaceAll("<!-- -->", "");
}

void signUp;
void signIn;

describe("member-invite landing (Admin Cliente register)", () => {
  it("shows the Empresa Cliente wordmark while checking the invitation", () => {
    const html = render(<InviteView brandName="Minera Los Andes" />);
    expect(html).toContain("Minera Los Andes");
    expect(html).toContain("Revisando la invitación…");
  });

  it("first-time form sets name and password in Spanish, address-less", () => {
    const html = render(<CreateAccountForm email="rosa@faena.test" token="t" />);
    expect(html).toContain("Nombre");
    expect(html).toContain("Correo");
    expect(html).toContain("Contraseña");
    expect(html).toContain("Crear cuenta");
    expect(html).toContain("Al menos 8 caracteres");
  });

  it("sign-in form is Spanish", () => {
    const html = render(<SignInForm email="rosa@faena.test" token="t" />);
    expect(html).toContain("Correo");
    expect(html).toContain("Entrar");
  });

  it("never addresses the Admin Cliente as tú and never says estudiante", () => {
    for (const html of [
      render(<InviteView brandName="Minera Los Andes" />),
      render(<CreateAccountForm email="rosa@faena.test" token="t" />),
      render(<SignInForm email="rosa@faena.test" token="t" />),
    ]) {
      expect(html).not.toMatch(/\btu\b|\btus\b/);
      expect(html).not.toMatch(/estudiante|alumno/i);
    }
  });
});
