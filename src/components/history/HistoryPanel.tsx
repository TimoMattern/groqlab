import { Trash2, Trash2Icon, CheckCircle2, XCircle } from "lucide-react";
import { useHistoryStore } from "@/stores/history-store";
import { formatDuration } from "@/lib/utils";

interface HistoryPanelProps {
  onReuse: (query: string) => void;
}

export function HistoryPanel({ onReuse }: HistoryPanelProps) {
  const entries = useHistoryStore((s) => s.entries);
  const removeEntry = useHistoryStore((s) => s.removeEntry);
  const clearHistory = useHistoryStore((s) => s.clearHistory);

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ minHeight: 0 }} data-testid="history-panel">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">Query History</span>
        {entries.length > 0 && (
          <button
            onClick={clearHistory}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            aria-label="Clear history"
            data-testid="clear-history"
          >
            <Trash2Icon className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>
      {entries.length === 0 && (
        <p className="py-4 text-center text-xs text-[var(--muted-foreground)]">
          No query history yet.
        </p>
      )}
      <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="group mb-1 cursor-pointer rounded-md px-2 py-1.5 hover:bg-[var(--muted)]"
            onClick={() => onReuse(entry.query)}
            data-testid={`history-entry-${entry.id}`}
          >
            <div className="mb-0.5 flex items-center gap-1.5">
              {entry.success ? (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
              ) : (
                <XCircle className="h-3 w-3 shrink-0 text-red-500" />
              )}
              <code className="flex-1 truncate text-xs font-medium text-[var(--foreground)]">
                {entry.query}
              </code>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeEntry(entry.id);
                }}
                className="shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--accent)]"
                aria-label={`Delete history entry`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
              <span>{new Date(entry.executedAt).toLocaleString()}</span>
              <span>{formatDuration(entry.durationMs)}</span>
              {entry.documentCount > 0 && (
                <span>{entry.documentCount} docs</span>
              )}
              <span className="truncate">{entry.connectionName}</span>
            </div>
            {entry.error && (
              <p className="mt-0.5 truncate text-[10px] text-red-500">
                {entry.error}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
