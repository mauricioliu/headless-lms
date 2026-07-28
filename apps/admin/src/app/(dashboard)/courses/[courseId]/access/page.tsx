import { requireAuth } from "@/lib/auth/server-session";
import { serverApi } from "@/lib/api/server";
import { AccessGrantsList } from "@/components/access-grants-list";

// Access tab: the students granted access to this course (entitlements). Read
// only here — grants are managed from the Entitlements area.
export default async function CourseAccessTab({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  const grantsPromise = serverApi.contentEntitlements(courseId);
  await requireAuth(grantsPromise);
  const grants = await grantsPromise;

  return (
    <AccessGrantsList
      grants={grants}
      emptyDescription="Students granted access to this course will appear here."
    />
  );
}
