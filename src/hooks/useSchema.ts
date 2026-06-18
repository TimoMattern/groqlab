import { useCallback, useEffect } from "react";
import { fetchSchema } from "@/lib/sanity-api";
import { useSchemaStore } from "@/stores/schema-store";
import { useConnectionStore, getActiveConnection } from "@/stores/connection-store";

export function useSchema() {
  const activeId = useConnectionStore((s) => s.activeId);
  const types = useSchemaStore((s) => s.types);
  const isLoadingMap = useSchemaStore((s) => s.isLoading);
  const setTypes = useSchemaStore((s) => s.setTypes);
  const setLoading = useSchemaStore((s) => s.setLoading);
  const setError = useSchemaStore((s) => s.setError);

  const loadSchema = useCallback(
    async (connectionId: string) => {
      const connection = getActiveConnection();
      if (!connection || connection.id !== connectionId) return;

      setLoading(connectionId, true);
      setError(connectionId, null);

      try {
        const result = await fetchSchema(connection);
        setTypes(connectionId, result);
      } catch (e: unknown) {
        const err = e as { kind?: string; message?: string };
        setError(connectionId, err.message ?? "Failed to load schema");
        setTypes(connectionId, []);
      } finally {
        setLoading(connectionId, false);
      }
    },
    [setTypes, setLoading, setError],
  );

  useEffect(() => {
    if (!activeId) return;
    if (activeId in types) return;
    if (isLoadingMap[activeId]) return;

    loadSchema(activeId);
  }, [activeId, types, isLoadingMap, loadSchema]);

  return { loadSchema };
}
