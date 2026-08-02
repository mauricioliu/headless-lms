import type { ReactNode } from "react";

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-x-12 gap-y-4 py-8 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && <p className="text-pretty text-sm text-ink-3">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}


export function SettingsRow({
  htmlFor,
  label,
  hint,
  control,
}: {
  htmlFor: string;
  label: string;
  hint: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
          {label}
        </label>
        <p className="mt-0.5 text-pretty text-sm text-ink-3">{hint}</p>
      </div>
      {control}
    </div>
  );
}
