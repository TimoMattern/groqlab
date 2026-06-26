import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "groqlab:sidebar-width";
const MIN_WIDTH = 180;
const MAX_WIDTH = 800;

function getStoredWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(raw)));
  } catch {
    // localStorage unavailable
  }
  return 240;
}

export function useSidebarWidth() {
  const [width, setWidth] = useState(240);
  const widthRef = useRef(240);

  useEffect(() => {
    const w = getStoredWidth();
    setWidth(w);
    widthRef.current = w;
  }, []);

  const persist = useCallback((w: number) => {
    setWidth(w);
    widthRef.current = w;
    try {
      localStorage.setItem(STORAGE_KEY, String(w));
    } catch {
      // localStorage unavailable
    }
  }, []);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = widthRef.current;

      const onMouseMove = (e: MouseEvent) => {
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + e.clientX - startX));
        persist(newWidth);
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
    [persist],
  );

  return { width, onResizeStart };
}
