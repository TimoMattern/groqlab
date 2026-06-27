import { create } from "zustand";
import { FlightRecorder } from "@/lib/flight-recorder";

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
    FlightRecorder.instance.recordSnapshot("after-action");
  },

  setError: (error) => {
    set({ error, data: null, durationMs: null, documentCount: null, isLoading: false });
    FlightRecorder.instance.recordSnapshot("after-action");
  },

  setLoading: (isLoading) => {
    set({ isLoading });
    FlightRecorder.instance.recordSnapshot("after-action");
  },

  clear: () => {
    set({ data: null, durationMs: null, documentCount: null, error: null, isLoading: false });
    FlightRecorder.instance.recordSnapshot("after-action");
  },
}));
