import type {
  Activity,
  ActivityAsset,
  Bundle,
  BundleItem,
  Course,
  CourseSettings,
  Download,
  DownloadAsset,
  Module,
  SaveActivityInput,
} from './model.js';
import type {
  BundlesService,
  CourseManagementService,
  ContentRepository,
  ContentUnitOfWork,
  DownloadablesService,
} from './ports.js';
import type {
  AddDownloadAssetInput,
  CreateBundleInput,
  CreateCourseInput,
  CreateDownloadInput,
  ListBundlesQuery,
  ListCoursesQuery,
  ListDownloadsQuery,
  Page,
  UpdateBundleInput,
  UpdateCourseInput,
  UpdateDownloadInput,
} from './types.js';
import { contentEvents } from './events.js';
import type { Logger } from '../shared/ports.js';
import { NotFoundError, ConflictError } from '../shared/errors.js';
import { noopLogger } from '../shared/logger.js';

/** URL-safe slug derived from a title. Domain rule owned by the service. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export type ContentServiceParams = {
  repo: ContentRepository;
  uow: ContentUnitOfWork;
  logger?: Logger;
};

export class ContentService
  implements CourseManagementService, DownloadablesService, BundlesService
{
  private readonly repo: ContentRepository;
  private readonly uow: ContentUnitOfWork;
  private readonly logger: Logger;

  constructor(params: ContentServiceParams) {
    this.repo = params.repo;
    this.uow = params.uow;
    this.logger = params.logger ?? noopLogger;
  }

  listCourses(orgId: string, query: ListCoursesQuery): Promise<Page<Course>> {
    return this.repo.listCourses(orgId, query);
  }

  getCourse(orgId: string, id: string): Promise<Course | null> {
    return this.repo.findCourseById(orgId, id);
  }

  async createCourse(orgId: string, input: CreateCourseInput): Promise<Course> {
    const course = await this.uow.run(async ({ content, outbox }) => {
      const created = await content.createCourse(orgId, input, slugify(input.title));
      await outbox.append([contentEvents.courseCreated.make({ orgId, data: created })]);
      return created;
    });
    this.logger.info('course created', { orgId, courseId: course.id, title: course.title });
    return course;
  }

  async updateCourse(orgId: string, id: string, patch: UpdateCourseInput): Promise<Course> {
    const course = await this.uow.run(async ({ content, outbox }) => {
      const updated = await content.updateCourse(orgId, id, patch);
      if (!updated) {
        this.logger.warn('course update rejected — not found', { orgId, courseId: id });
        throw new NotFoundError('Course', id);
      }
      await outbox.append([contentEvents.courseUpdated.make({ orgId, data: updated })]);
      return updated;
    });
    this.logger.info('course updated', { orgId, courseId: id, fields: Object.keys(patch) });
    return course;
  }

  async patchCourseSettings(
    orgId: string,
    id: string,
    value: Partial<CourseSettings>,
  ): Promise<CourseSettings> {
    const merged = await this.uow.run(async ({ content, outbox }) => {
      const course = await content.findCourseById(orgId, id);
      if (!course) {
        this.logger.warn('course settings patch rejected — not found', { orgId, courseId: id });
        throw new NotFoundError('Course', id);
      }
      const settings = await content.patchCourseSettings(orgId, id, value);
      await outbox.append([
        contentEvents.courseUpdated.make({ orgId, data: { ...course, settings } }),
      ]);
      return settings;
    });
    this.logger.info('course settings patched', { orgId, courseId: id, value });
    return merged;
  }

  async deleteCourse(orgId: string, id: string): Promise<void> {
    await this.uow.run(async ({ content, outbox }) => {
      // Snapshot before the delete — the event carries the last known state.
      const course = await content.findCourseById(orgId, id);
      if (!course) {
        this.logger.warn('course delete rejected — not found', { orgId, courseId: id });
        throw new NotFoundError('Course', id);
      }
      const ok = await content.deleteCourse(orgId, id);
      if (!ok) {
        throw new NotFoundError('Course', id);
      }
      await outbox.append([contentEvents.courseDeleted.make({ orgId, data: course })]);
    });
    this.logger.info('course deleted', { orgId, courseId: id });
  }

  // --- modules & activities ------------------------------------------------

  listCourseModules(orgId: string, courseId: string): Promise<Module[]> {
    return this.repo.listCourseModules(orgId, courseId);
  }
  listCourseActivities(orgId: string, courseId: string): Promise<Activity[]> {
    return this.repo.listActivitiesForCourse(orgId, courseId);
  }
  listCourseActivityAssets(orgId: string, courseId: string): Promise<ActivityAsset[]> {
    return this.repo.listActivityAssetsForCourse(orgId, courseId);
  }
  getActivity(orgId: string, activityId: string): Promise<Activity | null> {
    return this.repo.findActivity(orgId, activityId);
  }
  getModule(orgId: string, moduleId: string): Promise<Module | null> {
    return this.repo.findModule(orgId, moduleId);
  }

  async reorderModules(orgId: string, courseId: string, orderedIds: string[]): Promise<Module[]> {
    const modules = await this.uow.run(async ({ content, outbox }) => {
      const reordered = await content.reorderModules(orgId, courseId, orderedIds);
      await outbox.append([contentEvents.modulesReordered.make({ orgId, data: reordered })]);
      return reordered;
    });
    this.logger.debug('modules reordered', {
      orgId,
      courseId,
      moduleIds: modules.map((m) => m.id),
    });
    return modules;
  }

  async createModule(orgId: string, courseId: string, title: string): Promise<Module[]> {
    const { modules, created } = await this.uow.run(async ({ content, outbox }) => {
      const all = await content.createModule(orgId, courseId, title);
      // The list is ordered by seq and the new module is appended at max(seq)+1.
      const module = all.at(-1);
      if (!module) {
        throw new Error('failed to load created module');
      }
      await outbox.append([contentEvents.moduleCreated.make({ orgId, data: module })]);
      return { modules: all, created: module };
    });
    this.logger.info('module created', { orgId, courseId, moduleId: created.id, title });
    return modules;
  }

  async updateModule(
    orgId: string,
    courseId: string,
    moduleId: string,
    title: string,
  ): Promise<Module[]> {
    const modules = await this.uow.run(async ({ content, outbox }) => {
      const existing = await content.findModule(orgId, moduleId);
      if (!existing || existing.courseId !== courseId) {
        this.logger.warn('module update rejected — not found in course', {
          orgId,
          courseId,
          moduleId,
        });
        throw new NotFoundError('Module', moduleId);
      }
      const all = await content.updateModule(orgId, courseId, moduleId, title);
      const module = all.find((m) => m.id === moduleId);
      if (!module) {
        throw new NotFoundError('Module', moduleId);
      }
      await outbox.append([contentEvents.moduleUpdated.make({ orgId, data: module })]);
      return all;
    });
    this.logger.info('module updated', { orgId, courseId, moduleId, title });
    return modules;
  }

  async deleteModule(orgId: string, courseId: string, moduleId: string): Promise<Module[]> {
    const modules = await this.uow.run(async ({ content, outbox }) => {
      // Snapshot before the delete — the event carries the last known state.
      const module = await content.findModule(orgId, moduleId);
      if (!module || module.courseId !== courseId) {
        this.logger.warn('module delete rejected — not found in course', {
          orgId,
          courseId,
          moduleId,
        });
        throw new NotFoundError('Module', moduleId);
      }
      const remaining = await content.deleteModule(orgId, courseId, moduleId);
      await outbox.append([contentEvents.moduleDeleted.make({ orgId, data: module })]);
      return remaining;
    });
    this.logger.info('module deleted', { orgId, courseId, moduleId });
    return modules;
  }

  async reorderActivities(
    orgId: string,
    courseId: string,
    moduleId: string,
    orderedIds: string[],
  ): Promise<Module[]> {
    const modules = await this.uow.run(async ({ content, outbox }) => {
      const reordered = await content.reorderActivities(orgId, courseId, moduleId, orderedIds);
      const module = reordered.find((m) => m.id === moduleId);
      if (!module) {
        throw new NotFoundError('Module', moduleId);
      }
      await outbox.append([contentEvents.activitiesReordered.make({ orgId, data: module })]);
      return reordered;
    });
    this.logger.debug('activities reordered', { orgId, courseId, moduleId });
    return modules;
  }

  async saveActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    input: SaveActivityInput,
    activityId?: string,
  ): Promise<Module[]> {
    const { modules, activity } = await this.uow.run(async ({ content, outbox }) => {
      if (activityId) {
        const existing = await content.findActivity(orgId, activityId);
        if (!existing || existing.moduleId !== moduleId || existing.courseId !== courseId) {
          this.logger.warn('activity update rejected — not found in module', {
            orgId,
            courseId,
            moduleId,
            activityId,
          });
          throw new NotFoundError('Activity', activityId);
        }
      } else {
        const module = await content.findModule(orgId, moduleId);
        if (!module || module.courseId !== courseId) {
          this.logger.warn('activity create rejected — module not found in course', {
            orgId,
            courseId,
            moduleId,
          });
          throw new NotFoundError('Module', moduleId);
        }
      }

      const { modules: all, activity: saved } = await content.saveActivity(
        orgId,
        courseId,
        moduleId,
        input,
        activityId,
      );
      await outbox.append([
        activityId
          ? contentEvents.activityUpdated.make({ orgId, data: saved })
          : contentEvents.activityCreated.make({ orgId, data: saved }),
      ]);
      return { modules: all, activity: saved };
    });
    this.logger.info(activityId ? 'activity updated' : 'activity created', {
      orgId,
      courseId,
      moduleId,
      activityId: activity.id,
    });
    return modules;
  }

  async deleteActivity(
    orgId: string,
    courseId: string,
    moduleId: string,
    activityId: string,
  ): Promise<Module[]> {
    const modules = await this.uow.run(async ({ content, outbox }) => {
      // Snapshot before the delete — the event carries the last known state.
      const activity = await content.findActivity(orgId, activityId);
      if (!activity || activity.moduleId !== moduleId || activity.courseId !== courseId) {
        this.logger.warn('activity delete rejected — not found in module', {
          orgId,
          courseId,
          moduleId,
          activityId,
        });
        throw new NotFoundError('Activity', activityId);
      }
      const remaining = await content.deleteActivity(orgId, courseId, moduleId, activityId);
      await outbox.append([contentEvents.activityDeleted.make({ orgId, data: activity })]);
      return remaining;
    });
    this.logger.info('activity deleted', { orgId, courseId, moduleId, activityId });
    return modules;
  }

  // --- downloads ------------------------------------------------------------

  listDownloads(orgId: string, query: ListDownloadsQuery): Promise<Page<Download>> {
    return this.repo.listDownloads(orgId, query);
  }

  getDownload(orgId: string, id: string): Promise<Download | null> {
    return this.repo.getDownload(orgId, id);
  }

  async createDownload(orgId: string, input: CreateDownloadInput): Promise<Download> {
    const download = await this.uow.run(async ({ content, outbox }) => {
      const created = await content.createDownload(orgId, input, slugify(input.title));
      await outbox.append([contentEvents.downloadCreated.make({ orgId, data: created })]);
      return created;
    });
    this.logger.info('download created', { orgId, downloadId: download.id, title: download.title });
    return download;
  }

  async updateDownload(orgId: string, id: string, patch: UpdateDownloadInput): Promise<Download> {
    const download = await this.uow.run(async ({ content, outbox }) => {
      const updated = await content.updateDownload(orgId, id, patch);
      if (!updated) {
        this.logger.warn('download update rejected — not found', { orgId, downloadId: id });
        throw new NotFoundError('Download', id);
      }
      await outbox.append([contentEvents.downloadUpdated.make({ orgId, data: updated })]);
      return updated;
    });
    this.logger.info('download updated', { orgId, downloadId: id, fields: Object.keys(patch) });
    return download;
  }

  async removeDownload(orgId: string, id: string): Promise<void> {
    await this.uow.run(async ({ content, outbox }) => {
      // Snapshot before the delete — the event carries the last known state.
      const download = await content.getDownload(orgId, id);
      if (!download) {
        this.logger.warn('download delete rejected — not found', { orgId, downloadId: id });
        throw new NotFoundError('Download', id);
      }
      const ok = await content.deleteDownload(orgId, id);
      if (!ok) {
        throw new NotFoundError('Download', id);
      }
      await outbox.append([contentEvents.downloadDeleted.make({ orgId, data: download })]);
    });
    this.logger.info('download deleted', { orgId, downloadId: id });
  }

  // --- download asset links ------------------------------------------------

  listDownloadAssets(orgId: string, downloadId: string): Promise<DownloadAsset[]> {
    return this.repo.listDownloadAssets(orgId, downloadId);
  }

  async addDownloadAsset(
    orgId: string,
    downloadId: string,
    input: AddDownloadAssetInput,
  ): Promise<DownloadAsset[]> {
    const assets = await this.uow.run(async ({ content, outbox }) => {
      const assets = await content.addDownloadAsset(orgId, downloadId, input);
      await outbox.append([
        contentEvents.downloadAssetAdded.make({ orgId, data: { downloadId, assets } }),
      ]);
      return assets;
    });
    this.logger.info('download asset added', { orgId, downloadId, assetId: input.assetId });
    return assets;
  }

  async removeDownloadAsset(
    orgId: string,
    downloadId: string,
    assetId: string,
  ): Promise<DownloadAsset[]> {
    const assets = await this.uow.run(async ({ content, outbox }) => {
      const assets = await content.removeDownloadAsset(orgId, downloadId, assetId);
      await outbox.append([
        contentEvents.downloadAssetRemoved.make({ orgId, data: { downloadId, assets } }),
      ]);
      return assets;
    });
    this.logger.info('download asset removed', { orgId, downloadId, assetId });
    return assets;
  }

  async renameDownloadAsset(
    orgId: string,
    downloadId: string,
    assetId: string,
    displayName: string | null,
  ): Promise<DownloadAsset[]> {
    const assets = await this.uow.run(async ({ content, outbox }) => {
      const assets = await content.renameDownloadAsset(orgId, downloadId, assetId, displayName);
      await outbox.append([
        contentEvents.downloadAssetRenamed.make({ orgId, data: { downloadId, assets } }),
      ]);
      return assets;
    });
    this.logger.info('download asset renamed', { orgId, downloadId, assetId });
    return assets;
  }

  /** The caller must send the COMPLETE ordered set — a partial list would
   *  silently unlink whatever it omitted. */
  async reorderDownloadAssets(
    orgId: string,
    downloadId: string,
    assetIds: string[],
  ): Promise<DownloadAsset[]> {
    const assets = await this.uow.run(async ({ content, outbox }) => {
      const current = await content.listDownloadAssets(orgId, downloadId);
      const currentIds = new Set(current.map((a) => a.assetId));
      const requestedIds = new Set(assetIds);
      if (
        requestedIds.size !== assetIds.length ||
        requestedIds.size !== currentIds.size ||
        !assetIds.every((id) => currentIds.has(id))
      ) {
        this.logger.warn('download asset reorder rejected — id set mismatch', {
          orgId,
          downloadId,
          assetIds,
          currentIds: [...currentIds],
        });
        throw new ConflictError("Ordered asset ids does not match the download's current assets");
      }
      const assets = await content.reorderDownloadAssets(orgId, downloadId, assetIds);
      await outbox.append([
        contentEvents.downloadAssetsReordered.make({ orgId, data: { downloadId, assets } }),
      ]);
      return assets;
    });
    this.logger.debug('download assets reordered', { orgId, downloadId });
    return assets;
  }

  // --- bundles --------------------------------------------------------------

  listBundles(orgId: string, query: ListBundlesQuery): Promise<Page<Bundle>> {
    return this.repo.listBundles(orgId, query);
  }

  getBundle(orgId: string, id: string): Promise<Bundle | null> {
    return this.repo.findBundleById(orgId, id);
  }

  async createBundle(orgId: string, input: CreateBundleInput): Promise<Bundle> {
    const { bundle, items } = await this.uow.run(async ({ content, outbox }) => {
      // The repository writes the bundle and its initial items as one unit —
      // an unknown content id throws and nothing is created.
      const created = await content.createBundle(orgId, input);
      const initial = input.contentIds?.length
        ? await content.listBundleItems(orgId, created.id)
        : [];
      await outbox.append([
        contentEvents.bundleCreated.make({ orgId, data: created }),
        ...(initial.length > 0
          ? [
              contentEvents.bundleItemAdded.make({
                orgId,
                data: { bundleId: created.id, items: initial },
              }),
            ]
          : []),
      ]);
      return { bundle: created, items: initial };
    });
    this.logger.info('bundle created', {
      orgId,
      bundleId: bundle.id,
      name: bundle.name,
      itemCount: items.length,
    });
    return bundle;
  }

  async updateBundle(orgId: string, id: string, patch: UpdateBundleInput): Promise<Bundle> {
    const bundle = await this.uow.run(async ({ content, outbox }) => {
      const updated = await content.updateBundle(orgId, id, patch);
      if (!updated) {
        this.logger.warn('bundle update rejected — not found', { orgId, bundleId: id });
        throw new NotFoundError('Bundle', id);
      }
      await outbox.append([contentEvents.bundleUpdated.make({ orgId, data: updated })]);
      return updated;
    });
    this.logger.info('bundle updated', { orgId, bundleId: id, fields: Object.keys(patch) });
    return bundle;
  }

  async deleteBundle(orgId: string, id: string): Promise<void> {
    await this.uow.run(async ({ content, outbox }) => {
      // Snapshot before the delete — the event carries the last known state.
      const bundle = await content.findBundleById(orgId, id);
      if (!bundle) {
        this.logger.warn('bundle delete rejected — not found', { orgId, bundleId: id });
        throw new NotFoundError('Bundle', id);
      }
      const ok = await content.deleteBundle(orgId, id);
      if (!ok) {
        throw new NotFoundError('Bundle', id);
      }
      await outbox.append([contentEvents.bundleDeleted.make({ orgId, data: bundle })]);
    });
    this.logger.info('bundle deleted', { orgId, bundleId: id });
  }

  listBundleItems(orgId: string, bundleId: string): Promise<BundleItem[]> {
    return this.repo.listBundleItems(orgId, bundleId);
  }

  async addBundleItem(orgId: string, bundleId: string, contentId: string): Promise<BundleItem[]> {
    const items = await this.uow.run(async ({ content, outbox }) => {
      const all = await content.addBundleItem(orgId, bundleId, contentId);
      await outbox.append([
        contentEvents.bundleItemAdded.make({ orgId, data: { bundleId, items: all } }),
      ]);
      return all;
    });
    this.logger.info('bundle item added', { orgId, bundleId, contentId });
    return items;
  }

  async removeBundleItem(
    orgId: string,
    bundleId: string,
    contentId: string,
  ): Promise<BundleItem[]> {
    const items = await this.uow.run(async ({ content, outbox }) => {
      const all = await content.removeBundleItem(orgId, bundleId, contentId);
      await outbox.append([
        contentEvents.bundleItemRemoved.make({ orgId, data: { bundleId, items: all } }),
      ]);
      return all;
    });
    this.logger.info('bundle item removed', { orgId, bundleId, contentId });
    return items;
  }
}
