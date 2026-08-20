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
import { ApiError } from "@/lib/api/http";
import { formatDate, fullName, relativeTime } from "@/lib/format";
import type { Entitlement, Student } from "@/lib/api/types";

import { GrantAccessDialog, type LiteContent } from "../_components/grant-access-dialog";
import { deleteStudentAction, resendStudentInviteAction } from "../actions";
import { StudentDetailsForm } from "./student-details-form";

/**
 * Trabajador detail client view (option 2). The person and their entitlements
 * arrive as PROPS from the Server Component — no query hooks, no client cache,
 * so no loading/error states. The role check stays as belt-and-suspenders (the
 * RSC already gated managers).
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
        toast.success("Invitación reenviada", { description: student.email });
        router.refresh();
      } catch (err) {
        const status = err instanceof ApiError ? err.status : undefined;
        toast.error("No se pudo reenviar la invitación", {
          description:
            status === 404
              ? "El Trabajador ya no existe."
              : status === 409
                ? "La invitación ya fue aceptada; no queda nada por reenviar."
                : "Inténtelo de nuevo en un momento.",
        });
      }
    });

  // On success we leave the page — the list is revalidated by the action.
  const onDelete = () =>
    startDelete(async () => {
      try {
        await deleteStudentAction(student.id);
        toast.success("Trabajador eliminado");
        router.push("/students");
      } catch (err) {
        const status = err instanceof ApiError ? err.status : undefined;
        toast.error("No se pudo eliminar al Trabajador", {
          description:
            status === 404
              ? "Ya no existe; la lista se actualizará en un momento."
              : status === 409
                ? "Tiene evidencia registrada (Intentos o avance); no puede eliminarse."
                : "Inténtelo de nuevo en un momento.",
        });
      }
    });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-ink-3">
          <Link href="/students">
            <ArrowLeft />
            Trabajadores
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
          <TabsTrigger value="details">Datos</TabsTrigger>
          <TabsTrigger value="access">Accesos</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <StudentDetailsForm student={student} />
        </TabsContent>

        <TabsContent value="access" className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold tracking-tight text-ink">Accesos</h2>
            <div className="flex items-center gap-3">
              {entitlements.length > 0 ? (
                <span className="text-sm text-ink-3">{entitlements.length} en total</span>
              ) : null}
              <Button variant="primary" size="sm" onClick={() => setGrantOpen(true)}>
                Dar acceso
              </Button>
            </div>
          </div>

          {entitlements.length === 0 ? (
            <EmptyEntitlements />
          ) : (
            <ul className="divide-y divide-line">
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
        title="¿Eliminar Trabajador?"
        description={
          <>
            Esto elimina de forma permanente a{" "}
            <span className="font-medium text-ink">{fullName(student)}</span>, junto con sus
            accesos y su avance. No se puede deshacer.
            <br />
            Si ya tiene evidencia registrada (Intentos o avance), la plataforma rechazará la
            eliminación para proteger el registro.
          </>
        }
        confirmLabel="Eliminar Trabajador"
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
  // A Trabajador exists from the moment an admin adds them, so the page has to
  // say whether they have actually arrived.
  const pending = student.status === "invited";
  const stats: { label: string; value: string }[] = [
    { label: "Accesos", value: String(student.entitlementCount) },
    { label: "Avance promedio", value: `${Math.round(student.avgProgress)}%` },
    { label: "Última actividad", value: relativeTime(student.lastActiveAt) },
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
              {pending && <Badge variant="warning">Invitación pendiente</Badge>}
            </div>
            <p className="truncate text-sm text-ink-3">{student.email}</p>
            <p className="text-xs text-ink-4">
              {pending ? "Agregado" : "Se unió"} el {formatDate(student.joinedAt)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {pending && (
            <Button variant="secondary" size="sm" onClick={onResendInvite} disabled={resending}>
              Reinvitar
            </Button>
          )}
          <RowActions label="Acciones del Trabajador">
            <DropdownMenuItem variant="danger" onClick={onDelete}>
              Eliminar Trabajador
            </DropdownMenuItem>
          </RowActions>
        </div>
      </div>

      <div className="@container">
        <dl className="grid grid-cols-1 divide-y divide-line @sm:grid-cols-3 @sm:divide-x @sm:divide-y-0">
          {stats.map((s) => (
            <div
              key={s.label}
              className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 @sm:px-8 @sm:py-1 @sm:first:pl-0 @sm:last:pr-0"
            >
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
    <li className="flex flex-col gap-3 py-4 first:pt-1 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="truncate font-medium text-ink">{e.content.title}</span>
          <EntitlementStatusBadge status={e.status} />
        </div>
        <p className="text-xs text-ink-3">
          Concedido el {formatDate(e.grantedAt)}
          {" · "}
          {e.expiresAt ? `Expira ${relativeTime(e.expiresAt)}` : "Sin expiración"}
        </p>
      </div>
    </li>
  );
}

function EmptyEntitlements() {
  return (
    <div className="grid place-items-center rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center">
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-sm font-medium text-ink">Sin accesos</p>
        <p className="text-sm text-ink-3 text-pretty">
          Este Trabajador aún no tiene acceso a ningún curso.
        </p>
      </div>
    </div>
  );
}
