"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { NameAvatar } from "@/components/ui/avatar";
import { fullName, relativeTime } from "@/lib/format";
import type { Student } from "@/lib/api/types";

import { ProgressCell } from "./progress-meter";

/**
 * Column set for the Trabajadores list. `onView`/`onDelete` drive the
 * row-action menu; row clicks are wired separately on the table (onRowClick).
 */
export function studentColumns(
  onView: (id: string) => void,
  onDelete: (student: Student) => void,
): ColumnDef<Student, unknown>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => <ColumnHeader column={column} title="Trabajador" />,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex items-center gap-3">
            <NameAvatar name={fullName(s)} image={s.image} />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-ink">{fullName(s)}</span>
              <span className="truncate text-xs text-ink-3">{s.email}</span>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "entitlementCount",
      header: ({ column }) => <ColumnHeader column={column} title="Accesos" align="right" />,
      cell: ({ row }) => <span className="text-ink-2">{row.original.entitlementCount}</span>,
      meta: { align: "right" },
    },
    {
      accessorKey: "avgProgress",
      header: ({ column }) => (
        <ColumnHeader column={column} title="Avance promedio" align="right" />
      ),
      cell: ({ row }) => <ProgressCell value={row.original.avgProgress} />,
      meta: { align: "right" },
    },
    {
      accessorKey: "joinedAt",
      header: ({ column }) => <ColumnHeader column={column} title="Agregado" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-ink-3">{relativeTime(row.original.joinedAt)}</span>
      ),
    },
    {
      accessorKey: "lastActiveAt",
      header: ({ column }) => <ColumnHeader column={column} title="Última actividad" />,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-ink-3">
          {relativeTime(row.original.lastActiveAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <RowActions>
            <DropdownMenuItem onClick={() => onView(row.original.id)}>
              Ver Trabajador
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="danger" onClick={() => onDelete(row.original)}>
              Eliminar
            </DropdownMenuItem>
          </RowActions>
        </div>
      ),
      meta: { align: "right" },
    },
  ];
}
