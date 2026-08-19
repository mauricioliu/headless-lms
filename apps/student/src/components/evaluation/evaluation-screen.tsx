"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  Loader2,
  Lock,
  Send,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/primitives/progress-bar";
import { Evaluation } from "@headless-lms/sdk";
import { ensureClientSdk } from "@/lib/api/client-sdk";
import { ApiError } from "@/lib/api/shared";
import type {
  AttemptFeedback,
  AttemptQuestionReview,
  EvaluationQuestion,
  StartedAttempt,
} from "@/lib/api/types";
import { cn } from "@/lib/utils";

export interface EvaluationScreenProps {
  courseId: string;
  courseTitle: string;
  orgName: string;
  percent: number;
  cutoff: number;
  feedbackMode: "score_only" | "answer_review";
  questions: EvaluationQuestion[];
  latest: AttemptFeedback | null;
}

type Phase = "locked" | "answer" | "review";

const LETTERS = ["a", "b", "c", "d", "e", "f"];

function isApiErrorWithStatus(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.status === status;
}

export function EvaluationScreen(props: EvaluationScreenProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(() =>
    props.percent < 100 ? "locked" : props.latest?.submittedAt ? "review" : "answer",
  );
  const [feedback, setFeedback] = useState<AttemptFeedback | null>(props.latest);
  const [error, setError] = useState<string | null>(null);

  const enterAnswerPhase = useCallback(() => {
    setError(null);
    setPhase("answer");
  }, []);

  const body =
    phase === "locked" ? (
      <LockedState percent={props.percent} />
    ) : phase === "review" && feedback?.submittedAt ? (
      <ReviewState
        feedback={feedback}
        cutoff={props.cutoff}
        courseId={props.courseId}
        onRetry={enterAnswerPhase}
      />
    ) : (
      <AnswerState
        courseId={props.courseId}
        questions={props.questions}
        onError={setError}
        onGraded={(graded) => {
          setFeedback(graded);
          setPhase("review");
          router.refresh();
        }}
        openAttempt={feedback && !feedback.submittedAt ? feedback.attemptNumber : null}
        error={error}
      />
    );

  return (
    <div className="flex min-h-dvh flex-col bg-surface-warm-2 text-ink">
      <header className="flex flex-none items-center justify-between gap-4 border-b border-line-strong bg-surface-warm px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/courses/${props.courseId}`}
            aria-label="Volver al curso"
            className="grid size-9 flex-none place-items-center rounded-lg text-ink-2 hover:bg-hover-surface-2"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{props.courseTitle}</p>
            <p className="text-xs text-ink-3">{props.orgName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-ink-3 sm:inline">Curso visto</span>
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand">
            {props.percent}%
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1">{body}</main>
    </div>
  );
}

function LockedState({ percent }: { percent: number }) {
  return (
    <div className="flex flex-col items-center gap-5 px-6 py-24 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
        <Lock className="size-5" />
      </span>
      <div className="max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight">
          La evaluación se desbloquea al llegar al 100%
        </h1>
        <p className="mt-2 text-sm leading-6 text-ink-3">
          Has visto el {percent}% del curso. Completa todos los segmentos para desbloquear la
          evaluación.
        </p>
      </div>
      <Button variant="brand" size="pill" asChild>
        <Link href="/">Volver a mis cursos</Link>
      </Button>
    </div>
  );
}

function Eyebrow({ current, total }: { current?: number; total?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-brand">
      <ClipboardCheck className="size-4" />
      <span>Evaluación del curso</span>
      {current && total ? (
        <span className="text-ink-4">
          · Pregunta {current} de {total}
        </span>
      ) : null}
    </div>
  );
}

function AnswerChoices({
  question,
  selected,
  onSelect,
}: {
  question: EvaluationQuestion;
  selected?: string;
  onSelect?: (optionId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {question.options.map((option, index) => {
        const active = selected === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect?.(option.id)}
            aria-pressed={active}
            className={cn(
              "flex w-full items-start gap-3 rounded-xl border px-4 py-4 text-left transition-colors",
              active
                ? "border-brand bg-brand-soft text-ink"
                : "border-line-btn bg-surface text-ink-btn hover:border-line-hover hover:bg-hover-surface-2",
            )}
          >
            <span
              className={cn(
                "grid size-7 flex-none place-items-center rounded-full border text-xs font-semibold uppercase",
                active
                  ? "border-brand bg-brand text-brand-contrast"
                  : "border-line-strong text-ink-3",
              )}
            >
              {active ? <Check className="size-4" /> : LETTERS[index]}
            </span>
            <span className="pt-0.5 text-sm font-medium leading-6">{option.text}</span>
          </button>
        );
      })}
    </div>
  );
}

