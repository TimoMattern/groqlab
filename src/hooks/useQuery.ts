import { useCallback } from "react";
import { executeQuery } from "@/lib/sanity-api";
import { useResultStore } from "@/stores/result-store";
import { useHistoryStore } from "@/stores/history-store";
import { getActiveConnection } from "@/stores/connection-store";

export function useQuery() {
  const setLoading = useResultStore((s) => s.setLoading);
  const setResult = useResultStore((s) => s.setResult);
  const setError = useResultStore((s) => s.setError);
  const addHistoryEntry = useHistoryStore((s) => s.addEntry);

  const runQuery = useCallback(
    async (query: string) => {
      const connection = getActiveConnection();
      if (!connection) {
        setError("No active connection. Add and select a connection first.");
        return;
      }

      setLoading(true);

      try {
        const result = await executeQuery(connection, query);
        setResult(result.data, result.durationMs, result.documentCount);
        addHistoryEntry({
          query,
          connectionId: connection.id,
          connectionName: connection.name,
          durationMs: result.durationMs,
          documentCount: result.documentCount,
          success: true,
          resultPreview: JSON.stringify(result.data),
        });
      } catch (e: unknown) {
        const err = e as { kind?: string; message?: string };
        setError(err.message ?? "An unknown error occurred");
        addHistoryEntry({
          query,
          connectionId: connection.id,
          connectionName: connection.name,
          durationMs: 0,
          documentCount: 0,
          success: false,
          error: err.message ?? "An unknown error occurred",
        });
      }
    },
    [setLoading, setResult, setError, addHistoryEntry],
  );

  return { runQuery };
}
