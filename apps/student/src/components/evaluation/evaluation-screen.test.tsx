import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

import { EvaluationScreen } from "./evaluation-screen";
import type { AttemptFeedback, EvaluationQuestion } from "@/lib/api/types";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

/** Strips React's SSR text-node markers so interpolated copy asserts as one
 *  string. */
function render(screen: React.ReactElement): string {
  return renderToString(screen).replaceAll("<!-- -->", "");
}

const base = {
  courseId: "course_1",
  courseTitle: "Ley Karin",
  orgName: "Minera Los Andes",
  cutoff: 70,
  feedbackMode: "score_only" as const,
};

const questions: EvaluationQuestion[] = [
  {
    id: "q1",
    prompt: "¿Cuál es la vía formal para denunciar acoso laboral?",
    options: [
      { id: "o1", text: "El canal de denuncias de la empresa" },
      { id: "o2", text: "Comentarios en redes sociales" },
    ],
  },
  {
    id: "q2",
    prompt: "¿Qué hace la empresa al recibir una denuncia?",
    options: [
      { id: "o3", text: "La investiga con plazo definido" },
      { id: "o4", text: "La archiva" },
    ],
  },
];

describe("EvaluationScreen (seam 2: rendered route surface, español)", () => {
  it("explains the 100% gate in Spanish while locked", () => {
    const html = render(
      <EvaluationScreen {...base} percent={60} questions={questions} latest={null} />,
    );
    expect(html).toContain("La evaluación se desbloquea al llegar al 100%");
    expect(html).toContain("Has visto el 60% del curso.");
    expect(html).toContain("Volver a mis cursos");
  });

  it("walks the questions in Spanish", () => {
    const html = render(
      <EvaluationScreen {...base} percent={100} questions={questions} latest={null} />,
    );
    expect(html).toContain("Evaluación del curso");
    expect(html).toContain("Pregunta 1 de 2");
    expect(html).toContain(questions[0]!.prompt);
    expect(html).toContain("Anterior");
    expect(html).toContain("Siguiente");
    expect(html).toContain("Salir y continuar después");
  });

  it("reviews a failed attempt without revealing the key", () => {
    const latest: AttemptFeedback = {
      attemptNumber: 1,
      startedAt: "2026-08-01T12:00:00Z",
      submittedAt: "2026-08-01T12:05:00Z",
      score: 50,
      cutoff: 70,
      passed: false,
      feedbackMode: "answer_review",
      questions: [
        {
          questionId: "q1",
          prompt: questions[0]!.prompt,
          options: questions[0]!.options,
          selectedOptionId: "o1",
          correct: true,
        },
        {
          questionId: "q2",
          prompt: questions[1]!.prompt,
          options: questions[1]!.options,
          selectedOptionId: "o4",
          correct: false,
        },
      ],
    };
    const html = render(
      <EvaluationScreen
        {...base}
        feedbackMode="answer_review"
        percent={100}
        questions={questions}
        latest={latest}
      />,
    );
    expect(html).toContain("Obtuviste un 50%");
    expect(html).toContain("Aún no alcanzas el corte de 70%");
    expect(html).toContain("Respondiste correctamente 1 de 2 preguntas.");
    expect(html).toContain("Pregunta 1 · Correcta");
    expect(html).toContain("Pregunta 2 · Incorrecta");
    expect(html).toContain("Tu respuesta");
    expect(html).toContain("La respuesta correcta no se muestra.");
    expect(html).toContain("Intentar de nuevo");
  });

  it("celebrates a passed attempt", () => {
    const latest: AttemptFeedback = {
      attemptNumber: 2,
      startedAt: "2026-08-01T12:00:00Z",
      submittedAt: "2026-08-01T12:05:00Z",
      score: 100,
      cutoff: 70,
      passed: true,
      feedbackMode: "score_only",
    };
    const html = render(
      <EvaluationScreen {...base} percent={100} questions={questions} latest={latest} />,
    );
    expect(html).toContain("Obtuviste un 100%");
    expect(html).toContain("Aprobaste: el curso está completado");
    expect(html).toContain("Intento 2 · el corte es 70%.");
    expect(html).not.toContain("Intentar de nuevo");
  });
});
