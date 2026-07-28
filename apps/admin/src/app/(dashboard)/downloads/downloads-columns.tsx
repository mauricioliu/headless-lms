"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { CourseStatusBadge } from "@/components/status-badge";
import { ColumnHeader } from "@/components/data-table/column-header";
import { RowActions } from "@/components/data-table/row-actions";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { can } from "@/lib/roles";
import { relativeTime, formatNumber, formatBytes } from "@/lib/format";
import type { Download, SessionUser } from "@/lib/api/types";

/**
 * Column set for the downloads list. Callbacks drive the row-title link and
 * the row-action menu; role gating (`can.*`) hides actions the caller can't
 * perform. `user` is the server-resolved session user threaded down from the
 * island. Reuses `CourseStatusBadge` — both content types share the same
 * draft/published status shape.
 */
export function downloadsColumns(opts: {
  user: SessionUser;
  onView: (download: Download) => void;
  onEdit: (download: Download) => void;
  onTogglePublish: (download: Download) => void;
  onDelete: (download: Download) => void;
}): ColumnDef<Download, unknown>[] {
  const { user, onView, onEdit, onTogglePublish, onDelete } = opts;
  const canEdit = can.editDownload(user);
  const canPublish = can.publishDownload(user);
  const canDelete = can.deleteDownload(user);

  return [
    {
      accessorKey: "title",
      header: ({ column }) => <ColumnHeader column={column} title="Title" />,
      enableHiding: false,
      cell: ({ row }) => {
        const download = row.original;
        return (
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onView(download);
              }}
              className="text-left font-medium text-ink underline-offset-4 outline-none hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm"
            >
              {download.title}
            </button>
            <span className="text-xs text-ink-4">{download.slug}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "category",
      header: ({ column }) => <ColumnHeader column={column} title="Category" />,
      cell: ({ row }) => <span className="text-ink-2">{row.original.category}</span>,
    },
    {
      accessorKey: "status",
      header: ({ column }) => <ColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <CourseStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "assetCount",
      header: ({ column }) => <ColumnHeader column={column} title="Files" align="right" />,
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="tabular-nums text-ink-2">{formatNumber(row.original.assetCount)}</span>
      ),
    },
    {
      accessorKey: "totalSize",
      header: ({ column }) => <ColumnHeader column={column} title="Size" align="right" />,
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="tabular-nums text-ink-2">{formatBytes(row.original.totalSize)}</span>
      ),
    },
    {
      accessorKey: "entitledCount",
      header: ({ column }) => <ColumnHeader column={column} title="Entitled" align="right" />,
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="tabular-nums text-ink">{formatNumber(row.original.entitledCount)}</span>
      ),
    },
    {
      accessorKey: "updatedAt",
      header: ({ column }) => <ColumnHeader column={column} title="Updated" align="right" />,
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="text-ink-3">{relativeTime(row.original.updatedAt)}</span>
      ),
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const download = row.original;
        return (
          <div className="flex justify-end">
            <RowActions>
              {canEdit && (
                <DropdownMenuItem onClick={() => onEdit(download)}>Edit</DropdownMenuItem>
              )}
              {canPublish && (
                <DropdownMenuItem onClick={() => onTogglePublish(download)}>
                  {download.status === "published" ? "Unpublish" : "Publish"}
                </DropdownMenuItem>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="danger" onClick={() => onDelete(download)}>
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </RowActions>
          </div>
        );
      },
    },
  ];
}
