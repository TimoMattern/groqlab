import { NextRequest, NextResponse } from "next/server";
import {
  mergeSamples,
  inferFields,
  postProcessInferredTypes,
  extractInlineObjectTypes,
  extractArrayItemTypes,
} from "@/lib/schema-inference";
import { BUILT_IN_TYPES } from "@/lib/builtin-types";
import type { SchemaType } from "@/lib/sanity-types";

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

  const inferredNames = new Set(types.map((t) => t.name));
  for (const builtin of BUILT_IN_TYPES) {
    if (!inferredNames.has(builtin.name)) {
      types.push(builtin);
    }
  }

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
