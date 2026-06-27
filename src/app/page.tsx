"use client";

import { useState, useCallback, useRef } from "react";
import { Sidebar, type SidebarTabId } from "@/components/layout/Sidebar";
import { Toolbar } from "@/components/layout/Toolbar";
import { StatusBar } from "@/components/layout/StatusBar";
import { ConnectionList } from "@/components/connection/ConnectionList";
import { ConnectionDialog } from "@/components/connection/ConnectionDialog";
import { SchemaPanel } from "@/components/schema/SchemaPanel";
import { HistoryPanel } from "@/components/history/HistoryPanel";
import { ResultPanel } from "@/components/results/ResultPanel";
import { QueryEditor, type QueryEditorHandle } from "@/components/editor/QueryEditor";
import { QueryTabs, type QueryTab, type QueryTabResult } from "@/components/editor/QueryTabs";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizable } from "@/lib/use-resizable";
import { useSidebarWidth } from "@/lib/use-sidebar-width";
import { useKeyboard } from "@/lib/use-keyboard";
import { useConnections } from "@/hooks/useConnections";
import { executeQuery } from "@/lib/sanity-api";
import { getActiveConnection } from "@/stores/connection-store";
import { useHistoryStore } from "@/stores/history-store";
import type { ConnectionConfig } from "@/lib/sanity-types";
import { useEffect } from "react";
import { setupFlightGlobal, FlightRecorder } from "@/lib/flight-recorder";
import { FlightRecorderPanel } from "@/components/debug/FlightRecorderPanel";

const EMPTY_RESULT: QueryTabResult = {
  data: null,
  durationMs: null,
  documentCount: null,
  error: null,
  isLoading: false,
};

function createQueryTab(index: number): QueryTab {
  return {
    id: index === 1 ? "query-tab-1" : `query-tab-${crypto.randomUUID()}`,
    title: `Query ${index}`,
    query: "",
    result: { ...EMPTY_RESULT },
  };
}

