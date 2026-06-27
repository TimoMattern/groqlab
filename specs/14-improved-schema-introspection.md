# Improved Schema Introspection

## Purpose

Fix schema inference reliability problems — missing built-in type sub-fields and incorrect asset reference targets — via static built-in definitions and on-demand GROQ reference resolution in the schema browser. References are no longer inferred from `_ref` prefix heuristics; they're resolved with a `->_type` query when the user clicks to expand them.

## Our Actual Problems

| Problem | Root Cause | How We Fix It |
|---------|-----------|---------------|
| `image.asset` shows as ref(image) instead of ref(sanity.imageAsset) | `_ref` prefix `"image-"` maps to guessed type `"image"` | `->_type` query replaces prefix heuristics entirely |
| Can't expand `slug.current`, `geopoint.lat` | No built-in type definitions exist | Static built-in type file merged into schema |
| `image.asset` self-referential ref creates bogus cycle | `_ref` prefix `"image-"` + `extractInlineObjectTypes` promotes inline `image` type → `asset` type "image" collides with parent | `->` resolves `sanity.imageAsset` correctly, no collision |
| Reference targets guessed incorrectly in general | `_ref` prefix is heuristic, not authoritative | `->` queries don't guess — they ask the API |

## Design: Optimistic Resolution (Auto-Resolve on Expand)

No pre-resolution of ALL references after schema fetch. Instead, three triggers fire resolves only for refs the user is likely to interact with:

