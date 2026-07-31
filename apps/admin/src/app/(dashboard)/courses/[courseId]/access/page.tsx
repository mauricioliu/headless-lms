import { serverApi } from "@/lib/api/server";
import { AccessGrantsList } from "@/components/access-grants-list";

import { GrantCourseAccessButton } from "../_components/grant-course-access-button";

// Access tab: the students granted access to this course (entitlements), plus
// the course-scoped grant form.
export default async function CourseAccessTab({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  const [grants, students] = await Promise.all([
    serverApi.contentEntitlements(courseId),
    serverApi.studentsLite(),
  ]);

  // Anyone already on the list can't be granted twice — revoked grants are
  // reinstated from the Entitlements area, not re-granted here.
  const granted = new Set(grants.map((g) => g.orgUserId));
  const candidates = students.filter((s) => !granted.has(s.id));

  return (
    <AccessGrantsList
      grants={grants}
      emptyDescription="Students granted access to this course will appear here."
      action={<GrantCourseAccessButton courseId={courseId} students={candidates} />}
      emptyAction={
        <GrantCourseAccessButton courseId={courseId} students={candidates} variant="secondary" />
      }
    />
  );
}
