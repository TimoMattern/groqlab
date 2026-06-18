import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HistoryPanel } from "./HistoryPanel";
import { useHistoryStore } from "@/stores/history-store";

beforeEach(() => {
  useHistoryStore.setState({ entries: [] });
});

function addEntry(overrides: Record<string, unknown> = {}) {
  useHistoryStore.getState().addEntry({
    query: "*[_type == 'post']",
    connectionId: "conn-1",
    connectionName: "Test",
    durationMs: 42,
    documentCount: 10,
    success: true,
    ...overrides,
  });
}

describe("HistoryPanel", () => {
  it("shows empty state", () => {
    const onReuse = vi.fn();
    render(<HistoryPanel onReuse={onReuse} />);
    expect(screen.getByText("No query history yet.")).toBeInTheDocument();
  });

  it("renders history entries", () => {
    addEntry();
    const onReuse = vi.fn();
    render(<HistoryPanel onReuse={onReuse} />);
    expect(screen.getByText("*[_type == 'post']")).toBeInTheDocument();
    expect(screen.getByText("Test")).toBeInTheDocument();
    expect(screen.getByText("42ms")).toBeInTheDocument();
    expect(screen.getByText("10 docs")).toBeInTheDocument();
  });

  it("calls onReuse when clicking an entry", () => {
    addEntry();
    const onReuse = vi.fn();
    render(<HistoryPanel onReuse={onReuse} />);
    fireEvent.click(screen.getByText("*[_type == 'post']"));
    expect(onReuse).toHaveBeenCalledWith("*[_type == 'post']");
  });

  it("removes an entry on delete button click", () => {
    addEntry();
    const onReuse = vi.fn();
    render(<HistoryPanel onReuse={onReuse} />);
    const deleteBtn = screen.getByLabelText("Delete history entry");
    fireEvent.click(deleteBtn);
    expect(screen.getByText("No query history yet.")).toBeInTheDocument();
  });

  it("clears all entries on clear button click", () => {
    addEntry({ query: "one" });
    addEntry({ query: "two" });
    const onReuse = vi.fn();
    render(<HistoryPanel onReuse={onReuse} />);

    expect(screen.getByText("one")).toBeInTheDocument();
    expect(screen.getByText("two")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("clear-history"));
    expect(screen.getByText("No query history yet.")).toBeInTheDocument();
  });

  it("shows error entries with error text", () => {
    addEntry({ success: false, error: "Parse error", documentCount: 0 });
    const onReuse = vi.fn();
    render(<HistoryPanel onReuse={onReuse} />);
    expect(screen.getByText("Parse error")).toBeInTheDocument();
  });

  it("does not show clear button when empty", () => {
    const onReuse = vi.fn();
    render(<HistoryPanel onReuse={onReuse} />);
    expect(screen.queryByTestId("clear-history")).not.toBeInTheDocument();
  });
});