export default function Home() {
  const [showConnDialog, setShowConnDialog] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ConnectionConfig | undefined>(undefined);
  const [sidebarTab, setSidebarTab] = useState<SidebarTabId>("query");
  const [tabs, setTabs] = useState<QueryTab[]>(() => [createQueryTab(1)]);
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);
  const addHistoryEntry = useHistoryStore((s) => s.addEntry);
  useConnections();

  useEffect(() => { setupFlightGlobal(); }, []);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const query = activeTab.query;
  const isLoading = activeTab.result.isLoading;

  useEffect(() => {
    FlightRecorder.instance.setActiveQuery(query);
  }, [query]);

  const updateTab = useCallback((tabId: string, update: (tab: QueryTab) => QueryTab) => {
    setTabs((currentTabs) =>
      currentTabs.map((tab) => (tab.id === tabId ? update(tab) : tab)),
    );
  }, []);

  const setActiveQuery = useCallback((nextQuery: string | ((current: string) => string)) => {
    updateTab(activeTabId, (tab) => ({
      ...tab,
      query: typeof nextQuery === "function" ? nextQuery(tab.query) : nextQuery,
    }));
  }, [activeTabId, updateTab]);

  const setTabResult = useCallback((tabId: string, result: QueryTabResult) => {
    updateTab(tabId, (tab) => ({ ...tab, result }));
  }, [updateTab]);

  const handleRun = useCallback(async () => {
    const queryToRun = query.trim();
    if (!queryToRun) return;

    const connection = getActiveConnection();
    const runningTabId = activeTabId;

    if (!connection) {
      setTabResult(runningTabId, {
        ...EMPTY_RESULT,
        error: "No active connection. Add and select a connection first.",
      });
      return;
    }

    setTabResult(runningTabId, { ...EMPTY_RESULT, isLoading: true });

    try {
      const result = await executeQuery(connection, queryToRun);
      setTabResult(runningTabId, {
        data: result.data,
        durationMs: result.durationMs,
        documentCount: result.documentCount,
        error: null,
        isLoading: false,
      });
      addHistoryEntry({
        query: queryToRun,
        connectionId: connection.id,
        connectionName: connection.name,
        durationMs: result.durationMs,
        documentCount: result.documentCount,
        success: true,
        resultPreview: JSON.stringify(result.data),
      });
    } catch (e: unknown) {
      const err = e as { kind?: string; message?: string };
      const message = err.message ?? "An unknown error occurred";
      setTabResult(runningTabId, {
        ...EMPTY_RESULT,
        error: message,
      });
      addHistoryEntry({
        query: queryToRun,
        connectionId: connection.id,
        connectionName: connection.name,
        durationMs: 0,
        documentCount: 0,
        success: false,
        error: message,
      });
    }
  }, [activeTabId, addHistoryEntry, query, setTabResult]);

  const handleInsert = useCallback((text: string) => {
    setActiveQuery((prev) => prev + text);
  }, [setActiveQuery]);

  const handleReuseQuery = useCallback((q: string) => {
    setActiveQuery(q);
  }, [setActiveQuery]);

  const handleClear = useCallback(() => {
    updateTab(activeTabId, (tab) => ({
      ...tab,
      query: "",
      result: { ...EMPTY_RESULT },
    }));
  }, [activeTabId, updateTab]);

  const handleAddTab = useCallback(() => {
    const nextTab = createQueryTab(tabs.length + 1);
    setTabs((currentTabs) => [...currentTabs, nextTab]);
    setActiveTabId(nextTab.id);
  }, [tabs.length]);

  const handleCloseTab = useCallback((id: string) => {
    if (tabs.length === 1) return;
    const closingIndex = tabs.findIndex((tab) => tab.id === id);
    const nextTabs = tabs.filter((tab) => tab.id !== id);
    setTabs(nextTabs);
    if (id === activeTabId) {
      const nextActive = nextTabs[Math.max(0, closingIndex - 1)] ?? nextTabs[0];
      setActiveTabId(nextActive.id);
    }
  }, [activeTabId, tabs]);

  const [showFlightPanel, setShowFlightPanel] = useState(false);
  const editorRef = useRef<QueryEditorHandle>(null);

  useKeyboard({ onRun: handleRun, onClear: handleClear });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setShowFlightPanel((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const { ratio, containerRef, onResizeStart } = useResizable({
    storageKey: "groqlab:editor-split",
    defaultRatio: 0.5,
    minLeftPx: 200,
    minRightPx: 200,
  });

  const { width: sidebarWidth, onResizeStart: onSidebarResize } = useSidebarWidth();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--background)]">
      <div className="flex flex-1 overflow-hidden">
        <aside className="flex-shrink-0 overflow-hidden" data-testid="sidebar" style={{ width: sidebarWidth }}>
          <Sidebar activeTab={sidebarTab} onTabChange={setSidebarTab}>
            {sidebarTab === "query" && <SchemaPanel onInsert={handleInsert} />}
            {sidebarTab === "connections" && (
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
            )}
            {sidebarTab === "history" && <HistoryPanel onReuse={handleReuseQuery} />}
          </Sidebar>
        </aside>
        <ResizeHandle onMouseDown={onSidebarResize} />

        <main className="flex flex-1 flex-col overflow-hidden">
          <Toolbar
            onRun={handleRun}
            onClear={handleClear}
            isRunning={isLoading}
            hasQuery={query.trim().length > 0}
          />

          <div ref={containerRef} className="flex flex-1 overflow-hidden">
            <div className="flex flex-none flex-col overflow-hidden" style={{ width: `${ratio * 100}%` }}>
              <QueryTabs
                tabs={tabs}
                activeTabId={activeTabId}
                onSelect={setActiveTabId}
                onAdd={handleAddTab}
                onClose={handleCloseTab}
              />
              <div className="flex-1 overflow-hidden">
                <QueryEditor ref={editorRef} key={activeTabId} value={query} onChange={setActiveQuery} />
              </div>
            </div>
            <ResizeHandle onMouseDown={onResizeStart} />
            <div className="flex-1 overflow-auto">
              <ResultPanel result={activeTab.result} />
            </div>
          </div>
        </main>
      </div>

      <StatusBar result={activeTab.result} />

      <ConnectionDialog
        open={showConnDialog}
        onClose={() => {
          setShowConnDialog(false);
          setEditingConnection(undefined);
        }}
        connection={editingConnection}
      />

      {showFlightPanel && <FlightRecorderPanel editorRef={editorRef} />}
    </div>
  );
}
