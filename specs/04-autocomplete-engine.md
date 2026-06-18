# Autocomplete Engine

## Purpose

Provide context-aware GROQ autocomplete completions in the CodeMirror editor. The engine detects where the cursor is in the query (filter, projection, string, pipeline, etc.) and returns relevant completions.

## Architecture

```
User types → CM6 fires CompletionContext
  → detectContext(before) returns CompletionCtx
  → completion provider for that context returns Completion[]
  → CM6 renders list
```

## Completion Data: `groq-completions.ts`

**File**: `src/lib/groq/groq-completions.ts`

Static data organized into groups:

| Group | Count | Examples |
|-------|-------|----------|
| `KEYWORD_COMPLETIONS` | 11 | `order`, `asc`, `desc`, `select`, `collate`, `in`, `match`, `and`, `or`, `not` + `...` |
| `LITERAL_COMPLETIONS` | 3 | `true`, `false`, `null` |
| `OPERATOR_COMPLETIONS` | 17 | `==`, `!=`, `<`, `<=`, `>`, `>=`, `&&`, `\|\|`, `..`, `->`, `**`, `=>`, `+`, `-`, `/`, `%`, `!` |
| `FUNCTION_COMPLETIONS` | 33 | `count()`, `defined()`, `coalesce()`, `dateTime()`, `select()`, namespaced functions |
| `SNIPPET_COMPLETIONS` | 11 | `*[_type == ""]`, `count(*)`, `*[_type == ""]{...}`, etc. |
| `PIPELINE_STAGE_COMPLETIONS` | 6 | `order()`, `filter()`, `project()`, `score()`, `select()`, `slice()` |
| `LOCALE_COMPLETIONS` | 10 | `"en"`, `"de"`, `"fr"`, etc. |
| `PARAM_COMPLETIONS` | 9 | `$start`, `$end`, `$limit`, `$offset`, `$term`, etc. |
| `GLOB_COMPLETIONS` | 5 | `"drafts.*"`, `"a.b.c.**"`, etc. |
| `SCORE_CONTEXT_COMPLETIONS` | 4 | `boost()`, `text::semanticSimilarity()`, etc. |
| `ORDER_COMPLETIONS` | 5 | `asc`, `desc`, `collate`, `lower()`, `upper()` |
| `SELECT_COMPLETIONS` | 5 | ` => ""`, ` => true`, ` => false`, ` => null`, ` => {}` |

Namespaced functions are organized in `NAMESPACE_MAP`:

| Namespace | Functions |
|-----------|-----------|
| `sanity::` | `dataset()`, `versionOf()`, `partOfRelease()` |
| `geo::` | `distance()`, `contains()`, `intersects()` |
| `array::` | `join()`, `compact()`, `unique()`, `intersects()` |
| `text::` | `semanticSimilarity()`, `query()` |
| `string::` | `startsWith()` |
| `pt::` | `text()` |
| `user::` | `attributes()` |

### `GroqCompletion` Interface

```typescript
interface GroqCompletion {
  label: string;       // Display text
  type: CompletionKind; // Category (keyword, function, snippet, etc.)
  detail: string;      // Description shown on right side
  apply?: string;      // Text to insert (supports CM6 snippet syntax)
  boost?: number;      // Sort priority
}
```

## Context Detector: `detectContext(before)`

**File**: `src/lib/groq/groq-autocomplete.ts` (lines 349-681)

Analyzes the text before cursor and returns a `CompletionCtx`:

```typescript
type CompletionCtx =
  | { kind: "root" }
  | { kind: "filter"; before: string }
  | { kind: "string-value"; before: string }
  | { kind: "projection"; typeName?: string; before: string }
  | { kind: "pipeline" }
  | { kind: "order-arg"; before: string }
  | { kind: "score-arg" }
  | { kind: "select-arg"; before: string }
  | { kind: "deref"; typeName: string }
  | { kind: "dot-access"; typeName?: string }
  | { kind: "array-projection"; typeName?: string; before: string }
  | { kind: "inline-conditional"; typeName: string }
  | { kind: "namespace"; ns: string }
  | { kind: "negation" }
  | { kind: "at-scope"; typeName?: string }
  | { kind: "param" }
  | { kind: "arithmetic" }
  | { kind: "geo-arg"; fn: string; argIndex: number }
  | { kind: "pt-text-arg" }
  | { kind: "release-arg"; fn: string }
  | { kind: "join-filter"; parentTypeName?: string }
  | { kind: "batch-key" }
  | { kind: "root-object" }
  | { kind: "at-subfilter" }
  | { kind: "post-projection-slice" }
  | { kind: "concat-rhs" }
  | { kind: "array-traversal"; before: string }
  | { kind: "collate-arg" }
  | { kind: "path-arg" }
  | { kind: "object-projection"; fields: { name: string; type: string }[] }
  | { kind: "none" };
```

### Detection Priority (first match wins)

