import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboard } from "./use-keyboard";

describe("useKeyboard", () => {
  function fireKey(key: string, mod = false, shift = false) {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        metaKey: mod,
        ctrlKey: mod,
        shiftKey: shift,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  it("calls onRun on Cmd+Enter", () => {
    const onRun = vi.fn();
    const onClear = vi.fn();
    renderHook(() => useKeyboard({ onRun, onClear }));
    fireKey("Enter", true);
    expect(onRun).toHaveBeenCalledOnce();
    expect(onClear).not.toHaveBeenCalled();
  });

  it("calls onRun on Ctrl+Enter", () => {
    const onRun = vi.fn();
    const onClear = vi.fn();
    renderHook(() => useKeyboard({ onRun, onClear }));
    fireKey("Enter", true);
    expect(onRun).toHaveBeenCalledOnce();
  });

  it("calls onClear on Cmd+Shift+C", () => {
    const onRun = vi.fn();
    const onClear = vi.fn();
    renderHook(() => useKeyboard({ onRun, onClear }));
    fireKey("c", true, true);
    expect(onClear).toHaveBeenCalledOnce();
    expect(onRun).not.toHaveBeenCalled();
  });

  it("calls onClear on Ctrl+Shift+C", () => {
    const onRun = vi.fn();
    const onClear = vi.fn();
    renderHook(() => useKeyboard({ onRun, onClear }));
    fireKey("C", true, true);
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("does not fire on Enter without modifier", () => {
    const onRun = vi.fn();
    const onClear = vi.fn();
    renderHook(() => useKeyboard({ onRun, onClear }));
    fireKey("Enter");
    expect(onRun).not.toHaveBeenCalled();
  });

  it("cleans up on unmount", () => {
    const onRun = vi.fn();
    const onClear = vi.fn();
    const { unmount } = renderHook(() => useKeyboard({ onRun, onClear }));
    unmount();
    fireKey("Enter", true);
    expect(onRun).not.toHaveBeenCalled();
  });
});
