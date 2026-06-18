import { describe, it, expect, beforeEach, vi } from "vitest";
import { executeQuery, testConnection, fetchSchema } from "./sanity-api";
import type { ConnectionConfig } from "./sanity-types";

function makeConn(overrides?: Partial<ConnectionConfig>): ConnectionConfig {
  return {
    id: "c1",
    name: "Test",
    projectId: "abc123",
    dataset: "production",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("executeQuery", () => {
  it("calls /api/query with connection and query", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ _id: "1" }], durationMs: 42, documentCount: 1 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await executeQuery(makeConn(), "*[_type == 'post']");
    expect(result.data).toEqual([{ _id: "1" }]);
    expect(result.documentCount).toBe(1);
    expect(result.durationMs).toBe(42);

    const url = mockFetch.mock.calls[0][0];
    expect(url).toBe("/api/query");
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.connection.projectId).toBe("abc123");
    expect(body.query).toBe("*[_type == 'post']");
  });

  it("sends params when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], durationMs: 10, documentCount: 0 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await executeQuery(makeConn(), "*[_type == $type]", { type: "post" });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params).toEqual({ type: "post" });
  });

  it("throws error on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ kind: "Connection", message: "Unauthorized" }),
      }),
    );

    await expect(executeQuery(makeConn(), "*")).rejects.toMatchObject({
      kind: "Connection",
    });
  });

  it("throws error with fallback message on non-ok with unparseable body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error("not json")),
      }),
    );

    await expect(executeQuery(makeConn(), "*")).rejects.toMatchObject({
      message: "HTTP 500",
    });
  });
});

describe("testConnection", () => {
  it("returns success on valid connection", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, projectName: "abc123/production" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await testConnection("abc123", "production");
    expect(result.success).toBe(true);
    expect(result.projectName).toContain("abc123");

    const url = mockFetch.mock.calls[0][0];
    expect(url).toBe("/api/test-connection");
  });

  it("returns failure on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    const result = await testConnection("abc123", "production");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
  });
});

describe("fetchSchema", () => {
  const mockTypes = [
    {
      name: "post",
      title: "Post",
      fields: [
        { name: "title", type: "string", isArray: false, isReference: false },
        { name: "author", type: "author", isArray: false, isReference: true },
      ],
    },
    {
      name: "author",
      title: "Author",
      fields: [{ name: "name", type: "string", isArray: false, isReference: false }],
    },
  ];

  it("fetches schema via /api/schema", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ types: mockTypes }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const types = await fetchSchema(makeConn());
    expect(types).toHaveLength(2);
    expect(types[0].name).toBe("post");
    expect(types[1].name).toBe("author");

    const url = mockFetch.mock.calls[0][0];
    expect(url).toBe("/api/schema");
  });

  it("throws Schema error on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ kind: "Schema", message: "Forbidden" }),
      }),
    );

    await expect(
      fetchSchema(makeConn()),
    ).rejects.toMatchObject({
      kind: "Schema",
    });
  });
});
