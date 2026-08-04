import type { ReactNode } from "react";

import { Logo } from "@/components/app-shell/logo";
import { SignOutLink } from "./sign-out-link";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo org="Headless LMS" />
        </div>
        <div className="mt-6 rounded-card border border-line bg-surface p-6">{children}</div>
        <SignOutLink />
      </div>
    </div>
  );
}
