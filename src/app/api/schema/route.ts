import { NextRequest, NextResponse } from "next/server";

const GROQ_API_VERSION = "v2021-06-07";

// ── GROQ helpers ────────────────────────────────────────────────────

function buildQueryUrl(projectId: string, dataset: string): string {
  return `https://${projectId}.apicdn.sanity.io/${GROQ_API_VERSION}/data/query/${dataset}`;
}

async function queryGroq(url: string, groq: string, token?: string): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: groq }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `HTTP ${response.status}`);
  }

  const json = await response.json();
  return json.result;
}

// ── Types ───────────────────────────────────────────────────────────

interface SchemaField {
  name: string;
  type: string;
  isArray: boolean;
  isReference: boolean;
  fields?: SchemaField[];
}

interface SchemaType {
  name: string;
  title?: string;
  kind?: "document" | "object";
  fields: SchemaField[];
}

// ── Sample-document inference ───────────────────────────────────────

function mergeSamples(samples: Record<string, unknown>[]): Record<string, unknown> {
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

function inferFields(doc: Record<string, unknown>): SchemaField[] {
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
        return {
          name: key,
          type: "object",
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

// ── Post-processing ─────────────────────────────────────────────────

function postProcessInferredTypes(types: SchemaType[]): void {
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

  for (const t of types) {
    walk(t.fields);
  }
}

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

// ── Schema inference ────────────────────────────────────────────────

function buildFallbackUrl(projectId: string, dataset: string): string {
  return `https://${projectId}.api.sanity.io/${GROQ_API_VERSION}/data/query/${dataset}`;
}

async function queryWithFallback(
  url: string,
  fallbackUrl: string,
  groq: string,
  token?: string,
): Promise<unknown> {
  try {
    return await queryGroq(url, groq, token);
  } catch {
    return await queryGroq(fallbackUrl, groq, token);
  }
}

async function inferSchemaFromSamples(
  projectId: string,
  dataset: string,
  token?: string,
): Promise<{ types: SchemaType[]; error?: string }> {
  const url = buildQueryUrl(projectId, dataset);
  const fallbackUrl = buildFallbackUrl(projectId, dataset);

  let rawTypeNames: unknown;
  try {
    rawTypeNames = await queryWithFallback(url, fallbackUrl, 'array::unique(*[]._type)', token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Schema type list fetch failed:", msg);
    return { types: [], error: msg };
  }

  const typeNames = Array.isArray(rawTypeNames) ? (rawTypeNames as string[]) : [];
  if (typeNames.length === 0) {
    return { types: [], error: "No document types found in dataset" };
  }

  const sampleDocs: Record<string, unknown>[] = [];
  for (const typeName of typeNames) {
    const escaped = typeName.replace(/['\\]/g, "\\$&");
    let docs: unknown;
    try {
      docs = await queryWithFallback(url, fallbackUrl, `*[_type == '${escaped}'][0...5]`, token);
    } catch (e) {
      console.error(`Schema sample fetch failed for type '${typeName}':`, e instanceof Error ? e.message : String(e));
      docs = [];
    }
    const samples = (Array.isArray(docs) ? docs : [docs]).filter(Boolean) as Record<string, unknown>[];
    sampleDocs.push(samples.length > 0 ? mergeSamples(samples) : {});
  }

  const types: SchemaType[] = typeNames
    .map((name, i) => {
      const doc = sampleDocs[i];
      const title = (doc?._type as string) ?? name;
      const fields = Object.keys(doc).length > 0 ? inferFields(doc) : [];
      return { name, title, fields };
    })
    .filter((t) => !t.name.startsWith("system."));

  postProcessInferredTypes(types);
  extractInlineObjectTypes(types);
  extractArrayItemTypes(types, typeNames, sampleDocs);

  return { types };
}

// ── Route handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { connection } = body;
  const token = body.token ?? connection?.token;

  if (!connection?.projectId || !connection?.dataset) {
    return NextResponse.json(
      { kind: "Schema", message: "Missing connection parameters" },
      { status: 400 },
    );
  }

  try {
    const result = await inferSchemaFromSamples(connection.projectId, connection.dataset, token || undefined);
    if (result.types.length > 0) {
      return NextResponse.json({ types: result.types, source: "inference" });
    }
    if (result.error) {
      return NextResponse.json({ types: [], error: result.error });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Schema inference failed:", msg);
    return NextResponse.json({ types: [], error: msg }, { status: 500 });
  }

  return NextResponse.json({ types: [] });
}
