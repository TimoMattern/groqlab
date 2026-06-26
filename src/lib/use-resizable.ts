import { useState, useEffect, useCallback, useRef } from "react";

interface UseResizableOptions {
  storageKey: string;
  defaultRatio: number;
  minLeftPx: number;
  minRightPx: number;
}

function getStoredRatio(key: string, defaultVal: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const val = Number(raw);
      if (isFinite(val)) return Math.max(0, Math.min(1, val));
    }
  } catch {
    // localStorage unavailable
  }
  return defaultVal;
}

export function useResizable({
  storageKey,
  defaultRatio,
  minLeftPx,
  minRightPx,
}: UseResizableOptions) {
  const [ratio, setRatio] = useState(defaultRatio);
  const ratioRef = useRef(defaultRatio);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRatio(getStoredRatio(storageKey, defaultRatio));
  }, [storageKey, defaultRatio]);

  useEffect(() => {
    ratioRef.current = ratio;
  }, [ratio]);

  const persist = useCallback(
    (r: number) => {
      setRatio(r);
      try {
        localStorage.setItem(storageKey, String(r));
      } catch {
        // localStorage unavailable
      }
    },
    [storageKey],
  );

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const startX = e.clientX;
      const startRatio = ratioRef.current;
      const containerWidth = container.getBoundingClientRect().width;
      if (containerWidth === 0) return;

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const newRatio = Math.max(
          minLeftPx / containerWidth,
          Math.min(1 - minRightPx / containerWidth, startRatio + dx / containerWidth),
        );
        persist(newRatio);
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [minLeftPx, minRightPx, persist],
  );

  return { ratio, containerRef, onResizeStart };
}
