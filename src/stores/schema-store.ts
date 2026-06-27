import { create } from "zustand";
import type { SchemaType, SchemaField, ConnectionConfig } from "@/lib/sanity-types";
import { FlightRecorder } from "@/lib/flight-recorder";

interface SchemaState {
  types: Record<string, SchemaType[]>;
  isLoading: Record<string, boolean>;
  error: Record<string, string | null>;

  setTypes: (connectionId: string, types: SchemaType[]) => void;
  setLoading: (connectionId: string, loading: boolean) => void;
  setError: (connectionId: string, error: string | null) => void;
  getTypes: (connectionId: string) => SchemaType[];
  getIsLoading: (connectionId: string) => boolean;
  getError: (connectionId: string) => string | null;
  clear: (connectionId: string) => void;

  /** Resolve a single reference target via GROQ _type query.
   *  Finds the field on the given parent type and updates its type in-place.
   *  Returns true if the type was resolved. */
  resolveRef: (
    connectionId: string,
    conn: ConnectionConfig,
    parentTypeName: string,
    fieldPath: string,
  ) => Promise<boolean>;
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  types: {},
  isLoading: {},
  error: {},

  setTypes: (connectionId, types) => {
    set((s) => ({ types: { ...s.types, [connectionId]: types } }));
    FlightRecorder.instance.recordSnapshot("after-action");
  },

  setLoading: (connectionId, loading) => {
    set((s) => ({ isLoading: { ...s.isLoading, [connectionId]: loading } }));
    FlightRecorder.instance.recordSnapshot("after-action");
  },

  setError: (connectionId, error) => {
    set((s) => ({ error: { ...s.error, [connectionId]: error } }));
    FlightRecorder.instance.recordSnapshot("after-action");
  },

  getTypes: (connectionId) => get().types[connectionId] ?? [],
  getIsLoading: (connectionId) => get().isLoading[connectionId] ?? false,
  getError: (connectionId) => get().error[connectionId] ?? null,

  clear: (connectionId) => {
    set((s) => ({
      types: Object.fromEntries(
        Object.entries(s.types).filter(([k]) => k !== connectionId),
      ),
      isLoading: Object.fromEntries(
        Object.entries(s.isLoading).filter(([k]) => k !== connectionId),
      ),
      error: Object.fromEntries(
        Object.entries(s.error).filter(([k]) => k !== connectionId),
      ),
    }));
    FlightRecorder.instance.recordSnapshot("after-action");
  },

  resolveRef: async (connectionId, conn, parentTypeName, fieldPath) => {
    const types = get().types[connectionId];
    if (!types) return false;

    const parentType = types.find((t) => t.name === parentTypeName);
    if (!parentType) return false;

    let field: SchemaField | undefined;
    let parentField: SchemaField | undefined;
    let currentFields = parentType.fields;
    const segments = fieldPath.split(".");
    for (let i = 0; i < segments.length; i++) {
      parentField = field;
      field = currentFields.find((f) => f.name === segments[i]);
      if (!field) return false;
      const f = field;
      // If field is a reference with a resolved type, traverse into that type's fields.
      // This handles paths like screening.movie.poster.asset where movie is a ref.
      if (f.isReference && f.type !== "reference") {
        const targetType = types.find((t) => t.name === f.type);
        currentFields = targetType?.fields ?? [];
      } else {
        currentFields = f.fields ?? [];
      }
    }
    if (!field) return false;

    const url = `https://${conn.projectId}.api.sanity.io/v2021-06-07/data/query/${conn.dataset}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (conn.token) headers.Authorization = `Bearer ${conn.token}`;

    try {
      const query = `array::unique(*[_type == "${parentTypeName}"][0...50].${fieldPath}->_type)`;
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ query }),
      });
      if (response.ok) {
        const json = await response.json();
        const raw = json.result as unknown[];
        if (Array.isArray(raw)) {
          const resolved = raw.filter((v): v is string => typeof v === "string");
          if (resolved.length === 1) {
            field.type = resolved[0];
            set((s) => ({ types: { ...s.types, [connectionId]: [...types] } }));
            FlightRecorder.instance.recordSnapshot("after-action");
            return true;
          }
        }
      }
    } catch {
      // fall through to static fallback
    }

    // Static fallbacks when GROQ returned no usable data.
    const fieldName = segments[segments.length - 1];

    // Sanity invariants: image.asset → sanity.imageAsset, file.asset → sanity.fileAsset.
    // Check both parentField.type (for multi-segment paths like movie.poster.asset)
    // and parentTypeName (for single-segment paths like asset in image/file object types,
    // which aren't document types so GROQ *[_type == "image"] returns []).
    if (fieldName === "asset" && (parentField?.type === "image" || parentTypeName === "image")) {
      field.type = "sanity.imageAsset";
      set((s) => ({ types: { ...s.types, [connectionId]: [...types] } }));
      FlightRecorder.instance.recordSnapshot("after-action");
      return true;
    }
    if (fieldName === "asset" && (parentField?.type === "file" || parentTypeName === "file")) {
      field.type = "sanity.fileAsset";
      set((s) => ({ types: { ...s.types, [connectionId]: [...types] } }));
      FlightRecorder.instance.recordSnapshot("after-action");
      return true;
    }

    // Convention fallback: if field name matches a type name in the store, use it.
    // Catches cases like castMembers.person where no sample document has the ref populated.
    if (types.some((t) => t.name === fieldName)) {
      field.type = fieldName;
      set((s) => ({ types: { ...s.types, [connectionId]: [...types] } }));
      FlightRecorder.instance.recordSnapshot("after-action");
      return true;
    }

    return false;
  },
}));
