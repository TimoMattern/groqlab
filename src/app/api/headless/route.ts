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

if (typeof globalThis.localStorage === "undefined") {
  class MockStorage {
    private store = new Map<string, string>();
    getItem(key: string): string | null { return this.store.get(key) ?? null; }
    setItem(key: string, value: string): void { this.store.set(key, value); }
    removeItem(key: string): void { this.store.delete(key); }
    clear(): void { this.store.clear(); }
    get length(): number { return this.store.size; }
    key(index: number): string | null { return [...this.store.keys()][index] ?? null; }
  }
  (globalThis as unknown as Record<string, unknown>).localStorage = new MockStorage();
}

// ─── Server-side recording ─────────────────────────────────────────────────────

interface RecordedEvent {
  type: "command" | "snapshot";
  ts: string;
  command?: string;
  args?: Record<string, unknown>;
  response?: unknown;
  error?: string;
  durationMs: number;
}

let recordingEnabled = false;
let recordingEvents: RecordedEvent[] = [];
let recordingStartedAt: string | null = null;

function resetRecording(): void {
  recordingEvents = [];
  recordingEnabled = false;
  recordingStartedAt = null;
}

function getRecordingState(): { active: boolean; eventCount: number; startedAt: string | null } {
  return { active: recordingEnabled, eventCount: recordingEvents.length, startedAt: recordingStartedAt };
}

const SANITY_API_VERSION = "v2026-02-01";
const SANITY_GROQ_VERSION = "v2021-06-07";

function queryUrl(projectId: string, dataset: string): string {
  return `https://${projectId}.api.sanity.io/${SANITY_API_VERSION}/data/query/${dataset}`;
}

async function queryGroq(
  url: string,
  groq: string,
  token?: string,
): Promise<unknown> {
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
  if (json.error) throw new Error(json.error.description || json.error.message || "Query error");
  return json.result;
}

