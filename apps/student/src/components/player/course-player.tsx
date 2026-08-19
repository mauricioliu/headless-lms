"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";

import { initials } from "@/lib/format";
import {
  adjacentLesson,
  coursePercent,
  completedCount,
  findLesson,
  flattenLessons,
  isCourseCompleted,
  isLessonLocked,
  lessonStatus,
  moduleOfLesson,
  totalLessons,
} from "@/lib/progress";
import { useApp } from "@/lib/store";
import type { Completion, Course, LessonStatus } from "@/lib/types";
import { ensureClientSdk } from "@/lib/api/client-sdk";
import { progressReporter } from "@/lib/progress-reporter";
import {
  createVideoTracker,
  flushKeepalive,
  recordSessionItems,
  type SessionPositions,
  type VideoAssetSeed,
} from "@/lib/video-tracking";
import editorMedia from "@/editor-media.config";
import type { MediaPlaybackPolicy, MediaTrackingEvent } from "@headless-lms/editor";
import { Assets } from "@headless-lms/sdk";

import { PlayerHeader } from "./player-header";
import { CurriculumSidebar, type SidebarStyle } from "./curriculum-sidebar";
import { FooterNav } from "./footer-nav";
import { ContentArea } from "./content/content-area";
import { DiscussionPanel } from "./discussion/discussion-panel";
import { useIsNarrow } from "./use-viewport";

export interface CoursePlayerProps {
  course: Course;
  studentName: string;
  orgUserId: string;
  /** Portal org name — the header brand. */
  orgName: string;
  /** Server-rendered activity content, keyed by lesson id (see render-activity). */
  renderedContent: Record<string, ReactNode>;
  /** Server-derived completion — the initial value of the player's own state. */
  initialCompletion?: Completion;
  /** Server-hydrated per-activity position maps (activity id → asset id → state). */
  initialPositions?: Record<string, unknown>;
  /** Where the student left off — server-derived from their progress records. */
  initialLessonId?: string;
  /** The course carries an evaluation — the Completado gate beyond the lessons. */
  hasEvaluation?: boolean;
  /** The server's Completado fact (avance 100% + evaluation approved, if any). */
  courseCompletedServer?: boolean;
  sidebarStyle?: SidebarStyle;
  sequentialLocking?: boolean;
  autoAdvance?: boolean;
}

const AUTO_ADVANCE_MS = 420;
/** Segment playback rule: no speed beyond 2x. */
const MAX_PLAYBACK_RATE = 2;

function EvaluationBanner({ courseId }: { courseId: string }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3.5"
      style={{
        background: "var(--brand-soft)",
        borderColor: "var(--brand)",
      }}
    >
      <span
        className="flex items-center gap-[9px] text-[13.5px] font-semibold"
        style={{ color: "var(--brand-strong)" }}
      >
        <ClipboardCheck className="size-[17px]" />
        Ya viste todos los segmentos: rendí la evaluación para completar el curso.
      </span>
      <Link
        href={`/courses/${courseId}/evaluation`}
        className="rounded-full px-[18px] py-[9px] text-[13.5px] font-semibold"
        style={{ background: "var(--brand)", color: "var(--brand-contrast)" }}
      >
        Rendir evaluación
      </Link>
    </div>
  );
}

/** Promote a lesson to in-progress only if not started — never demotes a
 *  completed one. Returns the same object when nothing changes. */
function opened(completion: Completion, lessonId: string): Completion {
  if (!lessonId) return completion;
  if ((completion[lessonId] ?? "not-started") !== "not-started") return completion;
  return { ...completion, [lessonId]: "in-progress" };
}

