# Flight Recorder — Debugging & Command Interface

## Purpose

A comprehensive state recording and remote-control system that captures every application state change, action, API call, and autocomplete invocation into a structured JSON log. The AI agent can then:

1. **Inspect exact state** at any point in time (store snapshots, field types, resolved refs)
2. **Replay the recorded session** to diagnose timing issues (e.g., why `author` still shows `reference ->` after resolve)
3. **Drive the app programmatically** via a command queue (set store state, trigger actions, simulate keystrokes, dump state)
4. **Export the recording** as a JSON file for offline analysis

## Data Model

### Recording Format (JSON)

```typescript
interface FlightRecord {
  meta: {
    version: 1;
    startedAt: string;       // ISO 8601
    appVersion: string;      // package.json version
    connectionId: string | null;
    connectionProjectId: string | null;
    connectionDataset: string | null;
  };
  events: FlightEvent[];
}

type FlightEvent =
  | StoreSnapshotEvent
  | ActionEvent
  | ApiCallEvent
  | AutocompleteEvent
  | InputEvent
  | UserEvent;

interface StoreSnapshotEvent {
  type: "store-snapshot";
  ts: number;                // ms since recording start
  stores: {
    connectionStore: object;  // serialized state
    schemaStore: object;      // serialized state (types are summarized, fullTypes contains raw un-summarized SchemaType[])
    resultStore: object;
    historyStore: object;
    historyPreserveStore: object;
  };
  summary: {
    totalTypes: number;
    totalFields: number;
    unresolvedRefs: number;   // count of fields with isReference && type === "reference"
    connectionCount: number;
    activeConnectionId: string | null;
  };
  trigger: "timer" | "command" | "after-action" | "after-api" | "after-autocomplete";
}

interface ActionEvent {
  type: "action";
  ts: number;
  store: string;             // e.g. "schemaStore"
  action: string;            // e.g. "resolveRef"
  args: unknown[];
  result: unknown;
  durationMs: number;
}

interface ApiCallEvent {
  type: "api-call";
  ts: number;
  endpoint: string;          // e.g. "/api/query"
  method: string;
  requestBody: unknown;
  statusCode: number;
  responseBody: unknown;
  durationMs: number;
}

interface AutocompleteEvent {
  type: "autocomplete";
  ts: number;
  before: string;            // text before cursor
  query: string;             // search query
  context: CompletionCtx;    // detected context
  fieldTypesBefore: Record<string, string>;  // field -> type before resolve attempt
  fieldTypesAfter: Record<string, string>;   // field -> type after resolve attempt
  options: { label: string; detail: string }[];
  resolvesTriggered: string[];  // fieldPaths passed to resolveRef
}

interface UserEvent {
  type: "user";
  ts: number;
  kind: "keystroke" | "click" | "command";
  payload: string;
}

interface InputEvent {
  type: "input";
  ts: number;
  text: string;              // full editor text after the change
  cursor: number;            // cursor position after the change
  origin: string;            // CodeMirror userEvent: "input.type", "delete.backward", "input.paste"
}
```

### Command Interface

```typescript
interface FlightCommand {
  id: string;
  command: string;
  args: Record<string, unknown>;
  timestamp: number;         // when to execute (0 = now)
}
```

| Command | Args | Effect |
|---------|------|--------|
| `store.get` | `{ store: string, path?: string }` | Returns serialized store state |
| `store.set` | `{ store: string, path: string, value: unknown }` | Mutates store state |
| `store.action` | `{ store: string, action: string, args: unknown[] }` | Calls a store action |
| `schema.resolveRef` | `{ typeName: string, fieldPath: string }` | Triggers resolveRef directly |
| `schema.setTypes` | `{ types: SchemaType[] }` | Replaces types in store |
| `autocomplete.trigger` | `{ before: string }` | Runs groqCompletionSource and returns result |
| `autocomplete.detectContext` | `{ before: string }` | Runs detectContext and returns context |
| `recording.start` | `{ intervalMs?: number }` | Starts recording with optional periodic snapshot interval |
| `recording.stop` | `{}` | Stops recording |
| `recording.export` | `{}` | Returns full FlightRecord JSON |
| `recording.clear` | `{}` | Clears all recorded events |

## Implementation

### Flight Recorder Module (`src/lib/flight-recorder.ts`)

Singleton class `FlightRecorder`:

