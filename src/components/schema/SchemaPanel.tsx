import { useState, useMemo, useEffect, useRef } from "react";
import { useSchemaStore } from "@/stores/schema-store";
import { useSchema } from "@/hooks/useSchema";
import { getActiveConnection } from "@/stores/connection-store";
import { Database, RefreshCw, Search, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import type { SchemaType, SchemaField } from "@/lib/sanity-types";

interface SchemaPanelProps {
  onInsert: (text: string) => void;
}

function FieldRow({ field, depth, onInsert, types, visitedTypes = new Set(), connectionId, parentTypeName, fieldPath }: {
  field: SchemaField;
  depth: number;
  onInsert?: (text: string) => void;
  types: SchemaType[];
  visitedTypes?: Set<string>;
  connectionId: string;
  parentTypeName: string;
  fieldPath: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [resolving, setResolving] = useState(false);
  const resolveRef = useSchemaStore((s) => s.resolveRef);
  const connection = getActiveConnection();
  const didAutoResolve = useRef(false);

  useEffect(() => {
    if (expanded && !didAutoResolve.current && connection) {
      didAutoResolve.current = true;
      const refs = collectUnresolvedRefs(childFields, parentTypeName, fieldPath);
      for (const ref of refs) {
        resolveRef(connectionId, connection, ref.parentTypeName, ref.fieldPath);
      }
    }
  });

  const typeLabel = field.isArray
    ? `${field.type}[]`
    : field.isReference
      ? field.type === "reference"
        ? "ref(\u2026)"
        : `ref(${field.type})`
      : field.type;

  const hasObjectFields = field.fields && field.fields.length > 0;
  const refTarget = field.isReference
    ? resolveTypeName(field.type, types)
    : field.type === "unknown"
      ? resolveTypeName(field.name, types)
      : undefined;

  const isUnresolvedRef = field.isReference && field.type === "reference" && !refTarget;
  const isCircular = refTarget ? visitedTypes.has(refTarget.name) : false;
  const hasChildren = (hasObjectFields || !!refTarget || isUnresolvedRef) && !isCircular;

  const childFields = refTarget && !hasObjectFields
    ? refTarget.fields
    : field.fields ?? [];

  const nextVisited = refTarget && !isCircular
    ? new Set([...visitedTypes, refTarget.name])
    : visitedTypes;

  async function handleClick() {
    if (isUnresolvedRef && connection) {
      setResolving(true);
      const ok = await resolveRef(connectionId, connection, parentTypeName, fieldPath);
      if (ok) setExpanded(true);
      setResolving(false);
    } else if (hasChildren) {
      setExpanded(!expanded);
    } else if (onInsert) {
      onInsert(field.name);
    }
  }

  return (
    <div>
      <button
        className="flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-[var(--muted)]"
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={handleClick}
        title={`${field.name}: ${typeLabel}`}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
          )
        ) : resolving ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[var(--muted-foreground)]" />
        ) : (
          <span className="w-3" />
        )}
        <span className="font-medium text-[var(--foreground)]">{field.name}</span>
        <span className="text-[var(--muted-foreground)]">{typeLabel}</span>
      </button>
      {expanded && hasChildren && (
        <div>
          {childFields.map((child) => (
            <FieldRow
              key={child.name}
              field={child}
              depth={depth + 1}
              onInsert={onInsert}
              types={types}
              visitedTypes={nextVisited}
              connectionId={connectionId}
              parentTypeName={parentTypeName}
              fieldPath={`${fieldPath}.${child.name}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function collectUnresolvedRefs(
  fields: SchemaField[],
  parentTypeName: string,
  baseFieldPath: string,
): { parentTypeName: string; fieldPath: string }[] {
  const result: { parentTypeName: string; fieldPath: string }[] = [];
  for (const field of fields) {
    const fieldPath = baseFieldPath ? `${baseFieldPath}.${field.name}` : field.name;
    if (field.isReference && field.type === "reference") {
      result.push({ parentTypeName, fieldPath });
    }
    if (field.fields && field.fields.length > 0) {
      result.push(...collectUnresolvedRefs(field.fields, parentTypeName, fieldPath));
    }
  }
  return result;
}

function resolveTypeName(typeName: string, types: SchemaType[]): SchemaType | undefined {
  let found = types.find((t) => t.name === typeName);
  if (found) return found;
  found = types.find((t) => {
    const lastSegment = t.name.split(".").pop() || "";
    return lastSegment.toLowerCase().startsWith(typeName.toLowerCase());
  });
  if (found) return found;
  return types.find((t) => {
    const lower = typeName.toLowerCase();
    return lower.startsWith(t.name.toLowerCase()) && t.name.toLowerCase() !== lower;
  });
}

function fieldMatches(field: SchemaField, search: string): boolean {
  if (field.name.toLowerCase().includes(search) || field.type.toLowerCase().includes(search)) return true;
  if (field.fields) return field.fields.some((f) => fieldMatches(f, search));
  return false;
}

function TypeRow({
  type,
  search,
  onInsert,
  types,
  connectionId,
}: {
  type: SchemaType;
  search: string;
  onInsert: (text: string) => void;
  types: SchemaType[];
  connectionId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const didAutoResolve = useRef(false);
  const resolveRef = useSchemaStore((s) => s.resolveRef);
  const connection = getActiveConnection();

  useEffect(() => {
    if (expanded && !didAutoResolve.current && connection) {
      didAutoResolve.current = true;
      const refs = collectUnresolvedRefs(type.fields, type.name, "");
      for (const ref of refs) {
        resolveRef(connectionId, connection, ref.parentTypeName, ref.fieldPath);
      }
    }
  });

  const match =
    !search ||
    type.name.toLowerCase().includes(search) ||
    (type.title ?? "").toLowerCase().includes(search) ||
    type.fields.some((f) => fieldMatches(f, search));

  const filteredFields = useMemo(() => {
    const fields =
      search.length > 0
        ? type.fields.filter((f) => fieldMatches(f, search))
        : type.fields;
    return [...fields].sort((a, b) => a.name.localeCompare(b.name));
  }, [search, type.fields]);

  if (!match) return null;

  return (
    <div>
      <button
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs font-medium hover:bg-[var(--muted)]"
        onClick={() => {
          if (search) {
            onInsert(type.name);
          } else {
            setExpanded(!expanded);
          }
        }}
      >
        {expanded || search ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-[var(--muted-foreground)]" />
        )}
        <Database className="h-3 w-3 shrink-0 text-[var(--primary)]" />
        <span className="truncate">{type.name}</span>
        {type.title && type.title !== type.name && (
          <span className="truncate text-[var(--muted-foreground)]">({type.title})</span>
        )}
      </button>
      {(expanded || search) &&
        filteredFields.map((field) => (
          <FieldRow
            key={field.name}
            field={field}
            depth={1}
            onInsert={onInsert}
            types={types}
            visitedTypes={new Set([type.name])}
            connectionId={connectionId}
            parentTypeName={type.name}
            fieldPath={field.name}
          />
        ))}
    </div>
  );
}

const EMPTY_TYPES: SchemaType[] = [];

export function SchemaPanel({ onInsert }: SchemaPanelProps) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);

  const [search, setSearch] = useState("");
  const { loadSchema } = useSchema();

  const connection = getActiveConnection();

  const types = useSchemaStore((s) =>
    connection ? s.types[connection.id] ?? EMPTY_TYPES : EMPTY_TYPES,
  );
  const isLoading = useSchemaStore((s) =>
    connection ? s.isLoading[connection.id] ?? false : false,
  );
  const error = useSchemaStore((s) =>
    connection ? s.error[connection.id] ?? null : null,
  );

  const sortedTypes = useMemo(
    () => [...types].sort((a, b) => a.name.localeCompare(b.name)),
    [types],
  );

  if (!hydrated || !connection) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-[var(--muted-foreground)]">
        Select a connection to view schema
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="schema-panel">
      <div className="flex items-center gap-2 border-b border-[var(--border)] p-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            className="w-full rounded border border-[var(--border)] bg-transparent py-1 pl-6 pr-2 text-xs outline-none focus:border-[var(--primary)]"
            placeholder="Search types..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
          onClick={() => loadSchema(connection.id)}
          disabled={isLoading}
          aria-label="Refresh schema"
        >
          <RefreshCw
            className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      <div className="flex-1 overflow-auto py-1">
        {isLoading && (
          <div className="p-4 text-center text-xs text-[var(--muted-foreground)]">
            Loading schema...
          </div>
        )}

        {error && (
          <div className="p-4 text-center text-xs text-red-500">{error}</div>
        )}

        {!isLoading && !error && sortedTypes.length === 0 && (
          <div className="p-4 text-center text-xs text-[var(--muted-foreground)]">
            <p className="mb-2">No schema loaded.</p>
            <button
              className="rounded bg-[var(--primary)] px-3 py-1.5 text-xs text-white hover:opacity-90"
              onClick={() => loadSchema(connection.id)}
            >
              Load Schema
            </button>
          </div>
        )}

        {!isLoading && search && sortedTypes.map((type) => (
          <TypeRow
            key={type.name}
            type={type}
            search={search}
            onInsert={onInsert}
            types={types}
            connectionId={connection.id}
          />
        ))}

        {!isLoading && !search && (() => {
          const docTypes = sortedTypes.filter((t) => t.kind === "document" || !t.kind);
          const objTypes = sortedTypes.filter((t) => t.kind === "object");

          return (
            <>
              {docTypes.length > 0 && (
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Document Types
                </div>
              )}
              {docTypes.map((type) => (
                <TypeRow
                  key={type.name}
                  type={type}
                  search=""
                  onInsert={onInsert}
                  types={types}
                  connectionId={connection.id}
                />
              ))}
              {objTypes.length > 0 && (
                <div className="mt-2 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Object Types
                </div>
              )}
              {objTypes.map((type) => (
                <TypeRow
                  key={type.name}
                  type={type}
                  search=""
                  onInsert={onInsert}
                  types={types}
                  connectionId={connection.id}
                />
              ))}
            </>
          );
        })()}
      </div>
    </div>
  );
}
