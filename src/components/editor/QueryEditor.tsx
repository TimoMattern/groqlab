import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, EditorSelection, Transaction } from "@codemirror/state";
import { autocompletion, acceptCompletion, startCompletion } from "@codemirror/autocomplete";
import { keymap } from "@codemirror/view";
import { groqLanguage } from "@/lib/groq/groq-language";
import { groqCompletionSource } from "@/lib/groq/groq-autocomplete";
import { FlightRecorder } from "@/lib/flight-recorder";

export interface QueryEditorHandle {
  triggerAutocomplete: () => void;
  restoreEditor: (text: string, cursorPos?: number) => void;
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
      },
    }), []);

    useEffect(() => {
      if (!containerRef.current) return;

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
