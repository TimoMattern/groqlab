import { useConnectionStore } from "@/stores/connection-store";

export function ConnectionBadge() {
  const activeId = useConnectionStore((s) => s.activeId);
  const connections = useConnectionStore((s) => s.connections);
  const active = connections.find((c) => c.id === activeId);

  if (!active) {
    return (
      <span className="text-xs text-[var(--muted-foreground)]" data-testid="connection-badge">
        No connection
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs" data-testid="connection-badge">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      {active.name || `${active.projectId}/${active.dataset}`}
    </span>
  );
}
