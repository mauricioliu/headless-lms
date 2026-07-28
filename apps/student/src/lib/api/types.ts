import type {
  ListActivityCommentsResponse,
  GetLearnCourseResponse,
  GetLearnDownloadResponse,
  GetLearnOrgResponse,
  ListLearnCoursesResponse,
  ListLearnDownloadsResponse,
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
export type Download = ListLearnDownloadsResponse[number];
export type DownloadDetail = GetLearnDownloadResponse;
export type DownloadAsset = DownloadDetail["assets"][number];

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