async function inferSchema(
  projectId: string,
  dataset: string,
  token?: string,
): Promise<SchemaType[]> {
  const url = `https://${projectId}.apicdn.sanity.io/${SANITY_GROQ_VERSION}/data/query/${dataset}`;
  const fallbackUrl = queryUrl(projectId, dataset);

  async function q(groq: string): Promise<unknown> {
    try {
      return await queryGroq(url, groq, token);
    } catch {
      return await queryGroq(fallbackUrl, groq, token);
    }
  }

  const rawTypeNames = await q("array::unique(*[]._type)");
  const typeNames = Array.isArray(rawTypeNames) ? (rawTypeNames as string[]) : [];
  if (typeNames.length === 0) return [];

  const sampleDocs: Record<string, unknown>[] = [];
  for (const typeName of typeNames) {
    const escaped = typeName.replace(/['\\]/g, "\\$&");
    let docs: unknown;
    try {
      docs = await q(`*[_type == '${escaped}'][0...5]`);
    } catch {
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

  return types;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { command, args } = body as { command: string; args: Record<string, unknown> };

  const startTime = performance.now();

  try {
    let data: unknown;
    let error: string | undefined;

    // ─── Recording commands ──────────────────────────────────────────────

    if (command.startsWith("recording.") || command === "recording") {
      switch (command) {
        case "recording.start": {
          const { intervalMs } = args as { intervalMs?: number };
          recordingEnabled = true;
          recordingEvents = [];
          recordingStartedAt = new Date().toISOString();
          data = { success: true, startedAt: recordingStartedAt, intervalMs: intervalMs ?? null };
          break;
        }
        case "recording.stop": {
          recordingEnabled = false;
          data = { success: true, eventCount: recordingEvents.length };
          break;
        }
        case "recording.export": {
          data = {
            meta: {
              version: 1,
              startedAt: recordingStartedAt,
              appVersion: "headless",
              connectionId: null,
              connectionProjectId: null,
              connectionDataset: null,
            },
            events: [...recordingEvents],
            exportTimestamp: new Date().toISOString(),
          };
          break;
        }
        case "recording.clear": {
          resetRecording();
          data = { success: true };
          break;
        }
        case "recording.status": {
          data = getRecordingState();
          break;
        }
        default: {
          return NextResponse.json(
            { error: `Unknown recording command: ${command}. Use: start, stop, export, clear, status` },
            { status: 400 },
          );
        }
      }

      return NextResponse.json({
        data,
        commandId: crypto.randomUUID(),
        durationMs: Math.round(performance.now() - startTime),
      });
    }

    // ─── Standard commands ───────────────────────────────────────────────

    switch (command) {
      case "query.execute": {
        const conn = (args as Record<string, unknown>).connection as Record<string, string> | undefined;
        const query = (args as Record<string, unknown>).query as string;
        const params = (args as Record<string, unknown>).params as Record<string, unknown> | undefined;
        if (!query) {
          return NextResponse.json({ error: "Missing query" }, { status: 400 });
        }
        if (!conn?.projectId || !conn?.dataset) {
          return NextResponse.json({ error: "Missing connection (projectId, dataset)" }, { status: 400 });
        }
        const url = queryUrl(conn.projectId, conn.dataset);
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (conn.token) headers.Authorization = `Bearer ${conn.token}`;
        const requestBody: Record<string, unknown> = { query };
        if (params) requestBody.params = params;
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || `HTTP ${response.status}`);
        }
        const json = await response.json();
        if (json.error) throw new Error(json.error.description || json.error.message || "Query error");
        const result = json.result ?? json;
        data = {
          data: result,
          durationMs: Math.round(performance.now() - startTime),
          documentCount: Array.isArray(result) ? result.length : 1,
        };
        break;
      }

      case "connection.test": {
        const { projectId, dataset } = args as { projectId: string; dataset: string };
        if (!projectId || !dataset) {
          return NextResponse.json({ error: "Missing projectId or dataset" }, { status: 400 });
        }
        const url = queryUrl(projectId, dataset);
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: 'count(*[_type == "sanity.document.type"][0..1])' }),
          });
          if (!response.ok) {
            data = { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
          } else {
            const json = await response.json();
            if (json.error) {
              data = { success: false, error: json.error.description || json.error.message };
            } else {
              data = { success: true, projectName: `${projectId}/${dataset}` };
            }
          }
        } catch {
          data = { success: false, error: "Network error. Check your connection." };
        }
        break;
      }

      case "schema.fetch": {
        const conn = (args as Record<string, unknown>).connection as Record<string, string> | undefined;
        if (!conn?.projectId || !conn?.dataset) {
          return NextResponse.json({ error: "Missing connection (projectId, dataset)" }, { status: 400 });
        }
        const types = await inferSchema(conn.projectId, conn.dataset, conn.token || undefined);
        data = types;
        break;
      }

      case "autocomplete.trigger": {
        const { before, types } = args as { before: string; types?: SchemaType[] };
        if (!before) {
          return NextResponse.json({ error: "Missing 'before' (text before cursor)" }, { status: 400 });
        }

        const [mod, stateMod, autoMod, connStore, schemaStore] = await Promise.all([
          import("@/lib/groq/groq-autocomplete"),
          import("@codemirror/state"),
          import("@codemirror/autocomplete"),
          import("@/stores/connection-store"),
          import("@/stores/schema-store"),
        ]);

        const connId = "headless-conn";
        connStore.useConnectionStore.setState({
          connections: [{
            id: connId, projectId: "", dataset: "", token: "",
            name: "Headless", createdAt: new Date().toISOString(),
          }],
          activeId: connId,
        });
        if (types) {
          schemaStore.useSchemaStore.setState({ types: { [connId]: types } });
        }

        const state = stateMod.EditorState.create({ doc: before });
        const ctx = new autoMod.CompletionContext(state, state.doc.length, false);
        const result = mod.groqCompletionSource(ctx);

        if (result) {
          data = {
            from: result.from,
            options: result.options.map((o) => ({
              label: o.label,
              type: o.type,
              detail: o.detail,
              ...(typeof o.apply === "string" ? { apply: o.apply } : {}),
              ...(typeof o.boost === "number" ? { boost: o.boost } : {}),
            })),
          };
        } else {
          data = { from: before.length, options: [] };
        }
        break;
      }

      default: {
        return NextResponse.json(
          { error: `Unknown command: ${command}. Available: query.execute, connection.test, schema.fetch, autocomplete.trigger, recording.*` },
          { status: 400 },
        );
      }
    }

    // If recording is active, log this command and its result
    if (recordingEnabled) {
      recordingEvents.push({
        type: "command",
        ts: new Date().toISOString(),
        command,
        args: sanitizeArgs(args),
        response: data,
        error,
        durationMs: Math.round(performance.now() - startTime),
      });
    }

    return NextResponse.json({
      data,
      commandId: crypto.randomUUID(),
      durationMs: Math.round(performance.now() - startTime),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Record the error if recording is active
    if (recordingEnabled) {
      recordingEvents.push({
        type: "command",
        ts: new Date().toISOString(),
        command,
        args: sanitizeArgs(args),
        response: null,
        error: errorMsg,
        durationMs: Math.round(performance.now() - startTime),
      });
    }

    return NextResponse.json(
      { error: errorMsg },
      { status: 500 },
    );
  }

  function sanitizeArgs(a: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...a };
    if (sanitized.connection && typeof sanitized.connection === "object") {
      sanitized.connection = { ...(sanitized.connection as Record<string, unknown>) };
      delete (sanitized.connection as Record<string, unknown>).token;
    }
    if (sanitized.token) delete sanitized.token;
    return sanitized;
  }
}
