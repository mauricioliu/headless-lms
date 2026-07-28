import * as React from "react";

// One group of course settings: a sticky-feeling description column on the
// left, the controls on the right. Sections stack inside a `divide-y` list, so
// the separation is a hairline rule rather than a card per group.
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-x-12 gap-y-4 py-8 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="text-pretty text-sm text-ink-3">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** A single labelled control inside a section. */
export function SettingsRow({
  htmlFor,
  label,
  hint,
  control,
}: {
  htmlFor: string;
  label: string;
  hint: string;
  control: React.ReactNode;
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
