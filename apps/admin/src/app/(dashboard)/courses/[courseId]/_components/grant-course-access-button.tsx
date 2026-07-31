"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";

import { GrantCourseAccessDialog, type LiteStudent } from "./grant-course-access-dialog";

/** Opens the course-scoped grant sheet — the Access tab's only interactive bit. */
export function GrantCourseAccessButton({
  courseId,
  students,
  variant = "primary",
}: {
  courseId: string;
  students: LiteStudent[];
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button variant={variant} size="sm" onClick={() => setOpen(true)}>
        Grant access
      </Button>
      <GrantCourseAccessDialog
        open={open}
        onOpenChange={setOpen}
        courseId={courseId}
        students={students}
      />
    </>
  );
}
