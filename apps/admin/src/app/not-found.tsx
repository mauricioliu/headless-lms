// Branded 404 — rendered for unknown URLs and every `notFound()` call (editor
// and preview pages with missing activities, `requireManager` for non-managers).
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-well text-ink-3">
        <SearchX className="size-5" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-base font-medium tracking-tight text-ink">Página no encontrada</h1>
        <p className="max-w-[42ch] text-pretty text-sm text-ink-3">
          Esta página no existe, o no tiene acceso a ella.
        </p>
      </div>
      <Button variant="secondary" asChild>
        <Link href="/">Volver al inicio</Link>
      </Button>
    </main>
  );
}
