"use client";

import type { CSSProperties } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

/** Sticky bottom footer nav (handoff §12). */
export function FooterNav({
  isCompleted,
  showMarkComplete = true,
  prevDisabled,
  nextDisabled,
  onPrev,
  onNext,
  onMarkComplete,
}: {
  isCompleted: boolean;
  /** False when the lesson completes by watching (Segmento) — no manual path. */
  showMarkComplete?: boolean;
  prevDisabled: boolean;
  nextDisabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  onMarkComplete: () => void;
}) {
  const ghost = (disabled: boolean): CSSProperties => ({
    border: "1px solid var(--line-btn)",
    background: "var(--surface)",
    color: disabled ? "var(--ink-faintest)" : "var(--ink-btn)",
    cursor: disabled ? "default" : "pointer",
  });

  return (
    <div className="flex flex-none items-center justify-between gap-3 border-t border-line-strong bg-surface-warm px-[22px] py-3">
      <button
        type="button"
        onClick={onPrev}
        disabled={prevDisabled}
        className="inline-flex items-center gap-[7px] rounded-full px-4 py-2.5 text-[13.5px] font-semibold"
        style={ghost(prevDisabled)}
      >
        <ChevronLeft className="size-4" />
        Anterior
      </button>

      {showMarkComplete ? (
        <button
          type="button"
          onClick={onMarkComplete}
          className="inline-flex items-center gap-2 rounded-full py-[11px] text-[14px] font-semibold"
          style={
            isCompleted
              ? { background: "var(--brand-soft)", color: "var(--brand)", padding: "11px 22px" }
              : { background: "var(--brand)", color: "var(--brand-contrast)", padding: "11px 24px" }
          }
        >
          {isCompleted && <Check className="size-4" strokeWidth={2.4} />}
          {isCompleted ? "Completado" : "Marcar como completado"}
        </button>
      ) : (
        <span className="text-[13px] text-ink-3">Se completa al ver el video hasta el final</span>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="inline-flex items-center gap-[7px] rounded-full px-4 py-2.5 text-[13.5px] font-semibold"
        style={ghost(nextDisabled)}
      >
        {nextDisabled ? "Terminar" : "Siguiente"}
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
