"use client";

interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
}

export function ResizeHandle({ onMouseDown }: ResizeHandleProps) {
  return (
    <div
      className="w-1 cursor-col-resize shrink-0 bg-[var(--border)] transition-colors"
      onMouseDown={onMouseDown}
      role="separator"
      aria-label="Resize panes"
    />
  );
}
