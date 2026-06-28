import type { FlightRecord, FlightEvent, StoreSnapshotEvent, AutocompleteEvent, AutocompleteSelectionEvent, InputEvent } from "./flight-recorder";

export type ReplaySpeed = 0.25 | 0.5 | 1 | 2 | 4;

export interface ReplayCallbacks {
  onSetEditorValue: (text: string, cursorPos?: number) => void;
  onHighlightEvent?: (index: number) => void;
  onApiCall?: (event: FlightEvent) => void;
  onAutocomplete?: (event: AutocompleteEvent) => void;
  onSelectAutocompleteSuggestion?: (index: number) => void;
  onRestoreStores?: (stores: StoreSnapshotEvent["stores"]) => void;
}

export function getEditorTextAtEvent(
  record: FlightRecord,
  eventIndex: number,
): string | null {
  if (eventIndex < 0 || eventIndex >= record.events.length) return null;

  // Look backwards from the current event for the most recent text source
  for (let i = eventIndex; i >= 0; i--) {
    const ev = record.events[i];
    if (ev.type === "store-snapshot") {
      const stores = (ev as StoreSnapshotEvent).stores;
      if ((stores as Record<string, unknown>).activeQuery !== undefined) {
        return (stores as Record<string, unknown>).activeQuery as string;
      }
    }
    if (ev.type === "input") {
      return (ev as InputEvent).text;
    }
  }
  return null;
}

export function getCursorPositionAtEvent(
  record: FlightRecord,
  eventIndex: number,
): number | null {
  const ev = record.events[eventIndex];
  if (!ev) return null;
  if (ev.type === "autocomplete") {
    return (ev as AutocompleteEvent).before?.length ?? 0;
  }
  return null;
}

export function createReplaySession(
  record: FlightRecord,
  callbacks: ReplayCallbacks,
) {
  let currentIndex = -1;
  let playing = false;
  let speed: ReplaySpeed = 1;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  function stopTimer() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function applyEvent(index: number) {
    const idx = Math.max(0, Math.min(index, record.events.length - 1));
    if (idx !== currentIndex) {
      currentIndex = idx;
      const ev = record.events[idx];
      callbacks.onHighlightEvent?.(idx);

      // Determine editor text and cursor position
      let text: string | null = null;
      let cursorPos: number | null = null;

      // Input events carry their own exact text and cursor
      if (ev.type === "input") {
        text = (ev as InputEvent).text;
        cursorPos = (ev as InputEvent).cursor;
      } else {
        text = getEditorTextAtEvent(record, idx);
        cursorPos = getCursorPositionAtEvent(record, idx);
      }

      if (text !== null) {
        callbacks.onSetEditorValue(text, cursorPos ?? undefined);
      }

      // Visual indicator for API calls
      if (ev.type === "api-call") {
        callbacks.onApiCall?.(ev);
      }

      // Trigger autocomplete panel — cursor is already positioned
      if (ev.type === "autocomplete" && callbacks.onAutocomplete) {
        callbacks.onAutocomplete(ev as AutocompleteEvent);
      }

      // Select autocomplete suggestion (arrow up/down navigation)
      if (ev.type === "autocomplete-selection" && callbacks.onSelectAutocompleteSuggestion) {
        callbacks.onSelectAutocompleteSuggestion((ev as AutocompleteSelectionEvent).selectedIndex);
      }

      // Restore store state from snapshot
      if (ev.type === "store-snapshot" && callbacks.onRestoreStores) {
        callbacks.onRestoreStores((ev as StoreSnapshotEvent).stores);
      }
    }
  }

  function scheduleNext() {
    if (!playing) return;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= record.events.length) {
      playing = false;
      return;
    }

    const currentTs = record.events[currentIndex]?.ts ?? 0;
    const nextTs = record.events[nextIndex].ts;
    const delay = Math.max(50, (nextTs - currentTs) / speed);

    const scheduledAt = performance.now();
    timerId = setTimeout(() => {
      const elapsed = performance.now() - scheduledAt;
      applyEvent(nextIndex);
      // Account for time spent applying the event
      const remaining = Math.max(0, delay - elapsed);
      timerId = setTimeout(scheduleNext, remaining);
    }, delay);
  }

  return {
    get index() { return currentIndex; },
    get isPlaying() { return playing; },

    goTo(index: number) {
      stopTimer();
      applyEvent(index);
    },

    play() {
      if (playing) return;
      if (currentIndex >= record.events.length - 1) {
        currentIndex = -1;
      }
      playing = true;
      scheduleNext();
    },

    pause() {
      playing = false;
      stopTimer();
    },

    setSpeed(s: ReplaySpeed) {
      speed = s;
    },

    stepForward() {
      stopTimer();
      applyEvent(Math.min(currentIndex + 1, record.events.length - 1));
    },

    stepBackward() {
      stopTimer();
      applyEvent(Math.max(currentIndex - 1, -1));
    },

    destroy() {
      playing = false;
      stopTimer();
    },
  };
}

export type ReplaySession = ReturnType<typeof createReplaySession>;
