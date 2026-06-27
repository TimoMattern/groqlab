"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { FlightRecorder } from "@/lib/flight-recorder";
import type { FlightRecord, FlightEvent } from "@/lib/flight-recorder";
import { createReplaySession, getEditorTextAtEvent, getCursorPositionAtEvent } from "@/lib/flight-replay";
import type { ReplaySpeed, ReplaySession } from "@/lib/flight-replay";
import type { QueryEditorHandle } from "@/components/editor/QueryEditor";
import { useConnectionStore } from "@/stores/connection-store";
import { useSchemaStore } from "@/stores/schema-store";
import { useResultStore } from "@/stores/result-store";
import { useHistoryStore } from "@/stores/history-store";

type TabId = "events" | "replay" | "export";

export function FlightRecorderPanel({
  editorRef,
}: {
  editorRef?: React.RefObject<QueryEditorHandle | null>;
}) {
  const fr = FlightRecorder.instance;
  const [, forceUpdate] = useState(0);
  const [tab, setTab] = useState<TabId>("events");
  const [intervalInput, setIntervalInput] = useState("5000");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [replayRecord, setReplayRecord] = useState<FlightRecord | null>(null);
  const [replayIndex, setReplayIndex] = useState<number>(-1);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<ReplaySpeed>(1);
  const [apiFlash, setApiFlash] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<ReplaySession | null>(null);
  const storesBackupRef = useRef<Record<string, unknown> | null>(null);

  const tick = useCallback(() => forceUpdate((n) => n + 1), []);

  const saveStoresBackup = useCallback(() => {
    storesBackupRef.current = {
      connectionStore: {
        connections: useConnectionStore.getState().connections,
        activeId: useConnectionStore.getState().activeId,
        statuses: useConnectionStore.getState().statuses,
      },
      schemaStore: {
        types: useSchemaStore.getState().types,
        isLoading: useSchemaStore.getState().isLoading,
        error: useSchemaStore.getState().error,
      },
      resultStore: {
        data: useResultStore.getState().data,
        durationMs: useResultStore.getState().durationMs,
        documentCount: useResultStore.getState().documentCount,
        error: useResultStore.getState().error,
        isLoading: useResultStore.getState().isLoading,
      },
      historyStore: {
        entries: useHistoryStore.getState().entries,
      },
    };
  }, []);

  const restoreStoresFromSnapshot = useCallback((stores: Record<string, unknown>) => {
    // Schema store — prefer fullTypes for perfect restoration
    const schema = stores.schemaStore as Record<string, unknown>;
    if (schema) {
      const types = (schema.fullTypes as Record<string, unknown>) ?? (schema.types as Record<string, unknown>);
      useSchemaStore.setState({
        types: types ?? {},
        isLoading: (schema.isLoading as Record<string, boolean>) ?? {},
        error: (schema.error as Record<string, string | null>) ?? {},
      } as unknown as Parameters<typeof useSchemaStore.setState>[0]);
    }

    // Connection store
    const conn = stores.connectionStore as Record<string, unknown>;
    if (conn) {
      useConnectionStore.setState({
        connections: (conn.connections ?? []) as [],
        activeId: (conn.activeId ?? null) as string | null,
        statuses: (conn.statuses ?? {}) as Record<string, unknown>,
      } as unknown as Parameters<typeof useConnectionStore.setState>[0]);
    }

    // Result store
    const result = stores.resultStore as Record<string, unknown>;
    if (result) {
      useResultStore.setState({
        isLoading: (result.isLoading as boolean) ?? false,
        error: (result.error as string | null) ?? null,
        durationMs: (result.durationMs as number | null) ?? null,
        documentCount: (result.documentCount as number | null) ?? null,
        data: null,
      } as unknown as Parameters<typeof useResultStore.setState>[0]);
    }

    // History store
    const history = stores.historyStore as Record<string, unknown>;
    if (history) {
      useHistoryStore.setState({
        entries: (history.entries ?? []) as [],
      } as unknown as Parameters<typeof useHistoryStore.setState>[0]);
    }
  }, []);

  const restoreStoresBackup = useCallback(() => {
    const backup = storesBackupRef.current;
    if (!backup) return;
    restoreStoresFromSnapshot(backup);
    storesBackupRef.current = null;
  }, [restoreStoresFromSnapshot]);

  useEffect(() => {
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [tick]);

  const rec = fr.export();
  const isRecording = fr.isEnabled();
  const events = rec.events;

  const handleStart = () => {
    const ms = parseInt(intervalInput, 10);
    fr.start(isNaN(ms) ? undefined : ms);
    tick();
  };

  const handleStop = () => {
    fr.stop();
    tick();
  };

  const handleClear = () => {
    fr.clear();
    setSelectedIndex(null);
    tick();
  };

  const handleExport = () => {
    const json = JSON.stringify(rec, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flight-record-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as FlightRecord;
        // Restore store state before destroying session
        restoreStoresBackup();
        sessionRef.current?.destroy();
        sessionRef.current = null;
        setReplayRecord(parsed);
        setReplayIndex(-1);
        setReplayPlaying(false);
        setTab("replay");
      } catch {
        console.warn("Invalid flight record JSON");
      }
    };
    reader.readAsText(file);
  }, [restoreStoresBackup]);

  const displayRecord = replayRecord ?? rec;

  const handleReplayGoTo = useCallback((idx: number) => {
    const record = replayRecord ?? rec;
    const session = sessionRef.current;
    if (session) {
      session.goTo(idx);
    }
    setReplayIndex(idx);
    if (editorRef?.current) {
      const text = getEditorTextAtEvent(record, idx);
      const cursorPos = getCursorPositionAtEvent(record, idx);
      if (text !== null) editorRef.current.restoreEditor(text, cursorPos ?? undefined);
    }
  }, [replayRecord, rec, editorRef]);

  const handleReplayPlay = useCallback(() => {
    const record = replayRecord ?? rec;
    if (!editorRef?.current) return;

    if (sessionRef.current) {
      sessionRef.current.destroy();
    }

    // Save current store state so we can restore it when replay ends
    saveStoresBackup();

    // Apply initial store state from the first snapshot
    const firstSnapshot = record.events.find((e) => e.type === "store-snapshot") as FlightEvent | undefined;
    if (firstSnapshot && "stores" in firstSnapshot) {
      restoreStoresFromSnapshot((firstSnapshot as { stores: Record<string, unknown> }).stores);
    }

    const session = createReplaySession(record, {
      onSetEditorValue: (text, cursorPos) => {
        editorRef.current?.restoreEditor(text, cursorPos);
      },
      onHighlightEvent: (idx) => { setReplayIndex(idx); },
      onApiCall: (ev) => {
        if (ev.type === "api-call") {
          setApiFlash(`${ev.method} ${ev.endpoint} → ${ev.statusCode}`);
          setTimeout(() => setApiFlash(null), 800);
        }
      },
      onAutocomplete: () => {
        // Cursor already positioned by onSetEditorValue — trigger panel immediately
        editorRef.current?.triggerAutocomplete();
      },
      onRestoreStores: (stores) => {
        restoreStoresFromSnapshot(stores as unknown as Record<string, unknown>);
      },
    });
    sessionRef.current = session;
    session.goTo(0);
    session.play();
    setReplayPlaying(true);
  }, [replayRecord, rec, editorRef, saveStoresBackup, restoreStoresFromSnapshot]);

  const handleReplayPause = useCallback(() => {
    sessionRef.current?.pause();
    setReplayPlaying(false);
  }, []);

  const handleReplaySetSpeed = useCallback((s: ReplaySpeed) => {
    setReplaySpeed(s);
    sessionRef.current?.setSpeed(s);
  }, []);

  // Cleanup session on unmount — restore original store state
  useEffect(() => {
    return () => {
      sessionRef.current?.destroy();
      restoreStoresBackup();
    };
  }, [restoreStoresBackup]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-2xl" style={{ width: 560, maxHeight: "calc(100vh - 100px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${isRecording ? "bg-red-500 animate-pulse" : "bg-gray-400"}`} />
          <span className="text-xs font-semibold text-[var(--foreground)]">Flight Recorder</span>
          <span className="text-[10px] text-[var(--muted-foreground)]">
            {events.length} events
            {replayRecord ? ` (loaded: ${replayRecord.events.length})` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {isRecording ? (
            <button onClick={handleStop} className="rounded px-2 py-0.5 text-xs font-medium bg-red-500 text-white hover:bg-red-600">Stop</button>
          ) : (
            <button onClick={handleStart} className="rounded px-2 py-0.5 text-xs font-medium bg-green-600 text-white hover:bg-green-700">Record</button>
          )}
          <button onClick={handleClear} className="rounded px-2 py-0.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)]">Clear</button>
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <button onClick={() => fileRef.current?.click()} className="rounded px-2 py-0.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)]">Load</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        {(["events", "replay", "export"] as TabId[]).map((t) => (
          <button
            key={t}
            className={`flex-1 px-2 py-1 text-xs font-medium ${
              tab === t
                ? "border-b-2 border-[var(--primary)] text-[var(--primary)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
            onClick={() => setTab(t)}
          >
            {t === "events" ? "Events" : t === "replay" ? "Replay" : "Export"}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden flex-col" style={{ minHeight: 0 }}>
        {tab === "events" && (
          <EventList
            events={events}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            isRecording={isRecording}
          />
        )}

        {tab === "replay" && (
          <ReplayPanel
            record={displayRecord}
            replayIndex={replayIndex}
            replayPlaying={replayPlaying}
            replaySpeed={replaySpeed}
            apiFlash={apiFlash}
            onGoTo={handleReplayGoTo}
            onPlay={handleReplayPlay}
            onPause={handleReplayPause}
            onSetSpeed={handleReplaySetSpeed}
            hasEditor={!!editorRef?.current}
          />
        )}

        {tab === "export" && (
          <div className="flex flex-col gap-2 p-3 overflow-auto">
            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--muted-foreground)]">Snapshot interval (ms):</label>
              <input
                value={intervalInput}
                onChange={(e) => setIntervalInput(e.target.value)}
                className="w-20 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-xs"
              />
            </div>
            <button onClick={handleExport} className="rounded bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
              Download JSON ({events.length} events)
            </button>
            <textarea
              readOnly
              value={JSON.stringify(rec, null, 2).slice(0, 50000) + (JSON.stringify(rec, null, 2).length > 50000 ? "\n\n… truncated" : "")}
              className="mt-1 min-h-[200px] resize-y rounded border border-[var(--border)] bg-[var(--muted)] p-2 font-mono text-[10px]"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Event List ──────────────────────────────────────────────────────────────

function EventList({
  events,
  selectedIndex,
  onSelect,
  isRecording,
}: {
  events: FlightEvent[];
  selectedIndex: number | null;
  onSelect: (i: number | null) => void;
  isRecording: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isRecording) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length, isRecording]);

  const selected = selectedIndex !== null && selectedIndex < events.length ? events[selectedIndex] : null;

  return (
    <div className="flex flex-1 overflow-hidden flex-col" style={{ minHeight: 0 }}>
      <div className="flex-1 overflow-y-auto border-b border-[var(--border)]">
        {events.length === 0 && (
          <div className="flex items-center justify-center p-6 text-xs text-[var(--muted-foreground)]">
            No events recorded yet. Click Record to start.
          </div>
        )}
        {events.map((ev, i) => (
          <button
            key={i}
            className={`flex w-full items-center gap-2 border-b border-[var(--border)] px-3 py-1.5 text-left text-xs hover:bg-[var(--muted)] ${
              i === selectedIndex ? "bg-[var(--muted)]" : ""
            }`}
            onClick={() => onSelect(i === selectedIndex ? null : i)}
          >
            <EventIcon type={ev.type} />
            <span className="font-mono text-[10px] text-[var(--muted-foreground)] w-12 shrink-0">
              {ev.ts.toFixed(0)}ms
            </span>
            <span className="truncate flex-1">
              {describeEvent(ev)}
            </span>
          </button>
        ))}
        <div ref={endRef} />
      </div>
      {selected && (
        <div className="overflow-y-auto p-3" style={{ maxHeight: 300 }}>
          <EventDetail event={selected} />
        </div>
      )}
    </div>
  );
}

// ─── Replay Panel ────────────────────────────────────────────────────────────

function ReplayPanel({
  record,
  replayIndex,
  replayPlaying,
  replaySpeed,
  apiFlash,
  onGoTo,
  onPlay,
  onPause,
  onSetSpeed,
  hasEditor,
}: {
  record: FlightRecord;
  replayIndex: number;
  replayPlaying: boolean;
  replaySpeed: ReplaySpeed;
  apiFlash: string | null;
  onGoTo: (i: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onSetSpeed: (s: ReplaySpeed) => void;
  hasEditor: boolean;
}) {
  const events = record.events;
  const current = replayIndex >= 0 && replayIndex < events.length ? events[replayIndex] : null;
  const progress = events.length > 0
    ? Math.max(0, replayIndex) / (events.length - 1) * 100
    : 0;
  const totalDuration = events.length > 0 ? events[events.length - 1].ts : 0;

  const activeQuery = current
    ? getEditorTextAtEvent(record, replayIndex)
    : undefined;

  const cursorPos = current?.type === "autocomplete"
    ? current.before.length
    : current?.type === "input"
      ? current.cursor
      : null;

  const cursorPreview = current && cursorPos !== null
    ? getEditorTextAtEvent(record, replayIndex) ?? (current.type === "input" ? current.text : null)
    : null;

  return (
    <div className="flex flex-1 overflow-hidden flex-col" style={{ minHeight: 0 }}>
      {/* Progress bar */}
      <div className="h-1.5 w-full bg-[var(--muted)] cursor-pointer" onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        onGoTo(Math.round(pct * (events.length - 1)));
      }}>
        <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${progress}%` }} />
      </div>

      {/* Transport controls */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5">
        <div className="flex items-center gap-1">
          <button
            className="rounded px-2 py-0.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-30"
            disabled={replayPlaying || replayIndex <= 0}
            onClick={() => onGoTo(replayIndex - 1)}
          >⏮</button>
          <button
            className="rounded px-2 py-0.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-30"
            disabled={replayPlaying || replayIndex <= 0}
            onClick={() => onGoTo(0)}
          >◀◀</button>
          {replayPlaying ? (
            <button onClick={onPause} className="rounded px-3 py-0.5 text-xs font-medium bg-[var(--primary)] text-white hover:opacity-90">
              ⏸ Pause
            </button>
          ) : (
            <button
              onClick={onPlay}
              className="rounded px-3 py-0.5 text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-30"
              disabled={!hasEditor}
              title={!hasEditor ? "Replay needs editor access — close and reopen with Ctrl+Shift+D" : undefined}
            >
              ▶ Play
            </button>
          )}
          <button
            className="rounded px-2 py-0.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-30"
            disabled={replayPlaying || replayIndex >= events.length - 1}
            onClick={() => onGoTo(replayIndex + 1)}
          >▶▶</button>
          <button
            className="rounded px-2 py-0.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-30"
            disabled={replayPlaying || replayIndex >= events.length - 1}
            onClick={() => onGoTo(events.length - 1)}
          >⏭</button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--muted-foreground)]">
            {replayIndex < 0 ? "-" : `${replayIndex + 1}/${events.length}`}
          </span>
          <span className="text-[10px] text-[var(--muted-foreground)]">{(totalDuration / 1000).toFixed(1)}s</span>
        </div>
      </div>

      {/* Speed control */}
      <div className="flex items-center justify-center gap-1 border-b border-[var(--border)] px-3 py-1">
        {([0.25, 0.5, 1, 2, 4] as ReplaySpeed[]).map((s) => (
          <button
            key={s}
            className={`rounded px-2 py-0.5 text-[10px] font-medium ${
              replaySpeed === s
                ? "bg-[var(--primary)] text-white"
                : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            }`}
            onClick={() => onSetSpeed(s)}
          >{s}x</button>
        ))}
      </div>

      {/* API flash notification */}
      {apiFlash && (
        <div className="mx-3 mt-1 rounded bg-blue-100 px-2 py-1 text-[10px] text-blue-800 animate-pulse">
          {apiFlash}
        </div>
      )}

      {/* Body: timeline + detail */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        <div className="w-2/5 overflow-y-auto border-r border-[var(--border)]">
          {events.map((ev, i) => (
            <button
              key={i}
              className={`flex w-full items-center gap-2 border-b border-[var(--border)] px-2 py-1 text-left text-[10px] hover:bg-[var(--muted)] ${
                i === replayIndex ? "bg-[var(--muted)] font-semibold" : ""
              }`}
              onClick={() => { if (!replayPlaying) onGoTo(i); }}
            >
              <EventIcon type={ev.type} />
              <span className="text-[var(--muted-foreground)] shrink-0 w-10">{ev.ts.toFixed(0)}ms</span>
              <span className="truncate">{describeEvent(ev)}</span>
            </button>
          ))}
        </div>
        <div className="w-3/5 overflow-y-auto p-3">
          {current ? (
            <EventDetail event={current} />
          ) : (
            <div className="text-xs text-[var(--muted-foreground)]">
              {hasEditor
                ? "Press ▶ Play to start visual replay"
                : "Editor not connected — reopen panel with Ctrl+Shift+D on the main page"}
            </div>
          )}
          {activeQuery !== undefined && (
            <div className="mt-2 rounded border border-[var(--border)] bg-[var(--muted)] p-2">
              <div className="text-[10px] font-medium text-[var(--muted-foreground)] mb-1">Editor text at this point:</div>
              <pre className="overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed">
                {activeQuery || "(empty)"}
              </pre>
            </div>
          )}
          {cursorPreview !== null && cursorPos !== null && (
            <div className="mt-2 rounded border border-[var(--border)] bg-[var(--muted)] p-2">
              <div className="text-[10px] font-medium text-[var(--muted-foreground)] mb-1">
                Cursor at position <span className="font-mono">{cursorPos}</span>:
              </div>
              <pre className="overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed">
                {cursorPreview.slice(0, cursorPos)}<span className="bg-blue-300 text-blue-900">|</span>{cursorPreview.slice(cursorPos) || ""}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function EventIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    "store-snapshot": "📷",
    action: "⚡",
    "api-call": "🌐",
    autocomplete: "✨",
    user: "👤",
    input: "⌨️",
  };
  return <span className="shrink-0 text-xs">{icons[type] ?? "❓"}</span>;
}

function describeEvent(ev: FlightEvent): string {
  switch (ev.type) {
    case "store-snapshot":
      return `Snapshot [${ev.trigger}] ${ev.summary.totalTypes} types, ${ev.summary.totalFields} fields`;
    case "action":
      return `${ev.store}.${ev.action} (${ev.durationMs}ms)`;
    case "api-call":
      return `${ev.method} ${ev.endpoint} → ${ev.statusCode} (${ev.durationMs}ms)`;
    case "autocomplete":
      return `Autocomplete: "${ev.query}" (${ev.options.length} options)`;
    case "user":
      return `${ev.kind}: ${ev.payload.slice(0, 80)}`;
    case "input":
      return `Input: "${ev.text.slice(0, 60)}" cursor=${ev.cursor} origin=${ev.origin || "?"}`;
  }
}

function EventDetail({ event }: { event: FlightEvent }) {
  const common = (
    <div className="mb-2 flex items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
      <EventIcon type={event.type} />
      <span className="font-mono">{event.ts.toFixed(1)}ms</span>
      <span className="font-medium text-[var(--foreground)]">{event.type}</span>
    </div>
  );

  switch (event.type) {
    case "store-snapshot":
      return (
        <div>
          {common}
          <div className="space-y-1 text-xs">
            <div><span className="text-[var(--muted-foreground)]">Trigger:</span> {event.trigger}</div>
            <div><span className="text-[var(--muted-foreground)]">Types:</span> {event.summary.totalTypes}</div>
            <div><span className="text-[var(--muted-foreground)]">Fields:</span> {event.summary.totalFields}</div>
            <div><span className="text-[var(--muted-foreground)]">Unresolved refs:</span> {event.summary.unresolvedRefs}</div>
            <div><span className="text-[var(--muted-foreground)]">Connections:</span> {event.summary.connectionCount}</div>
            <div><span className="text-[var(--muted-foreground)]">Active connection:</span> {event.summary.activeConnectionId ?? "(none)"}</div>
            <div><span className="text-[var(--muted-foreground)]">Active query:</span> <code className="rounded bg-[var(--muted)] px-1">{(event.stores as Record<string, unknown>).activeQuery as string || "(empty)"}</code></div>
            {event.stores.schemaStore && (
              <details className="mt-1">
                <summary className="cursor-pointer text-[10px] text-[var(--muted-foreground)]">Schema store</summary>
                <pre className="mt-1 overflow-auto rounded bg-[var(--muted)] p-2 font-mono text-[10px]">
                  {JSON.stringify(event.stores.schemaStore, null, 2)}
                </pre>
              </details>
            )}
            {event.stores.connectionStore && (
              <details className="mt-1">
                <summary className="cursor-pointer text-[10px] text-[var(--muted-foreground)]">Connection store</summary>
                <pre className="mt-1 overflow-auto rounded bg-[var(--muted)] p-2 font-mono text-[10px]">
                  {JSON.stringify(event.stores.connectionStore, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      );

    case "action":
      return (
        <div>
          {common}
          <div className="space-y-1 text-xs">
            <div><span className="text-[var(--muted-foreground)]">Store:</span> {event.store}</div>
            <div><span className="text-[var(--muted-foreground)]">Action:</span> {event.action}</div>
            <div><span className="text-[var(--muted-foreground)]">Duration:</span> {event.durationMs.toFixed(1)}ms</div>
            <details className="mt-1">
              <summary className="cursor-pointer text-[10px] text-[var(--muted-foreground)]">Args</summary>
              <pre className="mt-1 overflow-auto rounded bg-[var(--muted)] p-2 font-mono text-[10px]">
                {JSON.stringify(event.args, null, 2)}
              </pre>
            </details>
            <details className="mt-1">
              <summary className="cursor-pointer text-[10px] text-[var(--muted-foreground)]">Result</summary>
              <pre className="mt-1 overflow-auto rounded bg-[var(--muted)] p-2 font-mono text-[10px]">
                {JSON.stringify(event.result, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      );

    case "api-call":
      return (
        <div>
          {common}
          <div className="space-y-1 text-xs">
            <div><span className="text-[var(--muted-foreground)]">{event.method}</span> {event.endpoint}</div>
            <div><span className="text-[var(--muted-foreground)]">Status:</span> {event.statusCode}</div>
            <div><span className="text-[var(--muted-foreground)]">Duration:</span> {event.durationMs.toFixed(1)}ms</div>
            {!!event.requestBody && (
              <details className="mt-1">
                <summary className="cursor-pointer text-[10px] text-[var(--muted-foreground)]">Request body</summary>
                <pre className="mt-1 overflow-auto rounded bg-[var(--muted)] p-2 font-mono text-[10px]">
                  {JSON.stringify(event.requestBody, null, 2)}
                </pre>
              </details>
            )}
            {!!event.responseBody && (
              <details className="mt-1">
                <summary className="cursor-pointer text-[10px] text-[var(--muted-foreground)]">Response body</summary>
                <pre className="mt-1 overflow-auto rounded bg-[var(--muted)] p-2 font-mono text-[10px]">
                  {JSON.stringify(event.responseBody, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      );

    case "autocomplete":
      return (
        <div>
          {common}
          <div className="space-y-1 text-xs">
            <div><span className="text-[var(--muted-foreground)]">Before:</span> <code className="rounded bg-[var(--muted)] px-1">{event.before}</code></div>
            <div><span className="text-[var(--muted-foreground)]">Query:</span> <code className="rounded bg-[var(--muted)] px-1">{event.query}</code></div>
            <div><span className="text-[var(--muted-foreground)]">Context:</span> {event.context.kind}</div>
            <div><span className="text-[var(--muted-foreground)]">Resolves triggered:</span> {event.resolvesTriggered.length > 0 ? event.resolvesTriggered.join(", ") : "(none)"}</div>
            {event.options.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-[10px] text-[var(--muted-foreground)]">Options ({event.options.length})</summary>
                <div className="mt-1 max-h-24 overflow-y-auto">
                  {event.options.map((o, i) => (
                    <div key={i} className="flex items-center gap-2 py-0.5 text-[10px]">
                      <span className="font-mono">{o.label}</span>
                      {o.detail && <span className="text-[var(--muted-foreground)]">— {o.detail}</span>}
                    </div>
                  ))}
                </div>
              </details>
            )}
            {event.fieldTypesBefore && (
              <details className="mt-1">
                <summary className="cursor-pointer text-[10px] text-[var(--muted-foreground)]">Field types ({Object.keys(event.fieldTypesBefore).length})</summary>
                <pre className="mt-1 overflow-auto rounded bg-[var(--muted)] p-2 font-mono text-[10px]">
                  {JSON.stringify(event.fieldTypesBefore, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      );

    case "user":
      return (
        <div>
          {common}
          <div className="space-y-1 text-xs">
            <div><span className="text-[var(--muted-foreground)]">Kind:</span> {event.kind}</div>
            <div><span className="text-[var(--muted-foreground)]">Payload:</span> {event.payload}</div>
          </div>
        </div>
      );

    case "input":
      return (
        <div>
          {common}
          <div className="space-y-1 text-xs">
            <div><span className="text-[var(--muted-foreground)]">Origin:</span> <code className="rounded bg-[var(--muted)] px-1">{event.origin || "(unknown)"}</code></div>
            <div><span className="text-[var(--muted-foreground)]">Cursor:</span> {event.cursor}</div>
            <div><span className="text-[var(--muted-foreground)]">Text:</span></div>
            <pre className="mt-1 overflow-auto rounded bg-[var(--muted)] p-2 font-mono text-[10px] whitespace-pre-wrap">
              {event.text.slice(0, event.cursor)}
              <span className="bg-blue-300 text-blue-900">|</span>
              {event.text.slice(event.cursor)}
            </pre>
          </div>
        </div>
      );

    default:
      return <div>{common}<pre className="mt-1 text-xs">{JSON.stringify(event, null, 2)}</pre></div>;
  }
}
