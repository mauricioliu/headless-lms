import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";
import { getBranding } from "@/lib/api/branding";

import { LoginView } from "./login-view";

export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await getBranding();
  return { title: `Iniciar sesión — ${brandName}` };
}

// Any session at all goes to /onboarding — including one that turns out to be
// unusable, which /onboarding clears. That leaves this page one job: credentials.
export default async function LoginPage() {
  const session = await getServerSession();
  if (session) redirect("/onboarding");

  const { brandName } = await getBranding();
  return <LoginView brandName={brandName} />;
}
