import * as React from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { OnboardingView } from "./onboarding-view";

export const metadata: Metadata = { title: "Create your organization — Headless LMS" };

// Onboarding sits outside the `(dashboard)` group so the org-creation prompt has
// its own URL instead of rendering in place of whatever dashboard route the user
// landed on. The gate is the dashboard's, inverted: only a signed-in session
// with no organization belongs here — everyone else is sent where they do.
export default async function OnboardingPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (session.status === "denied") redirect("/login?denied=1");
  // Already has an org (active or awaiting activation) — the dashboard takes over.
  if (session.status !== "no-organization") redirect("/");

  return <OnboardingView />;
}
