import { useEffect, useState } from "react";
import { useConnectionStore } from "@/stores/connection-store";
import { useResultStore } from "@/stores/result-store";
import { useTheme } from "@/lib/use-theme";
import { formatDuration } from "@/lib/utils";

export function StatusBar() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  const activeId = useConnectionStore((s) => s.activeId);
  const connections = useConnectionStore((s) => s.connections);
  const durationMs = useResultStore((s) => s.durationMs);
  const documentCount = useResultStore((s) => s.documentCount);
  const { theme, toggle } = useTheme();

  const active = connections.find((c) => c.id === activeId);

  return (
    <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted-foreground)]">
      <span data-testid="connection-badge">
        {hydrated && active ? `${active.projectId}/${active.dataset}` : "No connection"}
      </span>
      <span className="flex items-center gap-3">
        {documentCount !== null && durationMs !== null
          ? `${documentCount} results in ${formatDuration(durationMs)}`
          : ""}
        <button
          onClick={toggle}
          className="rounded px-1.5 py-0.5 hover:bg-[var(--muted)]"
          aria-label="Toggle theme"
          data-testid="theme-toggle"
        >
          {theme === "light" ? "🌙" : "☀️"}
        </button>
      </span>
    </div>
  );
}
