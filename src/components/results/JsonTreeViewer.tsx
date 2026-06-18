import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface JsonTreeViewerProps {
  data: unknown;
  maxDepth?: number;
}

function isExpandable(value: unknown): boolean {
  return value !== null && typeof value === "object";
}

function stringifyPrimitive(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function NodeValue({
  value,
  depth,
  maxDepth,
}: {
  value: unknown;
  depth: number;
  maxDepth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  if (!isExpandable(value)) {
    return (
      <span
        className={cn(
          "font-mono text-sm",
          value === null && "text-[var(--muted-foreground)]",
          typeof value === "string" && "text-green-700 dark:text-green-400",
          typeof value === "number" && "text-blue-600 dark:text-blue-400",
          typeof value === "boolean" && "text-purple-600 dark:text-purple-400",
        )}
      >
        {stringifyPrimitive(value)}
      </span>
    );
  }

  if (depth >= maxDepth) {
    return (
      <span className="font-mono text-xs text-[var(--muted-foreground)]">
        {Array.isArray(value) ? `[${value.length} items]` : "{...}"}
      </span>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);

  if (entries.length === 0) {
    return (
      <span className="font-mono text-sm text-[var(--muted-foreground)]">
        {isArray ? "[]" : "{}"}
      </span>
    );
  }

  const toggle = () => setExpanded(!expanded);
  const bracket = isArray ? "[" : "{";
  const closeBracket = isArray ? "]" : "}";

  return (
    <div>
      <button
        className="inline-flex items-center gap-0.5 align-middle text-sm"
        onClick={toggle}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
        )}
        <span className="font-mono text-sm">
          {bracket}
          <span className="text-xs text-[var(--muted-foreground)]">
            {entries.length} {isArray ? "items" : "keys"}
          </span>
          {closeBracket}
        </span>
      </button>
      {expanded && (
        <div className="ml-4 border-l border-[var(--border)] pl-3">
          {entries.map(([key, val]) => (
            <div key={key} className="py-0.5">
              <span className="font-mono text-sm text-[var(--foreground)]">
                {isArray ? "" : `${JSON.stringify(key)}: `}
              </span>
              <NodeValue value={val} depth={depth + 1} maxDepth={maxDepth} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function JsonTreeViewer({ data, maxDepth = 10 }: JsonTreeViewerProps) {
  return (
    <div className="overflow-auto p-3" data-testid="json-tree-viewer">
      <NodeValue value={data} depth={0} maxDepth={maxDepth} />
    </div>
  );
}
