import { NextRequest, NextResponse } from "next/server";

const SANITY_API_VERSION = "v2026-02-01";

function buildQueryUrl(projectId: string, dataset: string): string {
  return `https://${projectId}.api.sanity.io/${SANITY_API_VERSION}/data/query/${dataset}`;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { connection, query, params } = body;

  if (!connection?.projectId || !connection?.dataset || !query) {
    return NextResponse.json(
      { kind: "Query", message: "Missing connection or query parameters" },
      { status: 400 },
    );
  }

  const url = buildQueryUrl(connection.projectId, connection.dataset);

  const requestBody: Record<string, unknown> = { query };
  if (params) requestBody.params = params;

  const startTime = performance.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const durationMs = performance.now() - startTime;

    if (!response.ok) {
      const errorBody = await response.text();
      let message: string;
      try {
        const parsed = JSON.parse(errorBody);
        message = parsed.message || parsed.error?.description || `HTTP ${response.status}`;
      } catch {
        message = errorBody || `HTTP ${response.status}`;
      }

      if (response.status === 401) {
        return NextResponse.json(
          { kind: "Connection", message: "Unauthorized. The dataset may be private." },
          { status: 401 },
        );
      }
      if (response.status === 429) {
        return NextResponse.json(
          { kind: "Query", message: "Rate limited. Try again shortly." },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { kind: "Query", message },
        { status: response.status },
      );
    }

    const json = await response.json();

    if (json.error) {
      return NextResponse.json(
        {
          kind: "Query",
          message: json.error.description || json.error.message || "Query error",
        },
        { status: 400 },
      );
    }

    const result = json.result ?? json;

    return NextResponse.json({
      data: result,
      durationMs: Math.round(durationMs),
      documentCount: Array.isArray(result) ? result.length : 1,
    });
  } catch {
    const durationMs = performance.now() - startTime;
    return NextResponse.json(
      {
        kind: "Connection",
        message: "Network error. Check your connection.",
        durationMs: Math.round(durationMs),
      },
      { status: 502 },
    );
  }
}
