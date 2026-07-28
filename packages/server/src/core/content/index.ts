// content context — public surface. Re-export only what other contexts may use.
export { ContentServiceImpl } from './service.js';
export type { ContentService, ContentRepository, CourseRepository } from './ports.js';
export type {
  Course,
  CourseStatus,
  CourseSettings,
  Module,
  Activity,
  SaveActivityInput,
  DownloadStatus,
  Download,
  DownloadAsset,
} from './model.js';
export type {
  CreateCourseInput,
  ListCoursesQuery,
  Page,
  UpdateCourseInput,
  CreateDownloadInput,
  ListDownloadsQuery,
  UpdateDownloadInput,
  AddDownloadAssetInput,
  ReorderDownloadAssetsInput,
} from './types.js';
export type {
  CourseCreated,
  CourseUpdated,
  CourseDeleted,
  DownloadCreated,
  DownloadUpdated,
  DownloadDeleted,
  ContentEvent,
} from './events.js';
