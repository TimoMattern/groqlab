import { useConnectionStore, getActiveConnection } from "@/stores/connection-store";
import { useSchemaStore } from "@/stores/schema-store";
import { useResultStore } from "@/stores/result-store";
import { useHistoryStore } from "@/stores/history-store";
import { detectContext } from "@/lib/groq/groq-autocomplete";
import type { CompletionCtx } from "@/lib/groq/groq-autocomplete";
import type { ConnectionConfig, QueryResult, SchemaField, SchemaType } from "@/lib/sanity-types";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FlightRecord {
  meta: {
    version: 1;
    startedAt: string;
    appVersion: string;
    connectionId: string | null;
    connectionProjectId: string | null;
    connectionDataset: string | null;
  };
  events: FlightEvent[];
}

export type FlightEvent =
  | StoreSnapshotEvent
  | ActionEvent
  | ApiCallEvent
  | AutocompleteEvent
  | AutocompleteSelectionEvent
  | UserEvent
  | InputEvent;

export interface StoreSnapshotEvent {
  type: "store-snapshot";
  ts: number;
  stores: {
    connectionStore: object;
    schemaStore: object;
    resultStore: object;
    historyStore: object;
    activeQuery: string;
  };
  summary: {
    totalTypes: number;
    totalFields: number;
    unresolvedRefs: number;
    connectionCount: number;
    activeConnectionId: string | null;
  };
  trigger: string;
}

export interface ActionEvent {
  type: "action";
  ts: number;
  store: string;
  action: string;
  args: unknown[];
  result: unknown;
  durationMs: number;
}

export interface ApiCallEvent {
  type: "api-call";
  ts: number;
  endpoint: string;
  method: string;
  requestBody: unknown;
  statusCode: number;
  responseBody: unknown;
  durationMs: number;
}

export interface AutocompleteEvent {
  type: "autocomplete";
  ts: number;
  before: string;
  query: string;
  context: CompletionCtx;
  fieldTypesBefore: Record<string, string>;
  fieldTypesAfter: Record<string, string>;
  options: { label: string; detail: string }[];
  resolvesTriggered: string[];
  selectedIndex: number;
}

export interface AutocompleteSelectionEvent {
  type: "autocomplete-selection";
  ts: number;
  selectedIndex: number;
  totalOptions: number;
}

export interface UserEvent {
  type: "user";
  ts: number;
  kind: "keystroke" | "click" | "command";
  payload: string;
}

export interface InputEvent {
  type: "input";
  ts: number;
  text: string;              // full editor text after the change
  cursor: number;            // cursor position after the change
  origin: string;            // CodeMirror userEvent annotation: "input.type", "delete.backward", "input.paste", etc.
}

export interface FlightCommand {
  id: string;
  command: string;
  args: Record<string, unknown>;
  timestamp: number;
}

const MAX_EVENTS = 10000;
const MAX_SIZE_BYTES = 50 * 1024 * 1024;

// ─── Flight Recorder ───────────────────────────────────────────────────────────

export class FlightRecorder {
  private record: FlightRecord;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private _enabled = false;
  private snapshotsPaused = false;
  private startTs: number = 0;
  private _activeQuery = "";
  private _lastSelectedIndex = -1;

  static readonly instance = new FlightRecorder();

  private constructor() {
    this.record = this.emptyRecord();
  }

  private emptyRecord(): FlightRecord {
    return {
      meta: {
        version: 1,
        startedAt: new Date().toISOString(),
        appVersion: "__VERSION__",
        connectionId: null,
        connectionProjectId: null,
        connectionDataset: null,
      },
      events: [],
    };
  }

  get enabled(): boolean {
    return this._enabled;
  }

  isEnabled(): boolean {
    return this._enabled;
  }

  start(intervalMs?: number): void {
    if (this._enabled) return;
    this._enabled = true;
    this.startTs = performance.now();
    this.record = this.emptyRecord();
    this.updateMeta();
    this.recordSnapshot("start");
    if (intervalMs && intervalMs > 0) {
      this.timerId = setInterval(() => {
        this.recordSnapshot("timer");
      }, intervalMs);
    }
  }

