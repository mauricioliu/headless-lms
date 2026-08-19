import { notFound } from "next/navigation";

import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { ApiError } from "@/lib/api/http";

import { WaveReportView } from "./_components/wave-report-view";

// Per-Ola report (the Admin Cliente's table + CSV): the Server Component
// fetches the composed report and hands it to the client view; a missing Ola
// surfaces as the SDK's 404, which maps to notFound().
export default async function WaveReportPage({ params }: { params: Promise<{ waveId: string }> }) {
  const { waveId } = await params;

  const dataPromise = serverApi.waveReport(waveId);
  await requireManager(dataPromise);
  try {
    const report = await dataPromise;
    return <WaveReportView report={report} />;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}
