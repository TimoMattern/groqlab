# Query Execution

## Purpose

Execute GROQ queries against Sanity datasets via a proxy pattern that avoids browser CORS restrictions.

## Architecture

```
Browser → POST /api/query (same-origin) → Next.js server → POST api.sanity.io (server-to-server) → Response
```

## API Route: `POST /api/query`

**File**: `src/app/api/query/route.ts`

### Request

```json
{
  "connection": { "projectId": "abc123", "dataset": "production" },
  "query": "*[_type == \"movie\"]",
  "params": {}  // optional
}
```

### Processing

1. Validate required fields (projectId, dataset, query)
2. Build URL: `https://{projectId}.api.sanity.io/v2026-02/data/query/{dataset}`
3. Send POST with `Content-Type: application/json` and query body
4. Measure wall-clock time with `performance.now()`
5. Parse response

### Error Handling

| HTTP Status | Error Kind | Message |
|-------------|------------|---------|
| 400 (missing params) | `"Query"` | "Missing connection or query parameters" |
| 401 | `"Connection"` | "Unauthorized. The dataset may be private." |
| 429 | `"Query"` | "Rate limited. Try again shortly." |
| Other 4xx/5xx | `"Query"` | Parsed from Sanity error body |
| Sanity API error in body | `"Query"` | `json.error.description` or `json.error.message` |
| Network/fetch error | `"Connection"` | "Network error. Check your connection." |

### Success Response

```json
{
  "data": { /* query result */ },
  "durationMs": 123,
  "documentCount": 42
}
```

`documentCount` is `result.length` for arrays, `1` for objects.

## Client: `sanity-api.ts`

**File**: `src/lib/sanity-api.ts`

Typed fetch wrappers that all components/hooks use:

```typescript
executeQuery(connection, query, params?): Promise<QueryResult>
testConnection(projectId, dataset): Promise<{ success, projectName?, error? }>
fetchSchema(connection): Promise<SchemaType[]>
```

## Hook: `useQuery.ts`

**File**: `src/hooks/useQuery.ts`

```typescript
function useQuery() {
  const runQuery = useCallback(async (query: string) => {
    // 1. Get active connection via getActiveConnection()
    // 2. If no active connection → setError("No active connection...")
    // 3. setLoading(true)
    // 4. Call executeQuery(connection, query)
    // 5. On success: setResult(data, durationMs, documentCount)
    //    + addHistoryEntry({ query, connectionId, ...success data })
    // 6. On error: setError(message)
    //    + addHistoryEntry({ query, connectionId, ...error data })
  }, []);
  return { runQuery };
}
```

### Error Casting Pattern

```typescript
catch (e: unknown) {
  const err = e as { kind?: string; message?: string };
  setError(err.message ?? "An unknown error occurred");
}
```

## Flow Diagram

```
User presses Ctrl+Enter or clicks Run
  → handleRun() in page.tsx
    → runQuery(query) in useQuery
      → getActiveConnection()
      → setLoading(true)
      → executeQuery(connection, query) in sanity-api.ts
        → fetch("POST /api/query", { connection, query })
          → Next.js API Route
            → fetch("POST api.sanity.io/data/query/{dataset}", { query })
            → measure duration
            → return { data, durationMs }
        → return QueryResult
      → setResult(data, durationMs, documentCount)
      → addHistoryEntry({ query, ... })
```

## Security Considerations

- No API tokens are sent by the current app (public datasets only)
- The proxy does not require CORS configuration in the Sanity project
- All requests are HTTPS
- No logging of connection details on the server

## API Version

Hardcoded as `v2026-02-01` in both `/api/query` and `/api/test-connection`. The `/api/schema` route uses `v2021-06-07` for the CDN endpoint.

## Lessons Learned

1. **Proxy eliminates CORS as a failure point**: Before this architecture, users had to manually configure CORS origins in their Sanity project settings. This was friction (finding the right URL) and a security concern (opening browser access). The Next.js proxy removes both issues.

2. **`performance.now()` on the server**: The API route calls `performance.now()` in the Next.js server process. This measures server-to-Sanity latency, not browser-to-server latency. The duration shown in the UI is the Sanity backend time, which is what users actually care about.

3. **No Sanity SDK dependency**: The app uses raw `fetch()` calls to the Sanity REST API rather than `@sanity/client`. This reduces bundle size and keeps the proxy layer simple.

4. **`getActiveConnection()` is a simple getter**: Not a hook. Defined in `connection-store.ts` using `useConnectionStore.getState()` so it can be called from any context without hook constraints.

5. **Error shape from API routes**: Errors are sent as `{ kind: string, message: string }` (not `Error` instances) because the browser receives them via HTTP JSON. The catch pattern in `useQuery` uses type assertion.
