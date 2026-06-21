import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConnectionList } from "./ConnectionList";
import { useConnectionStore } from "@/stores/connection-store";

beforeEach(() => {
  useConnectionStore.setState({ connections: [], activeId: null, statuses: {} });
});

vi.mock("@/lib/sanity-api", () => ({
  testConnection: vi.fn(),
}));

function makeConn(id: string, name?: string) {
  return {
    id,
    name: name ?? `Connection ${id}`,
    projectId: `proj-${id}`,
    dataset: "production",
    createdAt: "2026-01-01T00:00:00Z",
    token: "",
  };
}

describe("ConnectionList", () => {
  it("shows empty state when no connections", () => {
    render(<ConnectionList onAdd={() => {}} onEdit={() => {}} />);
    expect(screen.getByText("No connections yet.")).toBeInTheDocument();
  });

  it("renders connections from store", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1", "Proj A"), makeConn("c2", "Proj B")],
      activeId: null,
    });
    render(<ConnectionList onAdd={() => {}} onEdit={() => {}} />);
    expect(screen.getByText("Proj A")).toBeInTheDocument();
    expect(screen.getByText("Proj B")).toBeInTheDocument();
  });

  it("highlights active connection", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: "c1",
    });
    render(<ConnectionList onAdd={() => {}} onEdit={() => {}} />);
    const el = screen.getByTestId("connection-c1");
    expect(el.className).toContain("font-medium");
  });

  it("does not highlight inactive connection", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1"), makeConn("c2")],
      activeId: "c2",
    });
    render(<ConnectionList onAdd={() => {}} onEdit={() => {}} />);
    const el = screen.getByTestId("connection-c1");
    expect(el.className).not.toContain("font-medium");
  });

  it("calls setActive on click", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: null,
    });
    render(<ConnectionList onAdd={() => {}} onEdit={() => {}} />);
    fireEvent.click(screen.getByTestId("connection-c1"));
    expect(useConnectionStore.getState().activeId).toBe("c1");
  });

  it("removes connection on delete click", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: null,
    });
    render(<ConnectionList onAdd={() => {}} onEdit={() => {}} />);
    fireEvent.click(screen.getByLabelText("Delete connection Connection c1"));
    expect(useConnectionStore.getState().connections).toHaveLength(0);
  });

  it("calls onAdd when add button clicked", () => {
    let called = false;
    render(<ConnectionList onAdd={() => { called = true; }} onEdit={() => {}} />);
    fireEvent.click(screen.getByLabelText("Add connection"));
    expect(called).toBe(true);
  });

  it("calls onEdit when edit button clicked", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: null,
    });
    let edited: unknown = null;
    render(<ConnectionList onAdd={() => {}} onEdit={(conn) => { edited = conn; }} />);
    fireEvent.click(screen.getByLabelText("Edit connection Connection c1"));
    expect(edited).not.toBeNull();
    expect((edited as Record<string, unknown>).id).toBe("c1");
  });

  it("shows status dot with online status", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: null,
      statuses: { c1: { status: "online", lastChecked: "2026-06-14T12:00:00Z" } },
    });
    render(<ConnectionList onAdd={() => {}} onEdit={() => {}} />);
    const dot = screen.getByTestId("connection-c1").querySelector("span.rounded-full");
    expect(dot?.className).toContain("bg-green-500");
  });

  it("shows status dot with error status", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: null,
      statuses: { c1: { status: "error", error: "Failed" } },
    });
    render(<ConnectionList onAdd={() => {}} onEdit={() => {}} />);
    const dot = screen.getByTestId("connection-c1").querySelector("span.rounded-full");
    expect(dot?.className).toContain("bg-red-500");
  });

  it("shows checking status dot", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: null,
      statuses: { c1: { status: "checking" } },
    });
    render(<ConnectionList onAdd={() => {}} onEdit={() => {}} />);
    const dot = screen.getByTestId("connection-c1").querySelector("span.rounded-full");
    expect(dot?.className).toContain("bg-yellow-400");
  });

  it("renders check connection button", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: null,
    });
    render(<ConnectionList onAdd={() => {}} onEdit={() => {}} />);
    expect(screen.getByLabelText("Check connection Connection c1")).toBeInTheDocument();
  });

  it("renders edit connection button", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: null,
    });
    render(<ConnectionList onAdd={() => {}} onEdit={() => {}} />);
    expect(screen.getByLabelText("Edit connection Connection c1")).toBeInTheDocument();
  });
});
