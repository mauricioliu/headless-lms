import Link from "next/link";
import { Inbox } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** No enrollments at all (handoff §6 / account empty). */
export function LibraryEmpty() {
  return (
    <div className="mx-auto max-w-[560px] px-7 py-[90px] text-center">
      <div className="mx-auto mb-6 grid size-16 place-items-center rounded-[18px] border border-line bg-surface text-ink-faintest">
        <Inbox className="size-7" strokeWidth={1.5} />
      </div>
      <h1 className="mb-3 text-[28px] font-semibold tracking-[-0.01em]">
        Tu biblioteca está vacía
      </h1>
      <p className="mb-[26px] text-[15.5px] leading-[1.6] text-ink-2">
        Todavía no tienes cursos asignados.
      </p>
    </div>
  );
}

/** No courses match the active filter (handoff §6). */
export function FilterEmpty({ showAllHref }: { showAllHref: string }) {
  return (
    <div className="rounded-card border border-dashed border-line-dashed bg-surface-warm-2 px-6 py-16 text-center">
      <div className="mb-3.5 flex justify-center text-ink-faintest">
        <Inbox className="size-[30px]" strokeWidth={1.5} />
      </div>
      <div className="mb-1.5 text-[21px] font-semibold">Nada por aquí por ahora</div>
      <p className="mb-[18px] text-[14px] text-ink-3">Ningún curso coincide con este filtro.</p>
      <Link
        href={showAllHref}
        className={buttonVariants({ variant: "ghostOutline", size: "pillSm" })}
      >
        Ver todos los cursos
      </Link>
    </div>
  );
}
