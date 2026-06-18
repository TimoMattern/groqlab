import { create } from "zustand";
import type { SchemaType } from "@/lib/sanity-types";

export function resolveRefType(ref: string, schemaTypes: SchemaType[]): string | undefined {
  for (const t of schemaTypes) {
    if (ref.startsWith(t.name + "-") || ref.startsWith(t.name + "_")) {
      return t.name;
    }
  }
  return undefined;
}

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
}

export const useSchemaStore = create<SchemaState>((set, get) => ({
  types: {},
  isLoading: {},
  error: {},

  setTypes: (connectionId, types) => {
    set((s) => ({ types: { ...s.types, [connectionId]: types } }));
  },

  setLoading: (connectionId, loading) => {
    set((s) => ({ isLoading: { ...s.isLoading, [connectionId]: loading } }));
  },

  setError: (connectionId, error) => {
    set((s) => ({ error: { ...s.error, [connectionId]: error } }));
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
  },
}));
