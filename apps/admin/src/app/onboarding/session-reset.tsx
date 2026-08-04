"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

import { signOut } from "@/lib/auth/client";

// Reached when the session cannot be routed: no cookie, a rejected cookie, or a
// valid cookie carrying no staff role. Clearing it is what stops /login from
// sending the same unusable session straight back here.
export function SessionReset() {
  const started = useRef(false);

  useEffect(() => {
    // Strict-mode double-mount fires this twice; the sign-out must run once.
    if (started.current) return;
    started.current = true;
    void signOut().finally(() => window.location.assign("/login"));
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Loader2 className="size-5 animate-spin text-brand" />
      <p className="text-sm text-ink-3">Signing you out…</p>
    </div>
  );
}