1. **Schema panel expand**: When a parent type or field row is expanded, every unresolved ref in its entire subtree auto-resolves in the background. The user sees `ref(…)` transition to `ref(typeName)` without clicking the ref itself.
2. **Autocomplete type-aware contexts**: When the autocomplete identifies a type from the query context (projection `{…}`, dot-access `].`, deref `->`, inline-conditional `=> {`, `@.` scope, or array-projection `[]{}`), it eagerly fires `resolveRef` for **every** unresolved reference field in that type — not just the one the user is currently typing. This way all refs in the type are warming in parallel before the user drills into any of them.
3. **Autocomplete `->` fallback**: When `->` is typed and `findReferenceTargetType` fails synchronously, `triggerRefResolve(fieldName)` fires a resolve for that specific field (same as before, guards the case where the type wasn't yet resolved through eager resolution).

```
Schema fetch:
  POST /api/schema ────── inferFields (refs are "reference")
  ├─ types stored in store
  └─ schema panel renders refs as "ref(…)" with chevron

User expands a type/field:
  ┌─ collectUnresolvedRefs(descendants) → (parentType, fieldPath)[]
  │    for each: resolveRef(fieldPath) ──► GROQ _type query
  │                                       ▼ field.type updated in store
  │    re-render: ref(…) → ref(typeName)   (no click needed)
  └─ user clicks ref → expanded = true, fields visible

Projection/dot-access context triggers eager type ref resolution:
  ┌─ detectContext → typeName = "movie" (from _type filter)
  │    groqCompletionSource dispatches to case "projection"
  │    optimisticallyResolveTypeRefs("movie")
  │      └─ collectUnresolvedRefPaths → ["poster", "castMembers"]
  │           for each: resolveRef ──► GROQ _type query (fire-and-forget)
  │    returns completion list immediately (fields may still show ref(…))
  └─ next keystroke → poster and castMembers already resolved
       → completions show resolved type names

User types `->` and type wasn't yet resolved (fallback):
  ┌─ detectContext → findReferenceTargetType("poster") → undefined
  │    triggerRefResolve("poster")  ──► fire-and-forget resolveRef
  │    returns { kind: "deref", typeName: "" }  (no completions this keystroke)
  └─ next keystroke → resolve complete → field.type = "person"
       → completions work
```

**Why not eager pre-resolve ALL:** Eagerly resolving ALL reference fields after schema fetch means paying for queries for refs the user may never expand. Optimistic resolution only pays for refs in types/fields the user actually expands or types queries for.

**Why autocomplete needs the triggers:** The autocomplete is synchronous — it reads the in-memory store on every keystroke. By firing `resolveRef` when a type is identified or `->` encounters an unresolved ref, the query (typically <10ms) completes before the user's next keystroke. The delay is invisible. The eager type-ref resolution (trigger 2) is strictly better than single-field resolution (trigger 3) because it resolves all refs in one batch, so the user can freely drill into any field.

### The GROQ Query

Single field at a time:

```groq
array::unique(*[_type == "movie"][0...50].author->_type)
```

Returns: `["author"]` or `["sanity.imageAsset"]` or `[]`

**Edge cases:**
- Empty array after null filtering (e.g., `[null]`) → three-layer fallback: (1) Sanity invariants: `image.asset` → `sanity.imageAsset`, `file.asset` → `sanity.fileAsset`. The invariant must check both `parentField?.type` (multi-segment paths like `movie.poster.asset`) AND `parentTypeName` (single-segment paths like `asset` in `image` object type, which isn't a document type so `*[_type == "image"]` returns `[]`). (2) Convention: if field name matches a type name (e.g., `person` → `"person"`), use it. (3) Otherwise stays `"reference"` (unresolved).
- Multiple types returned → polymorphic ref → stays unresolved (can't pick one)
- Null in result → filtered out as non-string (e.g., `["sanity.imageAsset", null]` → `["sanity.imageAsset"]`)

### schema-inference.ts Changes

`inferFields` stops resolving `_ref` prefix to type names:
- Reference detected (`_ref` exists) → `isReference: true`, `type: "reference"`
- No more `refPrefix` parsing or `_type` fallback for the target type
- This eliminates the `image-`→`"image"` bug at source

`postProcessInferredTypes`: Remove all fuzzy-matching logic for reference field types (the `!knownTypeNames.has(f.type)` blocks). These were compensating for wrong prefix-based resolution, which no longer happens.

`cleanSelfRefs` in `extractInlineObjectTypes`: Remove. No reference field ever has a guessed type that would collide with its promoted parent type.

### Where JIT Lives

**Schema store** (`src/stores/schema-store.ts`). A single `resolveRef` action:

```typescript
resolveRef(connectionId, conn, parentTypeName, fieldPath):
  GROQ: array::unique(*[_type == "parentTypeName"][0...50].fieldPath->_type)
  filter out nulls from result
  traverse nested field path to find field
  updates field.type in-place
  triggers Zustand re-render
```

**Schema panel** (`src/components/schema/SchemaPanel.tsx`):

- `collectUnresolvedRefs(fields, parentTypeName, basePath)` → recursively walks field tree, returns all `(parentTypeName, fieldPath)` pairs where `isReference && type === "reference"`
- `TypeRow` and `FieldRow` each have a `useEffect` + `useRef` guard: on first render where `expanded === true`, calls `collectUnresolvedRefs` on the subtree and fires `resolveRef` for each match
- Individual ref click still works: clicking an unresolved `ref(…)` shows spinner, calls `resolveRef`, then expands

**Autocomplete** (`src/lib/groq/groq-autocomplete.ts`):

- `triggerRefResolve(fieldName)` → searches all types for any field with `name === fieldName && isReference && type === "reference"`, fires `resolveRef` for each match (fire-and-forget). Called after `findReferenceTargetType` fails in each `->` detection context (standalone, inside projection, `->{}` projection, `[]->` array deref).
- `collectUnresolvedRefPaths(fields)` → exported pure function; recursively walks a field tree and returns all dot-separated paths where `isReference && type === "reference"`.
- `optimisticallyResolveTypeRefs(typeName)` → finds the type by name, calls `collectUnresolvedRefPaths` on its fields, fires `resolveRef` for each path. Called in `groqCompletionSource` for every type-aware context (`projection`, `dot-access`, `deref`, `inline-conditional`, `at-scope`, `array-projection`) before completions are computed.

### Built-in Types

Static file `src/lib/builtin-types.ts` defining `sanity.imageAsset`, `sanity.fileAsset`, `slug`, `geopoint`, `image`, `file` with canonical sub-fields. Merged into the types array after inference, so resolved `sanity.imageAsset` refs have a definition to expand.

### Pipeline

```
Schema fetch:
  POST /api/schema ────── inferFields (no ref prefix!)
  ├─ types stored in store
  ├─ mergeBuiltinTypes (server-side, inferred takes precedence)
  └─ schema panel renders refs as "ref(…)" with chevron

User expands a type or field:
  ┌─ collectUnresolvedRefs(descendants)
  │    for each ref: resolveRef ──► GROQ _type query
  │    field.type updated in store (no user action needed)
  └─ re-render: ref(…) → ref(typeName)

User clicks resolved ref(…):
  └─ expanded = true → resolved type's fields visible

User types field-> in editor:
  ┌─ detectContext → findReferenceTargetType fails
  │    triggerRefResolve(fieldName)  (fire-and-forget)
  └─ next keystroke → store updated → completions work
```

### Implementation

1. **`src/lib/builtin-types.ts`** — static type definitions
2. **`inferFields`** — stop resolving `_ref` prefix to type names
3. **`postProcessInferredTypes`** — remove fuzzy-matching for ref fields
4. **Remove `cleanSelfRefs`** — no longer needed
5. **`resolveRef` in schema store** — single-ref JIT action with null filtering + nested field path traversal
6. **SchemaPanel** — `collectUnresolvedRefs` helper + auto-resolve `useEffect` in `TypeRow` and `FieldRow`
7. **Autocomplete** — `triggerRefResolve` helper fired in all `->` detection paths
8. **Autocomplete** — `optimisticallyResolveTypeRefs` fired eagerly in type-aware contexts (projection, dot-access, deref, inline-conditional, at-scope, array-projection)
9. **Updated tests** — inference tests reflect "reference" type instead of prefix-based type; `collectUnresolvedRefPaths` unit tests

## Lessons Learned

1. **`_ref` prefix parsing is replaced, not patched**: Rather than adding a two-entry asset mapping, `->_type` queries resolve references correctly for all types including assets. No heuristics, no fallbacks, no edge cases.

2. **Optimistic resolution on expand is better than on-click**: Auto-resolving all descendant refs when a parent expands eliminates the need to individually click each `ref(…)`. The user navigates the schema tree naturally; resolves happen in the background.

3. **Built-in types are still the highest-leverage static change**: JIT is useless if resolved `sanity.imageAsset` has no field definitions. The static file provides the definition that JIT resolves to.

4. **`cleanSelfRefs` was a symptom, not the disease**: The self-referential ref bug existed because `_ref` prefix `"image-"` was interpreted as type `"image"`, which then matched the promoted inline type name `"image"`. Eliminating prefix resolution eliminates the cycle.

5. **Fire-and-forget for autocomplete works because resolves are fast**: The GROQ `->_type` query returns in ~7ms. Even though the autocomplete is synchronous, firing a resolve when `->` is typed means the store updates before the next keystroke.

6. **`useRef` guard prevents duplicate resolves**: The `didAutoResolve` ref in each `FieldRow`/`TypeRow` ensures the auto-resolve effect fires only once per component mount, even when the store update causes re-renders.

7. **Null filtering in GROQ results**: `["sanity.imageAsset", null]` is the normal case when some sample documents have null refs. Filtering nulls with `typeof v === "string"` gives the correct single-element array.

8. **`parentTypeName` is just as important as `parentField?.type` in fallback checks**: A single-segment path like `asset` has no `parentField` (only one segment), so the invariant fallback must also check `parentTypeName`. Without this, expanding the `image` object type's `asset` field would never resolve because `*[_type == "image"]` returns `[]` (object types aren't documents).

9. **Test the static fallbacks alongside the primary flow**: The auto-resolve tests in SchemaPanel verify that `resolveRef` is called on expand, and the static fallbacks fire correctly when GROQ is unavailable (as it is in test environments). These tests caught the `parentTypeName` gap immediately.

10. **Eager type-ref resolution in autocomplete is strictly better than single-field fallback**: Once the type of a projection/deref/dot-access is known, resolving all its refs in one batch costs no more than resolving one (parallel API calls), and means the user never hits the one-keystroke lag when drilling into any ref field. The `->` fallback (`triggerRefResolve`) still exists for edge cases where the type couldn't be determined.
