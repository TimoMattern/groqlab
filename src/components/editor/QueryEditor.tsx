import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { autocompletion, acceptCompletion } from "@codemirror/autocomplete";
import { keymap } from "@codemirror/view";
import { groqLanguage } from "@/lib/groq/groq-language";
import { groqCompletionSource } from "@/lib/groq/groq-autocomplete";

interface QueryEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function QueryEditor({ value, onChange }: QueryEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const suppressChangeRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !suppressChangeRef.current) {
        onChange(update.state.doc.toString());
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
}
