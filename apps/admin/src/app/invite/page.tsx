import { Suspense } from "react";
import type { Metadata } from "next";
import { InviteView } from "./invite-view";

export const metadata: Metadata = { title: "Join the team — Headless LMS" };

export default function InvitePage() {
  return (
    <Suspense>
      <InviteView />
    </Suspense>
  );
}