interface AnswerStateProps {
  courseId: string;
  questions: EvaluationQuestion[];
  openAttempt: number | null;
  error: string | null;
  onError: (message: string | null) => void;
  onGraded: (feedback: AttemptFeedback) => void;
}

function AnswerState({
  courseId,
  questions,
  openAttempt,
  error,
  onError,
  onGraded,
}: AnswerStateProps) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const question = questions[index];
  const answered = Object.keys(answers).length;
  const allAnswered = answered === questions.length;
  const isLast = index === questions.length - 1;
  const currentAnswer = question ? answers[question.id] : undefined;

  const submit = useCallback(async () => {
    if (!allAnswered || submitting) return;
    ensureClientSdk();
    setSubmitting(true);
    onError(null);
    try {
      let attemptNumber = openAttempt;
      if (!attemptNumber) {
        const started: StartedAttempt = await Evaluation.startCourseEvaluationAttempt({
          courseId,
        });
        attemptNumber = started.attemptNumber;
      }
      const graded: AttemptFeedback = await Evaluation.submitCourseEvaluationAttempt({
        courseId,
        attemptNumber,
        answers: questions.map((q) => ({ questionId: q.id, optionId: answers[q.id]! })),
      });
      onGraded(graded);
    } catch (err) {
      if (isApiErrorWithStatus(err, 403)) {
        onError("La evaluación está bloqueada: primero mira todos los segmentos del curso.");
        router.refresh();
      } else if (isApiErrorWithStatus(err, 404)) {
        onError("No encontramos la evaluación. Vuelve a entrar al curso.");
      } else {
        onError("No pudimos enviar tu evaluación. Inténtalo de nuevo.");
      }
      setSubmitting(false);
    }
  }, [
    allAnswered,
    submitting,
    onError,
    openAttempt,
    courseId,
    questions,
    answers,
    onGraded,
    router,
  ]);

  if (!question) return null;

  return (
    <div className="flex min-h-[calc(100dvh-61px)] flex-col px-5 py-7 sm:px-8 sm:py-10">
      <div className="flex items-center justify-between gap-4">
        <Eyebrow current={index + 1} total={questions.length} />
        <Link
          href={`/courses/${courseId}`}
          className="text-xs font-medium text-ink-3 hover:text-ink"
        >
          Salir y continuar después
        </Link>
      </div>
      <div className="mt-5">
        <ProgressBar
          percent={((index + 1) / questions.length) * 100}
          className="h-1.5"
          trackClassName="bg-track-side"
        />
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-5">
          <X className="size-4" />
          <AlertTitle>No pudimos enviar tu evaluación</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="flex flex-1 flex-col justify-center py-8 sm:py-12">
        <h1 className="max-w-2xl text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
          {question.prompt}
        </h1>
        <div className="mt-8">
          <AnswerChoices
            question={question}
            selected={currentAnswer}
            onSelect={(optionId) =>
              setAnswers((current) => ({ ...current, [question.id]: optionId }))
            }
          />
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 border-t border-line-divider pt-5">
        <Button
          variant="ghostOutline"
          size="pillSm"
          disabled={index === 0 || submitting}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          <ArrowLeft /> Anterior
        </Button>
        {isLast ? (
          <Button
            variant="brand"
            size="pillSm"
            disabled={!allAnswered || submitting}
            onClick={() => void submit()}
          >
            {submitting ? <Loader2 className="animate-spin" /> : <Send />}
            Enviar evaluación
          </Button>
        ) : (
          <Button
            variant="brand"
            size="pillSm"
            disabled={!currentAnswer || submitting}
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
          >
            Siguiente <ArrowRight />
          </Button>
        )}
      </div>
    </div>
  );
}

