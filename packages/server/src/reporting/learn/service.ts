// reporting/learn — service implementation. Composes the enrollment reader
// (which published courses the student is actively enrolled in) with the content
// service (the Course/Module payload). Activities are filtered to published;
// `settings.published === false` is the only draft signal (missing ⇒ published).
import type { ContentService } from '../../core/content/index.js';
import type { ProgressService } from '../../core/progress/index.js';
import type { AssetsService } from '../../core/assets/index.js';
import type { Course, Module, CourseProgressView, Download, DownloadAsset } from './model.js';
import type { LearnEntitlementReader, LearnReportService } from './ports.js';
import type { Logger } from '../../core/shared/ports.js';
import { noopLogger } from '../../core/shared/logger.js';

function isActivityPublished(settings: unknown): boolean {
  return (settings as { published?: boolean } | null)?.published !== false;
}

export class LearnReportServiceImpl implements LearnReportService {
  constructor(
    private readonly reader: LearnEntitlementReader,
    private readonly content: ContentService,
    private readonly progress: ProgressService,
    private readonly assets: AssetsService,
    private readonly deliveryExpirySeconds: number,
    private readonly logger: Logger = noopLogger,
  ) {}

  async listCourses(orgId: string, orgUserId: string): Promise<Course[]> {
    const refs = await this.reader.activeRefs(orgId, orgUserId);
    const courses = await Promise.all(refs.map((ref) => this.content.getCourse(ref.orgId, ref.contentId)));
    return courses.filter((c): c is Course => c !== null && c.status === 'published');
  }

  async getCourse(orgId: string, orgUserId: string, courseId: string): Promise<Course | null> {
    const ref = await this.reader.activeRef(orgId, orgUserId, courseId);
    if (!ref) {
      return null;
    }
    const course = await this.content.getCourse(ref.orgId, courseId);
    return course && course.status === 'published' ? course : null;
  }

  async listModules(orgId: string, orgUserId: string, courseId: string): Promise<Module[] | null> {
    const ref = await this.reader.activeRef(orgId, orgUserId, courseId);
    if (!ref) {
      return null;
    }
    const modules = await this.content.listCourseModules(ref.orgId, courseId);
    return modules.map((m) => ({
      ...m,
      activities: m.activities.filter((a) => isActivityPublished(a.settings)),
    }));
  }

  async courseProgress(
    orgId: string,
    orgUserId: string,
    courseId: string,
  ): Promise<CourseProgressView | null> {
    const ref = await this.reader.activeRef(orgId, orgUserId, courseId);
    if (!ref) {
      return null;
    }
    const modules = await this.content.listCourseModules(ref.orgId, courseId);
    const ids = modules.flatMap((m) =>
      m.activities.filter((a) => isActivityPublished(a.settings)).map((a) => a.id),
    );
    const records = await this.progress.listByTargets(ref.orgId, orgUserId, ids);
    const activities: CourseProgressView['activities'] = {};
    const positions: CourseProgressView['positions'] = {};
    let done = 0;
    for (const r of records) {
      if (r.targetType !== 'activity') {
        continue;
      }
      activities[r.targetId] = r.completedAt ? 'completed' : 'in-progress';
      if (r.completedAt) {
        done += 1;
      }
      if (r.position != null) {
        positions[r.targetId] = r.position;
      }
    }
    const courseRecord = await this.progress.get(ref.orgId, {
      orgUserId,
      targetType: 'course',
      targetId: courseId,
    });
    return {
      activities,
      percent: ids.length > 0 ? Math.round((done / ids.length) * 100) : 0,
      completed: courseRecord?.completedAt != null,
      positions,
    };
  }

  async listDownloads(orgId: string, orgUserId: string): Promise<Download[]> {
    const refs = await this.reader.activeDownloadRefs(orgId, orgUserId);
    const rows = await Promise.all(
      refs.map((ref) => this.content.getDownload(ref.orgId, ref.contentId)),
    );
    return rows.filter((d): d is Download => d !== null && d.status === 'published');
  }

  async getDownload(
    orgId: string,
    orgUserId: string,
    downloadId: string,
  ): Promise<{ download: Download; assets: DownloadAsset[] } | null> {
    const ref = await this.reader.activeDownloadRef(orgId, orgUserId, downloadId);
    if (!ref) {
      return null;
    }
    const download = await this.content.getDownload(ref.orgId, downloadId);
    if (!download || download.status !== 'published') {
      return null;
    }
    const assets = await this.content.listDownloadAssets(ref.orgId, downloadId);
    return { download, assets };
  }

  /** The paywall. Two gates, in order: an active entitlement to a published
   *  download, then the asset actually belonging to that download — so a
   *  student entitled to X cannot reach an asset of Y by swapping the id. */
  async downloadAssetUrl(
    orgId: string,
    orgUserId: string,
    downloadId: string,
    assetId: string,
  ): Promise<{ url: string; filename: string } | null> {
    const ref = await this.reader.activeDownloadRef(orgId, orgUserId, downloadId);
    if (!ref) {
      return null;
    }
    const linked = await this.reader.downloadHasAsset(ref.orgId, downloadId, assetId);
    if (!linked) {
      this.logger.warn('download asset not linked', { orgId, downloadId, assetId });
      return null;
    }
    const links = await this.content.listDownloadAssets(ref.orgId, downloadId);
    const link = links.find((l) => l.assetId === assetId);
    if (!link) {
      return null;
    }
    const filename = link.displayName ?? link.filename;
    const ticket = await this.assets.requestDownload(
      ref.orgId,
      assetId,
      filename,
      this.deliveryExpirySeconds,
    );
    if (!ticket) {
      return null;
    }
    // Never log the signed URL — it is a bearer capability.
    this.logger.info('download asset signed', { orgId, downloadId, assetId });
    return { url: ticket.url, filename };
  }
}
