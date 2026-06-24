# State Management

## Overview

All client-side state is managed with **Zustand v5**. There are four stores, each responsible for a distinct domain. No React Context is used.

## Stores

### 1. `connection-store.ts`

**Purpose**: Manage saved Sanity connections and their statuses.

**Persistence**: localStorage (`groqlab:connections`, `groqlab:activeId`, `groqlab:conn-status:{id}`)

| Slice | Type | Persisted |
|-------|------|-----------|
| `connections` | `ConnectionConfig[]` | Yes |
| `activeId` | `string \| null` | Yes |
| `statuses` | `Record<string, ConnectionStatus>` | Yes (per connection) |

**Selective subscription pattern**:
```typescript
// Good — only subscribes to `activeId`
const activeId = useConnectionStore((s) => s.activeId);

// Bad — subscribes to all state changes
const { connections, activeId } = useConnectionStore();
```

**Getter for non-React code**:
```typescript
export function getActiveConnection(): ConnectionConfig | null {
  const { connections, activeId } = useConnectionStore.getState();
  return connections.find((c) => c.id === activeId) ?? null;
}
```

### 2. `schema-store.ts`

**Purpose**: Cache fetched schemas per connection ID.

**Persistence**: None (in-memory only)

| Slice | Type |
|-------|------|
| `types` | `Record<connectionId, SchemaType[]>` |
| `isLoading` | `Record<connectionId, boolean>` |
| `error` | `Record<connectionId, string \| null>` |

**Key helper**:
```typescript
resolveRefType(ref: string, schemaTypes: SchemaType[]): string | undefined
```

### 3. `result-store.ts`

**Purpose**: Hold the current query result (ephemeral).

**Persistence**: None

| Slice | Type |
|-------|------|
| `data` | `unknown` |
| `durationMs` | `number \| null` |
| `documentCount` | `number \| null` |
| `error` | `string \| null` |
| `isLoading` | `boolean` |

### 4. `history-store.ts`

**Purpose**: Persist query execution history.

**Persistence**: localStorage (`groqlab:history`), max 100 entries

| Slice | Type |
|-------|------|
| `entries` | `HistoryEntry[]` |

## Key Patterns

### Selective Subscriptions

Always subscribe to the minimum needed slice:

```typescript
// Component only needs isLoading
const isLoading = useResultStore((s) => s.isLoading);

// Component needs both data and error
const data = useResultStore((s) => s.data);
const error = useResultStore((s) => s.error);
```

Never destructure the full store:
```typescript
// WRONG — re-renders on ANY state change
const { data, error, isLoading } = useResultStore();
```

### localStorage Persistence

All persistence is manual (no middleware like `zustand/middleware`):

```typescript
const STORAGE_KEY = "groqlab:connections";

function loadConnections(): ConnectionConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConnections(connections: ConnectionConfig[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
  } catch {
    // Storage full or unavailable — silently fail
  }
}
```

### Hydration Guard

Components that read from localStorage use a hydration guard to prevent SSR mismatches:

```typescript
const [hydrated, setHydrated] = useState(false);
useEffect(() => { setHydrated(true); }, []);

if (!hydrated) {
  return <LoadingSkeleton />;
}
```

### Loading/Error Pattern

The schema store uses parallel loading and error maps:

```typescript
setLoading(connectionId, true);
setError(connectionId, null);
try {
  const result = await fetchSchema(connection);
  setTypes(connectionId, result);
} catch (e) {
  setError(connectionId, err.message);
} finally {
  setLoading(connectionId, false);
}
```

### Store Actions Pattern

Actions are defined inside the store creator function, not as separate files:

```typescript
export const useConnectionStore = create<ConnectionState>((set) => ({
  // state
  connections: [],
  activeId: null,

  // actions — mutate state + persist
  addConnection: (connection) => {
    set((state) => {
      const connections = [...state.connections, connection];
      saveConnections(connections);
      return { connections };
    });
  },
}));
```

## Lessons Learned

1. **Zustand over Context**: Using React Context for global state causes unnecessary re-renders of entire subtrees. Zustand's selector-based subscriptions are fine-grained. A component that subscribes to `(s) => s.isLoading` only re-renders when `isLoading` changes.

2. **Manual persistence is simple and explicit**: Zustand's `persist` middleware is powerful but opaque. Manual `load/save` functions with try/catch give us full control over error handling and migration strategies.

3. **`getState()` bridges React and non-React code**: The `getActiveConnection()` getter is the primary example. It's called from `useQuery.ts` which is a React hook, but the pattern works for any module that imports the store.

4. **No editor store**: The original plan included `editor-store.ts` for editor tabs, content, and cursor position. This was not implemented. Query tabs, query text, and per-tab result state live in React component state (`useState` in `page.tsx`).

5. **Silent localStorage failures**: If localStorage is full or unavailable (private browsing in some browsers), the try/catch around `setItem` silently fails. This means connections/history may not persist, but the app continues to work in the session.
