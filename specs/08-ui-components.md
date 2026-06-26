# UI Components

## Design System Primitives

### Button (`src/components/ui/button.tsx`)

```typescript
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
}
```

Sizes:
| Size | Height | Padding | Font |
|------|--------|---------|------|
| `sm` | 32px (h-8) | px-3 | 12px (text-xs) |
| `md` | 36px (h-9) | px-4 | 14px (text-sm) |
| `lg` | 40px (h-10) | px-6 | 16px (text-base) |

Variants:
| Variant | Style |
|---------|-------|
| `primary` | `bg-[var(--primary)]` text-white, hover: brightness 110% |
| `secondary` | `bg-[var(--muted)]`, hover: `bg-[var(--accent)]` |
| `ghost` | Transparent, hover: `bg-[var(--muted)]` |
| `destructive` | `bg-[var(--destructive)]` text-white, hover: brightness 110% |

Shared styles:
- `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`
- `disabled:pointer-events-none disabled:opacity-50`

### Input (`src/components/ui/input.tsx`)

```typescript
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}
```

- Label rendered as `<label htmlFor={id}>` when provided
- Input: h-9, border, transparent background, focus ring in primary color
- Disabled: cursor-not-allowed + opacity-50

### Dialog (`src/components/ui/dialog.tsx`)

```typescript
interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}
```

- Returns `null` when `open` is false (unmounted)
- Modal overlay: `fixed inset-0 z-50 bg-black/50`
- Close on backdrop click: `if (e.target === e.currentTarget) onClose()`
- Card: max-w-lg, rounded-lg, shadow-xl
- Title bar: flex with title + X close button
- `role="dialog"` and `aria-modal="true"`
- ESC close not implemented (keyboard trap not added)

## Layout Components

### Sidebar (`src/components/layout/Sidebar.tsx`)

```
┌────┬────────────────┐
│    │                │
│ 🔍 │  Panel Content │
│    │  (varies by    │
│ 🔌 │   active tab)  │
│    │                │
│ ⏰ │                │
│    │                │
└────┴────────────────┘
```

- Vertical tab strip (40px) on the left with icon-only buttons
- Content panel fills remaining width
- Three tabs: **Query** (schema browser), **Connections** (connection list), **History** (query history)
- Active tab highlighted with `bg-[var(--muted)]` and `text-[var(--primary)]`
- Each tab receives its own content via `children`
- Sidebar width is user-resizable (default 240px, range 180–800px, persisted to `groqlab:sidebar-width`)

```typescript
export type SidebarTabId = "query" | "connections" | "history";

interface SidebarProps {
  activeTab: SidebarTabId;
  onTabChange: (tab: SidebarTabId) => void;
  children: ReactNode;
}
```

**Sidebar resize** (`src/lib/use-sidebar-width.ts`):
- Manages absolute pixel width with `localStorage` persistence
- Min: 180px, Max: 800px, Default: 240px
- A `ResizeHandle` on the right edge of the sidebar provides the drag target
- Icon tab strip remains fixed at 40px; only the content panel scales with the sidebar width

### Toolbar (`src/components/layout/Toolbar.tsx`)

```
┌──────────────────────────────┐
│  [▶ Run]  [🗑 Clear]          │
└──────────────────────────────┘
```

- Run: disabled when no query or already running
- Clear: ghost variant, disabled when no query

### Resizable Split Pane

The editor/results split in the main content area is resizable. The user can drag the divider between the two panes to allocate space according to their preference.

**Mechanism:**
- A thin (4px) `ResizeHandle` sits between the editor and results panes
- On hover, the cursor changes to `col-resize`
- On mousedown, a `mousemove`/`mouseup` listener pair tracks the drag
- The split ratio is persisted to `localStorage` under `groqlab:editor-split`
- During drag, `document.body.style.cursor = "col-resize"` and `userSelect = "none"` prevent text selection

**Components:**

`src/lib/use-resizable.ts` — Generic hook for horizontal split resize:
```typescript
interface UseResizableOptions {
  storageKey: string;       // localStorage key
  defaultRatio: number;     // 0-1, default 0.5
  minLeftPx: number;        // minimum left pane width (200)
  minRightPx: number;       // minimum right pane width (200)
}

interface UseResizableReturn {
  ratio: number;
  containerRef: RefObject<HTMLDivElement>;
  onResizeStart: (e: React.MouseEvent) => void;
}
```

`src/components/layout/ResizeHandle.tsx` — Visual drag handle:
- `w-1` (4px) width
- `cursor-col-resize` on hover
- `bg-[var(--border)]` default, `hover:bg-[var(--primary)]` on hover
- Receives `onMouseDown` from the hook

