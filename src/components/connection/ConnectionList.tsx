import { type MouseEvent, useEffect, useState } from "react";
import { Trash2, Plus, RefreshCw, Pencil } from "lucide-react";
import { useConnectionStore } from "@/stores/connection-store";
import { testConnection } from "@/lib/sanity-api";
import type { ConnectionConfig } from "@/lib/sanity-types";
import { cn } from "@/lib/utils";

interface ConnectionListProps {
  onAdd: () => void;
  onEdit: (connection: ConnectionConfig) => void;
}

const STATUS_COLORS: Record<string, string> = {
  online: "bg-green-500",
  error: "bg-red-500",
  checking: "bg-yellow-400",
  unknown: "bg-[var(--muted-foreground)]",
};

export function ConnectionList({ onAdd, onEdit }: ConnectionListProps) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  const connections = useConnectionStore((s) => s.connections);
  const activeId = useConnectionStore((s) => s.activeId);
  const statuses = useConnectionStore((s) => s.statuses);
  const setActive = useConnectionStore((s) => s.setActive);
  const removeConnection = useConnectionStore((s) => s.removeConnection);
  const setConnectionStatus = useConnectionStore((s) => s.setConnectionStatus);

  const handleCheck = async (e: MouseEvent, conn: { id: string; projectId: string; dataset: string }) => {
    e.stopPropagation();
    setConnectionStatus(conn.id, { status: "checking" });
    const result = await testConnection(conn.projectId, conn.dataset);
    setConnectionStatus(conn.id, {
      status: result.success ? "online" : "error",
      error: result.error,
      lastChecked: new Date().toISOString(),
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">Connections</span>
        <button
          onClick={onAdd}
          className="rounded p-1 hover:bg-[var(--muted)]"
          aria-label="Add connection"
          data-testid="add-connection"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {(!hydrated || connections.length === 0) && (
        <p className="py-4 text-center text-xs text-[var(--muted-foreground)]">
          No connections yet.
        </p>
      )}
      {hydrated && connections.map((conn) => {
        const cs = statuses[conn.id] ?? { status: "unknown" };
        return (
          <div
            key={conn.id}
            className={cn(
              "group flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
              activeId === conn.id
                ? "bg-[var(--muted)] font-medium"
                : "hover:bg-[var(--muted)]",
            )}
            onClick={() => setActive(conn.id)}
            data-testid={`connection-${conn.id}`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_COLORS[cs.status])}
                title={
                  cs.status === "error" ? cs.error :
                  cs.status === "online" ? `Last checked: ${cs.lastChecked ? new Date(cs.lastChecked).toLocaleString() : "never"}` :
                  cs.status === "unknown" ? "Not checked yet" :
                  "Checking..."
                }
              />
              <span className="min-w-0 flex-1 truncate" title={conn.name || conn.projectId}>
                {conn.name || conn.projectId}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={(e) => handleCheck(e, conn)}
                className={cn(
                  "rounded p-1 hover:bg-[var(--accent)]",
                  cs.status === "checking" && "animate-spin",
                )}
                aria-label={`Check connection ${conn.name}`}
                disabled={cs.status === "checking"}
              >
                <RefreshCw className="h-3 w-3 text-[var(--muted-foreground)]" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(conn);
                }}
                className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
                aria-label={`Edit connection ${conn.name}`}
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeConnection(conn.id);
                }}
                className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--destructive)]"
                aria-label={`Delete connection ${conn.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
