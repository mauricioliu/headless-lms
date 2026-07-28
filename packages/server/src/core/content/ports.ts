import type {
  Activity,
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
  get(orgId: string, id: string): Promise<Course | null>;
  create(orgId: string, input: CreateCourseInput): Promise<Course>;
  /** @throws NotFoundError when no course with this id exists in the org. */
  update(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course>;
  /** @throws NotFoundError when no course with this id exists in the org. */
  patchSettings(
    orgId: string,
    id: string,
    value: Partial<CourseSettings>,
  ): Promise<CourseSettings>;
  /** @throws NotFoundError when no course with this id exists in the org. */
  remove(orgId: string, id: string): Promise<void>;

  listForCourse(orgId: string, courseId: string): Promise<Module[]>;
  getActivity(orgId: string, activityId: string): Promise<Activity | null>;
  getModule(orgId: string, moduleId: string): Promise<Module | null>;
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
  ): Promise<Module[]>;
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

// TODO
// Combine repository and structure repo into a single port.
export interface ContentRepository {
  list(orgId: string, query: ListCoursesQuery): Promise<Page<Course>>;
  findById(orgId: string, id: string): Promise<Course | null>;
  create(orgId: string, input: CreateCourseInput, slug: string): Promise<Course>;
  update(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course | null>;
  delete(orgId: string, id: string): Promise<boolean>;

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

export interface CourseRepository {
  listForCourse(orgId: string, courseId: string): Promise<Module[]>;
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
  ): Promise<Module[]>;
  deleteActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    activityId: string,
  ): Promise<Module[]>;
}
