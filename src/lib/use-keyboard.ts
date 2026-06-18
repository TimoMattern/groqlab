import { useEffect, useRef } from "react";

interface ShortcutMap {
  onRun: () => void;
  onClear: () => void;
}

export function useKeyboard({ onRun, onClear }: ShortcutMap) {
  const onRunRef = useRef(onRun);
  const onClearRef = useRef(onClear);
  onRunRef.current = onRun;
  onClearRef.current = onClear;

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onRunRef.current();
      }
      if (mod && e.shiftKey && (e.key === "C" || e.key === "c")) {
        e.preventDefault();
        e.stopPropagation();
        onClearRef.current();
      }
    }
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, []);
}
