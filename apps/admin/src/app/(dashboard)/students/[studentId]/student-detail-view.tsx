"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { RowActions } from "@/components/data-table/row-actions";
import { ForbiddenView } from "@/components/full-page-states";
import { EntitlementStatusBadge } from "@/components/status-badge";
import { NameAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentUser } from "@/lib/auth/session-context";
import { isManager } from "@/lib/roles";
import { formatDate, fullName, relativeTime } from "@/lib/format";
import type { Entitlement, Student } from "@/lib/api/types";

import { GrantAccessDialog, type LiteContent } from "../_components/grant-access-dialog";
import { deleteStudentAction, resendStudentInviteAction } from "../actions";
import { StudentDetailsForm } from "./student-details-form";

/**
 * Student detail client view (option 2). The student and their entitlements
 * arrive as PROPS from the Server Component — no `useStudent`/
 * `useStudentEntitlements`, no client query cache, so no loading/error states.
 * The role check stays as belt-and-suspenders (the RSC already gated managers).
 */
export function StudentDetailView({
  student,
  entitlements,
  content,
}: {
  student: Student;
  entitlements: Entitlement[];
  content: LiteContent[];
}) {
  const user = useCurrentUser();
  const router = useRouter();
  const [grantOpen, setGrantOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [resending, startResend] = useTransition();

  if (!isManager(user.role)) return <ForbiddenView />;

  const onResendInvite = () =>
    startResend(async () => {
      try {
        await resendStudentInviteAction(student.id);
        toast.success("Invite sent", { description: student.email });
        router.refresh();
      } catch (err) {
        toast.error("Couldn't send the invite", { description: (err as Error).message });
      }
    });

  // On success we leave the page — the list is revalidated by the action.
  const onDelete = () =>
    startDelete(async () => {
      try {
        await deleteStudentAction(student.id);
        toast.success("Student deleted");
        router.push("/students");
      } catch (err) {
        toast.error("Couldn't delete student", { description: (err as Error).message });
      }
    });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-ink-3">
          <Link href="/students">
            <ArrowLeft />
            Students
          </Link>
        </Button>
      </div>

      <StudentHeader
        student={student}
        resending={resending}
        onResendInvite={onResendInvite}
        onDelete={() => setConfirmDelete(true)}
      />

      <Tabs defaultValue="details" className="flex flex-col gap-6">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="access">Access</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <StudentDetailsForm student={student} />
        </TabsContent>

        <TabsContent value="access" className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold tracking-tight text-ink">Entitlements</h2>
            <div className="flex items-center gap-3">
              {entitlements.length > 0 ? (
                <span className="text-sm text-ink-3">{entitlements.length} total</span>
              ) : null}
              <Button variant="primary" size="sm" onClick={() => setGrantOpen(true)}>
                Grant access
              </Button>
            </div>
          </div>

          {entitlements.length === 0 ? (
            <EmptyEntitlements />
          ) : (
            <ul className="divide-y divide-line rounded-card border border-line bg-surface px-4 sm:px-5">
              {entitlements.map((e) => (
                <EntitlementRow key={e.id} entitlement={e} />
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <GrantAccessDialog
        open={grantOpen}
        onOpenChange={setGrantOpen}
        studentId={student.id}
        content={content}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete student?"
        description={
          <>
            This permanently deletes <span className="font-medium text-ink">{fullName(student)}</span>,
            along with their entitlements and progress. This can&apos;t be undone.
          </>
        }
        confirmLabel="Delete student"
        destructive
        pending={deleting}
        onConfirm={onDelete}
      />
    </div>
  );
}

function StudentHeader({
  student,
  resending,
  onResendInvite,
  onDelete,
}: {
  student: Student;
  resending: boolean;
  onResendInvite: () => void;
  onDelete: () => void;
}) {
  // A student exists from the moment an admin adds them, so the page has to say
  // whether they have actually arrived.
  const pending = student.status === "invited";
  const stats: { label: string; value: string }[] = [
    { label: "Entitlements", value: String(student.entitlementCount) },
    { label: "Avg. progress", value: `${Math.round(student.avgProgress)}%` },
    { label: "Last active", value: relativeTime(student.lastActiveAt) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <NameAvatar name={fullName(student)} image={student.image} className="size-12 text-sm" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <h1 className="truncate text-xl font-semibold tracking-tight text-ink text-balance">
                {fullName(student)}
              </h1>
              {pending && <Badge variant="warning">Invite pending</Badge>}
            </div>
            <p className="truncate text-sm text-ink-3">{student.email}</p>
            <p className="text-xs text-ink-4">
              {pending ? "Added" : "Joined"} {formatDate(student.joinedAt)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {pending && (
            <Button variant="secondary" size="sm" onClick={onResendInvite} disabled={resending}>
              Resend invite
            </Button>
          )}
          <RowActions label="Student actions">
            <DropdownMenuItem variant="danger" onClick={onDelete}>
              Delete student
            </DropdownMenuItem>
          </RowActions>
        </div>
      </div>

      <div className="@container">
        <dl className="grid grid-cols-1 divide-y divide-line rounded-card border border-line @sm:grid-cols-3 @sm:divide-x @sm:divide-y-0">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-1 px-5 py-4">
              <dt className="truncate text-xs text-ink-3">{s.label}</dt>
              <dd className="text-2xl font-semibold tracking-tight text-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function EntitlementRow({ entitlement: e }: { entitlement: Entitlement }) {
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="truncate font-medium text-ink">{e.content.title}</span>
          <EntitlementStatusBadge status={e.status} />
        </div>
        <p className="text-xs text-ink-3">
          Granted {formatDate(e.grantedAt)}
          {" · "}
          {e.expiresAt ? `Expires ${relativeTime(e.expiresAt)}` : "No expiry"}
        </p>
      </div>
    </li>
  );
}

function EmptyEntitlements() {
  return (
    <div className="grid place-items-center rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center">
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-sm font-medium text-ink">No entitlements</p>
        <p className="text-sm text-ink-3 text-pretty">
          This student hasn&apos;t been granted access to any courses yet.
        </p>
      </div>
    </div>
  );
}