  stop(): void {
    if (!this._enabled) return;
    this.recordSnapshot("stop");
    this._enabled = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  clear(): void {
    this.record = this.emptyRecord();
    this.startTs = performance.now();
  }

  export(): FlightRecord {
    return JSON.parse(JSON.stringify(this.record));
  }

  private pushEvent(event: FlightEvent): void {
    if (!this._enabled) return;
    if (this.record.events.length >= MAX_EVENTS) {
      this.stop();
      console.warn("Flight recorder: max events reached, recording stopped");
      return;
    }
    const approxSize = JSON.stringify(this.record).length + JSON.stringify(event).length;
    if (approxSize > MAX_SIZE_BYTES) {
      this.stop();
      console.warn("Flight recorder: max size reached, recording stopped");
      return;
    }
    this.record.events.push(event);
  }

  setActiveQuery(query: string): void {
    this._activeQuery = query;
  }

  getActiveQuery(): string {
    return this._activeQuery;
  }

  recordSnapshot(trigger: string): void {
    if (!this._enabled || this.snapshotsPaused) return;
    this.snapshotsPaused = true;
    try {
      const raw = this.captureStores();
      const { _summary, ...stores } = raw;
      this.pushEvent({
        type: "store-snapshot",
        ts: performance.now() - this.startTs,
        stores,
        summary: _summary,
        trigger,
      });
    } finally {
      this.snapshotsPaused = false;
    }
  }

  recordAction(
    store: string,
    action: string,
    args: unknown[],
    result: unknown,
    durationMs: number,
  ): void {
    this.pushEvent({
      type: "action",
      ts: performance.now() - this.startTs,
      store,
      action,
      args,
      result,
      durationMs,
    });
  }

  recordApiCall(
    endpoint: string,
    method: string,
    requestBody: unknown,
    statusCode: number,
    responseBody: unknown,
    durationMs: number,
  ): void {
    this.pushEvent({
      type: "api-call",
      ts: performance.now() - this.startTs,
      endpoint,
      method,
      requestBody,
      statusCode,
      responseBody,
      durationMs,
    });
  }

  recordAutocomplete(event: Omit<AutocompleteEvent, "type" | "ts">): void {
    this._lastSelectedIndex = -1;
    this.pushEvent({
      type: "autocomplete",
      ts: performance.now() - this.startTs,
      ...event,
    });
  }

  recordAutocompleteSelect(selectedIndex: number, totalOptions: number): void {
    if (selectedIndex === this._lastSelectedIndex) return;
    this._lastSelectedIndex = selectedIndex;
    this.pushEvent({
      type: "autocomplete-selection",
      ts: performance.now() - this.startTs,
      selectedIndex,
      totalOptions,
    });
  }

  recordUser(kind: "keystroke" | "click" | "command", payload: string): void {
    this.pushEvent({
      type: "user",
      ts: performance.now() - this.startTs,
      kind,
      payload,
    });
  }

  recordInput(text: string, cursor: number, origin: string): void {
    this.pushEvent({
      type: "input",
      ts: performance.now() - this.startTs,
      text,
      cursor,
      origin,
    });
  }

  // ─── Snapshot helpers ──────────────────────────────────────────────────────

  private captureStores() {
    const connState = useConnectionStore.getState();
    const schemaState = useSchemaStore.getState();
    const resultState = useResultStore.getState();
    const historyState = useHistoryStore.getState();

    let totalTypes = 0;
    let totalFields = 0;
    let unresolvedRefs = 0;
    for (const types of Object.values(schemaState.types)) {
      for (const t of types) {
        totalTypes++;
        const countFields = (fs: SchemaField[]) => {
          for (const f of fs) {
            totalFields++;
            if (f.isReference && f.type === "reference") unresolvedRefs++;
            if (f.fields) countFields(f.fields);
          }
        };
        countFields(t.fields);
      }
    }

    return {
      connectionStore: safeSerialize({
        connections: connState.connections,
        activeId: connState.activeId,
        statuses: connState.statuses,
      }),
      schemaStore: safeSerialize({
        isLoading: schemaState.isLoading,
        error: schemaState.error,
        types: summarizeTypes(schemaState.types),
        fullTypes: schemaState.types,
      }),
      resultStore: safeSerialize({
        data: resultState.data !== null ? "(present)" : null,
        durationMs: resultState.durationMs,
        documentCount: resultState.documentCount,
        error: resultState.error,
        isLoading: resultState.isLoading,
      }),
      historyStore: safeSerialize({
        entries: historyState.entries.map((e) => ({
          id: e.id,
          query: e.query.substring(0, 200),
          success: e.success,
          executedAt: e.executedAt,
          durationMs: e.durationMs,
        })),
      }),
      activeQuery: this._activeQuery,
      _summary: {
        totalTypes,
        totalFields,
        unresolvedRefs,
        connectionCount: connState.connections?.length ?? 0,
        activeConnectionId: connState.activeId ?? null,
      },
    };
  }

  private updateMeta(): void {
    const conn = getActiveConnection();
    this.record.meta.connectionId = conn?.id ?? null;
    this.record.meta.connectionProjectId = conn?.projectId ?? null;
    this.record.meta.connectionDataset = conn?.dataset ?? null;
  }

  // ─── Command Execution ────────────────────────────────────────────────────

  async executeCommand(cmd: FlightCommand): Promise<unknown> {
    this.recordUser("command", `${cmd.command} ${JSON.stringify(cmd.args)}`);

    switch (cmd.command) {
      // Store commands
      case "store.get": {
        const { store, path } = cmd.args as { store: string; path?: string };
        const s = this.getStore(store);
        if (!s) throw new Error(`Unknown store: ${store}`);
        return path ? getNested(s, path as string) : safeSerialize(s);
      }

      case "store.set": {
        const { store } = cmd.args as { store: string };
        const s = this.getStore(store);
        if (!s) throw new Error(`Unknown store: ${store}`);
        throw new Error("store.set not implemented — use store.action instead");
      }

      case "store.action": {
        const { store, action, args } = cmd.args as { store: string; action: string; args: unknown[] };
        const start = performance.now();
        let result: unknown;
        const storeMap: Record<string, object> = {
          schema: useSchemaStore.getState(),
          connection: useConnectionStore.getState(),
          result: useResultStore.getState(),
          history: useHistoryStore.getState(),
        };
        const state = storeMap[store];
        if (!state) throw new Error(`Unknown store: ${store}`);
        const fn = (state as Record<string, unknown>)[action];
        if (typeof fn !== "function") throw new Error(`No action '${action}' on store '${store}'`);
        result = await (fn as (...a: unknown[]) => unknown)(...args);
        const durationMs = performance.now() - start;
        this.recordAction(store, action, args, result, durationMs);
        this.recordSnapshot("after-action");
        return result;
      }

      // Schema commands
      case "schema.resolveRef": {
        const { typeName, fieldPath } = cmd.args as { typeName: string; fieldPath: string };
        const conn = getActiveConnection();
        if (!conn) throw new Error("No active connection");
        const store = useSchemaStore.getState();
        const result = await store.resolveRef(conn.id, conn, typeName, fieldPath);
        this.recordAction("schema", "resolveRef", [typeName, fieldPath], result, 0);
        this.recordSnapshot("after-action");
        return result;
      }

      case "schema.setTypes": {
        const { types } = cmd.args as { types: SchemaType[] };
        const conn = getActiveConnection();
        if (!conn) throw new Error("No active connection");
        useSchemaStore.getState().setTypes(conn.id, types);
        this.recordSnapshot("after-action");
        return true;
      }

      // Autocomplete commands
      case "autocomplete.trigger": {
        const { before } = cmd.args as { before: string };
        const { groqCompletionSource } = await import("@/lib/groq/groq-autocomplete");
        const { EditorState } = await import("@codemirror/state");
        const state = EditorState.create({ doc: before });
        const ctx = new (await import("@codemirror/autocomplete")).CompletionContext(state, state.doc.length, false);
        const result = groqCompletionSource(ctx);
        this.recordSnapshot("after-autocomplete");
        return result;
      }

      case "autocomplete.detectContext": {
        const { before } = cmd.args as { before: string };
        const context = detectContext(before);
        return {
          kind: context.kind,
          ...(context.kind === "object-projection" ? { typeName: (context as CompletionCtx & { kind: "object-projection" }).typeName, fieldName: (context as CompletionCtx & { kind: "object-projection" }).fieldName } : {}),
          ...((context as Record<string, unknown>).typeName ? { typeName: (context as Record<string, unknown>).typeName } : {}),
          ...((context as Record<string, unknown>).before ? { before: (context as Record<string, unknown>).before } : {}),
        };
      }

      // Recording commands
      case "recording.start": {
        const { intervalMs } = cmd.args as { intervalMs?: number };
        this.start(intervalMs);
        return true;
      }

      case "recording.stop": {
        this.stop();
        return true;
      }

      case "recording.export": {
        return this.export();
      }

      case "recording.clear": {
        this.clear();
        return true;
      }

      // Headless: Query execution
      case "query.execute": {
        const { query, params } = cmd.args as { query: string; params?: Record<string, unknown> };
        const conn = getActiveConnection();
        if (!conn) throw new Error("No active connection");
        const { executeQuery } = await import("@/lib/sanity-api");
        const result = await executeQuery(conn, query, params);
        this.recordSnapshot("after-action");
        return result;
      }

      // Headless: Connection management
      case "connection.list": {
        const connState = useConnectionStore.getState();
        return {
          connections: connState.connections,
          activeId: connState.activeId,
          statuses: connState.statuses,
        };
      }

      case "connection.add": {
        const { projectId, dataset, name, token } = cmd.args as {
          projectId: string; dataset: string; name?: string; token?: string;
        };
        const id = `${projectId}/${dataset}`;
        const conn: ConnectionConfig = {
          id,
          name: name ?? id,
          projectId,
          dataset,
          token: token ?? "",
          createdAt: new Date().toISOString(),
        };
        useConnectionStore.getState().addConnection(conn);
        this.recordSnapshot("after-action");
        return conn;
      }

      case "connection.setActive": {
        const { id } = cmd.args as { id: string };
        useConnectionStore.getState().setActive(id);
        this.recordSnapshot("after-action");
        return true;
      }

      case "connection.test": {
        const { projectId, dataset } = cmd.args as { projectId: string; dataset: string };
        const { testConnection } = await import("@/lib/sanity-api");
        const result = await testConnection(projectId, dataset);
        this.recordSnapshot("after-action");
        return result;
      }

      // Headless: Schema commands
      case "schema.getTypes": {
        const conn = getActiveConnection();
        if (!conn) return [];
        return useSchemaStore.getState().getTypes(conn.id) ?? [];
      }

      case "schema.fetch": {
        const conn = getActiveConnection();
        if (!conn) throw new Error("No active connection");
        const { fetchSchema } = await import("@/lib/sanity-api");
        const types = await fetchSchema(conn);
        if (types.length > 0) {
          useSchemaStore.getState().setTypes(conn.id, types);
        }
        this.recordSnapshot("after-action");
        return types;
      }

      default:
        throw new Error(`Unknown command: ${cmd.command}`);
    }
  }

  private getStore(name: string): object | undefined {
    switch (name) {
      case "connection": return useConnectionStore.getState();
      case "schema": return useSchemaStore.getState();
      case "result": return useResultStore.getState();
      case "history": return useHistoryStore.getState();
      default: return undefined;
    }
  }
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function safeSerialize(value: unknown): object {
  return JSON.parse(JSON.stringify(value, (_key, val) => {
    if (typeof val === "undefined") return "__undefined__";
    if (typeof val === "function") return "__function__";
    return val;
  }));
}

function getNested(obj: object, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function summarizeTypes(
  types: Record<string, SchemaType[]>,
): Record<string, { name: string; fields: { name: string; type: string }[] }[]> {
  const out: Record<string, { name: string; fields: { name: string; type: string }[] }[]> = {};
  for (const [connId, ts] of Object.entries(types)) {
    out[connId] = ts.map((t) => ({
      name: t.name,
      fields: t.fields.map((f) => ({
        name: f.name,
        type: `${f.isReference ? (f.type === "reference" ? "ref(…)" : `ref(${f.type})`) : f.type}${f.isArray ? "[]" : ""}`,
      })),
    }));
  }
  return out;
}

// ─── Window Global ─────────────────────────────────────────────────────────────

declare global {
  interface Window {
    __FLIGHT__?: {
      recorder: FlightRecorder;
      execute: (command: FlightCommand) => Promise<unknown>;
      getState: () => FlightRecord;
      export: () => string;
      import: (json: string) => void;
      start: (intervalMs?: number) => void;
      stop: () => void;
      setQuery: (q: string) => void;

      /** Convenience: execute a GROQ query on the active connection */
      query: (groq: string, params?: Record<string, unknown>) => Promise<QueryResult>;
      /** Convenience: add and activate a connection */
      connect: (projectId: string, dataset: string, token?: string) => Promise<ConnectionConfig>;
      /** Convenience: run autocomplete for text before cursor */
      autocomplete: (before: string) => Promise<unknown>;
      /** Convenience: fetch and set schema for active connection */
      schema: () => Promise<SchemaType[]>;
      /** Convenience: get current store snapshot */
      snapshot: () => Promise<object>;
    };
  }
}

export function setupFlightGlobal(): void {
  if (typeof window === "undefined") return;
  if (window.__FLIGHT__) return;
  const fr = FlightRecorder.instance;
  window.__FLIGHT__ = {
    recorder: fr,
    execute: (cmd) => fr.executeCommand(cmd),
    getState: () => fr.export(),
    export: () => JSON.stringify(fr.export()),
    import: (json: string) => {
      const parsed = JSON.parse(json) as FlightRecord;
      fr.clear();
      fr.start();
      const rec = (fr as unknown as { record: FlightRecord });
      rec.record = parsed;
    },
    start: (intervalMs?: number) => fr.start(intervalMs),
    stop: () => fr.stop(),
    setQuery: (q: string) => fr.setActiveQuery(q),

    query: (groq, params) =>
      fr.executeCommand({ id: "", command: "query.execute", args: { query: groq, params }, timestamp: 0 }) as Promise<QueryResult>,
    connect: (projectId, dataset, token) =>
      fr.executeCommand({ id: "", command: "connection.add", args: { projectId, dataset, token }, timestamp: 0 })
        .then((conn) => {
          const c = conn as ConnectionConfig;
          return fr.executeCommand({ id: "", command: "connection.setActive", args: { id: c.id }, timestamp: 0 }).then(() => c);
        }) as Promise<ConnectionConfig>,
    autocomplete: (before) =>
      fr.executeCommand({ id: "", command: "autocomplete.trigger", args: { before }, timestamp: 0 }),
    schema: () =>
      fr.executeCommand({ id: "", command: "schema.fetch", args: {}, timestamp: 0 }) as Promise<SchemaType[]>,
    snapshot: () =>
      Promise.resolve({
        connectionStore: JSON.parse(JSON.stringify(useConnectionStore.getState(), (_, v) => typeof v === "function" ? undefined : v)),
        schemaStore: JSON.parse(JSON.stringify(useSchemaStore.getState(), (_, v) => typeof v === "function" ? undefined : v)),
        resultStore: JSON.parse(JSON.stringify(useResultStore.getState(), (_, v) => typeof v === "function" ? undefined : v)),
        historyStore: JSON.parse(JSON.stringify(useHistoryStore.getState(), (_, v) => typeof v === "function" ? undefined : v)),
        activeQuery: fr.getActiveQuery(),
      }) as Promise<object>,
  };
}
