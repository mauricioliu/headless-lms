import { describe, expect, it } from "vitest";

import { adaptCourse } from "./adapt";
import type {
  Activity as WireActivity,
  Course as WireCourse,
  Module as WireModule,
} from "./api/types";

const course: WireCourse = {
  id: "course_1",
  type: "course",
  orgId: "org_1",
  title: "Ley Karin",
  slug: "ley-karin",
  description: "",
  status: "published",
  category: "compliance",
  thumbnailAssetId: null,
  settings: { transcriptDownloads: false },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const module = (id: string, seq: number): WireModule => ({
  id,
  courseId: course.id,
  orgId: "org_1",
  title: `Module ${seq}`,
  seq,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});

const activity = (id: string, moduleId: string, seq: number, settings: unknown): WireActivity =>
  ({
    id,
    moduleId,
    courseId: course.id,
    orgId: "org_1",
    seq,
    settings,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  }) as WireActivity;

describe("adaptCourse", () => {
  it("carries the authored completion rule onto the lesson", () => {
    const adapted = adaptCourse(
      course,
      [module("m1", 0)],
      [
        activity("a1", "m1", 0, { title: "Segmento 1", published: true, completion: "video" }),
        activity("a2", "m1", 1, { title: "Segmento 2", published: true, completion: "manual" }),
        activity("a3", "m1", 2, { title: "Sin regla", published: true }),
      ],
    );
    const lessons = adapted.modules[0]!.lessons;
    expect(lessons[0]!.completionRule).toBe("video");
    expect(lessons[1]!.completionRule).toBe("manual");
    expect(lessons[2]!.completionRule).toBeUndefined();
  });
});
