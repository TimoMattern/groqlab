import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Home from "./app/page";
import { useConnectionStore } from "@/stores/connection-store";

vi.mock("@/components/editor/QueryEditor", () => ({
  QueryEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea
      data-testid="query-editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

beforeEach(() => {
  localStorage.clear();
  useConnectionStore.setState({
    connections: [],
    activeId: null,
    statuses: {},
  });
});

describe("Home connection flow", () => {
  it("lets users add their first connection from the default sidebar", () => {
    render(<Home />);

    fireEvent.click(screen.getByTestId("add-connection"));
    fireEvent.change(screen.getByLabelText("Project ID"), {
      target: { value: "abc123" },
    });
    fireEvent.change(screen.getByLabelText("Dataset"), {
      target: { value: "production" },
    });
    fireEvent.click(screen.getByText("Save"));

    expect(useConnectionStore.getState().connections).toHaveLength(1);
    expect(useConnectionStore.getState().activeId).toBe(
      useConnectionStore.getState().connections[0].id,
    );
    expect(screen.queryByText("Add Connection")).not.toBeInTheDocument();
  });
});
