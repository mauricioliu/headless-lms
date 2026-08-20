"use client";

// Root error boundary — catches errors thrown outside the `(dashboard)` group
// (the login page, and the dashboard *layout* itself, whose failures bubble past
// the group's own boundary). Rendered inside the root layout, so fonts and
// global styles still apply, but there is no app chrome — center the card.
import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the real error to the console/monitoring; the UI stays generic.
    console.error("root route error:", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-well text-ink-3">
        <TriangleAlert className="size-5" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-base font-medium tracking-tight text-ink">Algo falló</h1>
        <p className="max-w-[42ch] text-pretty text-sm text-ink-3">
          La página no se pudo cargar. Inténtelo de nuevo o vuelva al inicio.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={reset}>
          <RotateCw className="size-4" />
          Reintentar
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
      {error.digest ? (
        <p className="font-mono text-xs text-ink-4">ref: {error.digest}</p>
      ) : null}
    </main>
  );
}
