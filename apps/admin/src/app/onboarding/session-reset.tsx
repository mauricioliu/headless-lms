"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import { signOut } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

// Reached when the session cannot be routed: no cookie, a rejected cookie, or a
// valid cookie carrying no staff role. Clearing it is what stops /login from
// sending the same unusable session straight back here.

// signOut() resolves with { data, error } rather than rejecting on API-level
// errors, so both a rejected promise and a truthy `error` count as failure.
function attemptSignOut(onFailure: () => void) {
  signOut()
    .then(({ error }) => {
      if (error) {
        onFailure();
        return;
      }
      window.location.assign("/login");
    })
    .catch(onFailure);
}

export function SessionReset() {
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Strict-mode double-mount fires this twice; the sign-out must run once.
    if (started.current) return;
    started.current = true;
    attemptSignOut(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <div className="flex flex-col gap-3 py-2">
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>No se pudo cerrar la sesión. Inténtelo de nuevo.</p>
        </div>
        <Button
          variant="primary"
          className="w-full"
          onClick={() => attemptSignOut(() => setFailed(true))}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Loader2 className="size-5 animate-spin text-brand" />
      <p className="text-sm text-ink-3">Cerrando la sesión…</p>
    </div>
  );
}
