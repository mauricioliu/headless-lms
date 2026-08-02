import { requireAuth } from "@/lib/auth/server-session";
import { learnApi } from "@/lib/api/server";
import { adaptCourseSummary } from "@/lib/adapt";
import {
  countByState,
  dashboardHref,
  filterCourses,
  parseDashboardParams,
  pickHero,
  sortCourses,
  toCourseView,
  type SearchParams,
} from "@/lib/dashboard";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { GreetingStats } from "@/components/dashboard/greeting-stats";
import { ContinueHero } from "@/components/dashboard/continue-hero";
import { Toolbar } from "@/components/dashboard/toolbar";
import { CourseCollection } from "@/components/dashboard/course-collection";

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const coursesPromise = learnApi.listCourses();
  const orgPromise = learnApi.org();
  const paramsPromise = searchParams;
  const session = await requireAuth(coursesPromise, orgPromise);
  // Promise.all (not sequential awaits) so one read rejecting still marks the
  // other as handled — no unhandledRejection noise while the request unwinds.
  const [rawCourses, org, sp] = await Promise.all([coursesPromise, orgPromise, paramsPromise]);

  const courses = rawCourses.map(adaptCourseSummary);
  // Progress is per-course on the API; fan out so the whole page — hero, stat
  // chips, every bar — renders on the server instead of waiting on the client
  // store to be seeded.
  const progress = await Promise.all(courses.map((c) => learnApi.courseProgress(c.id)));
  const views = courses.map((course, i) => toCourseView(course, progress[i]?.activities ?? {}));

  const view = parseDashboardParams(sp);
  const totals = countByState(views);
  const hero = pickHero(views);
  const visible = sortCourses(filterCourses(views, view.filter), view.sort);

  return (
    <>
      <DashboardHeader
        studentName={session.user.name}
        studentEmail={session.user.email}
        orgName={org.name}
      />
      <main className="mx-auto max-w-[1180px] px-7 pb-[70px] pt-[30px]">
        <GreetingStats
          studentName={session.user.name}
          stats={[
            { value: String(totals.inProgress), label: "in progress" },
            { value: String(totals.completed), label: "completed" },
          ]}
        />

        {hero && <ContinueHero {...hero} />}

        <Toolbar {...view} />

        <CourseCollection
          views={visible}
          layout={view.layout}
          enrolled={courses.length > 0}
          showAllHref={dashboardHref({ ...view, filter: "all" })}
        />
      </main>
    </>
  );
}
