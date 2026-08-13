import type {
  Activity,
  ActivityAsset,
  Course,
  CourseSettings,
  Download,
  DownloadAsset,
  Module,
  SaveActivityInput,
} from './model.js';
import type {
  AddDownloadAssetInput,
  CreateCourseInput,
  CreateDownloadInput,
  ListCoursesQuery,
  ListDownloadsQuery,
  Page,
  UpdateCourseInput,
  UpdateDownloadInput,
} from './types.js';
import type { OutboxAppender, UnitOfWork } from '../shared/ports.js';

export interface ContentService {
  list(orgId: string, query: ListCoursesQuery): Promise<Page<Course>>;
  getCourse(orgId: string, id: string): Promise<Course | null>;
  createCourse(orgId: string, input: CreateCourseInput): Promise<Course>;
  /** @throws NotFoundError when no course with this id exists in the org. */
  updateCourse(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course>;
  /** @throws NotFoundError when no course with this id exists in the org. */
  patchSettings(
    orgId: string,
    id: string,
    value: Partial<CourseSettings>,
  ): Promise<CourseSettings>;
  /** @throws NotFoundError when no course with this id exists in the org. */
  deleteCourse(orgId: string, id: string): Promise<void>;

  listCourseModules(orgId: string, courseId: string): Promise<Module[]>;
  listCourseActivities(orgId: string, courseId: string): Promise<Activity[]>;
  listCourseActivityAssets(orgId: string, courseId: string): Promise<ActivityAsset[]>;
  getActivity(orgId: string, activityId: string): Promise<Activity | null>;
  getModule(orgId: string, moduleId: string): Promise<Module | null>;
  reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]>;
  createModule(orgId: string, courseId: string, title: string): Promise<Module[]>;
  /** @throws NotFoundError when no such module exists in this course. */
  updateModule(orgId: string, courseId: string, moduleId: string, title: string): Promise<Module[]>;
  /** @throws NotFoundError when no such module exists in this course. */
  deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]>;
  /** @throws NotFoundError when no such module exists in this course. */
  reorderActivities(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]>;
  /** @throws NotFoundError when the module — or, on update, the activity — does not exist. */
  saveActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveActivityInput,
    activityId?: string,
  ): Promise<Module[]>;
  /** @throws NotFoundError when no such activity exists in this module. */
  deleteActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    activityId: string,
  ): Promise<Module[]>;

  listDownloads(orgId: string, query: ListDownloadsQuery): Promise<Page<Download>>;
  getDownload(orgId: string, id: string): Promise<Download | null>;
  createDownload(orgId: string, input: CreateDownloadInput): Promise<Download>;
  /** @throws NotFoundError when no download with this id exists in the org. */
  updateDownload(orgId: string, id: string, patch: UpdateDownloadInput): Promise<Download>;
  /** @throws NotFoundError when no download with this id exists in the org. */
  removeDownload(orgId: string, id: string): Promise<void>;

  listDownloadAssets(orgId: string, downloadId: string): Promise<DownloadAsset[]>;
  addDownloadAsset(
    orgId: string,
    downloadId: string,
    input: AddDownloadAssetInput,
  ): Promise<DownloadAsset[]>;
  removeDownloadAsset(orgId: string, downloadId: string, assetId: string): Promise<DownloadAsset[]>;
  renameDownloadAsset(
    orgId: string,
    downloadId: string,
    assetId: string,
    displayName: string | null,
  ): Promise<DownloadAsset[]>;
  /** @throws ConflictError when assetIds is not exactly the download's current asset set. */
  reorderDownloadAssets(orgId: string, downloadId: string, assetIds: string[]): Promise<DownloadAsset[]>;
}

export interface ContentRepository {
  list(orgId: string, query: ListCoursesQuery): Promise<Page<Omit<Course, 'settings'>>>;
  findById(orgId: string, id: string): Promise<Omit<Course, 'settings'> | null>;
  create(orgId: string, input: CreateCourseInput, slug: string): Promise<Omit<Course, 'settings'>>;
  update(orgId: string, id: string, patch: UpdateCourseInput): Promise<Omit<Course, 'settings'> | null>;
  delete(orgId: string, id: string): Promise<boolean>;

  listForCourse(orgId: string, courseId: string): Promise<Module[]>;
  listActivitiesForCourse(orgId: string, courseId: string): Promise<Activity[]>;
  listActivityAssetsForCourse(orgId: string, courseId: string): Promise<ActivityAsset[]>;
  findActivity(orgId: string, activityId: string): Promise<Activity | null>;
  findModule(orgId: string, moduleId: string): Promise<Module | null>;
  reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]>;
  createModule(orgId: string, courseId: string, title: string): Promise<Module[]>;
  updateModule(orgId: string, courseId: string, moduleId: string, title: string): Promise<Module[]>;
  deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]>;
  reorderActivities(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]>;
  saveActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveActivityInput,
    activityId?: string,
  ): Promise<{ modules: Module[]; activity: Activity }>;
  deleteActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    activityId: string,
  ): Promise<Module[]>;

  listDownloads(orgId: string, query: ListDownloadsQuery): Promise<Page<Download>>;
  getDownload(orgId: string, id: string): Promise<Download | null>;
  createDownload(orgId: string, input: CreateDownloadInput, slug: string): Promise<Download>;
  updateDownload(orgId: string, id: string, patch: UpdateDownloadInput): Promise<Download | null>;
  deleteDownload(orgId: string, id: string): Promise<boolean>;

  listDownloadAssets(orgId: string, downloadId: string): Promise<DownloadAsset[]>;
  addDownloadAsset(
    orgId: string,
    downloadId: string,
    input: AddDownloadAssetInput,
  ): Promise<DownloadAsset[]>;
  removeDownloadAsset(orgId: string, downloadId: string, assetId: string): Promise<DownloadAsset[]>;
  renameDownloadAsset(
    orgId: string,
    downloadId: string,
    assetId: string,
    displayName: string | null,
  ): Promise<DownloadAsset[]>;
  reorderDownloadAssets(orgId: string, downloadId: string, assetIds: string[]): Promise<DownloadAsset[]>;
}

export interface ContentTxScope {
  content: ContentRepository;
  outbox: OutboxAppender;
}

export type ContentUnitOfWork = UnitOfWork<ContentTxScope>;
