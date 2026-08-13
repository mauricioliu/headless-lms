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
 * The API serves bare model rows; every display shape the dashboard needs —
 * the module→activity tree, entitlement rows joined with student identity and
 * content titles, download assets joined with file metadata — is composed here
 * from multiple bare reads (see lib/api/compose).
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
  Content,
  Discussion,
  Entitlements,
  Integrations,
  Organizations,
  Reporting,
} from "@headless-lms/sdk";

import { toQuery } from "./shared";
import { buildModuleTree, entitlementStatusOf } from "./compose";
import { fullName } from "@/lib/format";
import { authHeaders } from "./server-call";
import type {
  Asset,
  Automation,
  AutomationTriggerInfo,
  AvailableAction,
  AvailableIntegration,
  Course,
  CourseAnalytics,
  Download,
  DownloadAsset,
  EnrollmentSeries,
  Entitlement,
  EntitlementGrant,
  IntegrationConnection,
  ListParams,
  Member,
  ModuleTree,
  OverviewStats,
  Paginated,
  CommentListItem,
  Student,
} from "./types";

/** Resolve a granted content id to its type + display title. The grant row
 *  stores only the id, so probe the two content resources in order. */
async function contentRefOf(
  contentId: string,
  headers: Awaited<ReturnType<typeof authHeaders>>,
): Promise<Entitlement["content"]> {
  try {
    const course = await Content.getCourse({ id: contentId }, headers);
    return { id: contentId, type: "course", title: course.title };
  } catch {
    // fall through to download
  }
  try {
    const download = await Content.getDownload({ downloadId: contentId }, headers);
    return { id: contentId, type: "download", title: download.title };
  } catch {
    return { id: contentId, type: "course", title: contentId };
  }
}

/** Join bare grant rows with student identity + content titles (one fetch per
 *  unique id, in parallel) and derive the display status. */
async function composeEntitlements(grants: EntitlementGrant[]): Promise<Entitlement[]> {
  const headers = await authHeaders();
  const studentIds = [...new Set(grants.map((g) => g.orgUserId))];
  const contentIds = [...new Set(grants.map((g) => g.contentId))];
  const [students, refs] = await Promise.all([
    Promise.all(
      studentIds.map(async (id) => {
        try {
          return await Organizations.getStudent({ id }, headers);
        } catch {
          return null;
        }
      }),
    ),
    Promise.all(contentIds.map((id) => contentRefOf(id, headers))),
  ]);
  const studentById = new Map(students.filter((s) => s !== null).map((s) => [s.id, s]));
  const refById = new Map(refs.map((r) => [r.id, r]));
  return grants.map((g) => {
    const student = studentById.get(g.orgUserId);
    return {
      ...g,
      status: entitlementStatusOf(g),
      firstName: student?.firstName ?? null,
      lastName: student?.lastName ?? null,
      email: student?.email ?? "",
      content: refById.get(g.contentId) ?? { id: g.contentId, type: "course", title: g.contentId },
    };
  });
}

/** Join bare download→asset link rows with each asset's file metadata. Also
 *  used by the download-asset server actions to return display rows. */
export async function composeDownloadAssets(
  links: Awaited<ReturnType<typeof Content.listDownloadAssets>>,
): Promise<DownloadAsset[]> {
  const headers = await authHeaders();
  const assetIds = [...new Set(links.map((l) => l.assetId))];
  const assets = await Promise.all(assetIds.map((id) => Assets.getAsset({ id }, headers)));
  const assetById = new Map(assets.map((a) => [a.id, a]));
  return links.map((l) => {
    const asset = assetById.get(l.assetId);
    return {
      ...l,
      filename: asset?.filename ?? l.assetId,
      contentType: asset?.contentType ?? "application/octet-stream",
      size: asset?.size ?? 0,
    };
  });
}

