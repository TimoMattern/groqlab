import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResultPanel } from "./ResultPanel";
import { useResultStore } from "@/stores/result-store";

beforeEach(() => {
  useResultStore.setState({
    data: null,
    durationMs: null,
    documentCount: null,
    error: null,
    isLoading: false,
  });
});

describe("ResultPanel", () => {
  it("shows empty state when no data", () => {
    render(<ResultPanel />);
    expect(screen.getByText("Run a query to see results")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    useResultStore.getState().setLoading(true);
    render(<ResultPanel />);
    expect(screen.getByText("Running query...")).toBeInTheDocument();
  });

  it("shows error state", () => {
    useResultStore.getState().setError("Query failed");
    render(<ResultPanel />);
    expect(screen.getByText("Query failed")).toBeInTheDocument();
  });

  it("shows result data with metadata", () => {
    useResultStore
      .getState()
      .setResult([{ _id: "1", title: "Hello" }], 42, 1);
    render(<ResultPanel />);
    expect(screen.getByText("1 documents")).toBeInTheDocument();
    expect(screen.getByText("42ms")).toBeInTheDocument();
  });

  it("shows formatted duration in seconds", () => {
    useResultStore.getState().setResult([], 1500, 0);
    render(<ResultPanel />);
    expect(screen.getByText("1.50s")).toBeInTheDocument();
  });

  it("renders tree view by default", () => {
    const data = { _id: "1", name: "test" };
    useResultStore.getState().setResult(data, 10, 1);
    render(<ResultPanel />);
    expect(screen.getByTestId("json-tree-viewer")).toBeInTheDocument();
  });

  it("switches to raw view on button click", () => {
    const data = { name: "hello" };
    useResultStore.getState().setResult(data, 10, 1);
    render(<ResultPanel />);
    fireEvent.click(screen.getByText("Raw"));
    expect(screen.getByText(/"name"/)).toBeInTheDocument();
    expect(screen.getByText(/"hello"/)).toBeInTheDocument();
  });

  it("switches to table view for arrays of objects", () => {
    const data = [
      { _id: "1", title: "One" },
      { _id: "2", title: "Two" },
    ];
    useResultStore.getState().setResult(data, 10, 2);
    render(<ResultPanel />);
    fireEvent.click(screen.getByText("Table"));
    expect(screen.getByTestId("table-view")).toBeInTheDocument();
    expect(screen.getByText("_id")).toBeInTheDocument();
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("disables table button for non-array data", () => {
    useResultStore.getState().setResult({ _id: "1" }, 10, 1);
    render(<ResultPanel />);
    const tableBtn = screen.getByText("Table").closest("button");
    expect(tableBtn).toBeDisabled();
  });
});
