// discussion context — service implementation (inbound port).
//
// Owns every discussion rule: which settings apply to a thread, whether a new
// comment lands pending, who may edit/remove/moderate, and what a given reader
// is served. The caller's staff standing arrives as an `Actor` resolved at the
// HTTP edge — core never looks a role up to make a decision. Profiles and roles
// ARE read back to render an author, which is presentation, not authorisation.
//
// A comment stores no course. Every path that needs one resolves it from the
// activity through the repository.
import { NotFoundError } from '../shared/errors.js';
import type { Logger } from '../shared/ports.js';
import { noopLogger } from '../shared/logger.js';
import type { DiscussionSettings, ThreadState } from './model.js';
import type { ResolvedThreadConfig } from './types.js';
import type { DiscussionRepository, DiscussionUnitOfWork } from './ports.js';

/** A course with no stored settings. Discussion is opt-in, so the common case
 *  persists no row at all and every existing course stays silent. */
export const DEFAULT_SETTINGS = {
  enabled: false,
  threaded: true,
  requireReview: false,
  reactions: true,
} as const;

// Implements DiscussionService incrementally: Task 6 lands the settings/
// thread-state methods below; tasks 7-11 add post/edit/remove/... to this
// same class. The `implements DiscussionService` clause returns once every
// method exists — declaring it now would fail typecheck against methods that
// don't exist yet.
export class DiscussionServiceImpl {
  constructor(
    private readonly repo: DiscussionRepository,
    private readonly uow: DiscussionUnitOfWork,
    private readonly now: () => string,
    private readonly logger: Logger = noopLogger,
  ) {}

  async getSettings(orgId: string, courseId: string): Promise<DiscussionSettings> {
    const stored = await this.repo.findSettings(orgId, courseId);
    return stored ?? { orgId, courseId, ...DEFAULT_SETTINGS };
  }

  async setSettings(
    orgId: string,
    courseId: string,
    patch: Partial<Omit<DiscussionSettings, 'orgId' | 'courseId'>>,
  ): Promise<DiscussionSettings> {
    const current = await this.getSettings(orgId, courseId);
    return this.repo.upsertSettings(orgId, { ...current, ...patch });
  }

  async setThreadState(
    orgId: string,
    activityId: string,
    state: ThreadState | null,
  ): Promise<void> {
    if (state === null) {
      await this.repo.clearThreadState(orgId, activityId);
      return;
    }
    await this.repo.upsertThreadState(orgId, activityId, state);
  }

  listThreadStates(orgId: string, courseId: string): Promise<Record<string, ThreadState>> {
    return this.repo.listThreadStatesByCourse(orgId, courseId);
  }

  /** The course an activity sits in. Content owns this fact; discussion reads
   *  it here rather than storing a copy that goes stale on a restructure. */
  private async courseOf(orgId: string, activityId: string): Promise<string> {
    const courseId = await this.repo.courseOfActivity(orgId, activityId);
    if (!courseId) {
      throw new NotFoundError('Activity', activityId);
    }
    return courseId;
  }

  async resolveConfig(orgId: string, activityId: string): Promise<ResolvedThreadConfig> {
    const courseId = await this.courseOf(orgId, activityId);
    const settings = await this.getSettings(orgId, courseId);
    const override = await this.repo.findThreadState(orgId, activityId);
    // Discussion off for the course cannot be overridden back on by an
    // activity: the course switch is the master.
    const state: ThreadState = !settings.enabled ? 'hidden' : (override ?? 'visible');
    return {
      enabled: settings.enabled,
      threaded: settings.threaded,
      requireReview: settings.requireReview,
      reactions: settings.reactions,
      state,
    };
  }
}
