import "server-only";

/**
 * Server-side mirror of the browser `api` (`sdk.ts`), used by Server Components
 * to prefetch data for React-Query hydration.
 *
 * The SDK `client` is a module-level singleton with a global `credentials:
 * "include"`. On the server it is shared across all concurrent requests/users,
 * so mutating it to attach a per-request cookie would leak cookies between
 * users. Instead every call threads the incoming request's cookie via the
 * per-call `headers` option — never `client.setConfig` with request state.
 * `configureSdk` only sets the (constant) baseUrl.
 *
 * Only SSR-prefetched **read** methods live here. Mutations and browser-only
 * flows (`uploadAsset`, presigned `assetDownloadUrl`, `useAssetUrl`) stay
 * client-side and are never prefetched. Query serialization reuses the same
 * `toQuery`/`unwrap` as the browser client so prefetch keys match client keys
 * exactly (cache hit, no refetch on first paint).
 */

import {
  Assets,
  Automations,
  ConnectedApps,
  Courses,
  Dashboard,
  Discussion,
  Downloads,
  Entitlements,
  Integrations,
  Organizations,
  Students,
} from "@headless-lms/sdk";

import { toQuery, unwrap } from "./shared";
import { ensureConfigured, authHeaders } from "./server-call";
import type {
  Asset,
  Automation,
  AutomationTriggerInfo,
  AvailableAction,
  AvailableIntegration,
  ConnectedApp,
  Course,
  DiscussionSettings,
  Download,
  DownloadAsset,
  Entitlement,
  IntegrationConnection,
  ListParams,
  Member,
  Module,
  OverviewStats,
  Paginated,
  QueueEntry,
  Student,
  CommentStates,
} from "./types";


