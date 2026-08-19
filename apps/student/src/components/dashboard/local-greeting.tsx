"use client";

import { dateLabel, firstName, greeting } from "@/lib/format";
import { useLocalNow } from "@/lib/local-clock";

/**
 * Date eyebrow + time-of-day greeting — the only thing on this page that
 * genuinely needs the client, since "Buenas noches" is the *viewer's* night.
 * `serverNow` renders the first paint, then the local clock takes over.
 */
export function LocalGreeting({ name, serverNow }: { name: string; serverNow: string }) {
  const now = useLocalNow() ?? new Date(serverNow);

  return (
    <div>
      <div className="mb-[7px] text-[12px] tracking-[0.04em] text-ink-4">{dateLabel(now)}</div>
      <h1 className="text-[33px] font-semibold tracking-[-0.015em]">
        {greeting(now)}, {firstName(name)}
      </h1>
    </div>
  );
}
