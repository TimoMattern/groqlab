# Connection Management

## Purpose

Allow users to save, manage, test, and switch between Sanity project/dataset connections. Each connection is identified by a project ID + dataset pair and optionally a display name.

## Data Model

```typescript
interface ConnectionConfig {
  id: string;          // crypto.randomUUID()
  name: string;        // Display name (falls back to projectId)
  projectId: string;   // Sanity project ID (e.g., "abc123")
  dataset: string;     // Dataset name (e.g., "production")
  createdAt: string;   // ISO timestamp
}

type ConnectionStatusValue = "unknown" | "checking" | "online" | "error";

interface ConnectionStatus {
  status: ConnectionStatusValue;
  error?: string;
  lastChecked?: string; // ISO timestamp
}
```

## Components

### ConnectionDialog (`src/components/connection/ConnectionDialog.tsx`)

- **Props**: `open`, `onClose`, `connection?` (for editing)
- **Fields**: Project ID (required), Dataset (required), Display Name (optional)
- **Validation**: Both Project ID and Dataset must be non-empty
- **Test Connection**: Calls `POST /api/test-connection`, shows success/failure message
- **Save**: Creates new connection or updates existing one
- **Auto-select**: New connections are set active immediately
- **Edit mode**: Pre-fills fields from existing connection

### ConnectionList (`src/components/connection/ConnectionList.tsx`)

- **Props**: `onAdd`, `onEdit`
- **Features**:
  - Lists all saved connections with status dot indicator
  - Click to select active connection
  - Inline test/refresh button (with spin animation during check)
  - Edit button (pencil icon, visible in each row)
  - Delete button (trash icon, visible in each row)
  - Long connection names truncate so action buttons remain visible
  - Empty state: "No connections yet."
  - Hydration guard: Shows empty state before localStorage is read

### Status Indicator Colors

| Status | Color |
|--------|-------|
| `online` | `bg-green-500` |
| `error` | `bg-red-500` |
| `checking` | `bg-yellow-400` |
| `unknown` | `bg-muted-foreground` |

## Store: `connection-store.ts`

Persistence keys in localStorage:
- `groqlab:connections` — `JSON.stringify(ConnectionConfig[])`
- `groqlab:activeId` — string ID or null
- `groqlab:conn-status:{id}` — per-connection status cache

### Actions

| Action | Description |
|--------|-------------|
| `addConnection(config)` | Appends connection + sets status to "checking" |
| `updateConnection(id, updates)` | Partial update (name, projectId, dataset) |
| `removeConnection(id)` | Removes from list, clears status, clears activeId if was active |
| `setActive(id)` | Sets active connection, persists to localStorage |
| `setConnectionStatus(id, status)` | Updates status, persists per-connection |
| `setConnections(connections)` | Replaces full list (bulk operation) |

### Selector Helpers

```typescript
getActiveConnection(): ConnectionConfig | null
```

## Hook: `useConnections.ts`

Encapsulates connection CRUD + auto-status-checking.

### Auto Status Check (`useActiveConnectionCheck`)

When `activeId` changes and the connection's current status is not `"online"` or `"checking"`, automatically calls `POST /api/test-connection` and updates the status. Uses a `useRef` guard to prevent duplicate checks for the same connection.

### API Wrapper

```typescript
testConnection(projectId, dataset): Promise<{ success, projectName?, error? }>
```

Calls `POST /api/test-connection` with `{ projectId, dataset }`. Catches network errors and returns `{ success: false, error: "..." }`.

## API Route: `POST /api/test-connection`

- **Input**: `{ projectId, dataset }`
- **URL**: `https://{projectId}.api.sanity.io/v2026-02/data/query/{dataset}`
- **Query**: `count(*[_type == "sanity.document.type"][0..1])`
- **Response**: `{ success: true, projectName }` or `{ success: false, error }`
- **Error handling**: HTTP errors, Sanity API errors, network errors

## Lessons Learned

1. **Hydration guard pattern**: Components that read from localStorage must use a `hydrated` state (initialized via `useEffect`) to avoid SSR/SSR hydration mismatches. Without this, the server renders empty state, then client immediately shows data, causing a flash.

2. **Per-connection status caching**: Storing statuses per connection in localStorage means status survives page reloads. This is important because checking a connection takes 200-500ms and users don't want to wait on every load.

3. **Ref-based guard for auto-checks**: The `checkedRef` pattern prevents duplicate API calls when the component re-renders. Without it, React Strict Mode's double-invocation in dev would trigger two simultaneous checks.

4. **`getActiveConnection()` is a store getter, not a hook**: Defined as a regular function using `useConnectionStore.getState()`, so it can be called from non-React code (e.g., `useQuery.ts`) without hook constraints.

5. **Connections have no API tokens**: The app relies on public/CDN Sanity access. Private datasets would need token support added in the future.

6. **Invisible row actions are not discoverable**: Edit/delete existed behind opacity-only hover styling, but users reasonably perceived the list as add-only. Connection management actions need visible icon buttons in each row, not controls that only appear when hovering a hidden target.

7. **Flex truncation needs `min-w-0`**: A `truncate` class alone is not enough in a flex row. The row and text container must allow shrinking (`min-w-0`) and the action button group must be `shrink-0`, otherwise long connection names push edit/delete out of view.
