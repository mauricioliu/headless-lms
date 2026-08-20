import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/auth/client", () => ({
  signIn: { email: vi.fn() },
  authClient: {},
  useSession: () => ({ data: null }),
}));

import { LoginView } from "./login-view";

/** Strips React's SSR text-node markers so interpolated copy asserts as one
 *  string. */
function render(screen: React.ReactElement): string {
  return renderToString(screen).replaceAll("<!-- -->", "");
}

describe("student login (Trabajador register)", () => {
  it("renders in Spanish with the brand", () => {
    const html = render(<LoginView brandName="Minera Los Andes" />);
    expect(html).toContain("Minera Los Andes");
    expect(html).toContain("Iniciar sesión");
    expect(html).toContain("Contraseña");
  });

  it("offers the password-reset entry point", () => {
    const html = render(<LoginView brandName="Minera Los Andes" />);
    expect(html).toContain("¿Olvidaste tu contraseña?");
  });

  it("keeps the portal's tú register", () => {
    const html = render(<LoginView brandName="Minera Los Andes" />);
    expect(html).toContain("Ingresa tus datos");
  });
});
