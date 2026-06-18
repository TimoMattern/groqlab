import { useState, useMemo, useRef, type MouseEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUp, ArrowDown, X } from "lucide-react";

interface TableViewProps {
  data: unknown;
}

function flattenValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "object") {
    if (Array.isArray(value)) return `[${value.length} items]`;
    return "{...}";
  }
  return String(value);
}

const ROW_HEIGHT = 34;
const DETAIL_HEIGHT = 200;
const MIN_COLUMN_WIDTH = 120;
const DEFAULT_COLUMN_WIDTH = 180;

type Row = Record<string, unknown> & { _index: number };

type VirtualRow =
  | { type: "row"; row: Row }
  | { type: "detail"; row: Row };

export function TableView({ data }: TableViewProps) {
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const rows = useMemo(() => {
    if (!Array.isArray(data)) return [];
    const items = data.filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === "object" && !Array.isArray(item),
    );
    return items.map((item, i) => ({ _index: i, ...item })) as Row[];
  }, [data]);

  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        keys.add(key);
      }
    }
    return Array.from(keys).filter((k) => k !== "_index");
  }, [rows]);

  const sortedRows = useMemo(() => {
    if (!sortField) return rows as Row[];
    return [...rows].sort((a: Row, b: Row) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const aStr = flattenValue(aVal);
      const bStr = flattenValue(bVal);
      return sortAsc ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [rows, sortField, sortAsc]);

  const virtualRows: VirtualRow[] = useMemo(() => {
    const items: VirtualRow[] = [];
    for (const row of sortedRows) {
      items.push({ type: "row", row });
      if (expandedIndex === row._index) {
        items.push({ type: "detail", row });
      }
    }
    return items;
  }, [sortedRows, expandedIndex]);

  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollRef.current,
    initialRect: { height: 400, width: 800 },
    estimateSize: (i) =>
      virtualRows[i].type === "detail" ? DETAIL_HEIGHT : ROW_HEIGHT,
    overscan: 10,
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const toggleExpand = (index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  };

  const startResize = (event: MouseEvent<HTMLSpanElement>, column: string) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[column] ?? DEFAULT_COLUMN_WIDTH;

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const nextWidth = Math.max(
        MIN_COLUMN_WIDTH,
        startWidth + moveEvent.clientX - startX,
      );
      setColumnWidths((prev) => ({ ...prev, [column]: nextWidth }));
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  if (!Array.isArray(data)) return null;
  if (rows.length === 0) return null;

  const totalHeight = virtualizer.getTotalSize();

  return (
    <div className="overflow-auto" ref={scrollRef} data-testid="table-view">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="w-8 px-2 py-2" />
            {columns.map((col) => (
              <th
                key={col}
                className="relative cursor-pointer select-none px-3 py-2 text-left font-mono text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                style={{ width: columnWidths[col] ?? DEFAULT_COLUMN_WIDTH }}
                onClick={() => handleSort(col)}
              >
                <span className="inline-flex items-center gap-1">
                  {col}
                  {sortField === col && (
                    sortAsc ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )
                  )}
                </span>
                <span
                  className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-[var(--primary)]"
                  onMouseDown={(event) => startResize(event, col)}
                  aria-hidden="true"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody style={{ height: totalHeight, position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = virtualRows[virtualItem.index];
            if (item.type === "row") {
              const row = item.row;
              const isExpanded = expandedIndex === row._index;
              return (
                <tr
                  key={`row-${row._index}`}
                  className="cursor-pointer border-b border-[var(--muted)] hover:bg-[var(--muted)]"
                  style={{
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                    position: "absolute",
                    width: "100%",
                    display: "flex",
                  }}
                  onClick={() => toggleExpand(row._index)}
                >
                  <td className="flex w-8 items-center justify-center px-2 text-xs text-[var(--muted-foreground)]">
                    {isExpanded ? "▾" : "▸"}
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col}
                      className="min-w-0 shrink-0 truncate px-3 py-1.5 font-mono text-xs"
                      style={{ width: columnWidths[col] ?? DEFAULT_COLUMN_WIDTH }}
                      title={flattenValue(row[col])}
                    >
                      {flattenValue(row[col])}
                    </td>
                  ))}
                </tr>
              );
            }
            const row = item.row;
            return (
              <tr
                key={`detail-${row._index}`}
                style={{
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                  position: "absolute",
                  width: "100%",
                }}
              >
                <td colSpan={columns.length + 1} className="border-b border-[var(--border)] bg-[var(--background)] p-0">
                  <div className="flex h-full flex-col">
                    <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1">
                      <span className="text-xs font-medium text-[var(--muted-foreground)]">
                        Document #{row._index + 1}
                      </span>
                      <button
                        className="rounded p-0.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedIndex(null);
                        }}
                        aria-label="Close detail"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <pre className="flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-relaxed">
                      {JSON.stringify(
                        Object.fromEntries(
                          Object.entries(row).filter(([k]) => k !== "_index"),
                        ),
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
