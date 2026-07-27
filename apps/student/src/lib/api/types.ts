import type {
  GetActivityThreadResponse,
  GetLearnCourseResponse,
  GetLearnOrgResponse,
  ListLearnCoursesResponse,
  ListLearnModulesResponse,
} from "@headless-lms/sdk";

export type Course = GetLearnCourseResponse;
/** The portal org's public identity (branding). */
export type Org = GetLearnOrgResponse;
export type CourseSummary = ListLearnCoursesResponse[number];
export type Module = ListLearnModulesResponse[number];
export type Activity = Module["activities"][number];

/** One activity's thread as the learner may see it. */
export type ThreadView = GetActivityThreadResponse;
export type ResolvedThreadConfig = ThreadView["config"];
export type ThreadComment = ThreadView["comments"][number];
export type CommentAuthor = ThreadComment["author"];

/** The editor-agnostic content wrapper stored under `settings.content`. */
export interface ActivityContent {
  config: unknown;
  type: string;
  version?: number;
}
export interface ActivitySettings {
  title?: string;
  published?: boolean;
  content?: ActivityContent;
}