export const serverApi = {
  // dashboard
  async overview(): Promise<OverviewStats> {
    ensureConfigured();
    return unwrap(await Dashboard.getOverview(await authHeaders()));
  },

  // courses
  async listCourses(params: ListParams): Promise<Paginated<Course>> {
    ensureConfigured();
    return unwrap(
      await Courses.listCourses({
        query: toQuery(params, ["status", "category"]),
        ...(await authHeaders()),
      }),
    );
  },
  async getCourse(id: string): Promise<Course> {
    ensureConfigured();
    return unwrap(await Courses.getCourse({ path: { id }, ...(await authHeaders()) }));
  },
  async listModules(courseId: string): Promise<Module[]> {
    ensureConfigured();
    return unwrap(
      await Courses.listModules({ path: { courseId }, ...(await authHeaders()) }),
    );
  },
  // Both content types offered by the entitlements grant pickers, tagged with
  // their type so the UI can group course vs. download options.
  async contentLite(): Promise<{ id: string; title: string; type: "course" | "download" }[]> {
    ensureConfigured();
    const [coursesPage, downloadsPage] = await Promise.all([
      Courses.listCourses({ query: { pageSize: 100, sort: "title" }, ...(await authHeaders()) }),
      Downloads.listDownloads({ query: { pageSize: 100, sort: "title" }, ...(await authHeaders()) }),
    ]);
    const courses = unwrap(coursesPage).rows.map((c) => ({
      id: c.id,
      title: c.title,
      type: "course" as const,
    }));
    const downloads = unwrap(downloadsPage).rows.map((d) => ({
      id: d.id,
      title: d.title,
      type: "download" as const,
    }));
    return [...courses, ...downloads].sort((a, b) => a.title.localeCompare(b.title));
  },

  // downloads
  async listDownloads(params: ListParams): Promise<Paginated<Download>> {
    ensureConfigured();
    return unwrap(
      await Downloads.listDownloads({
        query: toQuery(params, ["status", "category"]),
        ...(await authHeaders()),
      }),
    );
  },
  async getDownload(downloadId: string): Promise<Download> {
    ensureConfigured();
    return unwrap(
      await Downloads.getDownload({ path: { downloadId }, ...(await authHeaders()) }),
    );
  },
  async listDownloadAssets(downloadId: string): Promise<DownloadAsset[]> {
    ensureConfigured();
    return unwrap(
      await Downloads.listDownloadAssets({ path: { downloadId }, ...(await authHeaders()) }),
    );
  },

  // students
  async listStudents(params: ListParams): Promise<Paginated<Student>> {
    ensureConfigured();
    return unwrap(
      await Students.listStudents({ query: toQuery(params, []), ...(await authHeaders()) }),
    );
  },
  async getStudent(id: string): Promise<Student> {
    ensureConfigured();
    return unwrap(await Students.getStudent({ path: { id }, ...(await authHeaders()) }));
  },
  async studentEntitlements(orgUserId: string): Promise<Entitlement[]> {
    ensureConfigured();
    const page = unwrap(
      await Entitlements.listEntitlements({
        query: { orgUserId, pageSize: 100 },
        ...(await authHeaders()),
      }),
    );
    return page.rows;
  },
  async studentsLite(search?: string): Promise<{ id: string; name: string; email: string }[]> {
    ensureConfigured();
    const page = unwrap(
      await Students.listStudents({
        query: { pageSize: 100, search: search || undefined, sort: "name" },
        ...(await authHeaders()),
      }),
    );
    return page.rows.map((s) => ({ id: s.id, name: s.name, email: s.email }));
  },

  // entitlements
  async listEntitlements(params: ListParams): Promise<Paginated<Entitlement>> {
    ensureConfigured();
    return unwrap(
      await Entitlements.listEntitlements({
        query: toQuery(params, ["status", "source"]),
        ...(await authHeaders()),
      }),
    );
  },
  async contentEntitlements(contentId: string): Promise<Entitlement[]> {
    ensureConfigured();
    const page = unwrap(
      await Entitlements.listEntitlements({
        query: { contentId, pageSize: 100 },
        ...(await authHeaders()),
      }),
    );
    return page.rows;
  },

  // discussion (course-scoped settings + moderation queue)
  async discussionSettings(courseId: string): Promise<DiscussionSettings> {
    ensureConfigured();
    return unwrap(
      await Discussion.getDiscussionSettings({ path: { courseId }, ...(await authHeaders()) }),
    );
  },
  async moderationQueue(
    courseId: string,
    kind: "pending" | "reported",
  ): Promise<QueueEntry[]> {
    ensureConfigured();
    const { entries } = unwrap(
      await Discussion.getModerationQueue({
        query: { kind, courseId },
        ...(await authHeaders()),
      }),
    );
    return entries;
  },
  async commentStates(courseId: string): Promise<CommentStates> {
    ensureConfigured();
    const { states } = unwrap(
      await Discussion.listCourseCommentStates({ path: { courseId }, ...(await authHeaders()) }),
    );
    return states;
  },

  // members
  async listMembers(params: ListParams): Promise<Paginated<Member>> {
    ensureConfigured();
    return unwrap(
      await Organizations.listMembers({
        query: toQuery(params, ["role", "status"]),
        ...(await authHeaders()),
      }),
    );
  },
  async instructorsLite(): Promise<{ id: string; name: string }[]> {
    ensureConfigured();
    const page = unwrap(
      await Organizations.listMembers({ query: { pageSize: 100 }, ...(await authHeaders()) }),
    );
    return page.rows
      .filter((m) => m.role === "owner" || m.role === "admin" || m.role === "instructor")
      .map((m) => ({ id: m.id, name: m.name }));
  },

  // media library (assets) — list only; presigned URL/upload stay client-side
  async listAssets(params: ListParams): Promise<Paginated<Asset>> {
    ensureConfigured();
    return unwrap(
      await Assets.listAssets({ query: toQuery(params, ["kind"]), ...(await authHeaders()) }),
    );
  },

  // connected apps
  async listConnectedApps(): Promise<ConnectedApp[]> {
    ensureConfigured();
    return unwrap(await ConnectedApps.listConnectedApps(await authHeaders()));
  },

  // integrations
  async listAvailableIntegrations(): Promise<AvailableIntegration[]> {
    ensureConfigured();
    return unwrap(await Integrations.listAvailableIntegrations(await authHeaders()));
  },
  async listConnections(): Promise<IntegrationConnection[]> {
    ensureConfigured();
    return unwrap(await Integrations.listConnections(await authHeaders()));
  },

  // automations
  async listAutomations(): Promise<Automation[]> {
    ensureConfigured();
    return unwrap(await Automations.listAutomations(await authHeaders()));
  },
  async getAutomation(id: string): Promise<Automation> {
    ensureConfigured();
    return unwrap(await Automations.getAutomation({ path: { id }, ...(await authHeaders()) }));
  },
  async automationActions(): Promise<AvailableAction[]> {
    ensureConfigured();
    return unwrap(await Automations.listAutomationActions(await authHeaders()));
  },
  async automationTriggers(): Promise<AutomationTriggerInfo[]> {
    ensureConfigured();
    const { triggers } = unwrap(await Automations.listAutomationTriggers(await authHeaders()));
    return triggers;
  },
};
