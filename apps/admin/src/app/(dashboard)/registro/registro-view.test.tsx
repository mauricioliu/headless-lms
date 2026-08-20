import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/waves/w_1",
}));

import { RegistroView } from "./registro-view";
import { EvidenceLink } from "./_components/evidence-link";
import { WaveReportView } from "../waves/[waveId]/_components/wave-report-view";
import type { WaveReport } from "@/lib/api/types";

/** Strips React's SSR text-node markers so interpolated copy asserts as one
 *  string. */
function render(screen: React.ReactElement): string {
  return renderToString(screen).replaceAll("<!-- -->", "");
}

const report: WaveReport = {
  wave: { id: "w_1", name: "Ola 1", createdAt: "2026-08-01T00:00:00.000Z" },
  course: { id: "c_1", title: "Ley Karin", status: "published" },
  totals: {
    members: 2,
    completed: 1,
    completedRate: 50,
    avgProgress: 60,
    avgScore: 80,
    avgAttempts: 1.5,
  },
  workers: [
    {
      orgUserId: "ou_1",
      firstName: "Juana",
      lastName: "Pérez",
      email: "juana.perez@faena.test",
      status: "active",
      progress: 100,
      evaluationStatus: "approved",
      score: 90,
      attempts: 2,
      completed: true,
    },
    {
      orgUserId: "ou_2",
      firstName: "Pedro",
      lastName: "Soto",
      email: "pedro.soto@faena.test",
      status: "active",
      progress: 40,
      evaluationStatus: "blocked",
      score: null,
      attempts: 0,
      completed: false,
    },
  ],
} as unknown as WaveReport;

describe("Qué atestigua el registro (page content)", () => {
  const html = render(<RegistroView />);

  it("states that avance atestigua exposición", () => {
    expect(html).toContain("Avance — atestigua exposición");
    expect(html).toContain("que el Trabajador estuvo frente al contenido");
  });

  it("states that the Evaluación atestigua aprendizaje, corrected server-side", () => {
    expect(html).toContain("Evaluación — atestigua aprendizaje");
    expect(html).toContain("no una actividad más del programa");
    expect(html).toContain("corren en la plataforma, no en el navegador del Trabajador");
    expect(html).toContain("El corte es el vigente al momento de rendir");
  });

  it("states the Intento regime: append-only, vale el último", () => {
    expect(html).toContain("Intentos — inmutables; vale el último");
    expect(html).toContain("inmutable y de solo-agregación");
    expect(html).toContain("Los Intentos no se editan ni se eliminan");
    expect(html).toContain("Vale el último resultado");
    expect(html).toContain("la evidencia de auditoría es la secuencia completa");
  });

  it("states Completado = avance 100% + Evaluación aprobada", () => {
    expect(html).toContain("Completado — avance 100% y Evaluación aprobada");
    expect(html).toContain("Sin las dos cosas, el Curso no está Completado");
  });

  it("explains every column of the per-Ola report", () => {
    expect(html).toContain("Cómo leer el reporte por Ola");
    for (const term of [
      "Avance",
      "Evaluación — Aprobada",
      "Evaluación — Bloqueada",
      "Evaluación — Pendiente",
      "Evaluación — Último intento",
      "Evaluación — Sin evaluación",
      "Puntaje",
      "Intentos",
      "Completado",
    ]) {
      expect(html).toContain(term);
    }
  });

  it("is in Spanish and never addresses the Admin Cliente as tú", () => {
    expect(html).not.toMatch(/\btu\b|\btus\b|\bti\b/);
    for (const english of ["exposure", "learning", "attempt", "evidence", "progress"]) {
      expect(html).not.toContain(english);
    }
  });
});

describe("reachability from the Admin Cliente surface", () => {
  it("the per-Ola report links to Qué atestigua el registro", () => {
    const html = render(<WaveReportView report={report} />);
    expect(html).toContain("Qué atestigua el registro");
    expect(html).toContain('href="/registro"');
  });

  it("the shared link carries the domain title, not a translation of it", () => {
    const html = render(<EvidenceLink />);
    expect(html).toContain("Qué atestigua el registro");
    expect(html).toContain('href="/registro"');
  });
});
