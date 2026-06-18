import { Database, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface SidebarProps {
  activePanel: "schema" | "history";
  onPanelChange: (panel: "schema" | "history") => void;
  children: ReactNode;
}

export function Sidebar({ activePanel, onPanelChange, children }: SidebarProps) {
  return (
    <div className="flex h-full flex-col border-r border-[var(--border)]">
      <div className="flex border-b border-[var(--border)]">
        <button
          onClick={() => onPanelChange("schema")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 px-3 py-2 text-sm font-medium",
            activePanel === "schema"
              ? "border-b-2 border-[var(--primary)] text-[var(--primary)]"
              : "text-[var(--muted-foreground)] hover:text-[var(--primary)]",
          )}
          data-testid="panel-schema"
        >
          <Database className="h-4 w-4" />
          Schema
        </button>
        <button
          onClick={() => onPanelChange("history")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 px-3 py-2 text-sm font-medium",
            activePanel === "history"
              ? "border-b-2 border-[var(--primary)] text-[var(--primary)]"
              : "text-[var(--muted-foreground)] hover:text-[var(--primary)]",
          )}
          data-testid="panel-history"
        >
          <Clock className="h-4 w-4" />
          History
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {children}
      </div>
    </div>
  );
}
