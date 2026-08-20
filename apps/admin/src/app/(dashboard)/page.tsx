import { serverApi } from "@/lib/api/server";
import { requireAuth } from "@/lib/auth/server-session";
import { isManager } from "@/lib/roles";
import { redirect } from "next/navigation";

import { ENROLLMENT_RANGES } from "./_components/enrollment-ranges";
import { OverviewView } from "./_components/overview-view";

// Dashboard overview. `requireAuth` shares the layout's cached session (free)
// and redirects if unauthenticated; the layout has already handled the no-org
// states, so reaching here means an authenticated session with an active org —
// safe to fire the org-scoped stats.
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();

  // The Overview is the Operador's authoring home; a manager (the Admin
  // Cliente) lands on the Olas list instead — their surface, not this one.
  if (isManager(session.role)) redirect("/waves");

  const sp = await searchParams;
  const range = ENROLLMENT_RANGES.find((r) => r.key === sp.range) ?? ENROLLMENT_RANGES[1];

  const manager = isManager(session.role);
  const [stats, enrollments] = await Promise.all([
    serverApi.overview(),
    manager ? serverApi.enrollmentSeries(range.days) : Promise.resolve(null),
  ]);

  return (
    <OverviewView
      role={session.role}
      user={session.user}
      organization={session.organization}
      stats={stats}
      enrollments={enrollments}
      range={range.key}
    />
  );
}
