# Query Editor (CodeMirror 6)

## Purpose

A full-featured GROQ query editor built on CodeMirror 6, providing syntax highlighting, autocomplete, and snippet support.

## Component: `QueryEditor`

**File**: `src/components/editor/QueryEditor.tsx`

A controlled component wrapping CM6's `EditorView`:

```typescript
interface QueryEditorProps {
  value: string;
  onChange: (value: string) => void;
}
```

### Lifecycle

1. **Mount**: Creates `EditorView` with `basicSetup`, `groqLanguage`, `groqCompletionSource`
2. **Update**: When `value` prop changes (external), synchronizes editor content
3. **Unmount**: Destroys the `EditorView`

### Key Pattern: `suppressChangeRef`

Prevents infinite loops when externally setting the value:

```
External update → dispatch change to editor
  → editor fires updateListener
    → if suppressChangeRef is true, skip onChange
```

## GROQ Language: `groq-language.ts`

**File**: `src/lib/groq/groq-language.ts`

Uses CodeMirror's `StreamLanguage` (not Lezer) for tokenization:

### Token Classes

| Token | Examples |
|-------|----------|
| `comment` | `// rest of line` |
| `string` | `"hello"`, `'world'` |
| `number` | `42`, `3.14` |
| `operator` | `==`, `!=`, `<=`, `>=`, `&&`, `\|\|`, `..`, `->` |
| `keyword` | `in`, `match`, `asc`, `desc`, `order`, `select`, `collate`, `true`, `false`, `null`, `and`, `or`, `not` |
| `variableName` | Identifiers (`title`, `_id`, `popularity`) |
| `atom` | `*`, `@`, `^` |
| `punctuation` | `(`, `)`, `{`, `}`, `[`, `]`, `,`, `:`, `;` |

### Language Data

```typescript
languageData: {
  commentTokens: { line: "//" },
  closeBrackets: { brackets: ["(", "[", "{", '"', "'"] },
}
```

## CodeMirror Theme: `editor.css`

**File**: `src/styles/editor.css`

CSS overrides for CM6 theme elements:

| Element | Styling |
|---------|---------|
| Editor background | `var(--background)` |
| Text color | `var(--foreground)` |
| Line cursor | `var(--foreground)` |
| Selection | `var(--muted)` |
| Active line | `color-mix(in oklch, var(--muted) 50%, transparent)` |
| Matching bracket | `color-mix(in oklch, var(--primary) 25%, transparent)` + outline |
| Non-matching bracket | `color-mix(in oklch, var(--destructive) 20%, transparent)` |
| Autocomplete tooltip | `var(--card)` background, `var(--border)` border |
| Selected completion | `color-mix(in oklch, var(--primary) 30%, transparent)` |
| Completion label | Weight 500 |
| Completion detail | Italic, 11px, `var(--muted-foreground)` |
| Matched text | Underline + weight 700 |
| Gutters | Hidden (no line numbers) |

### Completion Icons

Custom CSS-based icons for completion types:
- Function: `ƒ`
- Keyword: `K`
- Constant: `C`
- Text: `T`

## Extensions Used

| Extension | Purpose |
|-----------|---------|
| `basicSetup` | Line numbers, fold gutter, active line, bracket matching, etc. |
| `groqLanguage` | Syntax highlighting via StreamLanguage |
| `autocompletion({ override: [groqCompletionSource] })` | Custom autocomplete |
| `keymap.of([{ key: "Tab", run: acceptCompletion }])` | Tab to accept completion |
| `EditorView.updateListener` | Sync changes to React state |
| `EditorView.theme({...})` | Inline height/overflow/font styles |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` / `Cmd+Enter` | Execute query (handled by `use-keyboard.ts`) |
| `Ctrl+Shift+C` / `Cmd+Shift+C` | Clear query (handled by `use-keyboard.ts`) |
| `Ctrl+Space` | Trigger autocomplete (CM6 default) |
| `Tab` | Accept completion |

## Lessons Learned

1. **`StreamLanguage` over Lezer**: The original plan was a Lezer grammar. Lezer's `@tokens` DSL lacks character class support (`[a-zA-Z_$]` for identifiers) and requires a build step. `StreamLanguage` gives identical highlighting quality with 1/3 the code and no build step. Can be replaced with Lezer later without changing the component.

2. **`suppressChangeRef` pattern**: External value changes (from `onReuse` in History) must not trigger `onChange` callbacks. The ref-based suppression pattern is essential to avoid infinite update loops.

3. **EditorView is not a React component**: CM6's `EditorView` manages its own DOM. The React component is just a thin wrapper (`<div ref={containerRef}>`). All CM6 configuration happens in `useEffect` imperatively.

4. **No persisting editor state to store**: Unlike a traditional IDE, the editor value lives in React state (`useState` in `page.tsx`). This makes it simple to integrate with the history "reuse" feature and the clear button.

5. **CM6 memory management**: The `useEffect` cleanup function must call `view.destroy()`. Failing to do this causes memory leaks and ghost editor instances.