1. Inside `//` comment → none
2. Bare number literal → none
3. Inside `"..."` or `'...'` string → string-value
4. After `$` → param
5. After `collate ` inside order → collate-arg
6. Inside `path()` → path-arg
7. After `}[` (post-projection slice) → post-projection-slice
8. Inside `select()` → select-arg
9. Inside `order()` → order-arg
10. Inside `score()` → score-arg
11. Inside `geo::*()` → geo-arg
12. Inside `pt::text()` → pt-text-arg
13. Inside `sanity::versionOf/partOfRelease()` → release-arg
14. After `namespace::` → namespace
15. After `!` → negation
16. Inside `[@` → at-subfilter
17. Inside `references(` → join-filter
18. Inside `{...}` (projection scope) → projection / deref / array-projection / inline-conditional / object-projection / root-object
19. After `|` pipe → pipeline
20. After `->` dereference → deref
21. After `].` or `].field` dot access → dot-access
22. After `@.` or `^.` → at-scope
23. After `] +` or `} +` → concat-rhs
24. After `field[]` → array-traversal
25. Arithmetic expression context → arithmetic
26. Root `{...}` → root-object
27. Inside `[...]` → filter
28. Default → root

### Schema-Aware Completions

The engine integrates with the schema store to provide context-appropriate field completions:

- **Projection `{...}`**: Resolves `_type == "X"` filter before the brace → fields of type X
- **Dereference `->`**: Looks up the field in all schema types, finds its reference target type, returns that type's fields
- **String values**: When inside `_type == "..."`, offers all document type names from schema
- **Order args**: All fields of all types (for `order()` sorting)
- **Score args**: All fields (for `field match "..."` patterns)
- **Filter**: All fields (merged across types) + filter-appropriate functions/operators

### Field Resolution Helpers

| Function | Purpose |
|----------|---------|
| `getSchemaTypes()` | Gets types for active connection from schema store |
| `findType(name)` | Exact type name lookup |
| `resolveTypeName(name)` | Exact + fuzzy match (last segment, case-insensitive) |
| `resolveFieldTargetType(field, fieldName)` | Follows reference to target type |
| `findReferenceTargetType(fieldName)` | Searches all types for field matching name, then resolves its reference target |
| `findFieldSubFields(fieldName)` | Gets sub-fields of an object field or resolves reference target fields |
| `allFields()` | Union of all fields across all types + common fields (`_id`, `_type`, etc.) |
| `fieldsForType(typeName)` | Common fields + that type's fields |

## Boost Hierarchy

| Boost | Category |
|-------|----------|
| 99 | Schema type names (inside string) |
| 98 | Schema field names (in projections) |
| 95 | Snippets, special vars (`*`, `@`, `^`) |
| 90 | Core functions (`count()`, `order`, `defined()`) |
| 85 | Common functions (`dateTime()`, `coalesce()`) |
| 80 | Medium-use functions (`select()`, `round()`) |
| 75 | Less common (`now()`, `boost()`) |
| 70 | Utility (`upper()`, `lower()`, `path()`) |
| 65 | Namespace functions |
| 60 | Niche functions |
| 50-45 | Operators |

## Main Entry: `groqCompletionSource`

```typescript
function groqCompletionSource(context: CompletionContext): CompletionResult | null
```

1. Gets text before cursor
2. Gets the word at cursor (for prefix filtering)
3. Calls `detectContext(before)` → `CompletionCtx`
4. Dispatches to the appropriate provider function based on context kind
5. Returns `{ from, options, validFor }` or `null` (no completions)

Returns `null` when:
- Cursor is in a comment
- Cursor is inside a bare number literal
- No completions match the current context and word prefix
- Context is "none"

## Test Coverage

- `groq-autocomplete.test.ts`: 70+ tests covering cheat sheet patterns, projection suggestions, operators, `@`/`^`, single-quote, nested deref
- `groq-completions.test.ts`: 13 tests for data existence, labels, snippet templates, operator coverage

## Lessons Learned

1. **Context detection is the hardest problem**: GROQ's grammar allows many overlapping syntactic constructs. The detection order matters enormously — function-specific contexts (like `order()`, `score()`) must be checked before general contexts (like `filter`, `projection`).

2. **Schema-aware field suggestions require type resolution**: To suggest fields in `*[_type == "movie"]{title, |}`, the engine must trace back from `{` to find the `_type == "movie"` filter. This heuristic works for simple cases but fails for complex queries with joins or nested projections.

3. **`isInString` must balance quotes**: Using naive `before.includes('"')` would break `*[_type == "movie"]{title, |}` because the closed `""` around "movie" would trigger string context. The proper approach tracks quote pairs with a state machine.

4. **Fuzzy type matching is necessary but fragile**: When parsing `_ref: "image-abc123"` to determine target type, the engine extracts `"image"` and then does a case-insensitive last-segment match against known types. This works for `sanity.imageAsset` but fails for unconventional naming.

5. **Field resolution is heuristic**: `findReferenceTargetType(fieldName)` searches ALL schema types for the field name, then resolves the reference target. This is expensive but necessary because the autocomplete doesn't know which type the projection is scoped to at that point.

6. **Projection type ambiguity**: In `*[_type == "movie"]{castMembers[]{characterName, person->{name}}}`, the inner `{name}` should show fields of `person`, not fields of `movie`. The brace-depth tracking + checking for `->` before the brace handles this correctly.

7. **SchemaField data model is incomplete**: The current `SchemaField` has no `fields` for nested objects, no `refType` for reliable dereference, and no `of` for array element types. Adding these would unlock deeper completions but requires changes to the schema inference API route.
