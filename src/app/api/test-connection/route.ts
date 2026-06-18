import { NextRequest, NextResponse } from "next/server";

const SANITY_API_VERSION = "v2026-02-01";

function buildQueryUrl(projectId: string, dataset: string): string {
  return `https://${projectId}.api.sanity.io/${SANITY_API_VERSION}/data/query/${dataset}`;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { projectId, dataset } = body;

  if (!projectId || !dataset) {
    return NextResponse.json(
      { success: false, error: "Missing projectId or dataset" },
      { status: 400 },
    );
  }

  const url = buildQueryUrl(projectId, dataset);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: 'count(*[_type == "sanity.document.type"][0..1])',
      }),
    });

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      });
    }

    const json = await response.json();
    if (json.error) {
      return NextResponse.json({
        success: false,
        error: json.error.description || json.error.message,
      });
    }

    return NextResponse.json({
      success: true,
      projectName: `${projectId}/${dataset}`,
    });
  } catch {
    return NextResponse.json({
      success: false,
      error: "Network error. Check your connection.",
    });
  }
}
