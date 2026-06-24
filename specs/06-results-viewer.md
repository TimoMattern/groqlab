# Results Viewer

## Purpose

Display GROQ query results in three view modes: JSON Tree (interactive expand/collapse), Table (sortable, virtual-scrolled), and Raw (formatted JSON).

## Component: `ResultPanel`

**File**: `src/components/results/ResultPanel.tsx`

`ResultPanel` reads from `useResultStore` by default, but can receive a `result` prop for tab-scoped result state.

### States

| State | Display |
|-------|---------|
| **Loading** | Spinning `Loader2` icon + "Running query..." |
| **Error** | Red `AlertCircle` icon + error message |
| **Empty** (data is null) | "Run a query to see results" |
| **Data** | Metadata bar + selected view |

### View Mode Switcher

Three toggle buttons in a segmented control:

| Mode | Icon | Label | Available When |
|------|------|-------|----------------|
| Tree | `ListTree` | Tree | Always |
| Raw | `Code2` | Raw | Always |
| Table | `Table2` | Table | Only when result is a non-empty array |

### Metadata Bar

Shows between results and the view selector:
- Document count (e.g., "42 documents")
- Execution duration (e.g., "123ms" or "1.23s")

Uses `formatDuration()` from `src/lib/utils.ts`.

## View: JSON Tree (`JsonTreeViewer.tsx`)

**File**: `src/components/results/JsonTreeViewer.tsx`

Recursive component that renders JSON data as an interactive tree:

### Features

- **Expand/collapse**: Click toggles node expansion (initial depth: 2)
- **Depth limit**: Configurable `maxDepth` prop (default: 10), shows `[N items]` or `{...}` beyond limit
- **Syntax highlighting**:
  - Strings: green
  - Numbers: blue
  - Booleans: purple
  - Null: muted
  - Keys: default foreground
- **Border guides**: Left border per depth level for visual hierarchy
- **Empty handling**: `[]`, `{}` shown inline in muted color

### Node Components

```
NodeValue (recursive)
  ├── Primitive → inline colored text
  ├── Object → toggleable `{N keys}` → list of key: value pairs
  └── Array → toggleable `[N items]` → indexed list of values
```

## View: Table (`TableView.tsx`)

**File**: `src/components/results/TableView.tsx`

Virtual-scrolled table view for arrays of objects, using `@tanstack/react-virtual`.

### Features

- **Dynamic columns**: Auto-detected from union of all object keys in the array
- **Sortable**: Click column header to sort ascending/descending
- **Resizable columns**: Drag the right edge of column headers to resize (min 120px, default 180px)
- **Virtual scrolling**: Only renders visible rows (overscan: 10) via `useVirtualizer`
- **Expandable rows**: Click a row to expand a detail panel showing the full JSON
- **Cell truncation**: Long values truncated with title tooltip
- **Hide `_index`**: Internal sort index is hidden from display

### Row Virtualization

```typescript
const virtualizer = useVirtualizer({
  count: virtualRows.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: (i) => virtualRows[i].type === "detail" ? 200 : 34,
  overscan: 10,
});
```

Row height: 34px, Detail panel height: 200px.

### Column Resize

Implemented with `mousedown`/`mousemove`/`mouseup` event listeners on a drag handle at the right edge of each column header. Widths stored in component state (not persisted).

## Store: `result-store.ts`

Ephemeral (no persistence):

```typescript
interface ResultState {
  data: unknown;
  durationMs: number | null;
  documentCount: number | null;
  error: string | null;
  isLoading: boolean;
  setResult(data, durationMs, documentCount): void;
  setError(error): void;
  setLoading(loading): void;
  clear(): void;  // Resets all to initial state
}
```

## Integration

Global results flow: `useQuery.runQuery()` → `executeQuery()` (sanity-api.ts) → `setResult()` → `ResultPanel` re-renders.

Tabbed page flow: active tab query → `executeQuery()` → active tab result state → `<ResultPanel result={activeTab.result} />`.

## Lessons Learned

1. **Table view requires arrays of plain objects**: The table view filters out nulls, primitives, and nested arrays in the result. The "Table" button is disabled with reduced opacity when the data doesn't qualify.

2. **Virtual scrolling complexity**: `@tanstack/react-virtual` requires absolute positioning of rows with `transform: translateY`. This means the table uses `display: flex` on rows instead of standard table layout, which complicates column width management.

3. **Column auto-detection is lossy**: The union of all object keys can produce many columns, and different objects may have different shapes. Arrays of inconsistent objects will have sparse cells.

4. **Tree view depth limit prevents freezes**: Without `maxDepth`, deeply nested objects (e.g., Portable Text blocks) would try to render infinite recursion or enormous trees. Default depth of 10 handles 99% of real data.

5. **No copy/export functionality yet**: The original spec mentioned copy-to-clipboard and JSON download. These are not implemented. Future work.

6. **ResultPanel can be store-backed or prop-backed**: This lets the tabbed page keep independent results per tab without forcing every isolated result test or future usage to adopt tab state.
