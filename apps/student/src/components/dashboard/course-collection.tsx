import type { CourseView, LayoutValue } from "@/lib/dashboard";
import { CourseCard } from "./course-card";
import { CourseListRow } from "./course-list-row";
import { FilterEmpty, LibraryEmpty } from "./empty-states";

/** The course collection and the two ways it can be empty: nothing enrolled at
 *  all, or nothing matching the active filter. */
export function CourseCollection({
  views,
  layout,
  enrolled,
  showAllHref,
}: {
  views: CourseView[];
  layout: LayoutValue;
  enrolled: boolean;
  showAllHref: string;
}) {
  if (!enrolled) return <LibraryEmpty />;
  if (views.length === 0) return <FilterEmpty showAllHref={showAllHref} />;
  if (layout === "list") {
    return (
      <div className="flex flex-col gap-3">
        {views.map((v) => (
          <CourseListRow key={v.course.id} {...v} />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-[18px] min-[900px]:grid-cols-2 min-[1080px]:grid-cols-3">
      {views.map((v) => (
        <CourseCard key={v.course.id} {...v} />
      ))}
    </div>
  );
}
