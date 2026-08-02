"use client";

import { useState } from "react";

export function CommentComposer({
  placeholder,
  submitLabel,
  initialValue = "",
  autoFocus = false,
  rows = 3,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  initialValue?: string;
  autoFocus?: boolean;
  rows?: number;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const trimmed = value.trim();

  async function submit() {
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      setValue("");
      onCancel?.();
    } catch {
      // The hook already surfaced the failure; keep the draft so the
      // reader can retry rather than retyping.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-none rounded-card border border-line bg-surface px-3.5 py-2.5 text-[14px] leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-4 focus:border-line-hover"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11.5px] text-ink-4">Press ⌘↵ to post</span>
        <div className="flex items-center gap-1">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-ink-3 transition-colors hover:bg-hover-surface hover:text-ink"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!trimmed || busy}
            className="rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-brand-contrast transition-colors hover:bg-brand-strong disabled:opacity-40"
          >
            {busy ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
