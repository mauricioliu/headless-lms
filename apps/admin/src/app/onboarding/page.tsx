import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { SessionReset } from "./session-reset";

export const metadata: Metadata = { title: "Setting up — Headless LMS" };

// The single decision point after authentication. It resolves the session and
// sends the user to the one thing they need to do next. A session it cannot
// route is one that has to be re-established, so it is cleared, not bounced.
export default async function OnboardingPage() {
  const session = await getServerSession();
  if (session?.status === "authenticated") redirect("/");
  if (session?.status === "no-active-org") redirect("/onboarding/select-organization");
  if (session?.status === "no-organization") redirect("/onboarding/create-organization");
  return <SessionReset />;
}
