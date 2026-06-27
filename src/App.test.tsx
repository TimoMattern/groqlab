import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Home from "./app/page";
import { useConnectionStore } from "@/stores/connection-store";
import { useHistoryStore } from "@/stores/history-store";

vi.mock("@/components/editor/QueryEditor", async () => {
  const React = await import("react");
  return {
    QueryEditor: React.forwardRef(
      ({ value, onChange }: { value: string; onChange: (value: string) => void }, _ref: React.Ref<unknown>) => (
        <textarea
          data-testid="query-editor"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ),
    ),
  };
});

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  useConnectionStore.setState({
    connections: [],
    activeId: null,
    statuses: {},
  });
  useHistoryStore.setState({ entries: [] });
});

describe("Home connection flow", () => {
  it("lets users add their first connection from the sidebar", () => {
    render(<Home />);

    fireEvent.click(screen.getByTestId("sidebar-tab-connections"));
    fireEvent.click(screen.getByTestId("add-connection"));
    fireEvent.change(screen.getByLabelText("Project ID"), {
      target: { value: "abc123" },
    });
    fireEvent.change(screen.getByLabelText("Dataset"), {
      target: { value: "production" },
    });
    fireEvent.change(screen.getByLabelText("API Token"), {
      target: { value: "sk-test-token" },
    });
    fireEvent.click(screen.getByText("Save"));

    expect(useConnectionStore.getState().connections).toHaveLength(1);
    expect(useConnectionStore.getState().activeId).toBe(
      useConnectionStore.getState().connections[0].id,
    );
    expect(screen.queryByText("Add Connection")).not.toBeInTheDocument();
  });

  it("lets users edit and delete an existing connection", () => {
    useConnectionStore.setState({
      connections: [
        {
          id: "c1",
          name: "Original",
          projectId: "abc123",
          dataset: "production",
          token: "sk-test-token",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      activeId: null,
      statuses: {},
    });

    render(<Home />);

    fireEvent.click(screen.getByTestId("sidebar-tab-connections"));
    fireEvent.click(screen.getByLabelText("Edit connection Original"));
    fireEvent.change(screen.getByLabelText("Display Name (optional)"), {
      target: { value: "Updated" },
    });
    fireEvent.click(screen.getByText("Save Changes"));

    expect(useConnectionStore.getState().connections[0].name).toBe("Updated");
    expect(screen.getByText("Updated")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Delete connection Updated"));

    expect(useConnectionStore.getState().connections).toHaveLength(0);
    expect(screen.getByText("No connections yet.")).toBeInTheDocument();
  });

  it("keeps separate queries and results per tab", async () => {
    useConnectionStore.setState({
      connections: [
        {
          id: "c1",
          name: "Test",
          projectId: "abc123",
          dataset: "production",
          token: "sk-test-token",
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
      activeId: "c1",
      statuses: {},
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const isAuthorQuery = String(body.query).includes("author");
        return {
          ok: true,
          json: async () => ({
            data: isAuthorQuery ? [{ _id: "a1" }, { _id: "a2" }] : [{ _id: "p1" }],
            durationMs: isAuthorQuery ? 20 : 10,
            documentCount: isAuthorQuery ? 2 : 1,
          }),
        };
      }),
    );

    render(<Home />);

    expect(screen.getByTestId("query-tab-query-tab-1")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("query-editor"), {
      target: { value: "*[_type == 'post']" },
    });
    fireEvent.click(screen.getByTestId("run-query"));
    expect(await screen.findByText("1 documents")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("add-query-tab"));
    expect(screen.getByTestId("query-editor")).toHaveValue("");
    expect(screen.getByText("Run a query to see results")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("query-editor"), {
      target: { value: "*[_type == 'author']" },
    });
    fireEvent.click(screen.getByTestId("run-query"));
    expect(await screen.findByText("2 documents")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Query 1"));
    expect(screen.getByTestId("query-editor")).toHaveValue("*[_type == 'post']");
    expect(screen.getByText("1 documents")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Query 2"));
    expect(screen.getByTestId("query-editor")).toHaveValue("*[_type == 'author']");
    expect(screen.getByText("2 documents")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close Query 2"));
    expect(screen.queryByText("Query 2")).not.toBeInTheDocument();
    expect(screen.getByTestId("query-editor")).toHaveValue("*[_type == 'post']");
  });

  it("clears only the active query tab from the toolbar", () => {
    render(<Home />);

    fireEvent.change(screen.getByTestId("query-editor"), {
      target: { value: "*[_type == 'post']" },
    });
    fireEvent.click(screen.getByTestId("add-query-tab"));
    fireEvent.change(screen.getByTestId("query-editor"), {
      target: { value: "*[_type == 'author']" },
    });

    fireEvent.click(screen.getByText("Query 1"));
    fireEvent.click(screen.getByTestId("clear-query"));

    expect(screen.getByTestId("query-editor")).toHaveValue("");

    fireEvent.click(screen.getByText("Query 2"));
    expect(screen.getByTestId("query-editor")).toHaveValue("*[_type == 'author']");
  });
});
