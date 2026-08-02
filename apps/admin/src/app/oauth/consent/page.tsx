import { Suspense } from "react";
import type { Metadata } from "next";
import { ConsentView } from "./consent-view";

export const metadata: Metadata = { title: "Authorize access — Headless LMS" };

export default function ConsentPage() {
  return (
    <Suspense>
      <ConsentView />
    </Suspense>
  );
}
