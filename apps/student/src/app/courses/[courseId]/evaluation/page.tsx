import { notFound } from "next/navigation";

import { EvaluationScreen } from "@/components/evaluation/evaluation-screen";
import { learnApi } from "@/lib/api/server";
import { requireAuth } from "@/lib/auth/server-session";

export default async function EvaluationPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const [course, evaluation, latest, org, progress] = await Promise.all([
    learnApi.getCourse(courseId),
    learnApi.getCourseEvaluation(courseId),
    learnApi.latestEvaluationAttempt(courseId),
    learnApi.org(),
    learnApi.courseProgress(courseId),
  ]);
  if (!course || !evaluation) notFound();

  return (
    <EvaluationScreen
      courseId={courseId}
      courseTitle={course.title}
      orgName={org.name}
      percent={progress?.percent ?? 0}
      cutoff={evaluation.cutoff}
      feedbackMode={evaluation.feedbackMode}
      questions={evaluation.questions}
      latest={latest}
    />
  );
}