export function CoursePlayer({
  course,
  studentName,
  orgUserId,
  orgName,
  renderedContent,
  initialCompletion,
  initialPositions,
  initialLessonId,
  hasEvaluation = false,
  courseCompletedServer = false,
  sidebarStyle = "detailed",
  sequentialLocking = true,
  autoAdvance = true,
}: CoursePlayerProps) {
  const router = useRouter();
  const { showToast } = useApp();
  const isNarrow = useIsNarrow();

  const flat = useMemo(() => flattenLessons(course), [course]);
  const startLessonId =
    (initialLessonId && flat.some((l) => l.id === initialLessonId) ? initialLessonId : null) ??
    flat[0]?.id ??
    "";

  // Completion is this course's, and only the player advances it — so it starts
  // as the server's value rather than being seeded into a global store after
  // mount. Opening the start lesson is part of that initial value, not a
  // post-mount correction, so the first paint is already right.
  const [completion, setCompletion] = useState<Completion>(() =>
    opened(initialCompletion ?? {}, startLessonId),
  );

  const setLessonStatus = useCallback((lessonId: string, status: LessonStatus) => {
    setCompletion((prev) => ({ ...prev, [lessonId]: status }));
  }, []);

  const markOpened = useCallback((lessonId: string) => {
    setCompletion((prev) => opened(prev, lessonId));
  }, []);

  const [lessonId, setLessonId] = useState(startLessonId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const mod = moduleOfLesson(course, startLessonId);
    return mod ? { [mod.id]: true } : {};
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);

  const curLesson = findLesson(course, lessonId) ?? flat[0];
  // A course may have no student-visible lessons (every activity a draft). Keep a
  // safe id so hooks/derived values never dereference an undefined lesson; the
  // render falls back to an empty state below.
  const curLessonId = curLesson?.id ?? "";
  const curIdx = flat.findIndex((l) => l.id === curLessonId);

  const reporter = useMemo(() => {
    ensureClientSdk();
    return curLessonId ? progressReporter({ activity: curLessonId }) : null;
  }, [curLessonId]);

  // Latest reported state this session, per activity/asset. Preferred over the
  // page-load hydration so within-session navigation never rewinds progress.
  // A stable useState object (never set) rather than a ref: it's read from
  // callbacks the lint can't prove are event-time.
  const [sessionPositions] = useState<SessionPositions>(() => ({}));

  const assetSeed = useCallback(
    (lessonId: string, assetId: string): VideoAssetSeed | undefined => {
      const local = sessionPositions[lessonId]?.[assetId];
      if (local) return local;
      const hydrated = initialPositions?.[lessonId] as
        Record<string, VideoAssetSeed | undefined> | undefined;
      return hydrated?.[assetId];
    },
    [sessionPositions, initialPositions],
  );

  // Fresh tracker per lesson — per-asset watch state must not leak across
  // lessons — seeded with prior state so revisits keep the high-water mark.
  const tracker = useMemo(() => {
    if (!reporter || !curLessonId) return null;
    const lessonId = curLessonId;
    return createVideoTracker({
      send: (items) => {
        recordSessionItems(sessionPositions, lessonId, items);
        void reporter.report(items);
      },
      initial: (assetId) => assetSeed(lessonId, assetId),
    });
  }, [reporter, curLessonId, sessionPositions, assetSeed]);

  const onMediaEvent = useCallback((e: MediaTrackingEvent) => tracker?.handleEvent(e), [tracker]);

  const startPosition = useCallback(
    (assetId: string): number | undefined => {
      const seconds = assetSeed(curLessonId, assetId)?.seconds;
      return typeof seconds === "number" ? seconds : undefined;
    },
    [assetSeed, curLessonId],
  );

  // Segment playback gate: the seek ceiling is the asset's live high-water
  // mark (seeded across sessions, advancing with real watching), the rate cap
  // is the 2x rule. Read at event time, so it never goes stale mid-lesson.
  const playbackPolicy = useCallback(
    (assetId: string): MediaPlaybackPolicy => ({
      seekCeiling: tracker?.ceiling(assetId) ?? 0,
      maxRate: MAX_PLAYBACK_RATE,
    }),
    [tracker],
  );

  const refreshUrl = useCallback(async (assetId: string): Promise<string | null> => {
    ensureClientSdk();
    try {
      const ticket = await Assets.getAssetDownloadUrl({ id: assetId });
      return ticket.url;
    } catch {
      return null;
    }
  }, []);

  // Flush unsent watch state when the tab hides or the lesson unmounts.
  useEffect(() => {
    if (!tracker || !curLessonId) return;
    const lessonId = curLessonId;
    const flush = () => {
      const items = tracker.flush();
      recordSessionItems(sessionPositions, lessonId, items);
      flushKeepalive(lessonId, items);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [tracker, curLessonId, sessionPositions]);

  // Tell the server the lesson was opened. Purely an outbound side effect —
  // the local status is set by whoever navigated (or by the initial state).
  useEffect(() => {
    if (!curLessonId) return;
    reporter?.opened();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report on lesson change only
  }, [curLessonId]);

  const goToLesson = useCallback(
    (id: string) => {
      const mod = moduleOfLesson(course, id);
      setLessonId(id);
      markOpened(id);
      setExpanded((e) => (mod ? { ...e, [mod.id]: true } : e));
    },
    [course, markOpened],
  );

  const selectLesson = useCallback(
    (id: string) => {
      const locked = isLessonLocked(course, id, completion, curLessonId, sequentialLocking);
      if (locked) return;
      goToLesson(id);
      setMobileSidebar(false);
    },
    [course, completion, curLessonId, sequentialLocking, goToLesson],
  );

  const goNext = useCallback(
    (fromComplete: boolean) => {
      const nxt = adjacentLesson(course, curLessonId, 1);
      if (nxt) {
        goToLesson(nxt.id);
      } else if (fromComplete) {
        showToast("Curso completado. ¡Bien hecho!");
      }
    },
    [course, curLessonId, goToLesson, showToast],
  );

  const goPrev = useCallback(() => {
    const prv = adjacentLesson(course, curLessonId, -1);
    if (prv) goToLesson(prv.id);
  }, [course, curLessonId, goToLesson]);

  // ---- derived ----
  const coursePct = coursePercent(course, completion);
  const doneCount = completedCount(course, completion);
  const total = totalLessons(course);
  const courseCompleted = isCourseCompleted(course, completion);
  const curStatus = lessonStatus(completion, curLessonId);
  const isCompleted = curStatus === "completed";
  // A Segment completes by watching to the end — no manual claim path.
  const completesByVideo = curLesson?.completionRule === "video";

  const markComplete = useCallback(() => {
    if (isCompleted || !reporter || completesByVideo) return;
    void reporter.completed().then((status) => {
      if (status !== "completed") return;
      setLessonStatus(curLessonId, "completed");
      showToast("Segmento completado");
      if (autoAdvance) {
        window.setTimeout(() => goNext(true), AUTO_ADVANCE_MS);
      }
    });
  }, [
    isCompleted,
    reporter,
    completesByVideo,
    curLessonId,
    setLessonStatus,
    showToast,
    autoAdvance,
    goNext,
  ]);

  const sidebarShownDesktop = !isNarrow && sidebarOpen;
  const sidebarShownMobile = isNarrow && mobileSidebar;
  const showSidebar = sidebarShownDesktop || sidebarShownMobile;

  const toggleSidebar = () => {
    if (isNarrow) setMobileSidebar((v) => !v);
    else setSidebarOpen((v) => !v);
  };
  const sidebarToggleActive = isNarrow ? mobileSidebar : sidebarOpen;

  const onBack = () => router.push("/");

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PlayerHeader
        courseTitle={course.title}
        coursePercent={coursePct}
        doneCount={doneCount}
        total={total}
        studentInitials={initials(studentName)}
        orgName={orgName}
        sidebarActive={sidebarToggleActive}
        onBack={onBack}
        onToggleSidebar={toggleSidebar}
      />

      {flat.length === 0 ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <p className="max-w-sm text-[14px] text-ink-3">
            Este curso aún no tiene segmentos publicados.
          </p>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1">
          {showSidebar && sidebarShownMobile && (
            <div
              onClick={() => setMobileSidebar(false)}
              className="absolute inset-0 z-40"
              style={{ background: "rgba(20,20,18,0.4)" }}
              aria-hidden
            />
          )}

          {showSidebar && (
            <CurriculumSidebar
              course={course}
              completion={completion}
              currentLessonId={curLessonId}
              sidebarStyle={sidebarStyle}
              sequentialLocking={sequentialLocking}
              expanded={expanded}
              isNarrow={isNarrow}
              onToggleModule={(id) => setExpanded((e) => ({ ...e, [id]: !e[id] }))}
              onSelectLesson={selectLesson}
              onClose={() => setMobileSidebar(false)}
            />
          )}

          <main className="flex min-w-0 flex-1 flex-col bg-surface-warm-2">
            <div className="flex-1 overflow-y-auto">
              {courseCompletedServer && (
                <div
                  className="flex items-center gap-[11px] border-b px-6 py-[13px]"
                  style={{
                    background: "var(--brand-soft)",
                    borderColor: "var(--brand)",
                    color: "var(--brand-strong)",
                  }}
                >
                  <span className="text-[13.5px] font-semibold">
                    Completaste este curso. Puedes revisar cualquier segmento cuando quieras.
                  </span>
                </div>
              )}
              {hasEvaluation && !courseCompletedServer && courseCompleted && (
                <EvaluationBanner courseId={course.id} />
              )}
              <editorMedia.MediaProvider
                onEvent={onMediaEvent}
                startPosition={startPosition}
                refreshUrl={refreshUrl}
                playbackPolicy={playbackPolicy}
              >
                <ContentArea node={curLesson ? renderedContent[curLessonId] : null} />
              </editorMedia.MediaProvider>
              {curLessonId && (
                <DiscussionPanel
                  key={curLessonId}
                  activityId={curLessonId}
                  orgUserId={orgUserId}
                  viewerName={studentName}
                />
              )}
            </div>

            <FooterNav
              isCompleted={isCompleted}
              showMarkComplete={!completesByVideo}
              prevDisabled={curIdx <= 0}
              nextDisabled={curIdx >= flat.length - 1}
              onPrev={goPrev}
              onNext={() => goNext(false)}
              onMarkComplete={markComplete}
            />
          </main>
        </div>
      )}
    </div>
  );
}