```typescript
class FlightRecorder {
  private record: FlightRecord;
  private timerId: ReturnType<typeof setInterval> | null;
  private enabled: boolean;

  start(intervalMs?: number): void;
  stop(): void;
  clear(): void;
  export(): FlightRecord;

  // Called automatically by store middlewares and hooks
  recordSnapshot(trigger: string): void;
  recordAction(store: string, action: string, args: unknown[], result: unknown, durationMs: number): void;
  recordApiCall(endpoint: string, method: string, requestBody: unknown, statusCode: number, responseBody: unknown, durationMs: number): void;
  recordAutocomplete(event: Omit<AutocompleteEvent, "type" | "ts">): void;
  recordInput(text: string, cursor: number, origin: string): void;
  recordUser(kind: string, payload: string): void;

  // Command execution
  executeCommand(cmd: FlightCommand): Promise<unknown>;
}
```

### Store Middleware Integration

Wrap Zustand stores with recording middleware:

```typescript
const flightRecorderMiddleware = (config) => (set, get, api) => {
  const wrappedSet = (...args) => {
    set(...args);
    FlightRecorder.instance.recordSnapshot("after-action");
  };
  return config(wrappedSet, get, api);
};
```

Stores to instrument:
- `useConnectionStore` — connection add/remove/activate
- `useSchemaStore` — setTypes, resolveRef, isLoading/error changes
- `useResultStore` — query results
- `useHistoryStore` — history entries

### API Call Interception

Wrap `sanity-api.ts` functions to record every request/response. Since the app proxies through Next.js routes, intercept at the `fetch()` call level:

```typescript
// In sanity-api.ts
export async function flightRecordingFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const start = performance.now();
  const body = init?.body;
  const response = await fetch(input, init);
  const duration = performance.now() - start;
  const cloned = response.clone();
  const responseBody = await cloned.json();
  FlightRecorder.instance.recordApiCall(
    typeof input === "string" ? input : input.url,
    init?.method || "GET",
    body ? JSON.parse(body as string) : null,
    response.status,
    responseBody,
    duration,
  );
  return response;
}
```

### Autocomplete Interception

In `groqCompletionSource`, record every invocation:

```typescript
function groqCompletionSource(context: CompletionContext): CompletionResult | null {
  const startFields = captureFieldTypes();
  // ... existing logic ...
  if (FlightRecorder.instance.isEnabled()) {
    FlightRecorder.instance.recordAutocomplete({
      before: context.state.sliceDoc(0, context.pos),
      query: context.matchBefore(/.../)?.text ?? "",
      context: detectedCtx,
      fieldTypesBefore: startFields,
      fieldTypesAfter: captureFieldTypes(),
      options: options ?? [],
      resolvesTriggered: resolvedPaths,
    });
  }
  // ... return ...
}
```

### Periodic Snapshots

When recording is active, take full store snapshots at a configurable interval (default 5000ms) to capture gradual state changes between actions.

### Debug UI (`src/components/debug/FlightRecorderPanel.tsx`)

A minimal floating panel (toggleable via `Ctrl+Shift+D`) with three tabs:

**Events tab:**
- Recording status indicator (red pulse dot when recording)
- Record / Stop / Clear / Load controls
- Scrollable event list with icons per type, timestamp, description
- Click event to expand detail panel below the list
- Auto-scroll to latest event while recording

**Replay tab:**
- Load a previously exported `.json` recording via file picker
- Prev/Next step buttons and position counter
- Side-by-side layout: event timeline (left) + event detail (right)
- Step through events to inspect store state, API calls, autocomplete invocations at each point in time
- Works with both live and imported recordings

**Export tab:**
- Snapshot interval input (default 5000ms)
- Download button → `flight-record-<timestamp>.json`
- Read-only textarea showing first 50KB of JSON for quick inspection

### Visual Replay ("Movie Mode")

The replay engine (`src/lib/flight-replay.ts`) treats a `FlightRecord` as an immutable playback source and drives the app UI:

1. **Import**: Load a `FlightRecord` JSON file via the Load button or `window.__FLIGHT__.import()`
2. **Navigation**: Transport controls (Play/Pause, step forward/backward, jump to start/end) with configurable speed (0.25x–4x), progress bar, and clickable timeline
3. **Auto-advance**: When playing, each event is applied with timing proportional to the real `ts` delta between events, scaled by speed. The scheduling accounts for time spent applying the event (`delay - elapsed`) to prevent drift
4. **Editor restoration**: Each event restores the editor text to the most recent `activeQuery` (from store snapshots only, NOT from autocomplete `before` which is partial text), using `getEditorTextAtEvent()` which walks backward through events to find the latest store snapshot's `activeQuery`
5. **Cursor restoration**: For autocomplete events, cursor position is restored to `before.length` via `getCursorPositionAtEvent()`, and the editor cursor visually appears at that position (the "fake cursor"). For non-autocomplete events, cursor stays at the end of the restored text
6. **Autocomplete panel reopening**: When an autocomplete event is encountered during play, `triggerAutocomplete()` is called **synchronously** via the direct CodeMirror dispatch (not via React state) — no 100ms setTimeout is needed because `restoreEditor()` dispatches directly to the CodeMirror view, which is immediately ready for `startCompletion()`
7. **Direct CodeMirror dispatch**: The replay engine bypasses React state for text/cursor updates, calling `editorRef.current.restoreEditor(text, cursorPos)` which calls `view.dispatch({ changes, selection })` directly on the CodeMirror view. This avoids React re-render cycles and makes replay smoother
8. **API flash**: When an `api-call` event is encountered during play, a brief notification appears showing the endpoint and status code
9. **Side-by-side inspection**: Left panel shows event timeline, right panel shows event detail + the active editor text + cursor position indicator (a blue `|` at the cursor position in a text preview)
10. **State reconstruction**: Works with both live and imported recordings
11. **Store state restoration**: During replay, `applyEvent` restores Zustand store state from `store-snapshot` events via `onRestoreStores` callback. The panel saves a backup of all stores before replay starts and restores them when the session is destroyed. Schema types prefer `fullTypes` (un-summarized, preserving `isReference`/`isArray`) when available, falling back to summarized `types` for backward compatibility with old recordings

The `activeQuery` is tracked by the `FlightRecorder` singleton via `setActiveQuery(query)` and included in every store snapshot. The `page.tsx` component calls this in a `useEffect` whenever the active query changes.

The `QueryEditor` exposes a `QueryEditorHandle` via `forwardRef`/`useImperativeHandle` with two methods:
- `restoreEditor(text, cursorPos?)`: Dispatches directly to the CodeMirror view (`view.dispatch({ changes, selection })`) — bypasses React props entirely
- `triggerAutocomplete()`: Calls `startCompletion(view)` from `@codemirror/autocomplete`

The `FlightRecorderPanel` receives `editorRef` directly (rather than separate `replaySetQuery`/`replayTriggerAutocomplete` callbacks) and calls these methods during replay, eliminating React roundtrips for smoother playback.

The replay callbacks include `onRestoreStores(stores)` which is called when a `store-snapshot` event is applied. The panel implements this by calling `useXStore.setState()` for each store with the snapshot data. For the schema store, `fullTypes` (un-summarized `SchemaType[]` preserving `isReference`/`isArray`) is preferred over the summarized `types` field. A backup of all stores is saved before replay starts and restored when the session is destroyed.

## Key Logic

### Snapshot Serialization

Each snapshot must serialize the Zustand stores to plain objects. Zustand stores hold Immutable-like data but are plain JS objects — use `JSON.parse(JSON.stringify(state))` for deep cloning. Exclude functions and large arrays (full query results) unless specifically requested.

### Circular Reference Handling

Schema types may contain circular references (cycle detection already in schema panel). Flight recorder snaps should preserve the cycle-safe representation already in the store — the store doesn't hold cycles in its field structure (cycles are detected at render time), so serialization should be safe.

### Command Queue Ordering

Commands execute sequentially in FIFO order. Each command returns its result. If a command triggers a store update, the next snapshot captures the new state before the next command runs.

### Size Limits

Flight records can grow large. Cap at 10,000 events or 50MB serialized, whichever comes first, then auto-stop recording and warn. Export truncates to the last 5,000 events by default (configurable).

### Two Modes

| Mode | Behavior |
|------|----------|
| **Passive** | Records all events automatically (snapshots, actions, API calls, autocomplete). No command injection. |
| **Interactive** | Passive + command queue open for external input. Commands can be submitted via the debug UI or a `window.__FLIGHT__` global. |

## API

### Global Window Object (for AI / devtools)

```typescript
interface Window {
  __FLIGHT__?: {
    recorder: FlightRecorder;
    execute: (command: FlightCommand) => Promise<unknown>;
    getState: () => FlightRecord;
    export: () => string;       // JSON string
    import: (json: string) => void;  // Load a recording for analysis
  };
}
```

This lets the AI agent (or any script in console) inspect and control the app without UI interaction.

## Lessons Learned