**Layout structure:**
```
┌───────────────────────┬──┬────────────────────┐
│  Editor Pane          │▏▏│  Results Pane      │
│  (ratio * 100% width) │  │  (flex-1)          │
│  flex-none            │  │                    │
└───────────────────────┴──┴────────────────────┘
                         ▲
                    ResizeHandle
                   (cursor: col-resize)
```

**Constraints enforced in the hook (not CSS):**
- Left pane minimum: 200px
- Right pane minimum: 200px

### StatusBar (`src/components/layout/StatusBar.tsx`)

```
┌──────────────────────────────────────┐
│  projectId/dataset   42 results in   │
│                      123ms      🌙   │
└──────────────────────────────────────┘
```

- Shows active connection badge (hydrated check for SSR)
- Shows result count + duration when available
- Theme toggle button (🌙/☀️)

## Theme System

### CSS Variables

Defined in `src/app/globals.css`:

| Variable | Light (`:root`) | Dark (`.dark`) |
|----------|-----------------|----------------|
| `--background` | oklch(1 0 0) | oklch(0.145 0 0) |
| `--foreground` | oklch(0.145 0 0) | oklch(0.985 0 0) |
| `--muted` | oklch(0.97 0 0) | oklch(0.22 0 0) |
| `--muted-foreground` | oklch(0.556 0 0) | oklch(0.65 0 0) |
| `--border` | oklch(0.922 0 0) | oklch(0.3 0 0) |
| `--primary` | oklch(0.205 0.042 265) | oklch(0.6 0.15 265) |
| `--primary-foreground` | oklch(0.985 0 0) | oklch(0.985 0 0) |
| `--card` | oklch(1 0 0) | oklch(0.18 0 0) |
| `--destructive` | oklch(0.577 0.245 27) | oklch(0.577 0.245 27) |

### Theme Hook (`src/lib/use-theme.ts`)

- Key: `groqlab:theme` (value: `"light"` or `"dark"`)
- Initializes on mount from localStorage
- Toggles `dark` class on `document.documentElement`
- SSR-safe: `<script>` in `layout.tsx` applies theme before paint

### Dark Mode Flash Prevention

An inline script in `<head>` checks localStorage and `prefers-color-scheme` immediately:

```html
<script>
  (function() {
    try {
      var theme = JSON.parse(localStorage.getItem('groqlab:theme'));
      if (theme === 'dark' || (theme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      }
    } catch(e) {}
  })();
</script>
```

## Keyboard Shortcuts (`src/lib/use-keyboard.ts`)

Global event listener on `window` (capture phase):

```typescript
interface ShortcutMap {
  onRun: () => void;     // Ctrl/Cmd + Enter
  onClear: () => void;   // Ctrl/Cmd + Shift + C
}
```

Uses refs to avoid stale closures in the effect dependency array.

## Loading State Pattern

The app follows a consistent pattern for loading states:

1. **`hydrated` guard**: Component-level `useState(false)` + `useEffect(() => setHydrated(true), [])`
2. **`isLoading` flag**: Per-operation loading from store
3. **Conditional rendering**: Loading → Error → Empty → Content

## Accessibility

- All interactive elements are keyboard-navigable (native `button`, `input`)
- Icon buttons have `aria-label`
- Test IDs use `data-testid` attribute (not `data-test` or `data-cy`)

## Lessons Learned

1. **TailwindCSS v4 uses CSS variables, not HSL**: Tailwind v4 dropped the `hsl()` color system. All themes use `oklch()` which provides better perceptual uniformity across light/dark. No `tailwind.config.js` needed.

2. **CM6 theme via CSS, not `EditorView.theme`**: The CM6 theme override is a standalone CSS file (`editor.css`), not a CM6 extension. This makes it easier to maintain and works with Tailwind's dark mode.

3. **No `"use client"` in ui primitives**: The small utility components (`Button`, `Input`) don't need the directive since they only use props and basic React. But `page.tsx` and all interactive components need `"use client"`.

4. **Dialog backdrop close**: Clicking the backdrop closes the dialog. This is standard UX but requires the `if (e.target === e.currentTarget)` check to avoid closing when clicking inside the dialog.

5. **Hydration guard prevents SSR flash**: The `hydrated` pattern prevents components from rendering their "empty/no data" state on the server, then immediately showing data on the client. Without it, users see a flash of "No connections yet." before the localStorage data loads.

6. **Percentage-based split avoids window-resize jank**: Using a ratio (0-1) instead of absolute pixel widths means the split proportion is preserved across window resizes. The ratio is computed against `container.getBoundingClientRect().width` at drag-start, giving stable behavior during a single drag gesture.

7. **Document-level event listeners during drag**: Attaching `mousemove` and `mouseup` to `document` (not the element) ensures the drag gesture tracks the mouse even when it leaves the element boundary. This is the standard pattern for drag-to-resize but requires proper cleanup on mouseup.
