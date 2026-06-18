import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SchemaPanel } from "./SchemaPanel";
import { useConnectionStore } from "@/stores/connection-store";
import { useSchemaStore } from "@/stores/schema-store";
import type { SchemaType } from "@/lib/sanity-types";

const { mockFetchSchema } = vi.hoisted(() => ({ mockFetchSchema: vi.fn() }));
vi.mock("@/lib/sanity-api", () => ({ fetchSchema: mockFetchSchema }));

function makeConn(id: string) {
  return {
    id,
    name: `Conn ${id}`,
    projectId: `proj-${id}`,
    dataset: "production",
    createdAt: "2026-01-01T00:00:00Z",
  };
}

function makeType(name: string): SchemaType {
  return {
    name,
    title: name.charAt(0).toUpperCase() + name.slice(1),
    fields: [{ name: "title", type: "string", isArray: false, isReference: false }],
  };
}

beforeEach(() => {
  useConnectionStore.setState({ connections: [], activeId: null });
  useSchemaStore.setState({ types: {}, isLoading: {}, error: {} });
});

describe("SchemaPanel", () => {
  it("shows no-connection message when no active connection", () => {
    render(<SchemaPanel onInsert={() => {}} />);
    expect(screen.getByText("Select a connection to view schema")).toBeInTheDocument();
  });

  it("shows empty state when connection has no schema loaded", async () => {
    useSchemaStore.getState().setTypes("c1", []);
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: "c1",
    });
    render(<SchemaPanel onInsert={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("No schema loaded.")).toBeInTheDocument();
    });
  });

  it("renders schema types from store", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: "c1",
    });
    useSchemaStore.getState().setTypes("c1", [
      makeType("post"),
      makeType("author"),
    ]);
    render(<SchemaPanel onInsert={() => {}} />);
    expect(screen.getByText("post")).toBeInTheDocument();
    expect(screen.getByText("author")).toBeInTheDocument();
  });

  it("calls onInsert with type name when clicking type in search mode", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: "c1",
    });
    useSchemaStore.getState().setTypes("c1", [makeType("post")]);
    const onInsert = vi.fn();
    render(<SchemaPanel onInsert={onInsert} />);
    const input = screen.getByPlaceholderText("Search types...");
    fireEvent.change(input, { target: { value: "post" } });
    fireEvent.click(screen.getByText("post"));
    expect(onInsert).toHaveBeenCalledWith("post");
  });

  it("calls onInsert with field name when clicking field", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: "c1",
    });
    useSchemaStore.getState().setTypes("c1", [makeType("post")]);
    const onInsert = vi.fn();
    render(<SchemaPanel onInsert={onInsert} />);
    // First expand the type
    fireEvent.click(screen.getByText("post"));
    // Then click field
    fireEvent.click(screen.getByText("title"));
    expect(onInsert).toHaveBeenCalledWith("title");
  });

  it("filters types by search query", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: "c1",
    });
    useSchemaStore.getState().setTypes("c1", [
      makeType("post"),
      makeType("author"),
    ]);
    render(<SchemaPanel onInsert={() => {}} />);
    const input = screen.getByPlaceholderText("Search types...");
    fireEvent.change(input, { target: { value: "post" } });
    expect(screen.getByText("post")).toBeInTheDocument();
    expect(screen.queryByText("author")).not.toBeInTheDocument();
  });

  it("shows loading state", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: "c1",
    });
    useSchemaStore.getState().setLoading("c1", true);
    render(<SchemaPanel onInsert={() => {}} />);
    expect(screen.getByText("Loading schema...")).toBeInTheDocument();
  });

  it("shows error state", async () => {
    mockFetchSchema.mockRejectedValue(new Error("Failed to fetch"));
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: "c1",
    });
    render(<SchemaPanel onInsert={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
    });
  });

  it("does not crash when re-rendering with empty types", () => {
    useSchemaStore.getState().setTypes("c1", []);
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: "c1",
    });
    const { rerender } = render(<SchemaPanel onInsert={() => {}} />);
    // Re-render multiple times — regression test for infinite loop
    for (let i = 0; i < 10; i++) {
      rerender(<SchemaPanel onInsert={() => {}} />);
    }
    expect(screen.getByText("No schema loaded.")).toBeInTheDocument();
  });

  it("sorts types alphabetically", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: "c1",
    });
    useSchemaStore.getState().setTypes("c1", [
      makeType("zebra"),
      makeType("apple"),
      makeType("post"),
    ]);
    render(<SchemaPanel onInsert={() => {}} />);
    const items = screen.getAllByText(/apple|post|zebra/);
    expect(items[0]).toHaveTextContent("apple");
    expect(items[1]).toHaveTextContent("post");
    expect(items[2]).toHaveTextContent("zebra");
  });

  it("sorts fields alphabetically", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: "c1",
    });
    useSchemaStore.getState().setTypes("c1", [
      {
        name: "post",
        title: "Post",
        fields: [
          { name: "zebra", type: "string", isArray: false, isReference: false },
          { name: "apple", type: "string", isArray: false, isReference: false },
          { name: "title", type: "string", isArray: false, isReference: false },
        ],
      },
    ]);
    render(<SchemaPanel onInsert={() => {}} />);
    fireEvent.click(screen.getByText("post"));
    const items = screen.getAllByText(/apple|title|zebra/);
    expect(items[0]).toHaveTextContent("apple");
    expect(items[1]).toHaveTextContent("title");
    expect(items[2]).toHaveTextContent("zebra");
  });
});
