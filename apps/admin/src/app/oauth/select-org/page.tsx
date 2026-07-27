import * as React from "react";
import type { Metadata } from "next";
import { SelectOrgView } from "./select-org-view";

export const metadata: Metadata = { title: "Choose an organization — Headless LMS" };

export default function SelectOrgPage() {
  return (
    <React.Suspense>
      <SelectOrgView />
    </React.Suspense>
  );
}
