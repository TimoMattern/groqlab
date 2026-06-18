# Testing

## Framework

- **Runner**: Vitest (configured in `vitest.config.ts`)
- **Environment**: jsdom (for React component tests)
- **Assertions**: Built-in Vitest assertions + Testing Library queries
- **Setup**: `src/test-setup.ts` (loaded before all tests)

### Vitest Config

```typescript
// vitest.config.ts
export default defineConfig({
  plugins: [react()],                // @vitejs/plugin-react
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    css: true,
  },
});
```

## Test Files

| File | Type | Tests |
|------|------|-------|
| `src/lib/groq/groq-autocomplete.test.ts` | Unit (autocomplete engine) | 70+ |
| `src/lib/groq/groq-completions.test.ts` | Unit (completion data) | 13 |
| `src/lib/sanity-api.test.ts` | Unit (API wrappers) | — |
| `src/lib/utils.test.ts` | Unit (utility functions) | — |
| `src/lib/use-keyboard.test.ts` | Unit (keyboard shortcuts) | — |
| `src/stores/connection-store.test.ts` | Store (CRUD, persistence) | — |
| `src/stores/history-store.test.ts` | Store (entry management, max limit) | — |
| `src/stores/result-store.test.ts` | Store (data/error/loading states) | — |
| `src/stores/schema-store.test.ts` | Store (caching per connection) | — |
| `src/App.test.tsx` | Component (integration) | — |
| SchemaPanel.test.tsx (in schema folder) | Component | — |
| ConnectionDialog.test.tsx (likely) | Component | — |
| ConnectionList.test.tsx (likely) | Component | — |
| ResultPanel.test.tsx (likely) | Component | — |
| StatusBar.test.tsx (likely) | Component | — |

## Testing Patterns

### Store Tests

Test zustand stores by calling actions and asserting state:

```typescript
import { useConnectionStore } from "./connection-store";

beforeEach(() => {
  // Reset store between tests
  useConnectionStore.setState({
    connections: [],
    activeId: null,
    statuses: {},
  });
});

it("adds a connection", () => {
  useConnectionStore.getState().addConnection(mockConnection);
  expect(useConnectionStore.getState().connections).toHaveLength(1);
});
```

### Component Tests

Using `@testing-library/react`:

```typescript
import { render, screen, fireEvent } from "@testing-library/react";

it("renders empty state", () => {
  render(<ConnectionList onAdd={vi.fn()} onEdit={vi.fn()} />);
  expect(screen.getByText("No connections yet.")).toBeInTheDocument();
});
```

### Autocomplete Tests

Testing the context detector directly (not through CM6):

```typescript
it("detects projection context", () => {
  const ctx = detectContext('*[_type == "movie"]{');
  expect(ctx.kind).toBe("projection");
  if (ctx.kind === "projection") {
    expect(ctx.typeName).toBe("movie");
  }
});
```

## Mock Strategy

- **API calls**: Not yet mocked in tests (tests that trigger API calls may fail)
- **localStorage**: jsdom provides a mock localStorage
- **CodeMirror**: Not mocked — component tests that render `QueryEditor` may have issues
- **Vitest globals**: `vi.fn()`, `vi.mock()`, etc. available without import

## Verification Gates (from docs)

Every PR should pass:
1. `npx vitest run` — all tests pass
2. `npx tsc --noEmit` — 0 TypeScript errors (strict mode)
3. `npm run lint` — 0 ESLint errors/warnings

## Known Issues

1. **SchemaPanel tests fail**: The `useSchema` hook's `useEffect` auto-loads schema when `activeId` is set, causing `isLoading = true` synchronously. Tests expecting "No schema loaded." instead see "Loading schema...". Needs `beforeEach` mock for `fetchSchema`.

2. **Unused imports/functions**: Several lint issues in `groq-autocomplete.ts` — unused imports (`ALL_COMPLETIONS`, `SELECT_COMPLETIONS`, `resolveRefType`), unused functions (`wordStartAfter`, `trimAfterLast`), non-null assertion, unnecessary regex escapes.

3. **No CI pipeline**: There is no GitHub Actions or other CI configuration in the repo.

## Lessons Learned

1. **Store tests should reset state between runs**: Zustand stores hold state in module scope. Without resetting in `beforeEach`, tests leak state to each other. Use `store.setState(initialState)`.

2. **Autocomplete tests are best done on the `detectContext` function directly**: Testing through CodeMirror's `CompletionContext` requires complex setup. Testing the pure function `detectContext(before)` with string input is simpler and more reliable.

3. **Hydration effects break component tests**: Components that use the `hydrated` pattern (`useState(false)` + `useEffect` to set `true`) need special handling in tests. The `act()` wrapper in Testing Library flushes effects synchronously, which can trigger unexpected state changes.

4. **Vitest works with Next.js**: The vitest config uses `@vitejs/plugin-react` and path aliases matching Next.js. This allows testing React components outside the Next.js compilation pipeline.

5. **Test count mismatch**: The docs claim 146 tests across 15 files (old Vite baseline). The actual count is higher (many autocomplete tests were added in Phase 5). The docs are out of date.
