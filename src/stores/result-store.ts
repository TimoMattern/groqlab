import { create } from "zustand";

interface ResultState {
  data: unknown;
  durationMs: number | null;
  documentCount: number | null;
  error: string | null;
  isLoading: boolean;
  setResult: (data: unknown, durationMs: number, documentCount: number) => void;
  setError: (error: string) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useResultStore = create<ResultState>((set) => ({
  data: null,
  durationMs: null,
  documentCount: null,
  error: null,
  isLoading: false,

  setResult: (data, durationMs, documentCount) => {
    set({ data, durationMs, documentCount, error: null, isLoading: false });
  },

  setError: (error) => {
    set({ error, data: null, durationMs: null, documentCount: null, isLoading: false });
  },

  setLoading: (isLoading) => {
    set({ isLoading });
  },

  clear: () => {
    set({ data: null, durationMs: null, documentCount: null, error: null, isLoading: false });
  },
}));
