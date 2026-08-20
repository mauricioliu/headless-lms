"use client";

import { Suspense, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, FileDown } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { fullName } from "@/lib/format";
import { EvidenceLink } from "@/app/(dashboard)/registro/_components/evidence-link";
import type { WaveReport, WaveWorkerEvaluationStatus } from "@/lib/api/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const EVALUATION_LABELS: Record<WaveWorkerEvaluationStatus, string> = {
  approved: "Aprobada",
  last_attempt: "Último intento",
  pending: "Pendiente",
  blocked: "Bloqueada",
  no_evaluation: "Sin evaluación",
};

function ResultPill({ status }: { status: WaveWorkerEvaluationStatus }) {
  const approved = status === "approved";
  const neutral = status === "pending" || status === "blocked" || status === "no_evaluation";
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold",
        approved
          ? "bg-brand-soft text-brand"
          : neutral
            ? "bg-neutral-soft text-neutral-soft-fg"
            : "bg-warning-soft text-warning",
      )}
    >
      {EVALUATION_LABELS[status]}
    </span>
  );
}

/** Mirrors the export's Content-Disposition filename (the response header is
 *  not CORS-readable from the browser). */
function csvFilename(name: string, id: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `reporte-ola-${slug || id}.csv`;
}

function decimalEs(n: number): string {
  return n.toLocaleString("es-CL", { maximumFractionDigits: 1 });
}

function WorkerTable({ workers }: { workers: WaveReport["workers"] }) {
  return (
    <div className="overflow-x-auto border-y border-line">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-xs text-ink-3">
            <th className="px-4 py-3 font-medium">Trabajador</th>
            <th className="px-4 py-3 font-medium">Avance</th>
            <th className="px-4 py-3 font-medium">Evaluación</th>
            <th className="px-4 py-3 text-right font-medium">Puntaje</th>
            <th className="px-4 py-3 text-right font-medium">Intentos</th>
          </tr>
        </thead>
        <tbody>
          {workers.map((worker) => (
            <tr
              key={worker.orgUserId}
              className="border-b border-line last:border-0 hover:bg-hover-2"
            >
              <td className="px-4 py-4 font-medium">{fullName(worker)}</td>
              <td className="px-4 py-4 text-ink-2">{`${worker.progress}%`}</td>
              <td className="px-4 py-4">
                <ResultPill status={worker.evaluationStatus} />
              </td>
              <td className="px-4 py-4 text-right font-medium">
                {worker.score === null ? "—" : `${worker.score}%`}
              </td>
              <td className="px-4 py-4 text-right text-ink-2">{worker.attempts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WaveReportViewInner({ report }: { report: WaveReport }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isExporting, startExport] = useTransition();

  const pendientes = report.totals.members - report.totals.completed;
  const estado = searchParams.get("estado") === "pendientes" ? "pendientes" : "todos";
  const rows =
    estado === "pendientes" ? report.workers.filter((w) => !w.completed) : report.workers;

  function setEstado(value: "todos" | "pendientes") {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "todos") {
      params.delete("estado");
    } else {
      params.set("estado", value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function exportCsv() {
    startExport(async () => {
      try {
        const res = await fetch(`${API_URL}/api/waves/${report.wave.id}/report.csv`, {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(`El servidor respondió ${res.status}`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = csvFilename(report.wave.name, report.wave.id);
        link.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        toast.error("No se pudo exportar el reporte", {
          description: (err as Error).message,
        });
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-7 px-4 py-7 sm:px-6 sm:py-9">
      <div className="flex flex-col gap-5">
        <Link
          href="/waves"
          className="inline-flex w-fit items-center gap-1 text-sm text-ink-3 hover:text-ink"
        >
          <ChevronLeft className="size-4" /> Olas
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{report.course.title}</h1>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold",
                  report.course.status === "published"
                    ? "bg-brand-soft text-brand"
                    : "bg-neutral-soft text-neutral-soft-fg",
                )}
              >
                {report.course.status === "published" ? "Publicado" : "Borrador"}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-3">
              {`${report.wave.name} · ${report.totals.members} Trabajadores`}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={isExporting}>
            <FileDown /> Exportar CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
        {[
          ["Completado", `${report.totals.completedRate}%`],
          ["Avance promedio", `${report.totals.avgProgress}%`],
          [
            "Puntaje promedio",
            report.totals.avgScore === null ? "—" : `${report.totals.avgScore}%`,
          ],
          ["Intentos promedio", decimalEs(report.totals.avgAttempts)],
        ].map(([label, value]) => (
          <div key={label} className="border-l-2 border-line pl-4">
            <p className="text-xs text-ink-3">{label}</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Registro por Trabajador</h2>
            <p className="mt-1 text-sm text-ink-3">
              Vale el último intento; el historial completo permanece registrado.{" "}
              <EvidenceLink />
            </p>
          </div>
          <div className="flex gap-2" role="group" aria-label="Filtrar por estado">
            <button
              type="button"
              aria-pressed={estado === "todos"}
              onClick={() => setEstado("todos")}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs",
                estado === "todos"
                  ? "bg-brand-soft font-semibold text-brand"
                  : "text-ink-3 hover:text-ink",
              )}
            >
              {`Todos ${report.totals.members}`}
            </button>
            <button
              type="button"
              aria-pressed={estado === "pendientes"}
              onClick={() => setEstado("pendientes")}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs",
                estado === "pendientes"
                  ? "bg-brand-soft font-semibold text-brand"
                  : "text-ink-3 hover:text-ink",
              )}
            >
              {`Pendientes ${pendientes}`}
            </button>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="border-y border-line py-10 text-center text-sm text-ink-3">
            No hay Trabajadores pendientes — la Ola completa está Completado.
          </div>
        ) : (
          <WorkerTable workers={rows} />
        )}
      </div>
    </div>
  );
}

export function WaveReportView({ report }: { report: WaveReport }) {
  // `useSearchParams` requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <WaveReportViewInner report={report} />
    </Suspense>
  );
}
