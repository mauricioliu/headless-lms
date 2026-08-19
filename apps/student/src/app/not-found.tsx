// Branded 404 — rendered for unknown URLs and `notFound()` calls (e.g. the
// course player when the course or its modules can't be fetched).
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col items-center justify-center px-7 text-center">
      <div className="mb-6 grid size-16 place-items-center rounded-[18px] border border-line bg-surface text-ink-faintest">
        <SearchX className="size-7" strokeWidth={1.5} />
      </div>
      <h1 className="mb-3 text-[28px] font-semibold tracking-[-0.01em]">Página no encontrada</h1>
      <p className="mb-[26px] text-[15.5px] leading-[1.6] text-ink-2">
        Esta página no existe o ya no tienes acceso a ella.
      </p>
      <Button variant="brand" size="pillSm" asChild>
        <Link href="/">Volver a mis cursos</Link>
      </Button>
    </main>
  );
}
