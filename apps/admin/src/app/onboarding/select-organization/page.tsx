import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { OrgPicker } from "./org-picker";

export const metadata: Metadata = { title: "Choose an organization — Headless LMS" };

export default async function SelectOrganizationPage() {
  const session = await getServerSession();
  // This page serves one state; every other one is /onboarding's to route.
  if (session?.status !== "no-active-org") redirect("/onboarding");

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-ink">Choose an organization</h1>
        <p className="text-sm text-ink-3 text-pretty">
          You belong to more than one. Pick the one you want to work in — you can switch later.
        </p>
      </div>
      <OrgPicker organizations={session.organizations} />
    </>
  );
}