function ReviewState({
  feedback,
  cutoff,
  courseId,
  onRetry,
}: {
  feedback: AttemptFeedback;
  cutoff: number;
  courseId: string;
  onRetry: () => void;
}) {
  const passed = feedback.passed === true;
  const questions = feedback.questions ?? [];
  const hits = questions.filter((q) => q.correct).length;

  return (
    <div className="px-5 py-8 sm:px-8 sm:py-11">
      <div className="flex flex-col gap-6 border-b border-line pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            Obtuviste un {feedback.score}%
          </h1>
          <p className={cn("mt-2 font-semibold", passed ? "text-brand" : "text-quiz-wrong-fg")}>
            {passed ? (
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-4" /> Aprobaste: el curso está completado
              </span>
            ) : (
              `Aún no alcanzas el corte de ${feedback.cutoff ?? cutoff}%`
            )}
          </p>
          {questions.length > 0 ? (
            <p className="mt-2 text-sm text-ink-3">
              Respondiste correctamente {hits} de {questions.length} preguntas.
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-3">
              Intento {feedback.attemptNumber} · el corte es {feedback.cutoff ?? cutoff}%.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <Button variant="brand" size="pill" asChild>
            <Link href={`/courses/${courseId}`}>Volver al curso</Link>
          </Button>
          {!passed ? (
            <Button variant="ghostOutline" size="pillSm" onClick={onRetry}>
              Intentar de nuevo
            </Button>
          ) : null}
        </div>
      </div>

      {questions.length > 0 ? (
        <>
          <div className="py-8">
            <h2 className="text-xl font-semibold">Revisa tus respuestas</h2>
            <p className="mt-2 text-sm text-ink-3">
              Las opciones correctas de las preguntas que fallaste no están marcadas.
            </p>
          </div>
          <div>
            {questions.map((question, index) => (
              <QuestionReview key={question.questionId} number={index + 1} review={question} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function QuestionReview({ number, review }: { number: number; review: AttemptQuestionReview }) {
  return (
    <section className="flex flex-col gap-5 border-b border-line-divider py-7 first:pt-0 last:border-0 last:pb-0">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 grid size-7 flex-none place-items-center rounded-full",
            review.correct ? "bg-brand text-brand-contrast" : "bg-quiz-wrong-bg text-quiz-wrong-fg",
          )}
        >
          {review.correct ? <Check className="size-4" /> : <X className="size-4" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className={cn(
              "text-xs font-semibold uppercase tracking-wider",
              review.correct ? "text-brand" : "text-quiz-wrong-fg",
            )}
          >
            Pregunta {number} · {review.correct ? "Correcta" : "Incorrecta"}
          </span>
          <h2 className="text-lg font-semibold leading-7">{review.prompt}</h2>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:pl-10">
        {review.options.map((option, index) => {
          const selected = review.selectedOptionId === option.id;
          return (
            <div
              key={option.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-4 py-3.5",
                selected && review.correct && "border-brand bg-brand-soft",
                selected &&
                  !review.correct &&
                  "border-quiz-wrong-border bg-quiz-wrong-bg text-quiz-wrong-fg",
                !selected && "border-line-btn bg-surface text-ink-2",
              )}
            >
              <span
                className={cn(
                  "grid size-6 flex-none place-items-center rounded-full border text-xs font-semibold uppercase",
                  selected && review.correct && "border-brand bg-brand text-brand-contrast",
                  selected &&
                    !review.correct &&
                    "border-quiz-wrong-border bg-surface text-quiz-wrong-fg",
                  !selected && "border-line-strong text-ink-4",
                )}
              >
                {LETTERS[index]}
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium leading-6">{option.text}</span>
              {selected ? (
                <span className="flex-none rounded-full bg-surface px-2 py-1 text-xs font-semibold text-ink">
                  Tu respuesta
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {!review.correct ? (
        <p className="text-xs leading-5 text-ink-3 sm:pl-10">
          La respuesta correcta no se muestra. Repasa el curso y vuelve a intentarlo.
        </p>
      ) : null}
    </section>
  );
}
