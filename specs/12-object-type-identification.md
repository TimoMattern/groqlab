# Object Type Discovery

## Purpose

Object types — reusable named types like `slug`, `geopoint`, `address`, `castMember` — are invisible to `array::unique(*[]._type)` (which only returns document `_type` values). The GROQ inference pipeline must extract them from inline object fields and array items in sample documents.

## Background

### How Object Types Work in Sanity

```ts
defineType({
  name: 'person',
  type: 'document',
  fields: [
    { name: 'name', type: 'string' },
    {
      name: 'address',
      type: 'object',
      fields: [
        { name: 'street', type: 'string' },
        { name: 'city', type: 'string' },
      ],
    },
    {
      name: 'castMembers',
      type: 'array',
      of: [{ type: 'castMember' }],
    },
  ],
})
```

Two kinds of object types:

| Kind | Has `_type` in data? | Named? | Example |
|------|----------------------|--------|---------|
| Inline (anonymous) | No | No (defined inline) | `{ name: 'address', type: 'object', fields: [...] }` |
| Named (reusable) | Yes (`_type` value) | Yes (has `.name` in schema) | `{ name: 'castMember', type: 'object', fields: [...] }` |

Inline types appear as nested objects in sample documents. Named types appear as `_type` values in array items or object fields, but are NOT returned by `array::unique(*[]._type)` — that only returns **document** types.

## Solution: Extract Object Types from Sample Data

Since the Schema API (`api.sanity.io/.../schemas`) returns `[]` for schemas deployed via `npx sanity schemas deploy`, the route relies entirely on GROQ-based sample inference. After producing document types (with inline fields), three post-processing passes run — the last two extract object types.

### Extraction Rules

```
Input:  person { address { street, city }, social { platform, url } }
Output: person { address (type=address), social (type=socialLink) }
        + address (kind=object) { street, city }
        + socialLink (kind=object) { platform, url }
```

1. Walk every field of every inferred type recursively
2. For fields with `type === "object"` and non-empty `fields`:
   a. Create a new `SchemaType` with `name: f.name`, `kind: "object"`, `fields: f.fields`
   b. Change `f.type` from `"object"` to `f.name`
   c. Recursively extract from the sub-fields
3. Deduplicate by type name (first definition wins)
4. Push all extracted object types to the types array

### Edge Cases

- **Nested inline objects**: Recursively extracted — `address.location { lat, lng }` creates both `address` and `location` types
- **Same field name in multiple doc types**: Deduplicated — if both `person` and `company` have `address`, only one `address` object type is created
- **Field name conflicts with existing doc type**: Skipped — `knownNames` includes all existing type names, so a doc type named `address` prevents extraction
- **Empty object** (`fields: []`): Skipped — no sub-fields to extract

### Limitations

- **Inline anonymous objects only**: The initial extraction only handles fields with `type === "object"` (inline anonymous objects). It misses named object types used as array items (like `castMember[]`).
- Arrays of anonymous objects (e.g., `images: [{caption, url}]`) are not extracted because `inferFields` doesn't generate inline fields for array members without `_type`.
- Two different doc types may have inline objects with the same name but different structures — the first one extracted wins. This is acceptable since inference is already lossy.

## Extraction Passes (in order)

The GROQ fallback runs three post-processing passes after inferring fields from sample documents:

1. **`postProcessInferredTypes`** — resolves unknown types, arrays, and references
2. **`extractInlineObjectTypes`** — promotes inline anonymous objects to named `kind: "object"` types
3. **`extractArrayItemTypes`** — promotes named object types found as array items to `kind: "object"` types

### Pass 2: `extractInlineObjectTypes(types)`

Walks all fields recursively. For any field with `type === "object"` and non-empty `fields`, creates a new `SchemaType` using the field name:

```typescript
function extractInlineObjectTypes(types: SchemaType[]): void {
  const knownNames = new Set(types.map((t) => t.name));

  function walk(fields: SchemaField[]): void {
    for (const f of fields) {
      if (f.type === "object" && f.fields && f.fields.length > 0) {
        const name = f.name;
        f.type = name;

        if (!knownNames.has(name)) {
          knownNames.add(name);
          types.push({ name, kind: "object", fields: f.fields });
        }

        walk(f.fields);
      }
    }
  }

  for (const t of types) { walk(t.fields); }
}
```

