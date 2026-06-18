import type { QueryResult, ConnectionConfig, SchemaType } from "./sanity-types";

export async function executeQuery(
  connection: ConnectionConfig,
  query: string,
  params?: Record<string, unknown>,
): Promise<QueryResult> {
  const response = await fetch("/api/query", {
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
    const response = await fetch("/api/test-connection", {
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
  const response = await fetch("/api/schema", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connection }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      kind: "Schema",
      message: `Failed to fetch schema: HTTP ${response.status}`,
    }));
    throw error;
  }

  const json = await response.json();
  return json.types;
}
