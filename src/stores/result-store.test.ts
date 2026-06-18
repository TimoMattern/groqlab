import { describe, it, expect, beforeEach } from "vitest";
import { useResultStore } from "./result-store";

beforeEach(() => {
  useResultStore.setState({
    data: null,
    durationMs: null,
    documentCount: null,
    error: null,
    isLoading: false,
  });
});

describe("result-store", () => {
  it("starts in idle state", () => {
    const s = useResultStore.getState();
    expect(s.data).toBeNull();
    expect(s.durationMs).toBeNull();
    expect(s.documentCount).toBeNull();
    expect(s.error).toBeNull();
    expect(s.isLoading).toBe(false);
  });

  it("setResult stores data and clears error", () => {
    const data = { _id: "123", title: "Hello" };
    useResultStore.getState().setResult(data, 42, 1);
    const s = useResultStore.getState();
    expect(s.data).toEqual(data);
    expect(s.durationMs).toBe(42);
    expect(s.documentCount).toBe(1);
    expect(s.error).toBeNull();
    expect(s.isLoading).toBe(false);
  });

  it("setResult handles array data", () => {
    const data = [{ _id: "a" }, { _id: "b" }];
    useResultStore.getState().setResult(data, 100, 2);
    const s = useResultStore.getState();
    expect(s.data).toHaveLength(2);
    expect(s.documentCount).toBe(2);
    expect(s.durationMs).toBe(100);
  });

  it("setError stores error and clears data", () => {
    useResultStore.getState().setError("Something went wrong");
    const s = useResultStore.getState();
    expect(s.error).toBe("Something went wrong");
    expect(s.data).toBeNull();
    expect(s.durationMs).toBeNull();
    expect(s.documentCount).toBeNull();
    expect(s.isLoading).toBe(false);
  });

  it("setLoading toggles loading state", () => {
    useResultStore.getState().setLoading(true);
    expect(useResultStore.getState().isLoading).toBe(true);
    useResultStore.getState().setLoading(false);
    expect(useResultStore.getState().isLoading).toBe(false);
  });

  it("setLoading does not clear existing data", () => {
    useResultStore.getState().setResult({ x: 1 }, 50, 1);
    useResultStore.getState().setLoading(true);
    const s = useResultStore.getState();
    expect(s.data).toEqual({ x: 1 });
    expect(s.durationMs).toBe(50);
    expect(s.isLoading).toBe(true);
  });

  it("clear resets all to initial state", () => {
    useResultStore.getState().setResult({ x: 1 }, 50, 1);
    useResultStore.getState().clear();
    const s = useResultStore.getState();
    expect(s.data).toBeNull();
    expect(s.durationMs).toBeNull();
    expect(s.documentCount).toBeNull();
    expect(s.error).toBeNull();
    expect(s.isLoading).toBe(false);
  });

  it("setResult overwrites previous result", () => {
    useResultStore.getState().setResult({ first: true }, 10, 1);
    useResultStore.getState().setResult({ second: true }, 20, 2);
    const s = useResultStore.getState();
    expect(s.data).toEqual({ second: true });
    expect(s.durationMs).toBe(20);
    expect(s.documentCount).toBe(2);
  });
});
