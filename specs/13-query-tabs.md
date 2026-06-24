# Query Tabs

## Purpose

Allow users to work with multiple independent GROQ queries in one session. Each tab owns both its query text and its latest result state, so users can switch between queries without losing either the editor contents or the result output.

## Data Model

```typescript
interface QueryTabResult {
  data: unknown;
  durationMs: number | null;
  documentCount: number | null;
  error: string | null;
  isLoading: boolean;
}

interface QueryTab {
  id: string;      // crypto.randomUUID()
  title: string;   // "Query 1", "Query 2", ...
  query: string;
  result: QueryTabResult;
}
```

Tabs are ephemeral React state in `src/app/page.tsx`. They are not persisted to localStorage.

## Component API

### QueryTabs (`src/components/editor/QueryTabs.tsx`)

```typescript
interface QueryTabsProps {
  tabs: QueryTab[];
  activeTabId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
}
```

- Renders a horizontal tab strip above the query editor.
- The active tab is visually connected to the editor.
- The final remaining tab cannot be closed.
- Closing the active tab selects the nearest remaining tab, preferring the previous tab.
- Long tab labels truncate so the close button stays visible.

## Store Actions

No Zustand store is introduced for tabs. The page owns the tab state because no other component needs to subscribe to all tabs.

| Action | Behavior |
|--------|----------|
| `addTab()` | Creates an empty query tab and selects it |
| `closeTab(id)` | Removes a tab; if active, selects a neighboring tab |
| `setActiveQuery(value)` | Updates the active tab query |
| `setActiveResult(update)` | Updates the active tab result state |
| `clearActiveTab()` | Clears active tab query and result |

## Key Logic

- Run executes only the active tab's query.
- While a tab query is running, only that tab's result shows loading.
- Successful execution writes data, duration, and document count to the active tab.
- Failed execution writes the error to the active tab.
- Switching tabs swaps both editor content and visible result.
- The editor is keyed by active tab id and the CodeMirror update listener calls the latest `onChange` callback via a ref, so text entered after switching tabs updates the selected tab rather than the tab that mounted the editor first.
- Schema insertion appends to the active tab query.
- History reuse replaces the active tab query and leaves other tabs untouched.
- The toolbar trash button and clear keyboard shortcut clear only the active tab's query/result.

## Result Panel Integration

`ResultPanel` keeps its existing store-backed behavior by default, but accepts an optional `result` prop. The tabbed page passes the active tab result through that prop, while existing tests and isolated usages can continue to rely on `useResultStore`.

## Lessons Learned

1. **Results must move with tabs**: Keeping queries per tab but results global creates confusing stale output. The result state belongs on the same tab object as the query text.

2. **The result store can remain as a compatibility default**: Adding an optional prop to `ResultPanel` avoids a broad store migration while still enabling per-tab results in the page.

3. **Closing tabs needs deterministic selection**: Selecting the previous tab when possible matches common editor behavior and avoids jumping to the first tab unexpectedly.

4. **CodeMirror listeners can capture stale React callbacks**: `EditorView.updateListener` is registered once when the editor mounts. Without an `onChangeRef`, switching tabs can leave the listener writing edits into the old active tab.
