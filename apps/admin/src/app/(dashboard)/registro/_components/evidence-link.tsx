import Link from "next/link";
import { ScrollText } from "lucide-react";

/** The one entry point to "Qué atestigua el registro" from the report
 *  surfaces — plain server-safe markup so both the Olas list (RSC) and the
 *  per-Ola report (client island) can render it. */
export function EvidenceLink({ className }: { className?: string }) {
  return (
    <Link
      href="/registro"
      className={
        className ??
        "inline-flex items-center gap-1.5 text-sm text-ink-3 underline-offset-4 hover:text-ink hover:underline"
      }
    >
      <ScrollText className="size-4" aria-hidden />
      Qué atestigua el registro
    </Link>
  );
}
