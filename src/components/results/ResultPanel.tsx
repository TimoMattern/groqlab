import { useState } from "react";
import { useResultStore } from "@/stores/result-store";
import { Loader2, AlertCircle, Code2, ListTree, Table2 } from "lucide-react";
import { formatDuration, cn } from "@/lib/utils";
import { JsonTreeViewer } from "./JsonTreeViewer";
import { TableView } from "./TableView";

type ViewMode = "raw" | "tree" | "table";

const VIEW_ICONS: Record<ViewMode, typeof Code2> = {
  raw: Code2,
  tree: ListTree,
  table: Table2,
};

const VIEW_LABELS: Record<ViewMode, string> = {
  raw: "Raw",
  tree: "Tree",
  table: "Table",
};

export function ResultPanel() {
  const [view, setView] = useState<ViewMode>("tree");
  const isLoading = useResultStore((s) => s.isLoading);
  const data = useResultStore((s) => s.data);
  const error = useResultStore((s) => s.error);
  const durationMs = useResultStore((s) => s.durationMs);
  const documentCount = useResultStore((s) => s.documentCount);

  if (isLoading) {
    return (
      <div
        className="flex h-full items-center justify-center"
        role="status"
        aria-live="polite"
        data-testid="result-panel"
      >
        <Loader2 className="h-6 w-6 animate-spin text-[var(--muted-foreground)]" />
        <span className="ml-2 text-sm text-[var(--muted-foreground)]">Running query...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-2 p-6"
        data-testid="result-panel"
      >
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="text-sm font-medium text-red-600" data-testid="result-error">
          {error}
        </p>
      </div>
    );
  }

  if (data === null) {
    return (
      <div
        className="flex h-full items-center justify-center"
        data-testid="result-panel"
      >
        <p className="text-sm text-[var(--muted-foreground)]">
          Run a query to see results
        </p>
      </div>
    );
  }

  const canTableView = Array.isArray(data) && data.length > 0;

  return (
    <div className="flex h-full flex-col" data-testid="result-panel">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5">
        <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
          <span data-testid="result-count">{documentCount} documents</span>
          <span>{durationMs !== null ? formatDuration(durationMs) : ""}</span>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border)] p-0.5">
          {(Object.keys(VIEW_ICONS) as ViewMode[]).map((mode) => {
            const Icon = VIEW_ICONS[mode];
            const disabled = mode === "table" && !canTableView;
            return (
              <button
                key={mode}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                  view === mode && !disabled
                    ? "bg-[var(--primary)] text-white"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]",
                  disabled && "cursor-not-allowed opacity-40",
                )}
                onClick={() => !disabled && setView(mode)}
                disabled={disabled}
                title={
                  disabled ? "Table view only available for arrays of objects" : VIEW_LABELS[mode]
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {VIEW_LABELS[mode]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {view === "tree" && <JsonTreeViewer data={data} />}
        {view === "raw" && (
          <pre className="overflow-auto whitespace-pre-wrap p-3 font-mono text-sm leading-relaxed">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
        {view === "table" && <TableView data={data} />}
      </div>
    </div>
  );
}
