import { useCallback, useEffect, useRef } from "react";
import { useConnectionStore } from "@/stores/connection-store";
import { testConnection } from "@/lib/sanity-api";
import type { ConnectionConfig } from "@/lib/sanity-types";

function useActiveConnectionCheck() {
  const activeId = useConnectionStore((s) => s.activeId);
  const connections = useConnectionStore((s) => s.connections);
  const statuses = useConnectionStore((s) => s.statuses);
  const setConnectionStatus = useConnectionStore((s) => s.setConnectionStatus);
  const checkedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeId) return;
    const conn = connections.find((c) => c.id === activeId);
    if (!conn) return;

    const cs = statuses[activeId];
    if (cs?.status === "online" || cs?.status === "checking") return;
    if (checkedRef.current === activeId) return;
    checkedRef.current = activeId;

    setConnectionStatus(activeId, { status: "checking" });
    testConnection(conn.projectId, conn.dataset).then((result) => {
      setConnectionStatus(activeId, {
        status: result.success ? "online" : "error",
        error: result.error,
        lastChecked: new Date().toISOString(),
      });
    });
  }, [activeId, connections, statuses, setConnectionStatus]);
}

export function useConnections() {
  useActiveConnectionCheck();

  const connections = useConnectionStore((s) => s.connections);
  const activeId = useConnectionStore((s) => s.activeId);
  const addConnection = useConnectionStore((s) => s.addConnection);
  const updateConnectionInStore = useConnectionStore((s) => s.updateConnection);
  const removeConnection = useConnectionStore((s) => s.removeConnection);
  const setActive = useConnectionStore((s) => s.setActive);

  const testConn = useCallback(
    async (projectId: string, dataset: string) => {
      return testConnection(projectId, dataset);
    },
    [],
  );

  const saveConnection = useCallback(
    (config: Omit<ConnectionConfig, "id" | "createdAt">) => {
      const connection: ConnectionConfig = {
        ...config,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      addConnection(connection);
      return connection;
    },
    [addConnection],
  );

  const updateConnection = useCallback(
    (id: string, config: Partial<Omit<ConnectionConfig, "id" | "createdAt">>) => {
      updateConnectionInStore(id, config);
    },
    [updateConnectionInStore],
  );

  return {
    connections,
    activeId,
    setActive,
    testConn,
    saveConnection,
    updateConnection,
    removeConnection,
  };
}
