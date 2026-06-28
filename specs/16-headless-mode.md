# Headless Mode — Programmatic App Control

## Purpose

Allow external scripts, tests, CI pipelines, and AI agents to drive the full GroqLab application programmatically — without requiring a browser UI or manual interaction.

The flight recorder (spec 15) introduced passive recording and a `window.__FLIGHT__` command interface. Headless mode builds on that foundation by:

1. Exposing self-contained commands (query execution, connection testing, schema fetching) over an **HTTP API** so any HTTP client (curl, scripts, CI) can drive a running instance
2. Providing a **`HeadlessDriver` class** for Node.js that wraps the HTTP API
3. Adding a **CLI script** (`scripts/headless.ts`) for common one-shot operations
4. Adding **convenience methods** on `window.__FLIGHT__` for driving the app from the browser console
5. Adding new command cases to `FlightRecorder.executeCommand` for query execution and connection/schema management

## Data Model

### HeadlessCommand — Same as FlightCommand

Reuses `FlightCommand` from flight-recorder:

```typescript
interface HeadlessCommand {
  id: string;
  command: string;
  args: Record<string, unknown>;
  timestamp: number;  // 0 = execute now
}
```

### HeadlessResponse

```typescript
interface HeadlessResponse {
  data?: unknown;
  error?: string;
  commandId: string;
  durationMs: number;
}
```

HTTP status codes: `200` on success (data present), `400` for invalid request, `404` for unknown command, `500` for command execution error.

## Implementation

The system has two independent layers:

**Server-side HTTP API** (`/api/headless`): Handles commands that don't need browser state — query execution, connection testing, schema fetching. These call the Sanity API directly.

**Browser-side FlightRecorder** (`FlightRecorder.executeCommand`): Handles all commands including store operations, recording, and autocomplete. These have access to Zustand stores and the DOM.

### 1. Headless HTTP API Route (`src/app/api/headless/route.ts`)

