import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TableView } from "./TableView";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: (index: number) => number }) => ({
    getTotalSize: () =>
      Array.from({ length: count }, (_, index) => estimateSize(index)).reduce(
        (total, size) => total + size,
        0,
      ),
    getVirtualItems: () => {
      let start = 0;
      return Array.from({ length: count }, (_, index) => {
        const size = estimateSize(index);
        const item = { index, key: index, start, size };
        start += size;
        return item;
      });
    },
  }),
}));

describe("TableView", () => {
  it("renders table with column headers", () => {
    const data = [
      { _id: "1", title: "One", count: 42 },
      { _id: "2", title: "Two", count: 99 },
    ];
    render(<TableView data={data} />);
    expect(screen.getByText("_id")).toBeInTheDocument();
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("count")).toBeInTheDocument();
  });

  it("renders null for array of non-objects", () => {
    const data = ["a", "b", "c"];
    const { container } = render(<TableView data={data} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders null for non-array data", () => {
    const { container } = render(<TableView data={{ _id: "1" }} />);
    expect(container.firstChild).toBeNull();
  });

  it("expands a row to show document details", () => {
    const data = [{ _id: "1", title: "One", nested: { slug: "one" } }];
    render(<TableView data={data} />);

    fireEvent.click(screen.getByText("One"));

    expect(screen.getByText("Document #1")).toBeInTheDocument();
    expect(screen.getByText(/"nested"/)).toBeInTheDocument();
    expect(screen.getByText(/"slug": "one"/)).toBeInTheDocument();
  });

  it("resizes columns with the header resize handle", () => {
    const data = [{ _id: "1", title: "One" }];
    render(<TableView data={data} />);

    const titleHeader = screen.getByText("title").closest("th");
    const resizeHandle = titleHeader?.querySelector("span[aria-hidden='true']");
    expect(titleHeader).toBeInTheDocument();
    expect(resizeHandle).toBeInTheDocument();

    fireEvent.mouseDown(resizeHandle as Element, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 160 });
    fireEvent.mouseUp(window);

    expect(titleHeader).toHaveStyle({ width: "240px" });
  });
});
