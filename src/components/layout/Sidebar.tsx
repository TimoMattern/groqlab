import { Database, Plug, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type SidebarTabId = "query" | "connections" | "history";

interface SidebarProps {
  activeTab: SidebarTabId;
  onTabChange: (tab: SidebarTabId) => void;
  children: ReactNode;
}

const TABS: { id: SidebarTabId; label: string; icon: ReactNode }[] = [
  { id: "query", label: "Query", icon: <Database className="h-4 w-4" /> },
  { id: "connections", label: "Connections", icon: <Plug className="h-4 w-4" /> },
  { id: "history", label: "History", icon: <Clock className="h-4 w-4" /> },
];

export function Sidebar({ activeTab, onTabChange, children }: SidebarProps) {
  return (
    <div className="flex h-full border-r border-[var(--border)]">
      <nav className="flex w-10 flex-col items-center gap-1 border-r border-[var(--border)] py-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors",
              activeTab === tab.id
                ? "bg-[var(--muted)] text-[var(--primary)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
            )}
            title={tab.label}
            data-testid={`sidebar-tab-${tab.id}`}
          >
            {tab.icon}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-hidden p-3">
        {children}
      </div>
    </div>
  );
}
