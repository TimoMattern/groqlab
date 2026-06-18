"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Toolbar } from "@/components/layout/Toolbar";
import { StatusBar } from "@/components/layout/StatusBar";
import { ConnectionList } from "@/components/connection/ConnectionList";
import { ConnectionDialog } from "@/components/connection/ConnectionDialog";
import { SchemaPanel } from "@/components/schema/SchemaPanel";
import { HistoryPanel } from "@/components/history/HistoryPanel";
import { ResultPanel } from "@/components/results/ResultPanel";
import { QueryEditor } from "@/components/editor/QueryEditor";
import { useQuery } from "@/hooks/useQuery";
import { useResultStore } from "@/stores/result-store";
import { useKeyboard } from "@/lib/use-keyboard";
import { useConnections } from "@/hooks/useConnections";
import type { ConnectionConfig } from "@/lib/sanity-types";

export default function Home() {
  const [showConnDialog, setShowConnDialog] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ConnectionConfig | undefined>(undefined);
  const [sidebarPanel, setSidebarPanel] = useState<"schema" | "history">("schema");
  const [query, setQuery] = useState("");
  const { runQuery } = useQuery();
  const isLoading = useResultStore((s) => s.isLoading);
  useConnections();

  const handleRun = useCallback(() => {
    if (query.trim()) runQuery(query);
  }, [query, runQuery]);

  const handleInsert = useCallback((text: string) => {
    setQuery((prev) => prev + text);
  }, []);

  const handleReuseQuery = useCallback((q: string) => {
    setQuery(q);
  }, []);

  const handleClear = useCallback(() => {
    setQuery("");
    useResultStore.getState().clear();
  }, []);

  useKeyboard({ onRun: handleRun, onClear: handleClear });

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--background)]">
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-60 flex-shrink-0" data-testid="sidebar">
          <Sidebar activePanel={sidebarPanel} onPanelChange={setSidebarPanel}>
            {sidebarPanel === "schema" ? (
              <div className="flex h-full flex-col">
                <SchemaPanel onInsert={handleInsert} />
                <div className="mt-auto border-t border-[var(--border)] pt-3">
                  <ConnectionList
                    onAdd={() => {
                      setEditingConnection(undefined);
                      setShowConnDialog(true);
                    }}
                    onEdit={(conn) => {
                      setEditingConnection(conn);
                      setShowConnDialog(true);
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <HistoryPanel onReuse={handleReuseQuery} />
                <div className="mt-auto border-t border-[var(--border)] pt-3">
                  <ConnectionList
                    onAdd={() => {
                      setEditingConnection(undefined);
                      setShowConnDialog(true);
                    }}
                    onEdit={(conn) => {
                      setEditingConnection(conn);
                      setShowConnDialog(true);
                    }}
                  />
                </div>
              </div>
            )}
          </Sidebar>
        </aside>

        <main className="flex flex-1 flex-col overflow-hidden">
          <Toolbar
            onRun={handleRun}
            onClear={handleClear}
            isRunning={isLoading}
            hasQuery={query.trim().length > 0}
          />

          <div className="flex flex-1 overflow-hidden">
            <div className="flex w-1/2 flex-col border-r border-[var(--border)]">
              <div className="flex-1 overflow-hidden">
                <QueryEditor value={query} onChange={setQuery} />
              </div>
            </div>
            <div className="w-1/2 overflow-auto">
              <ResultPanel />
            </div>
          </div>
        </main>
      </div>

      <StatusBar />

      <ConnectionDialog
        open={showConnDialog}
        onClose={() => {
          setShowConnDialog(false);
          setEditingConnection(undefined);
        }}
        connection={editingConnection}
      />
    </div>
  );
}