export const serverApi = {
  // reporting
  async overview(): Promise<OverviewStats> {
    return await Reporting.getOverview(await authHeaders());
  },
  async enrollmentSeries(days: number): Promise<EnrollmentSeries> {
    return await Reporting.getEnrollmentSeries({ days }, await authHeaders());
  },
  async courseAnalytics(courseId: string): Promise<CourseAnalytics> {
    return await Reporting.getCourseAnalytics({ id: courseId }, await authHeaders());
  },
  async courseEnrollmentSeries(courseId: string, days: number): Promise<EnrollmentSeries> {
    return await Reporting.getCourseEnrollmentSeries({ id: courseId, days }, await authHeaders());
  },

  // courses
  async listCourses(params: ListParams): Promise<Paginated<Course>> {
    return await Content.listCourses(toQuery(params, ["status", "category"]), await authHeaders());
  },
  async getCourse(id: string): Promise<Course> {
    return await Content.getCourse({ id }, await authHeaders());
  },
  /** The builder's module→activity tree, composed from the three bare lists. */
  async moduleTree(courseId: string): Promise<ModuleTree[]> {
    const headers = await authHeaders();
    const [modules, activities, links] = await Promise.all([
      Content.listModules({ courseId }, headers),
      Content.listActivities({ courseId }, headers),
      Content.listActivityAssets({ courseId }, headers),
    ]);
    return buildModuleTree(modules, activities, links);
  },
  // Both content types offered by the entitlements grant pickers, tagged with
  // their type so the UI can group course vs. download options.
  async contentLite(): Promise<{ id: string; title: string; type: "course" | "download" }[]> {
    const [coursesPage, downloadsPage] = await Promise.all([
      Content.listCourses({ pageSize: 100, sort: "title" }, await authHeaders()),
      Content.listDownloads({ pageSize: 100, sort: "title" }, await authHeaders()),
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
    return await Content.listDownloads(toQuery(params, ["status", "category"]), await authHeaders());
  },
  async getDownload(downloadId: string): Promise<Download> {
    return await Content.getDownload({ downloadId }, await authHeaders());
  },
  async listDownloadAssets(downloadId: string): Promise<DownloadAsset[]> {
    const links = await Content.listDownloadAssets({ downloadId }, await authHeaders());
    return composeDownloadAssets(links);
  },
  /** Header stats for one download, composed from its assets + grants. */
  async downloadStats(
    downloadId: string,
  ): Promise<{ assetCount: number; totalSize: number; entitledCount: number }> {
    const [assets, entitled] = await Promise.all([
      this.listDownloadAssets(downloadId),
      Entitlements.listEntitlements(
        { contentId: downloadId, status: "active", page: 1, pageSize: 1 },
        await authHeaders(),
      ),
    ]);
    return {
      assetCount: assets.length,
      totalSize: assets.reduce((sum, a) => sum + a.size, 0),
      entitledCount: entitled.total,
    };
  },

  // students
  async listStudents(params: ListParams): Promise<Paginated<Student>> {
    return await Organizations.listStudents(toQuery(params, []), await authHeaders());
  },
  async getStudent(id: string): Promise<Student> {
    return await Organizations.getStudent({ id }, await authHeaders());
  },
  async studentEntitlements(orgUserId: string): Promise<Entitlement[]> {
    const page = await Entitlements.listEntitlements(
      { orgUserId, page: 1, pageSize: 100 },
      await authHeaders(),
    );
    return composeEntitlements(page.rows);
  },
  async studentsLite(search?: string): Promise<{ id: string; name: string; email: string }[]> {
    const page = await Organizations.listStudents(
      { page: 1, pageSize: 100, search: search || undefined, sort: "name" },
      await authHeaders(),
    );
    return page.rows.map((s) => ({ id: s.id, name: fullName(s), email: s.email }));
  },

  // entitlements
  async listEntitlements(params: ListParams): Promise<Paginated<Entitlement>> {
    const page = await Entitlements.listEntitlements(
      toQuery(params, ["status", "source"]),
      await authHeaders(),
    );
    return { ...page, rows: await composeEntitlements(page.rows) };
  },
  async contentEntitlements(contentId: string): Promise<Entitlement[]> {
    const page = await Entitlements.listEntitlements(
      { contentId, page: 1, pageSize: 100 },
      await authHeaders(),
    );
    return composeEntitlements(page.rows);
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
