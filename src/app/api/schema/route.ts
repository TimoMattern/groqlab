import { NextRequest, NextResponse } from "next/server";

const SANITY_API_VERSION = "v2021-06-07";

function buildQueryUrl(projectId: string, dataset: string): string {
  return `https://${projectId}.apicdn.sanity.io/${SANITY_API_VERSION}/data/query/${dataset}`;
}

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
  fields: SchemaField[];
}

async function queryGroq(
  url: string,
  groq: string,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: groq }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `HTTP ${response.status}`);
  }

  const json = await response.json();
  return json.result;
}

function inferFields(doc: Record<string, unknown>): SchemaField[] {
  return Object.entries(doc)
    .filter(([key]) => !key.startsWith("_"))
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        const refsInArray = value
          .filter((item): item is Record<string, unknown> =>
            item !== null && typeof item === "object" && "_ref" in (item as Record<string, unknown>)
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
        // Sanity references have _type="reference" but the actual target type is
        // encoded in the _ref prefix (e.g., _ref="image-xxx" → type "image").
        // Prefer the _ref prefix over _type since _type can be unreliable.
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

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { connection } = body;

  if (!connection?.projectId || !connection?.dataset) {
    return NextResponse.json(
      { kind: "Schema", message: "Missing connection parameters" },
      { status: 400 },
    );
  }

  const url = buildQueryUrl(connection.projectId, connection.dataset);

  try {
    const typeNames = (await queryGroq(url, 'array::unique(*[]._type)')) as string[];

    if (!Array.isArray(typeNames) || typeNames.length === 0) {
      return NextResponse.json({ types: [] });
    }

    const sampleDocs: Record<string, unknown>[] = [];

    for (const typeName of typeNames) {
      const escaped = typeName.replace(/['\\]/g, "\\$&");
      let doc: unknown;
      try {
        doc = await queryGroq(
          url,
          `*[_type == '${escaped}'][0]`,
        );
      } catch {
        doc = null;
      }
      sampleDocs.push((doc as Record<string, unknown>) ?? {});
    }

    const types: SchemaType[] = typeNames
      .map((name, i) => {
        const doc = sampleDocs[i];
        const title = (doc?._type as string) ?? name;
        const fields = doc ? inferFields(doc as Record<string, unknown>) : [];
        return { name, title, fields };
      })
      .filter((t) => !t.name.startsWith("system."));

    // Post-process: fix fields inferred as "unknown" (null in sample) or
    // reference fields whose resolved type doesn't match any known type name
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
          // Array with unknown element type (empty array in sample).
          // Try matching field name (or its singular form) to a known type name.
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
            // Keep isArray: true, don't set isReference — the elements may not be refs
          }
        } else if (f.isReference && !knownTypeNames.has(f.type)) {
          // Resolved type doesn't match any known type — likely an ID fragment
          // was used as _type on the reference object. Try field-name matching.
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
          }
        }
      }
    }

    return NextResponse.json({ types });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch schema";
    return NextResponse.json(
      { kind: "Schema", message },
      { status: 502 },
    );
  }
}
