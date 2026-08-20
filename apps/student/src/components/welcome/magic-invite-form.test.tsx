import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/client", () => ({
  authClient: { signIn: { magicLink: vi.fn() } },
}));

import { MagicInviteForm } from "./magic-invite-form";

function render(screen: React.ReactElement): string {
  return renderToString(screen).replaceAll("<!-- -->", "");
}

describe("magic invite form (Trabajador register)", () => {
  it("explains the passwordless entry in Spanish, naming the invited email", () => {
    const html = render(<MagicInviteForm email="juana.perez@faena.test" stale={false} />);
    expect(html).toContain("juana.perez@faena.test");
    expect(html).toContain("para que entres sin crear contraseña");
    expect(html).toContain("Enviar el enlace a mi correo");
    expect(html).not.toContain("Contraseña");
  });

  it("says the link is stale when the mail link came back bad", () => {
    const html = render(<MagicInviteForm email="juana.perez@faena.test" stale={true} />);
    expect(html).toContain("El enlace con el que llegaste expiró o ya se usó");
  });
});