### Pass 3: `extractArrayItemTypes(types, typeNames, sampleDocs)`

Named object types in arrays (like `castMember` in `castMembers[]`) don't appear as inline objects — they have a `_type` tag in data but aren't document types. This pass:

1. Scans all fields of all document types for array fields
2. For each array whose item type name isn't in the known type list, looks up the parent sample document
3. Finds an array item with `_type` matching the field type
4. Infers sub-fields from that item via `inferFields`
5. Creates a new `SchemaType` with `kind: "object"`
6. Sets `field.fields` on the array field so the UI can expand it

```typescript
function extractArrayItemTypes(
  types: SchemaType[],
  typeNames: string[],
  sampleDocs: Record<string, unknown>[],
): void {
  const knownNames = new Set(types.map((t) => t.name));

  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    const sample = sampleDocs[i];
    if (!sample) continue;

    for (const f of t.fields) {
      if (f.isArray && !f.isReference && !knownNames.has(f.type)) {
        const items = sample[f.name];
        if (!Array.isArray(items)) continue;

        const typedItem = items.find(
          (item): item is Record<string, unknown> =>
            item !== null && typeof item === "object"
            && (item as Record<string, unknown>)._type === f.type,
        );

        if (!typedItem) continue;

        const itemFields = inferFields(typedItem);
        f.fields = itemFields;

        knownNames.add(f.type);
        types.push({ name: f.type, kind: "object", fields: itemFields });
      }
    }
  }
}
```

This pass relies on the original `sampleDocs` array (kept from the GROQ fetch phase) to look at actual array item content, not just inferred field metadata.

### Full Flow in `inferSchemaFromSamples`:

```typescript
const types = typeNames.map((name, i) => {
  const doc = sampleDocs[i];
  const fields = doc ? inferFields(doc) : [];
  return { name, title, fields };
}).filter(t => !t.name.startsWith("system."));

postProcessInferredTypes(types);
extractInlineObjectTypes(types);
extractArrayItemTypes(types, typeNames, sampleDocs);
return { types };
```

### Schema Panel Impact

The schema panel already supports `kind: "object"` types — they render in the "Object Types" section. Fields that reference extracted object types show the type name (e.g., `address`) instead of `object`. The inline `fields` are kept on the field for direct expandability.

### Autocomplete Impact

Object types are now in the top-level type list. The existing resolution chain works:
- `findType("address")` → returns the extracted object type
- `resolveFieldTargetType()` → resolves field type to extracted type
- Field completions work for nested fields

## Interaction with Spec 03

`03-schema-introspection.md` documents the GROQ-only schema inference pipeline. This spec details the two extraction passes that recover object types from sample data.

## Lessons Learned

1. **Inline objects in samples ARE object types**: A field storing `{ street, city }` corresponds to an inline `{ name: 'address', type: 'object', fields: [...] }` in the schema. Extracting it as a named type makes it discoverable.

2. **Field name as type name**: Using `f.name` as the extracted type name works because Sanity convention is to name object types after their field (e.g., `address` field → `address` type).

3. **Array members with `_type` vs without**: Named object types in arrays include `_type` (e.g., `_type: "castMember"`). Anonymous inline objects don't. The inference uses `_type` to identify array item types, then samples an item to infer its fields.

4. **Recursive extraction is necessary**: Objects nested within objects (e.g., `address.geo { lat, lng }`) need recursive extraction for both parent and child. Single-level misses the child type.

5. **Duplication by name is the right tradeoff**: Two doc types with the same field name share one extracted type — matching Sanity's actual behavior where `address` is defined once and reused.

6. **Array item types need their own pass**: `extractInlineObjectTypes` only catches inline anonymous objects. Array items with `_type` need a separate pass that inspects the parent sample document's array content directly.

7. **Keep sample docs alive**: `extractArrayItemTypes` needs the original sample documents. `inferSchemaFromSamples` must keep `sampleDocs` around past the initial `inferFields` phase.

8. **Three-pass ordering**: Run `postProcessInferredTypes` first (resolve unknowns/refs), then `extractInlineObjectTypes` (inline anonymous objects), then `extractArrayItemTypes` (named array items). Running passes out of order misses types.
