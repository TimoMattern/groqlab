import { create } from "zustand";
import type { ConnectionConfig, ConnectionStatus, ConnectionStatusValue } from "@/lib/sanity-types";
import { FlightRecorder } from "@/lib/flight-recorder";

const STORAGE_KEY = "groqlab:connections";
const ACTIVE_KEY = "groqlab:activeId";
const STATUS_KEY_PREFIX = "groqlab:conn-status:";

function loadConnections(): ConnectionConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const conns: ConnectionConfig[] = raw ? JSON.parse(raw) : [];
    for (const c of conns) {
      if (!("token" in c)) {
        (c as ConnectionConfig).token = "";
      }
    }
    return conns;
  } catch {
    return [];
  }
}

function saveConnections(connections: ConnectionConfig[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
  } catch {
    // Storage full or unavailable — silently fail
  }
}


function loadActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function saveActiveId(id: string | null) {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_KEY);
    }
  } catch {
    // silently fail
  }
}

function loadStatus(id: string): ConnectionStatus {
  try {
    const raw = localStorage.getItem(STATUS_KEY_PREFIX + id);
    return raw ? JSON.parse(raw) : { status: "unknown" };
  } catch {
    return { status: "unknown" };
  }
}

function saveStatus(id: string, status: ConnectionStatus) {
  try {
    localStorage.setItem(STATUS_KEY_PREFIX + id, JSON.stringify(status));
  } catch {
    // silently fail
  }
}

interface ConnectionState {
  connections: ConnectionConfig[];
  activeId: string | null;
  statuses: Record<string, ConnectionStatus>;
  addConnection: (connection: ConnectionConfig) => void;
  updateConnection: (id: string, updates: Partial<Omit<ConnectionConfig, "id" | "createdAt">>) => void;
  removeConnection: (id: string) => void;
  setActive: (id: string | null) => void;
  setConnections: (connections: ConnectionConfig[]) => void;
  setConnectionStatus: (id: string, status: ConnectionStatus) => void;
}

function buildInitialStatuses(connections: ConnectionConfig[]): Record<string, ConnectionStatus> {
  const statuses: Record<string, ConnectionStatus> = {};
  for (const c of connections) {
    statuses[c.id] = loadStatus(c.id);
  }
  return statuses;
}

export const useConnectionStore = create<ConnectionState>((set) => {
  const initialConnections = loadConnections();
  return {
    connections: initialConnections,
    activeId: loadActiveId(),
    statuses: buildInitialStatuses(initialConnections),

    addConnection: (connection) => {
      set((state) => {
        const connections = [...state.connections, connection];
        const statuses = { ...state.statuses, [connection.id]: { status: "checking" as ConnectionStatusValue } };
        saveConnections(connections);
        return { connections, statuses };
      });
      FlightRecorder.instance.recordSnapshot("after-action");
    },

    updateConnection: (id, updates) => {
      set((state) => {
        const connections = state.connections.map((c) =>
          c.id === id ? { ...c, ...updates } : c,
        );
        saveConnections(connections);
        return { connections };
      });
      FlightRecorder.instance.recordSnapshot("after-action");
    },

    removeConnection: (id) => {
      set((state) => {
        const connections = state.connections.filter((c) => c.id !== id);
        const statuses: Record<string, ConnectionStatus> = {};
        for (const [k, v] of Object.entries(state.statuses)) {
          if (k !== id) statuses[k] = v;
        }
        const activeId = state.activeId === id ? null : state.activeId;
        saveConnections(connections);
        if (state.activeId === id) saveActiveId(null);
        try { localStorage.removeItem(STATUS_KEY_PREFIX + id); } catch { /* ignore */ }
        return { connections, activeId, statuses };
      });
      FlightRecorder.instance.recordSnapshot("after-action");
    },

    setActive: (id) => {
      saveActiveId(id);
      set({ activeId: id });
      FlightRecorder.instance.recordSnapshot("after-action");
    },

    setConnections: (connections) => {
      saveConnections(connections);
      set({ connections });
      FlightRecorder.instance.recordSnapshot("after-action");
    },

    setConnectionStatus: (id, status) => {
      saveStatus(id, status);
      set((state) => ({
        statuses: { ...state.statuses, [id]: status },
      }));
      FlightRecorder.instance.recordSnapshot("after-action");
    },
  };
});

export function getActiveConnection(): ConnectionConfig | null {
  const { connections, activeId } = useConnectionStore.getState();
  return connections.find((c) => c.id === activeId) ?? null;
}
