import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { OrgPicker } from "./org-picker";

export const metadata: Metadata = { title: "Elegir organización" };

export default async function SelectOrganizationPage() {
  const session = await getServerSession();
  // This page serves one state; every other one is /onboarding's to route.
  if (session?.status !== "no-active-org") redirect("/onboarding");

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-ink">Elegir organización</h1>
        <p className="text-sm text-ink-3 text-pretty">
          La sesión pertenece a más de una organización. Elija en cuál trabajar; se puede cambiar
          más tarde.
        </p>
      </div>
      <OrgPicker organizations={session.organizations} />
    </>
  );
}
