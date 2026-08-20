"use client";

import { Suspense, useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { ForbiddenView } from "@/components/full-page-states";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { useDataTable } from "@/components/data-table/use-data-table";
import { useCurrentUser } from "@/lib/auth/session-context";
import { isManager } from "@/lib/roles";
import { ApiError } from "@/lib/api/http";
import type { ListParams, Student } from "@/lib/api/types";
import { fullName } from "@/lib/format";

import { studentColumns } from "./_components/student-columns";
import { AddStudentDialog } from "./_components/add-student-dialog";
import { deleteStudentAction } from "./actions";

// Trabajadores table (client): rows come in as props.
function StudentsTableInner({
  rows,
  total,
  params,
}: {
  rows: Student[];
  total: number;
  params: ListParams;
}) {
  const user = useCurrentUser();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

  const table = useDataTable({
    pageSize: params.pageSize,
    initialSort: params.sort,
  });

  // Navigation in flight: URL is ahead of the rows the server rendered.
  const isStale = JSON.stringify(table.params) !== JSON.stringify(params);

  const goToStudent = useCallback((id: string) => router.push(`/students/${id}`), [router]);

  // Delete confirmation target.
  const [toDelete, setToDelete] = useState<Student | null>(null);
  const [isPending, startTransition] = useTransition();

  const confirmDelete = useCallback(() => {
    if (!toDelete) return;
    const student = toDelete;
    startTransition(async () => {
      try {
        await deleteStudentAction(student.id);
        toast.success("Trabajador eliminado");
        setToDelete(null);
      } catch (e) {
        const status = e instanceof ApiError ? e.status : undefined;
        toast.error("No se pudo eliminar al Trabajador", {
          description:
            status === 404
              ? "Ya no existe; recargue la lista."
              : status === 409
                ? "La plataforma no permite eliminar a este Trabajador."
                : "Inténtelo de nuevo en un momento.",
        });
      }
    });
  }, [toDelete]);

  const columns = useMemo(() => studentColumns(goToStudent, setToDelete), [goToStudent]);

  // Defense-in-depth: the Server Component already 404s non-managers.
  if (!isManager(user.role)) return <ForbiddenView />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Trabajadores"
        subtitle="Personas de la Empresa Cliente invitadas a rendir los Cursos"
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <Plus />
            Agregar Trabajador
          </Button>
        }
      />
      <AddStudentDialog open={addOpen} onOpenChange={setAddOpen} />

      <DataTable<Student>
        columns={columns}
        rows={rows}
        total={total}
        state={table}
        isLoading={false}
        isFetching={isStale || isPending}
        isError={false}
        refetch={() => router.refresh()}
        getRowId={(s) => s.id}
        searchPlaceholder="Buscar Trabajadores…"
        onRowClick={(s) => goToStudent(s.id)}
        emptyTitle="Aún no hay Trabajadores"
        emptyDescription="Agregue un Trabajador o espere a que la Ola ingrese sus invitaciones."
      />

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        title="¿Eliminar Trabajador?"
        description={
          toDelete ? (
            <>
              Esto elimina de forma permanente a{" "}
              <span className="font-medium text-ink">{fullName(toDelete)}</span>, junto con sus
              accesos y su avance. No se puede deshacer.
            </>
          ) : null
        }
        confirmLabel="Eliminar Trabajador"
        destructive
        pending={isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export function StudentsTable(props: { rows: Student[]; total: number; params: ListParams }) {
  // `useDataTable` reads `useSearchParams()`, which requires a Suspense
  // boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <StudentsTableInner {...props} />
    </Suspense>
  );
}
