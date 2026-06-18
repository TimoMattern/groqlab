import { describe, it, expect, beforeEach } from "vitest";
import { useHistoryStore } from "./history-store";

beforeEach(() => {
  useHistoryStore.setState({ entries: [] });
  localStorage.clear();
});

describe("history-store", () => {
  it("starts with empty entries", () => {
    expect(useHistoryStore.getState().entries).toEqual([]);
  });

  it("adds an entry", () => {
    useHistoryStore.getState().addEntry({
      query: "*[_type == 'post']",
      connectionId: "conn-1",
      connectionName: "Test",
      durationMs: 42,
      documentCount: 10,
      success: true,
    });
    const entries = useHistoryStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].query).toBe("*[_type == 'post']");
    expect(entries[0].durationMs).toBe(42);
    expect(entries[0].success).toBe(true);
  });

  it("assigns id and executedAt", () => {
    useHistoryStore.getState().addEntry({
      query: "test",
      connectionId: "c1",
      connectionName: "Test",
      durationMs: 0,
      documentCount: 0,
      success: true,
    });
    const entry = useHistoryStore.getState().entries[0];
    expect(entry.id).toBeDefined();
    expect(entry.id.length).toBeGreaterThan(0);
    expect(entry.executedAt).toBeDefined();
  });

  it("stores error entries", () => {
    useHistoryStore.getState().addEntry({
      query: "bad query",
      connectionId: "c1",
      connectionName: "Test",
      durationMs: 0,
      documentCount: 0,
      success: false,
      error: "Parse error",
    });
    const entry = useHistoryStore.getState().entries[0];
    expect(entry.success).toBe(false);
    expect(entry.error).toBe("Parse error");
  });

  it("prepends new entries", () => {
    useHistoryStore.getState().addEntry({
      query: "first",
      connectionId: "c1",
      connectionName: "Test",
      durationMs: 0,
      documentCount: 0,
      success: true,
    });
    useHistoryStore.getState().addEntry({
      query: "second",
      connectionId: "c1",
      connectionName: "Test",
      durationMs: 0,
      documentCount: 0,
      success: true,
    });
    const entries = useHistoryStore.getState().entries;
    expect(entries).toHaveLength(2);
    expect(entries[0].query).toBe("second");
    expect(entries[1].query).toBe("first");
  });

  it("removes an entry by id", () => {
    useHistoryStore.getState().addEntry({
      query: "test",
      connectionId: "c1",
      connectionName: "Test",
      durationMs: 0,
      documentCount: 0,
      success: true,
    });
    const id = useHistoryStore.getState().entries[0].id;
    useHistoryStore.getState().removeEntry(id);
    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });

  it("clears all entries", () => {
    useHistoryStore.getState().addEntry({
      query: "a",
      connectionId: "c1",
      connectionName: "Test",
      durationMs: 0,
      documentCount: 0,
      success: true,
    });
    useHistoryStore.getState().addEntry({
      query: "b",
      connectionId: "c1",
      connectionName: "Test",
      durationMs: 0,
      documentCount: 0,
      success: true,
    });
    useHistoryStore.getState().clearHistory();
    expect(useHistoryStore.getState().entries).toHaveLength(0);
  });

  it("limits entries to 100", () => {
    for (let i = 0; i < 110; i++) {
      useHistoryStore.getState().addEntry({
        query: `q-${i}`,
        connectionId: "c1",
        connectionName: "Test",
        durationMs: i,
        documentCount: 0,
        success: true,
      });
    }
    expect(useHistoryStore.getState().entries).toHaveLength(100);
  });

  it("persists to localStorage", () => {
    useHistoryStore.getState().addEntry({
      query: "persist-test",
      connectionId: "c1",
      connectionName: "Test",
      durationMs: 10,
      documentCount: 0,
      success: true,
    });
    const raw = localStorage.getItem("groqlab:history");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed[0].query).toBe("persist-test");
  });

  it("truncates long resultPreview", () => {
    useHistoryStore.getState().addEntry({
      query: "test",
      connectionId: "c1",
      connectionName: "Test",
      durationMs: 0,
      documentCount: 0,
      success: true,
      resultPreview: "x".repeat(500),
    });
    const preview = useHistoryStore.getState().entries[0].resultPreview;
    expect(preview).toBeDefined();
    expect(preview?.length).toBeLessThanOrEqual(203); // 200 + "..."
  });
});