- Snapshot frequency must be configurable — 100ms intervals produce thousands of events during keystroke bursts
- The timing of `fieldTypesBefore` vs `fieldTypesAfter` in autocomplete events is critical: if we snapshot before `optimisticallyResolveTypeRefs` and after `objectProjectionCompletions`, we can see exactly whether sync resolution took effect or not
- Recording middleware on Zustand stores must not create infinite loops (snapshot triggers set, which triggers snapshot, ...). Use a flag or debounce
- `JSON.parse(JSON.stringify())` loses `undefined` values — use a custom serializer that preserves them as `"__undefined__"` or skip them
- The command interface should validate commands with a schema (zod) to prevent injecting invalid state that crashes the app
- Autocomplete events are the most valuable debug signal — they capture the exact timeline of context detection, sync resolution, async firing, and the final completion list
- Don't record full query result bodies by default — they can be megabytes. Record them only when a `store.result` path is explicitly requested
- The `stop()` method must call `recordSnapshot("stop")` *before* setting `_enabled = false`, otherwise the snapshot is silently dropped
- Summary counts (`totalTypes`, `totalFields`, `unresolvedRefs`) must be computed from raw Zustand state, not from the already-summarized type data passed to the snapshot — `summarizeTypes()` strips `isReference` and `isArray` fields, making subsequent ref counting impossible
- A class-based singleton with private fields makes testing harder: use `unknown as { field: type }` casts in tests to access internals for reset/verification
- Visual replay needs the editor text at each recorded point: store `activeQuery` in the `FlightRecorder` singleton (not in any Zustand store) and include it in every store snapshot via `captureStores()`
- For smooth replay timing, events must have accurate `ts` (ms since recording start) — use `performance.now() - this.startTs` consistently
- The replay engine should look backward from the current event index to find the most recent store snapshot's `activeQuery` (full query text), NOT fall back to autocomplete `before` text which is only the prefix before the cursor
- **Autocomplete replay requires cursor position**: `startCompletion(view)` detects context based on text before the cursor. Restoring only the text (without cursor position) opens the panel at the wrong context. Use `before.length` from the autocomplete event to set `EditorSelection.cursor(cursorPos)` before calling `startCompletion`
- **Direct CodeMirror dispatch for replay**: Bypassing React state (`view.dispatch({ changes, selection })`) for editor text/cursor restoration during replay eliminates the React re-render cycle and makes playback smoother. The synchronous dispatch means `startCompletion` can be called immediately without `setTimeout`
- **Ref-based editor access is cleaner than callback props**: Passing `editorRef` to the debug panel and calling methods directly on the `QueryEditorHandle` avoids the indirection of React state callback props and eliminates the need for a 100ms delay between restoring text and triggering autocomplete
- **Visual cursor indicator**: Setting the CodeMirror selection via `EditorSelection.cursor(pos)` creates a visible cursor in the editor. Additionally, showing a character-position marker (blue `|`) in the replay panel's text preview helps the user understand where the cursor was during autocomplete
- **Full-text InputEvent vs delta**: Recording full editor text (not just the delta/change) in `InputEvent` makes replay simpler and faster — no need to reconstruct state by applying sequential deltas. The trade-off is slightly larger recording size, which is acceptable given the 10K-event/50MB cap
- **`getEditorTextAtEvent` fallback chain**: For non-input events (snapshots, autocomplete, api-call), `getEditorTextAtEvent` walks backward and returns the first `activeQuery` from a store snapshot, falling back to the nearest input event's `text` field. This ensures every event index can report the editor text, even if there are gaps between snapshots
- **Direct `InputEvent` usage in `applyEvent`**: When replay steps to an `InputEvent`, `applyEvent` uses the event's `text` and `cursor` directly instead of going through `getEditorTextAtEvent`. This is more precise because input events carry the exact text+cursor at that moment, while the backward-walk approach might skip back to a stale event
- **Store state restoration during replay**: Autocomplete context detection depends on schema types being correct. Without restoring the Zustand store state during replay, autocomplete shows wrong options (using current live types instead of recorded types). The fix: save a backup of all stores before replay starts, restore from `store-snapshot` data during replay (preferring `fullTypes` for perfect `isReference`/`isArray` preservation), and restore the backup on session destroy
- **`fullTypes` in snapshots**: The `summarizeTypes()` function strips `isReference` and `isArray` from schema types. For replay restoration to work correctly, we store the full un-summarized types alongside the summarized ones as `schemaStore.fullTypes`. Old recordings without `fullTypes` fall back to the summarized `types` — not perfect, but better than using the live session's unrelated types
- **Zustand `setState` with internal types**: Store state interfaces are not exported. Using `setState({ ... } as unknown as Parameters<typeof useXStore.setState>[0])` bypasses TypeScript while working correctly at runtime because Zustand's `setState` does a shallow merge — only the data fields are replaced, action functions remain untouched

