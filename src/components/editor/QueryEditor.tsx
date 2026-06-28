import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, EditorSelection, Transaction } from "@codemirror/state";
import { autocompletion, acceptCompletion, startCompletion, completionStatus, currentCompletions, selectedCompletionIndex, setSelectedCompletion } from "@codemirror/autocomplete";
import { keymap } from "@codemirror/view";
import { groqLanguage } from "@/lib/groq/groq-language";
import { groqCompletionSource } from "@/lib/groq/groq-autocomplete";
import { FlightRecorder } from "@/lib/flight-recorder";

export interface QueryEditorHandle {
  triggerAutocomplete: () => void;
  restoreEditor: (text: string, cursorPos?: number) => void;
  selectAutocompleteSuggestion: (index: number) => void;
}

interface QueryEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export const QueryEditor = forwardRef<QueryEditorHandle, QueryEditorProps>(
  function QueryEditor({ value, onChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const suppressChangeRef = useRef(false);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useImperativeHandle(ref, () => ({
      triggerAutocomplete: () => {
        if (viewRef.current) {
          startCompletion(viewRef.current);
        }
      },
      restoreEditor: (text, cursorPos) => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          selection: cursorPos !== undefined
            ? EditorSelection.cursor(cursorPos)
            : undefined,
        });
        suppressChangeRef.current = false;
      },
      selectAutocompleteSuggestion: (index: number) => {
        const view = viewRef.current;
        if (!view) return;
        const completions = currentCompletions(view.state);
        if (index < 0 || index >= completions.length) return;
        const currentIndex = selectedCompletionIndex(view.state);
        if (currentIndex === index) return;
        view.dispatch({ effects: setSelectedCompletion(index) });
      },
    }), []);

    useEffect(() => {
      if (!containerRef.current) return;

      let lastSelectedIdx = -1;

      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged && !suppressChangeRef.current) {
          const newText = update.state.doc.toString();
          onChangeRef.current(newText);

          // Record keystroke if flight recorder is active
          if (FlightRecorder.instance.isEnabled()) {
            const userEvent = update.transactions[0]?.annotation(Transaction.userEvent) ?? "";
            FlightRecorder.instance.recordInput(
              newText,
              update.state.selection.main.head,
              userEvent,
            );
          }
        }

        // Track autocomplete selection changes
        if (FlightRecorder.instance.isEnabled()) {
          const status = completionStatus(update.state);
          if (status === "active") {
            const completions = currentCompletions(update.state);
            const idx = selectedCompletionIndex(update.state);
            if (idx !== null && idx >= 0 && idx !== lastSelectedIdx) {
              lastSelectedIdx = idx;
              FlightRecorder.instance.recordAutocompleteSelect(idx, completions.length);
            }
          } else {
            lastSelectedIdx = -1;
          }
        }
      });

      const state = EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          groqLanguage,
          autocompletion({ override: [groqCompletionSource] }),
          keymap.of([{ key: "Tab", run: acceptCompletion }]),
          updateListener,
          EditorView.theme({
            "&": { height: "100%" },
            ".cm-scroller": { overflow: "auto" },
            ".cm-content": { fontFamily: "monospace", fontSize: "14px" },
            ".cm-gutters": { display: "none" },
          }),
        ],
      });

      const view = new EditorView({
        state,
        parent: containerRef.current,
      });

      viewRef.current = view;

      return () => {
        view.destroy();
        viewRef.current = null;
      };
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current !== value) {
        suppressChangeRef.current = true;
        view.dispatch({
          changes: { from: 0, to: current.length, insert: value },
        });
        suppressChangeRef.current = false;
      }
    }, [value]);

    return (
      <div
        ref={containerRef}
        className="h-full w-full"
        data-testid="query-editor"
      />
    );
  },
);
