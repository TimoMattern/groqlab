import type { SchemaField, SchemaType } from "@/lib/sanity-types";

export function mergeSamples(samples: Record<string, unknown>[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const sample of samples) {
    for (const [key, value] of Object.entries(sample)) {
      if (!(key in merged)) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

export function inferFields(doc: Record<string, unknown>): SchemaField[] {
  return Object.entries(doc)
    .filter(([key]) => !key.startsWith("_"))
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        const refsInArray = value
          .filter((item): item is Record<string, unknown> =>
            item !== null && typeof item === "object" && "_ref" in (item as Record<string, unknown>),
          )
          .map((item) => {
            const obj = item as Record<string, unknown>;
            const ref = obj._ref as string;
            const refType = obj._type as string;
            const refPrefix = ref?.indexOf("-") > 0 ? ref.slice(0, ref.indexOf("-")) : "";
            return refPrefix || (refType && refType !== "reference" ? refType : "");
          })
          .filter(Boolean);
        if (refsInArray.length > 0) {
          const uniqueRefTypes = [...new Set(refsInArray)];
          return {
            name: key,
            type: uniqueRefTypes.length === 1 ? uniqueRefTypes[0] : "reference",
            isArray: true,
            isReference: true,
          };
        }
        const itemTypes = value
          .map((item: unknown) => (item as Record<string, unknown>)?._type as string)
          .filter(Boolean);
        const uniqueTypes = [...new Set(itemTypes)];
        return {
          name: key,
          type: uniqueTypes.length === 1 ? uniqueTypes[0] : "array",
          isArray: true,
          isReference: false,
        };
      }
      if (
        value !== null &&
        typeof value === "object" &&
        (value as Record<string, unknown>)._ref
      ) {
        const ref = (value as Record<string, unknown>)._ref as string;
        const refType = (value as Record<string, unknown>)._type as string;
        const refPrefix = ref?.indexOf("-") > 0 ? ref.slice(0, ref.indexOf("-")) : "";
        const resolvedType = refPrefix || (refType && refType !== "reference" ? refType : "reference");
        return {
          name: key,
          type: resolvedType,
          isArray: false,
          isReference: true,
        };
      }
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        const nestedFields = inferFields(value as Record<string, unknown>);
        const valueType = (value as Record<string, unknown>)?._type;
        return {
          name: key,
          type: typeof valueType === "string" ? valueType : "object",
          isArray: false,
          isReference: false,
          fields: nestedFields,
        };
      }
      const typeName =
        value === null
          ? "unknown"
          : Array.isArray(value)
            ? "array"
            : typeof value;
      return {
        name: key,
        type: typeName,
        isArray: false,
        isReference: false,
      };
    });
}

export function postProcessInferredTypes(types: SchemaType[]): void {
  const knownTypeNames = new Set(types.map((t) => t.name));
  const refFieldMap = new Map<string, string>();
  for (const t of types) {
    for (const f of t.fields) {
      if (f.isReference) refFieldMap.set(f.name, f.type);
    }
  }
  for (const t of types) {
    for (const f of t.fields) {
      if (f.type === "unknown") {
        const fromMap = refFieldMap.get(f.name);
        if (fromMap && knownTypeNames.has(fromMap)) {
          f.type = fromMap;
          f.isReference = true;
          continue;
        }
        const exactMatch = types.find((ot) => ot.name === f.name);
        if (exactMatch) {
          f.type = exactMatch.name;
          f.isReference = true;
          continue;
        }
        const fuzzyMatch = types.find((ot) => {
          const seg = ot.name.split(".").pop() || "";
          return seg.toLowerCase().startsWith(f.name.toLowerCase());
        });
        if (fuzzyMatch) {
          f.type = fuzzyMatch.name;
          f.isReference = true;
        }
      } else if (f.type === "array" && f.isArray) {
        const singular = f.name.endsWith("s") ? f.name.slice(0, -1) : f.name;
        let arrMatch = knownTypeNames.has(f.name)
          ? types.find((ot) => ot.name === f.name)
          : undefined;
        if (!arrMatch) {
          arrMatch = types.find((ot) => ot.name === singular);
        }
        if (!arrMatch) {
          arrMatch = types.find((ot) => {
            const seg = ot.name.split(".").pop() || "";
            return seg.toLowerCase() === f.name.toLowerCase() ||
                   seg.toLowerCase() === singular.toLowerCase();
          });
        }
        if (arrMatch) {
          f.type = arrMatch.name;
        }
      } else if (f.isReference && !knownTypeNames.has(f.type)) {
        const exactMatch = types.find((ot) => ot.name === f.name);
        if (exactMatch) {
          f.type = exactMatch.name;
          continue;
        }
        const fuzzyMatch = types.find((ot) => {
          const seg = ot.name.split(".").pop() || "";
          return seg.toLowerCase().startsWith(f.name.toLowerCase());
        });
        if (fuzzyMatch) {
          f.type = fuzzyMatch.name;
          continue;
        }
        const typeContainsKnown = types.find((ot) => {
          const lower = f.type.toLowerCase();
          return lower.startsWith(ot.name.toLowerCase()) && ot.name.toLowerCase() !== lower;
        });
        if (typeContainsKnown) {
          f.type = typeContainsKnown.name;
        }
      }
    }
  }
}

export function extractInlineObjectTypes(types: SchemaType[]): void {
  const knownNames = new Set(types.map((t) => t.name));

  function cleanSelfRefs(fields: SchemaField[], parentName: string): SchemaField[] {
    return fields.map((child) => ({
      ...child,
      type: child.isReference && child.type === parentName ? "reference" : child.type,
      fields: child.fields ? cleanSelfRefs(child.fields, parentName) : undefined,
    }));
  }

  function walk(fields: SchemaField[]): void {
    for (const f of fields) {
      if (f.fields && f.fields.length > 0 && !f.isReference) {
        const name = f.type !== "object" ? f.type : f.name;
        f.type = name;

        if (!knownNames.has(name)) {
          knownNames.add(name);
          types.push({ name, kind: "object", fields: cleanSelfRefs(f.fields, name) });
        }

        walk(f.fields);
      }
    }
  }

  for (const t of types) {
    walk(t.fields);
  }
}

export function extractArrayItemTypes(
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
            item !== null && typeof item === "object" && (item as Record<string, unknown>)._type === f.type,
        ) as Record<string, unknown> | undefined;
        if (!typedItem) continue;

        const itemFields = inferFields(typedItem);
        f.fields = itemFields;

        knownNames.add(f.type);
        types.push({ name: f.type, kind: "object", fields: itemFields });
      }
    }
  }
}
