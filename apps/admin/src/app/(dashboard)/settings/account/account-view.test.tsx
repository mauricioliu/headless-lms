import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SessionProvider } from "@/lib/auth/session-context";
import type { ServerSession } from "@/lib/auth/server-session";
import { AccountView } from "./account-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

const session: ServerSession = {
  user: { id: "u_1", name: "Rosa Ríos", email: "rosa@faena.test", image: null },
  organization: { id: "o_1", name: "Faena Piloto", slug: "faena-piloto" },
  role: "admin",
  status: "authenticated",
  organizations: [],
};

/** Strips React's SSR text-node markers so interpolated copy asserts as one
 *  string. */
function render(screen: React.ReactElement): string {
  return renderToString(screen).replaceAll("<!-- -->", "");
}

describe("Settings/Account (Admin Cliente surface)", () => {
  it("renders in Spanish", () => {
    const html = render(
      <SessionProvider session={session}>
        <AccountView />
      </SessionProvider>,
    );
    expect(html).toContain("Organización");
    expect(html).toContain("Faena Piloto");
    expect(html).toContain("Rol");
    expect(html).toContain("Cerrar sesión");
  });

  it("never addresses the Admin Cliente as tú", () => {
    const html = render(
      <SessionProvider session={session}>
        <AccountView />
      </SessionProvider>,
    );
    expect(html).not.toMatch(/\btu\b|\btus\b/);
  });
});
