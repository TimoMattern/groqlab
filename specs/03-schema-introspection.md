# Schema Introspection

## Purpose

Fetch and display the document schema (document types + their fields) for a Sanity dataset without relying on Sanity's private Schema API (which requires authentication). Instead, the app **infers** the schema by sampling actual documents.

## How It Works

1. Get all unique `_type` values in the dataset: `array::unique(*[]._type)`
2. Fetch one sample document of each type: `*[_type == 'X'][0]`
3. Infer fields by inspecting the sample document's key-value pairs
4. Post-process to fix references and resolve type names

This approach works for any dataset (public or with tokens) and requires no special permissions beyond querying data.

## API Route: `POST /api/schema`

- **Input**: `{ connection: { projectId, dataset } }`
- **CDN Endpoint**: `https://{projectId}.apicdn.sanity.io/v2021-06/data/query/{dataset}`
- Uses `apicdn.sanity.io` (read-optimized CDN) rather than `api.sanity.io`

### Inference Logic (`inferFields`)

For each document field (excluding `_`-prefixed system fields):

| Value Pattern | Inferred Type | `isArray` | `isReference` |
|---------------|---------------|-----------|---------------|
| `null` | `"unknown"` | false | false |
| `string` | `"string"` | false | false |
| `number` | `"number"` | false | false |
| `boolean` | `"boolean"` | false | false |
| Non-array object with `_ref` | Extracted from `_ref` prefix | false | true |
| Array containing items with `_ref` | Inferred from `_ref` prefix | true | true |
| Array containing items with `_type` | Inferred from `_type` | true | false |
| Non-array object without `_ref` | `"object"` | false | false (recurses into `inferFields`) |

### Post-Processing

After initial inference, the route fixes common issues:

1. **Unknown type resolution**: Fields inferred as `"unknown"` (null in the sample) are cross-referenced against known type names and field-name matches
2. **Reference type alignment**: Fields marked as references whose `type` doesn't match any known type name are resolved by:
   - Direct field name → type name match
   - Fuzzy match on the last segment of the type name (e.g., `"image"` → `"sanity.imageAsset"`)
3. **Filter system types**: Types prefixed with `system.` are excluded

## Component: `SchemaPanel`

### States

| State | Display |
|-------|---------|
| No active connection | "Select a connection to view schema" |
| Loading | Spinning refresh icon + "Loading schema..." |
| Error | Red error message |
| Loaded + empty types | "No schema loaded." with "Load Schema" button |
| Loaded + types | Search bar + expandable type tree |

### Features

- **Search**: Filters types and fields by name (case-insensitive)
- **Expandable tree**: Types expand to show fields, which recursively expand for sub-objects
- **Click-to-insert**: Click a field name to append it to the query editor
- **Refresh**: Manual refresh button to re-fetch schema
- **Type resolution**: Fields that are references show `ref(typeName)`; arrays show `typeName[]`

### Field Row

Each field shows:
- Chevron (expandable if has sub-fields or references a known type)
- Field name (bold)
- Type label: `string`, `number`, `array[]`, `ref(person)`, etc.

## Store: `schema-store.ts`

Simple in-memory cache (no localStorage persistence):

```typescript
interface SchemaState {
  types: Record<connectionId, SchemaType[]>;         // Cache per connection
  isLoading: Record<connectionId, boolean>;
  error: Record<connectionId, string | null>;
}
```

### Helper: `resolveRefType`

```typescript
resolveRefType(ref: string, schemaTypes: SchemaType[]): string | undefined
```

Attempts to find a type name that matches a reference document's ID prefix. Used by the autocomplete engine.

## Hook: `useSchema.ts`

- **Auto-loads schema** when `activeId` changes and types are not yet cached
- Guards against duplicate loads with `isLoading` check
- Guards against unnecessary loads with `types[activeId]?.length` check
- Returns `{ loadSchema }` for manual refresh

## Lessons Learned

1. **Sample-based schema is lossy but practical**: Fields that are `null` in the sample document are inferred as `"unknown"`. This is the single biggest limitation. Mitigated by the post-processing step that cross-references field names against known type names.

2. **Sanity's `_ref` encodes the target type**: A reference like `_ref: "image-abc123"` encodes the target type (`image`) as the prefix before the first `-`. This is a reliable heuristic for 95% of Sanity schemas.

3. **`_type` on reference objects is unreliable**: Reference objects sometimes have `_type: "reference"` instead of the actual target type. Always prefer parsing the `_ref` prefix.

4. **Schema is fetched per-connection**: The store keys by `connectionId`. Switching connections triggers a new fetch if not cached. No cross-connection sharing.

5. **No schema subscription**: After initial fetch, the schema is static. Users must click "Refresh" to pick up schema changes. This is intentional to avoid constant re-fetching.

6. **`apicdn.sanity.io` vs `api.sanity.io`**: The schema route uses the CDN endpoint which is optimized for read workloads. The query route uses the regular API endpoint which supports writes and has different rate limits.
