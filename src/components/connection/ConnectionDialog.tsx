import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useConnections } from "@/hooks/useConnections";
import type { ConnectionConfig } from "@/lib/sanity-types";

interface ConnectionDialogProps {
  open: boolean;
  onClose: () => void;
  connection?: ConnectionConfig;
}

export function ConnectionDialog({ open, onClose, connection }: ConnectionDialogProps) {
  const { testConn, saveConnection, updateConnection, setActive } = useConnections();
  const isEditing = !!connection;

  const [projectId, setProjectId] = useState("");
  const [dataset, setDataset] = useState("");
  const [name, setName] = useState("");

  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [errors, setErrors] = useState<{ projectId?: string; dataset?: string }>({});

  useEffect(() => {
    if (open) {
      setProjectId(connection?.projectId ?? "");
      setDataset(connection?.dataset ?? "");
      setName(connection?.name ?? "");
      setTestResult(null);
      setErrors({});
    }
  }, [open, connection]);

  function validate(): boolean {
    const newErrors: { projectId?: string; dataset?: string } = {};
    if (!projectId.trim()) newErrors.projectId = "Project ID is required";
    if (!dataset.trim()) newErrors.dataset = "Dataset is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleTest() {
    if (!validate()) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testConn(projectId.trim(), dataset.trim());
      if (result.success) {
        setTestResult({ success: true, message: `Connected to ${result.projectName ?? projectId}` });
      } else {
        setTestResult({ success: false, message: result.error ?? "Connection failed" });
      }
    } catch {
      setTestResult({ success: false, message: "Connection test failed" });
    } finally {
      setIsTesting(false);
    }
  }

  function handleSave() {
    if (!validate()) return;
    if (isEditing) {
      updateConnection(connection.id, {
        name: name.trim() || projectId.trim(),
        projectId: projectId.trim(),
        dataset: dataset.trim(),
      });
    } else {
      const conn = saveConnection({
        name: name.trim() || projectId.trim(),
        projectId: projectId.trim(),
        dataset: dataset.trim(),
      });
      setActive(conn.id);
    }
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title={isEditing ? "Edit Connection" : "Add Connection"}>
      <div className="flex flex-col gap-4">
        <Input
          id="project-id"
          label="Project ID"
          placeholder="abc123"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        />
        {errors.projectId && (
          <span className="text-xs text-[var(--destructive)]">{errors.projectId}</span>
        )}

        <Input
          id="dataset"
          label="Dataset"
          placeholder="production"
          value={dataset}
          onChange={(e) => setDataset(e.target.value)}
        />
        {errors.dataset && (
          <span className="text-xs text-[var(--destructive)]">{errors.dataset}</span>
        )}

        <Input
          id="connection-name"
          label="Display Name (optional)"
          placeholder="My Project"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {testResult && (
          <div
            className={`rounded-md px-3 py-2 text-sm ${
              testResult.success
                ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400"
            }`}
            data-testid="test-result"
          >
            {testResult.message}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleTest} disabled={isTesting}>
            {isTesting ? "Testing..." : "Test Connection"}
          </Button>
          <Button onClick={handleSave}>{isEditing ? "Save Changes" : "Save"}</Button>
        </div>
      </div>
    </Dialog>
  );
}
