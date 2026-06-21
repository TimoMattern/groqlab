# Schema Introspection

## Purpose

Discover and display the schema (document types + object types + their fields) for a Sanity dataset by **sampling documents via GROQ queries** from the CDN endpoint — no API token required.

Originally built around the Sanity Schema API (`api.sanity.io/.../schemas`), that endpoint proved unreliable for datasets deployed via `npx sanity schemas deploy` (returns `[]`). The GROQ-based inference path is now the sole approach.

## How It Works

1. `POST /api/schema` receives `{ connection: { projectId, dataset }, token?: string }`
2. Server queries `https://{projectId}.apicdn.sanity.io/v2021-06-07/data/query/{dataset}` (CDN), with fallback to `api.sanity.io` if CDN fails. If a token is provided, adds `Authorization: Bearer <token>` for private datasets.
3. `array::unique(*[]._type)` returns all document type names in the dataset
4. For each type, fetch up to 5 sample documents via `*[_type == '...'][0...5]`
5. Merge samples into a single document — first non-null value per field wins (captures variant fields like `firstName`+`lastName` vs `name`)
6. Infer fields from the merged document — non-underscore keys become `SchemaField[]`
7. Post-process to resolve references, unknown types, and arrays
8. Extract inline anonymous objects and named array-item objects as `kind: "object"` types
9. Return `{ types: SchemaType[], source: "inference" }` or `{ types: [], error: string }` on failure

## API Route: `POST /api/schema`

- **Input**: `{ connection: { projectId, dataset }, token?: string }`
- **Output**: `{ types: SchemaType[], source: "inference" }`
- Token is optional: with token → adds `Authorization: Bearer <token>` header to CDN request (private datasets); without → CDN with no auth (public datasets)

### Field Inference Rules (`inferFields`)

| Sample Value | `type` | `isArray` | `isReference` |
|---|---|---|---|
| `"hello"` | `"string"` | false | false |
| `42` | `"number"` | false | false |
| `true` | `"boolean"` | false | false |
| `null` | `"unknown"` | false | false |
| `{ _ref: "abc-123" }` | inferred from prefix | false | true |
| `{ _type: "slug", current: "..." }` | `"object"` | false | false |
| `[{ _ref: "a-1" }, { _ref: "b-2" }]` | inferred from prefix | true | true |
| `[{ _type: "castMember", ... }]` | `"castMember"` | true | false |

### Post-Processing Order

Three passes run sequentially:

1. **`postProcessInferredTypes`** — Resolve `"unknown"` field types by matching field name to known type names. Match array fields to singular type names (e.g., `castMembers` → `castMember`). Resolve reference fields with fuzzy name matching.

2. **`extractInlineObjectTypes`** — Walk all fields recursively. For fields with `type: "object"` and sub-fields, create a named `kind: "object"` type using the field name. Deduplicates by name.

3. **`extractArrayItemTypes`** — Scan all array fields whose item type is not yet known. Find a typed item in the parent sample document, infer its fields, and create a `kind: "object"` type.

### Error Handling

| Scenario | HTTP | Message |
|----------|------|---------|
| Missing connection params | 400 | `"Missing connection parameters"` |
| Empty dataset (no documents) | 200 | `{ types: [], error: "No document types found in dataset" }` |
| Type list query failed | 200 | `{ types: [], error: <underlying message> }` |
| Catch-all failure | 500 | `{ types: [], error: <underlying message> }` |

## Token Management

The schema route accepts an **optional** token. If provided, it authenticates GROQ queries via `Authorization: Bearer <token>` (supports private datasets). If absent, queries use no auth (public datasets only). The token is persisted in localStorage alongside connection config.

## Component: `SchemaPanel`

### States

| State | Display |
|-------|---------|
| No active connection | `"Select a connection to view schema"` |
| Loading | Spinning refresh icon + `"Loading schema..."` |
| Error | Red error message |
| Loaded + empty types | `"No schema loaded."` with `"Load Schema"` button |
| Loaded + types | Search bar + expandable type tree, grouped by kind |

### Grouping

Types are grouped into two sections (when not searching):

1. **Document Types** — `kind === "document"` (or `kind` unset)
2. **Object Types** — `kind === "object"`

Sections have uppercase label headers. The Object Types section is hidden if no object types exist.
When searching, all matching types appear in a flat list.

### Field Row

Each field shows:
- Chevron (expandable if has sub-fields)
- Field name (bold)
- Type label: `string`, `number`, `castMember[]`, `ref(person)`, etc.

## Prerequisites

The dataset must contain at least one document for schema inference to work. Empty datasets return `{ types: [] }`.

## Lessons Learned

1. **The Sanity Schema API is unreliable**: Despite being the "authoritative source," the endpoint at `api.sanity.io/.../schemas` returns `[]` for datasets deployed via `npx sanity schemas deploy` (the standard workflow). Sample-based GROQ inference is more reliable in practice.

2. **Optional Bearer auth on CDN**: `apicdn.sanity.io` accepts an optional `Authorization: Bearer <token>` header for private datasets. The same CDN host is used regardless — no host switching needed. The route simply adds the header when a token is present.

3. **Inference is lossy but sufficient**: Fields that are `null` in the sample become `"unknown"`. Empty arrays have no element type. References depend on fragile `_ref` prefix parsing. But for autocomplete and schema browsing, the inferred schema is good enough.

4. **Three-pass post-processing is needed**: A single pass can't simultaneously resolve unknown types, extract inline objects, and discover array item types. Running them sequentially (resolve unknowns → inline objects → array items) produces the best results.

5. **Object types must be extracted from sample data**: Named object types like `castMember` don't have their own documents — they exist only as array items within document data. The `extractArrayItemTypes` pass finds them by inspecting sample document arrays directly.

6. **Field name as type name works for extraction**: Using `f.name` as the extracted type name is a reasonable heuristic because Sanity convention names object types after their field (e.g., `address` field → `address` type).

7. **Removing the Schema API simplified the codebase**: No more `ManifestSchemaType` interfaces, no `mapManifestFields`, no `JSON.parse()`, no token validation, no `fetchSchemaFromApi`. The route is now a single-path inference engine.

8. **Multi-sample merge handles variant fields**: Document types like `person` can have `firstName`+`lastName` in some docs and `name` in others. Sampling 5 documents and merging their fields (first non-null per key) produces a union of all fields. This is coarse but captures the schema's flexibility without false positives.

9. **CDN endpoint is not always reliable**: `apicdn.sanity.io` can return unexpected results or fail silently for certain datasets. Using `api.sanity.io` as a fallback when the CDN fails improves robustness. Both endpoints accept the same `Authorization: Bearer` header, so no host switching is needed for auth.

10. **Error visibility matters**: When the schema route silently returned `{ types: [] }` on failure, the client-side `useSchema` hook stored the empty result and blocked retries. Including an `error` field in the response and having the client check and throw it makes failures visible in the UI.
