import type {
  GetLearnViewerResponse,
  ListActivityCommentsResponse,
  GetLearnCourseResponse,
  GetLearnDownloadResponse,
  GetLearnOrgResponse,
  ListLearnCoursesResponse,
  ListLearnDownloadsResponse,
  ListLearnActivitiesResponse,
  ListLearnModulesResponse,
} from "@headless-lms/sdk";

export type Course = GetLearnCourseResponse;
/** The portal org's public identity (branding). */
export type Org = GetLearnOrgResponse;
export type CourseSummary = ListLearnCoursesResponse[number];
export type Module = ListLearnModulesResponse[number];
export type Activity = ListLearnActivitiesResponse[number];

/** One activity's comments as the learner may see them. */
export type ActivityComments = ListActivityCommentsResponse;
export type CommentsConfig = ActivityComments["config"];
export type CommentView = ActivityComments["comments"][number];
export type CommentAuthor = CommentView["author"];
export type ReactionEmoji = NonNullable<CommentView["viewerReaction"]>;
export type ReactionCounts = CommentView["reactions"];
/** Who the caller is inside the session's org. */
export type Viewer = GetLearnViewerResponse;
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
