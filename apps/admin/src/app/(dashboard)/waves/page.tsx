import Link from "next/link";

import { requireManager } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { PageHeader } from "@/components/page-header";

import { EvidenceLink } from "../registro/_components/evidence-link";

// Olas list (the Admin Cliente's entry point): each Ola links to its per-Ola
// report. Fetches server-side like every list screen; the table follows the
// approved report table's styling (variant A).
export default async function WavesPage() {
  const dataPromise = serverApi.listWaves();
  await requireManager(dataPromise);
  const waves = await dataPromise;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Olas"
        subtitle="Grupos de Trabajadores inscritos por Curso"
        actions={<EvidenceLink />}
      />
      {waves.length === 0 ? (
        <div className="flex flex-col gap-1 border-y border-line py-10 text-center">
          <p className="text-sm font-medium text-ink">Aún no hay Olas</p>
          <p className="text-sm text-ink-3">
            Las Olas que se ingersen por CSV aparecerán aquí con su reporte.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border-y border-line">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-xs text-ink-3">
                <th className="px-4 py-3 font-medium">Ola</th>
                <th className="px-4 py-3 font-medium">Curso</th>
                <th className="px-4 py-3 text-right font-medium">Trabajadores</th>
                <th className="px-4 py-3 font-medium">Creada</th>
              </tr>
            </thead>
            <tbody>
              {waves.map((wave) => (
                <tr key={wave.id} className="border-b border-line last:border-0 hover:bg-hover-2">
                  <td className="px-4 py-4 font-medium">
                    <Link href={`/waves/${wave.id}`} className="text-ink hover:underline">
                      {wave.name}
                    </Link>
                  </td>
                  <td className="px-4 py-4 text-ink-2">{wave.courseTitle}</td>
                  <td className="px-4 py-4 text-right text-ink-2">{wave.memberCount}</td>
                  <td className="px-4 py-4 text-ink-3">
                    {new Date(wave.createdAt).toLocaleDateString("es-CL", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
