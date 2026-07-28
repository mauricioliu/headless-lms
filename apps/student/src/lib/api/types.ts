import type {
  ListActivityCommentsResponse,
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

/** One activity's comments as the learner may see them. */
export type ActivityComments = ListActivityCommentsResponse;
export type CommentsConfig = ActivityComments["config"];
export type CommentView = ActivityComments["comments"][number];
export type CommentAuthor = CommentView["author"];

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
