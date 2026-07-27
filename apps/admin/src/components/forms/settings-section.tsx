import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Card-per-group settings layout, shared by every settings surface: a titled
 * section holding divided rows, with the form's actions in a bordered footer.
 */
export function SettingsSection({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-card border border-line bg-surface">
      <header className="flex flex-col gap-1 border-b border-line px-6 py-4">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description ? <p className="text-sm text-ink-3 text-pretty">{description}</p> : null}
      </header>
      <div className="flex flex-col divide-y divide-line">{children}</div>
      {footer ? (
        <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

/** One setting: label + hint on the left, its control on the right. */
export function SettingRow({
  id,
  label,
  hint,
  error,
  controlClassName,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  controlClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        {error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : hint ? (
          <p className="text-sm text-ink-4 text-pretty">{hint}</p>
        ) : null}
      </div>
      <div className={cn("shrink-0 sm:pt-0.5", controlClassName)}>{children}</div>
    </div>
  );
}
