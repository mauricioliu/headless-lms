import "server-only";

/**
 * Server-side reads used by Server Components to prefetch data for React-Query
 * hydration.
 *
 * The SDK `client` is a module-level singleton with a global `credentials:
 * "include"`. On the server it is shared across all concurrent requests/users,
 * so mutating it to attach a per-request cookie would leak cookies between
 * users. Instead every call threads the incoming request's cookie via the
 * per-call `headers` option — never `client.setConfig` with request state.
 * `configureSdk` only sets the (constant) baseUrl and the error mapping.
 *
 * Only SSR-prefetched **read** methods live here. Mutations and browser-only
 * flows (`uploadAsset`, presigned `assetDownloadUrl`, `useAssetUrl`) stay
 * client-side and are never prefetched. Query serialization goes through the
 * shared `toQuery` so prefetch keys match client keys exactly (cache hit, no
 * refetch on first paint).
 */

import {
  Assets,
  Automations,
  Courses,
  Dashboard,
  Discussion,
  Downloads,
  Entitlements,
  Integrations,
  Organizations,
  Students,
} from "@headless-lms/sdk";

import { toQuery } from "./shared";
import { fullName } from "@/lib/format";
import { authHeaders } from "./server-call";
import type {
  Asset,
  Automation,
  AutomationTriggerInfo,
  AvailableAction,
  AvailableIntegration,
  Course,
  Download,
  DownloadAsset,
  Entitlement,
  IntegrationConnection,
  ListParams,
  Member,
  Module,
  OverviewStats,
  Paginated,
  CommentListItem,
  Student,
} from "./types";

export const serverApi = {
  // dashboard
  async overview(): Promise<OverviewStats> {
    return await Dashboard.getOverview(await authHeaders());
  },

  // courses
  async listCourses(params: ListParams): Promise<Paginated<Course>> {
    return await Courses.listCourses(toQuery(params, ["status", "category"]), await authHeaders());
  },
  async getCourse(id: string): Promise<Course> {
    return await Courses.getCourse({ id }, await authHeaders());
  },
  async listModules(courseId: string): Promise<Module[]> {
    return await Courses.listModules({ courseId }, await authHeaders());
  },
  // Both content types offered by the entitlements grant pickers, tagged with
  // their type so the UI can group course vs. download options.
  async contentLite(): Promise<{ id: string; title: string; type: "course" | "download" }[]> {
    const [coursesPage, downloadsPage] = await Promise.all([
      Courses.listCourses({ pageSize: 100, sort: "title" }, await authHeaders()),
      Downloads.listDownloads({ pageSize: 100, sort: "title" }, await authHeaders()),
    ]);
    const courses = coursesPage.rows.map((c) => ({
      id: c.id,
      title: c.title,
      type: "course" as const,
    }));
    const downloads = downloadsPage.rows.map((d) => ({
      id: d.id,
      title: d.title,
      type: "download" as const,
    }));
    return [...courses, ...downloads].sort((a, b) => a.title.localeCompare(b.title));
  },

  // downloads
  async listDownloads(params: ListParams): Promise<Paginated<Download>> {
    return await Downloads.listDownloads(
      toQuery(params, ["status", "category"]),
      await authHeaders(),
    );
  },
  async getDownload(downloadId: string): Promise<Download> {
    return await Downloads.getDownload({ downloadId }, await authHeaders());
  },
  async listDownloadAssets(downloadId: string): Promise<DownloadAsset[]> {
    return await Downloads.listDownloadAssets({ downloadId }, await authHeaders());
  },

  // students
  async listStudents(params: ListParams): Promise<Paginated<Student>> {
    return await Students.listStudents(toQuery(params, []), await authHeaders());
  },
  async getStudent(id: string): Promise<Student> {
    return await Students.getStudent({ id }, await authHeaders());
  },
  async studentEntitlements(orgUserId: string): Promise<Entitlement[]> {
    const page = await Entitlements.listEntitlements(
      { orgUserId, pageSize: 100 },
      await authHeaders(),
    );
    return page.rows;
  },
  async studentsLite(search?: string): Promise<{ id: string; name: string; email: string }[]> {
    const page = await Students.listStudents(
      { pageSize: 100, search: search || undefined, sort: "name" },
      await authHeaders(),
    );
    return page.rows.map((s) => ({ id: s.id, name: fullName(s), email: s.email }));
  },

  // entitlements
  async listEntitlements(params: ListParams): Promise<Paginated<Entitlement>> {
    return await Entitlements.listEntitlements(
      toQuery(params, ["status", "source"]),
      await authHeaders(),
    );
  },
  async contentEntitlements(contentId: string): Promise<Entitlement[]> {
    const page = await Entitlements.listEntitlements(
      { contentId, pageSize: 100 },
      await authHeaders(),
    );
    return page.rows;
  },

  // discussion (the comment list; settings ride on the course payload)
  /** The staff comment list, scoped to one course. `status` and `reported` are
   *  the two facets the Comments tab exposes; `reported` goes over the wire as
   *  a string because query values always do. */
  async listComments(courseId: string, params: ListParams): Promise<Paginated<CommentListItem>> {
    const { reported, ...query } = toQuery(params, ["status", "reported"]);
    return await Discussion.listComments(
      {
        ...query,
        courseId,
        ...(reported === undefined ? {} : { reported: String(reported) }),
      },
      await authHeaders(),
    );
  },

  // members
  async listMembers(params: ListParams): Promise<Paginated<Member>> {
    return await Organizations.listMembers(
      toQuery(params, ["role", "status"]),
      await authHeaders(),
    );
  },
  async instructorsLite(): Promise<{ id: string; name: string }[]> {
    const page = await Organizations.listMembers({ pageSize: 100 }, await authHeaders());
    return page.rows
      .filter((m) => m.role === "owner" || m.role === "admin" || m.role === "instructor")
      .map((m) => ({ id: m.id, name: fullName(m) }));
  },

  // media library (assets) — list only; presigned URL/upload stay client-side
  async listAssets(params: ListParams): Promise<Paginated<Asset>> {
    return await Assets.listAssets(toQuery(params, ["kind"]), await authHeaders());
  },

  // integrations
  async listAvailableIntegrations(): Promise<AvailableIntegration[]> {
    return await Integrations.listAvailableIntegrations(await authHeaders());
  },
  async listConnections(): Promise<IntegrationConnection[]> {
    return await Integrations.listConnections(await authHeaders());
  },

  // automations
  async listAutomations(): Promise<Automation[]> {
    return await Automations.listAutomations(await authHeaders());
  },
  async getAutomation(id: string): Promise<Automation> {
    return await Automations.getAutomation({ id }, await authHeaders());
  },
  async automationActions(): Promise<AvailableAction[]> {
    return await Automations.listAutomationActions(await authHeaders());
  },
  async automationTriggers(): Promise<AutomationTriggerInfo[]> {
    const { triggers } = await Automations.listAutomationTriggers(await authHeaders());
    return triggers;
  },
};
