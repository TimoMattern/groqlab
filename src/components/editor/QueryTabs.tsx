import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface QueryTabResult {
  data: unknown;
  durationMs: number | null;
  documentCount: number | null;
  error: string | null;
  isLoading: boolean;
}

export interface QueryTab {
  id: string;
  title: string;
  query: string;
  result: QueryTabResult;
}

interface QueryTabsProps {
  tabs: QueryTab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
}

export function QueryTabs({
  tabs,
  activeTabId,
  onSelect,
  onAdd,
  onClose,
}: QueryTabsProps) {
  return (
    <div className="flex h-10 items-end border-b border-[var(--border)] bg-[var(--card)] px-2">
      <div className="flex min-w-0 flex-1 items-end overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={cn(
                "flex h-9 max-w-48 min-w-28 items-center gap-1 border border-b-0 px-2 text-sm",
                isActive
                  ? "bg-[var(--background)] text-[var(--foreground)]"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
              )}
              data-testid={`query-tab-${tab.id}`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => onSelect(tab.id)}
                aria-current={isActive ? "page" : undefined}
              >
                {tab.title}
              </button>
              {tabs.length > 1 && (
                <button
                  type="button"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-[var(--accent)]"
                  onClick={() => onClose(tab.id)}
                  aria-label={`Close ${tab.title}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="mb-1 ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-[var(--muted)]"
        onClick={onAdd}
        aria-label="Add query tab"
        data-testid="add-query-tab"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
