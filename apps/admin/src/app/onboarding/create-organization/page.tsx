import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { CreateOrgForm } from "./create-org-form";

export const metadata: Metadata = { title: "Create your organization" };

export default async function CreateOrganizationPage() {
  const session = await getServerSession();
  // This page serves one state; every other one is /onboarding's to route.
  if (session?.status !== "no-organization") redirect("/onboarding");

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-ink">Create your organization</h1>
        <p className="text-sm text-ink-3 text-pretty">
          You&apos;re signed in but not part of an organization yet. Create one to get started —
          you&apos;ll be its owner.
        </p>
      </div>
      <CreateOrgForm />
    </>
  );
}
