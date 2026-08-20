import type { ReactNode } from "react";

import { Logo } from "@/components/app-shell/logo";
import { getBranding } from "@/lib/api/branding";
import { SignOutLink } from "./sign-out-link";

// Pre-org routing surface on the Admin Cliente's entry path; the wordmark is
// the deployment's brand (the session has no org resolved yet).
export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  const { brandName } = await getBranding();
  return (
    <div className="grid min-h-dvh place-items-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo org={brandName} />
        </div>
        <div className="mt-6 rounded-card border border-line bg-surface p-6">{children}</div>
        <SignOutLink />
      </div>
    </div>
  );
}
