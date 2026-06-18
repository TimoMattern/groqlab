import { Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ToolbarProps {
  onRun: () => void;
  onClear: () => void;
  isRunning: boolean;
  hasQuery: boolean;
}

export function Toolbar({ onRun, onClear, isRunning, hasQuery }: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
      <Button
        size="sm"
        onClick={onRun}
        disabled={!hasQuery || isRunning}
        data-testid="run-query"
      >
        <Play className="h-4 w-4" />
        {isRunning ? "Running..." : "Run"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onClear}
        disabled={!hasQuery}
        data-testid="clear-query"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
