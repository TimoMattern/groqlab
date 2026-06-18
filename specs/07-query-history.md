# Query History

## Purpose

Persistently store recently executed queries so users can review, reuse, and manage their query history. Each entry records the query text, which connection it ran against, execution metadata, and whether it succeeded or failed.

## Data Model

```typescript
interface HistoryEntry {
  id: string;              // crypto.randomUUID()
  query: string;
  connectionId: string;
  connectionName: string;
  executedAt: string;      // ISO timestamp
  durationMs: number;
  documentCount: number;
  success: boolean;
  error?: string;
  resultPreview?: string;  // Truncated to 200 chars
}
```

## Component: `HistoryPanel`

**File**: `src/components/history/HistoryPanel.tsx`

### Features

- **Entry list**: Reverse chronological (newest first)
- **Click to reuse**: Click an entry to load its query into the editor
- **Success/error indicator**: Green checkmark or red X icon
- **Metadata**: Execution timestamp, duration, document count, connection name
- **Error display**: Red truncated error message on failed queries
- **Individual delete**: Per-entry trash button (shown on hover)
- **Clear all**: Button in header to remove all entries
- **Empty state**: "No query history yet."

### Props

```typescript
interface HistoryPanelProps {
  onReuse: (query: string) => void;
}
```

## Store: `history-store.ts`

**File**: `src/stores/history-store.ts`

### Persistence

- **Key**: `groqlab:history`
- **Format**: `JSON.stringify(HistoryEntry[])`
- **Max entries**: 100 (oldest are dropped when adding new)

### Actions

| Action | Description |
|--------|-------------|
| `addEntry(entry)` | Prepends entry with generated `id` + `executedAt`, truncates `resultPreview` to 200 chars, slices to 100 entries |
| `removeEntry(id)` | Removes single entry by ID |
| `clearHistory()` | Removes all entries |

### Entry Creation (in `useQuery.ts`)

Both success and failure create history entries:

```typescript
// Success
addHistoryEntry({
  query,
  connectionId,
  connectionName,
  durationMs: result.durationMs,
  documentCount: result.documentCount,
  success: true,
  resultPreview: JSON.stringify(result.data),
});

// Error
addHistoryEntry({
  query,
  connectionId,
  connectionName,
  durationMs: 0,
  documentCount: 0,
  success: false,
  error: err.message,
});
```

## Integration with Query Execution

History entries are created inside `useQuery.runQuery()`:

```
runQuery(query)
  → executeQuery(connection, query)
  → on success:
      setResult(data, durationMs, documentCount)
      addHistoryEntry({ success: true, ... })
  → on error:
      setError(message)
      addHistoryEntry({ success: false, error, ... })
```

## Reuse Flow

```
User clicks history entry
  → HistoryPanel onReuse(entry.query)
  → page.tsx handleReuseQuery(query)
    → setQuery(query) in editor state
      → QueryEditor useEffect detects value change
        → dispatches change to CM6 EditorView
```

## Lessons Learned

1. **Keep full queries, not just summaries**: History stores the complete query text. This is essential for the "reuse" feature (load query back into editor). Some apps only store summaries, which defeats the purpose.

2. **Result previews must be truncated**: Raw query results can be megabytes. The `truncate()` function limits `resultPreview` to 200 characters to keep localStorage usage reasonable.

3. **Max cap of 100 entries**: This prevents the localStorage from growing unbounded. At ~200 bytes per entry (conservative estimate), 100 entries = ~20KB, well within localStorage limits.

4. **History is per-app, not per-connection**: All connections share the same history list. If you switch connections, you still see queries from the previous connection. This is by design but could be changed to filter by `connectionId`.

5. **History survives page reloads and tab closes**: Persisted to localStorage. This is essential for developer workflow — you can close the browser and come back to your queries.

6. **No "search history" feature yet**: The original spec mentioned history search. Not implemented. Users scroll through the list or use the clear button.