A Next.js API route that handles self-contained commands server-side. It does NOT proxy through FlightRecorder (API routes can't access browser-side singletons).

```
POST /api/headless
Body: { command, args }
Response: { data, commandId, durationMs }
```

Commands supported server-side:

| Command | Notes |
|---------|-------|
| `query.execute` | Accepts `{ query, connection: { projectId, dataset, token? }, params? }`. Calls Sanity API directly. Returns `{ data, durationMs, documentCount }` |
| `connection.test` | Accepts `{ projectId, dataset }`. Calls Sanity API test endpoint |
| `schema.fetch` | Accepts `{ connection: { projectId, dataset, token? } }`. Infers schema from document samples (same logic as `/api/schema`) |
| `autocomplete.trigger` | Accepts `{ before, types? }`. Synthesizes a `CompletionContext` from the `before` text, injects types (if provided) into a local Zustand store, calls `groqCompletionSource`. Returns `{ from, options: [{ label, type, detail, apply?, boost? }] }`. Functions in `apply` fields are stripped — only string `apply` values survive serialization |

Store/recording commands (`store.*`, `recording.*`, `connection.add`, `connection.setActive`) return HTTP 400 — they require the browser context with `window.__FLIGHT__`.

### 2. `FlightRecorder.executeCommand` — New Browser-Side Commands

The following command cases are added to `FlightRecorder.executeCommand` for browser use:

| Command | Implementation |
|---------|---------------|
| `query.execute` | Calls `executeQuery` from `@/lib/sanity-api` using the active connection |
| `connection.list` | Returns `{ connections, activeId, statuses }` from connectionStore |
| `connection.add` | Constructs a `ConnectionConfig` (generates `id` as `projectId/dataset`, `createdAt` as ISO string), calls `addConnection` |
| `connection.setActive` | Calls `setActive` on connectionStore |
| `connection.test` | Calls `testConnection` from `@/lib/sanity-api` |
| `schema.getTypes` | Returns types for the active connection from schemaStore |
| `schema.fetch` | Calls `fetchSchema` from `@/lib/sanity-api`, stores result, returns types |

### 3. `src/lib/headless-driver.ts` — Node.js Driver

A class that POSTs commands to the running app's HTTP API:

```typescript
export class HeadlessDriver {
  constructor(options?: { baseUrl?: string })  // default http://localhost:3000

  executeCommand(command: string, args: Record<string, unknown>): Promise<HeadlessResponse>
  query(groq: string, connection: ConnectionArgs, params?: Record<string, unknown>): Promise<QueryResult>
  testConnection(projectId: string, dataset: string): Promise<{ success: boolean; error?: string }>
  fetchSchema(connection: ConnectionArgs): Promise<SchemaType[]>
}
```

Always communicates via `fetch` to `POST /api/headless`. Browser convenience methods live on `window.__FLIGHT__` instead.

### 3b. Config File (`groqlab.json` / `.groqlabrc`)

A config file discovered by walking up from `cwd`. Stores default connection and server details so CLI flags are not required on every invocation. Two formats are supported:

**JSON** (`groqlab.json`):
```json
{
  "projectId": "abc123",
  "dataset": "production",
  "token": "sk-...",
  "url": "http://localhost:3000"
}
```

**Key-value** (`.groqlabrc`):
```text
projectId: abc123
dataset: production
token: sk-...
url: http://localhost:3000
```

`.groqlabrc` supports these key aliases: `projectId`, `projectid`, `project_id`, `project-id`, `project`. It ignores blank lines and `#` comment lines.

Resolution order (later wins):
1. Config file found in `cwd` or nearest ancestor (`.groqlabrc` or `groqlab.json`)
2. Environment variables: `GROQLAB_PROJECT`, `GROQLAB_DATASET`, `GROQLAB_TOKEN`, `GROQLAB_URL`
3. CLI flags: `--project`, `--dataset`, `--token`, `--url`

CLI flags always override config file and env vars.

### 4. CLI Script (`scripts/headless.ts`)

A `tsx`-runnable CLI that hits the running app's HTTP API:

```
Usage: npx tsx scripts/headless.ts <command> [options]

Commands:
  query <groq>                   Execute a GROQ query
    [--project <id> --dataset <name>]  [--token <key>]
    [--params <json>]

  schema                         Fetch schema for a connection
    [--project <id> --dataset <name>]  [--token <key>]

  connection test                Test a connection
    [--project <id> --dataset <name>]

  autocomplete <before-text>     Get completions for text before cursor
    [--project <id> --dataset <name>]   (optional, improves completions with schema)

  batch <file>                   Run commands from a JSON file

  recording / snapshot / export  Browser-only — hints at using window.__FLIGHT__

Options:
  --json                         Raw JSON output
  --url <url>                    App URL (default: http://localhost:3000)

Connection defaults are read from `groqlab.json`, environment variables, then CLI flags.
CLI flags override env vars, which override the config file.
```

Browser-only commands (`recording`, `snapshot`, `export`) print a message directing the user to the browser console and `window.__FLIGHT__`.

### 5. Enhanced `window.__FLIGHT__` Global

Convenience methods added to `setupFlightGlobal()`:

```typescript
interface Window {
  __FLIGHT__?: {
    // existing: recorder, execute, getState, export, import, start, stop, setQuery

    // New convenience methods (call executeCommand internally):
    query: (groq: string, params?: Record<string, unknown>) => Promise<QueryResult>;
    connect: (projectId: string, dataset: string, token?: string) => Promise<ConnectionConfig>;
    autocomplete: (before: string) => Promise<CompletionResult | null>;
    schema: () => Promise<SchemaType[]>;
    snapshot: () => Promise<object>;  // serialized store state
  };
}
```

### 6. Test Helpers (`src/lib/headless-test-utils.ts`)

```typescript
import { HeadlessDriver } from "./headless-driver";

export function createTestDriver(baseUrl?: string): HeadlessDriver {
  return new HeadlessDriver({ baseUrl: baseUrl ?? "http://localhost:3000" });
}
```

### 7. Tests (`src/lib/headless.test.ts`)

26 tests covering the full headless stack in a pure Node environment (`// @vitest-environment node`):

| Group | Tests | What it validates |
|-------|-------|-------------------|
| `localStorage polyfill` | 4 | Polyfill works without jsdom: `getItem`, `setItem`, `removeItem`, `clear`, `length`, and `connection-store` imports without throwing |
| `store injection + autocomplete` | 14 | After `setState()` injection (same sequence as API route), `groqCompletionSource` returns correct completions: schema-free fallback, type names in string context, field names in projection/filter context, pipeline stages, function names, `from` position, serialization strips function-valued `apply`, preserves string `apply`, JSON-roundtrips |
| `HeadlessDriver` | 7 | Construction with/without `baseUrl`, HTTP error propagation, `executeCommand`/`query`/`testConnection`/`autocomplete` responses with mocked `fetch` |
| `createTestDriver` | 2 | Creates properly configured driver instances |

The `localStorage` polyfill test is the most critical — it validates that the same trick the API route uses (polyfill → dynamic import → `setState()`) works in a Node.js environment without jsdom, which is exactly what Next.js API routes run in.

### 8. Integration with Flight Recorder

The HTTP API and `window.__FLIGHT__` are independent but complementary:

- HTTP API handles server-side commands (`query.execute`, `connection.test`, `schema.fetch`)
- Browser `window.__FLIGHT__` handles store/recording/autocomplete commands
- To record a headless session, start recording via `window.__FLIGHT__.start()` in the browser, then drive queries via curl, and export via `window.__FLIGHT__.export()`

### 9. Script Examples

```bash
# Execute a query
npx tsx scripts/headless.ts query '*[_type == "movie"][0..5]' \
  --project abc123 --dataset production --json

# Fetch schema
npx tsx scripts/headless.ts schema \
  --project abc123 --dataset production

# Test a connection
npx tsx scripts/headless.ts connection test \
  --project abc123 --dataset production

# Batch commands from file
npx tsx scripts/headless.ts batch ./test-session.json

# Autocomplete with schema awareness
npx tsx scripts/headless.ts autocomplete '*[_type == "movie"][' \
  --project abc123 --dataset production --json
```

## Key Logic

### Two Independent Layers

The HTTP API and `FlightRecorder.executeCommand` are independent. The HTTP API runs server-side and handles self-contained operations (query.execute, connection.test, schema.fetch). The FlightRecorder runs browser-side and handles everything including store access and recording. They share no state.

### HTTP API: Connection Required in Every Command

Unlike the browser-side FlightRecorder which uses the "active connection" from the store, the HTTP API requires `connection` arguments (`{ projectId, dataset, token? }`) in every command. The HTTP API has no session state — each request is self-contained. This makes it stateless and suitable for CI/scripts.

### Error Propagation

HTTP API errors return HTTP 500 with a structured response containing an `error` field. Never an unhandled exception.

### CLI Requires Running Server

The CLI always hits `POST /api/headless`. If no `--url` is given it defaults to `http://localhost:3000`. Fails with a clear error if the server isn't reachable.

### Autocomplete Works Server-Side

`autocomplete.trigger` is fully available in the HTTP API. The secret: `@codemirror/state`'s `EditorState` and `@codemirror/autocomplete`'s `CompletionContext` are pure JS — no DOM needed. The only blocker was that `groqCompletionSource` calls `getActiveConnection()` and `useSchemaStore.getState().getTypes()`, both of which read from Zustand stores.

Solution: The API route polyfills `localStorage` (needed at connection-store module init time) before dynamically importing the store modules, then calls `setState()` to inject a dummy connection and the user-provided schema types. After that, `groqCompletionSource` runs identically to the browser.

If no schema types are provided, autocomplete returns schema-free completions (keywords, operators, functions, snippets). If types are provided, field-aware completions (projection fields, filter fields, string-value type names) work fully.

The CLI's `autocomplete` command optionally accepts `--project` / `--dataset` to fetch schema types first:

```bash
npx tsx scripts/headless.ts autocomplete '*[_type == "movie"][' \
  --project abc123 --dataset production
```

### Browser-Only Commands

Store operations (`store.*`), recording (`recording.*`), and connection management commands (`connection.add`, `connection.setActive`, `connection.list`) are only available browser-side because they depend on Zustand store state that lives in the browser session. The CLI prints a hint directing the user to the browser console.

`autocomplete.trigger` and `autocomplete.detectContext` were previously in this category but now run server-side — see above.

## Files

| File | Status |
|------|--------|
| `src/lib/flight-recorder.ts` | Modified — added `ConnectionConfig` import, `query.execute`, `connection.*`, `schema.*` command cases, convenience methods on `window.__FLIGHT__` |
| `src/app/api/headless/route.ts` | Created — `POST /api/headless`, handles `query.execute`, `connection.test`, `schema.fetch` server-side |
| `src/lib/headless-driver.ts` | Created — Node.js driver class, wraps HTTP API, includes `autocomplete()`, `CompletionOption`, `CompletionResult` types |
| `src/lib/headless-config.ts` | Created — loads config from `groqlab.json` / `.groqlabrc`, env vars, with CLI flag overrides |
| `src/lib/headless-test-utils.ts` | Created — `createTestDriver()` helper |
| `src/lib/headless.test.ts` | Created — 26 tests for polyfill, store injection, autocomplete parity, HeadlessDriver, serialization; updated for config |
| `scripts/headless.ts` | Created — CLI for `query`, `schema`, `connection test`, `batch`; reads config for defaults |

## Lessons Learned

- **HTTP API cannot access browser singletons**: Next.js API routes run in a separate server context from client components. The `FlightRecorder` singleton and Zustand stores live in the browser JS context and are inaccessible from API routes. The API route must handle commands independently by calling the Sanity API directly
- **Two-layer architecture is the right trade-off**: Rather than fighting the server/client split, accept it. The HTTP API handles self-contained operations (query, schema fetch, connection test). Browser-side `window.__FLIGHT__` handles store operations, recording, and autocomplete. Each layer does what it can do naturally
- **HTTP API is stateless by design**: Every command carries its own connection details. No session management, no cookies, no auth tokens to manage. This makes the API trivially usable from curl, CI, and test scripts
- **CLI always needs the server**: Query execution, schema fetching, and connection testing all talk to Sanity via the Next.js API routes. The CLI can't bypass the server because the server holds the API proxy logic and CORS bypass. For local dev, run `npm run dev` in parallel
- **Autocomplete runs server-side with the same code**: `groqCompletionSource` calls Zustand stores via `getState()`, which is pure JS — no React, no DOM. A `localStorage` polyfill (needed at connection-store init time) plus `setState()` to inject a dummy connection and schema types is all it takes. The browser and server run identical completion logic, guaranteeing consistent results between the editor and the headless API
- **`window.__FLIGHT__` convenience methods reduce friction**: `window.__FLIGHT__.query(groq)` and `window.__FLIGHT__.connect(id, dataset)` are much simpler to type in a console than constructing `FlightCommand` objects. They make the global feel like a first-class API
- **Batch commands enable reproducible sessions**: The `batch` CLI command lets you define complete sessions as JSON files checked into the repo for reproducible debugging
- **Config file mirrors Sanity conventions**: Using `groqlab.json` discovered by walking up from `cwd` (same pattern as `sanity.json`) makes the CLI feel familiar to Sanity users. Three-layer resolution (config → env → flags) is standard and predictable
- **`groqlab.json` keeps tokens out of shell history**: Writing the token in a config file (`.gitignore`d) is safer than passing `--token` on every CLI invocation, which leaks into shell history. The config file should be listed in `.gitignore`
