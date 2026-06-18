import { create } from "zustand";
import type { HistoryEntry } from "@/lib/sanity-types";
import { truncate } from "@/lib/utils";

const STORAGE_KEY = "groqlab:history";
const MAX_ENTRIES = 100;

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable
  }
}

interface HistoryState {
  entries: HistoryEntry[];
  addEntry: (entry: Omit<HistoryEntry, "id" | "executedAt">) => void;
  removeEntry: (id: string) => void;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  entries: loadHistory(),

  addEntry: (entry) => {
    set((state) => {
      const newEntry: HistoryEntry = {
        ...entry,
        id: crypto.randomUUID(),
        executedAt: new Date().toISOString(),
        resultPreview: entry.resultPreview
          ? truncate(entry.resultPreview, 200)
          : undefined,
      };
      const entries = [newEntry, ...state.entries].slice(0, MAX_ENTRIES);
      saveHistory(entries);
      return { entries };
    });
  },

  removeEntry: (id) => {
    set((state) => {
      const entries = state.entries.filter((e) => e.id !== id);
      saveHistory(entries);
      return { entries };
    });
  },

  clearHistory: () => {
    saveHistory([]);
    set({ entries: [] });
  },
}));
