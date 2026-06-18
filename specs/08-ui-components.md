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
┌─────────────────────┐
│  [Schema] [History]  │  ← tab buttons
├─────────────────────┤
│                     │
│  Panel Content      │  ← children
│  (schema or history) │
│                     │
├─────────────────────┤
│  ConnectionList     │  ← sticky bottom area (rendered by parent)
└─────────────────────┘
```

- Fixed width: `w-60`
- Tab buttons with active indicator (bottom border + primary color)

### Toolbar (`src/components/layout/Toolbar.tsx`)

```
┌──────────────────────────────┐
│  [▶ Run]  [🗑 Clear]          │
└──────────────────────────────┘
```

- Run: disabled when no query or already running
- Clear: ghost variant, disabled when no query

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
