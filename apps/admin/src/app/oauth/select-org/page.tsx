import { Suspense } from "react";
import type { Metadata } from "next";
import { SelectOrgView } from "./select-org-view";

export const metadata: Metadata = { title: "Choose an organization — Headless LMS" };

export default function SelectOrgPage() {
  return (
    <Suspense>
      <SelectOrgView />
    </Suspense>
  );
}
