import type { QueryResult, ConnectionConfig, SchemaType } from "./sanity-types";
import { FlightRecorder } from "./flight-recorder";

async function recordFetch(
  input: RequestInfo,
  init?: RequestInit,
): Promise<Response> {
  const start = performance.now();
  try {
    const response = await fetch(input, init);
    const duration = performance.now() - start;
    let responseBody: unknown = null;
    try {
      const cloned = response.clone();
      responseBody = await cloned.json();
    } catch {
      // response may not be cloneable (e.g. mock in tests)
    }
    FlightRecorder.instance.recordApiCall(
      typeof input === "string" ? input : "url" in input ? input.url : String(input),
      init?.method || "GET",
      init?.body ? JSON.parse(init.body as string) : null,
      response.status,
      responseBody,
      duration,
    );
    return response;
  } catch (err) {
    const duration = performance.now() - start;
    FlightRecorder.instance.recordApiCall(
      typeof input === "string" ? input : "url" in input ? input.url : String(input),
      init?.method || "GET",
      init?.body ? JSON.parse(init.body as string) : null,
      0,
      { error: String(err) },
      duration,
    );
    throw err;
  }
}

export async function executeQuery(
  connection: ConnectionConfig,
  query: string,
  params?: Record<string, unknown>,
): Promise<QueryResult> {
  const response = await recordFetch("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection, query, params }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      kind: "Query",
      message: `HTTP ${response.status}`,
    }));
    throw error;
  }

  return response.json();
}

export async function testConnection(
  projectId: string,
  dataset: string,
): Promise<{ success: boolean; projectName?: string; error?: string }> {
  try {
    const response = await recordFetch("/api/test-connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, dataset }),
    });

    return response.json();
  } catch {
    return { success: false, error: "Network error. Check your connection." };
  }
}

export async function fetchSchema(
  connection: ConnectionConfig,
): Promise<SchemaType[]> {
  const response = await recordFetch("/api/schema", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection, token: connection.token }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      kind: "Schema",
      message: `Failed to fetch schema: HTTP ${response.status}`,
    }));
    throw error;
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(json.error);
  }
  return json.types ?? [];
}
