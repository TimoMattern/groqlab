# GroqLab — Overview

## What It Is

A browser-based IDE for writing, executing, and debugging **GROQ (GROQ Query Language)** queries against **Sanity CMS** datasets. Think of it as Postman for Sanity's query language.

The app proxies all Sanity API calls through Next.js server-side routes to eliminate browser CORS restrictions — the browser only talks to its own origin.

## Core Features

| Feature | Description |
|---------|-------------|
| Connection Manager | Save multiple Sanity project/dataset pairs with status checking |
| Query Editor | CodeMirror 6 with GROQ syntax highlighting |
| Autocomplete | Schema-aware — suggests type names, field names, GROQ keywords/functions/operators/snippets based on cursor context |
| Schema Browser | Tree view of document types and fields with click-to-insert |
| Results Viewer | Three modes: JSON Tree (expandable), Table (sortable), Raw (formatted JSON) |
| Query History | Persisted to localStorage, click to reuse, success/error indicators |
| Dark/Light Theme | Toggle persisted in localStorage |
| Keyboard Shortcuts | `Cmd/Ctrl+Enter` to run, `Cmd/Ctrl+Shift+C` to clear |

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Next.js 15 (App Router) | API routes for Sanity proxy, built-in SSR |
| UI | React 19 + TypeScript 5.7 | — |
| Editor | CodeMirror 6 | Lighter than Monaco, excellent extension API |
| Language | StreamLanguage (GROQ tokenizer) | Lezer deferred; StreamLanguage works well enough |
| Autocomplete | CM6 autocomplete plugin | Custom `CompletionSource` with context detection |
| Styling | TailwindCSS v4 | CSS variables with `oklch()` for theme |
| State | Zustand v5 | Minimal boilerplate, selective subscriptions |
| Icons | Lucide React | Clean, tree-shakeable |
| Storage | localStorage | Connections, history, theme preference |
| Testing | Vitest + Testing Library + jsdom | — |

## Architecture

```
Browser (React SPA)
  ├── QueryEditor (CM6)
  ├── SchemaPanel (tree view)
  ├── ResultPanel (tree/table/raw)
  ├── HistoryPanel (sidebar)
  ├── ConnectionDialog/List
  └── StatusBar
       │
       ▼  fetch() same-origin
Zustand Stores → lib/sanity-api.ts
       │
       ▼  fetch() POST
Next.js API Routes
  ├── /api/query           → api.sanity.io/v2026-02/data/query/{dataset}
  ├── /api/schema          → apicdn.sanity.io/v2021-06/data/query/{dataset}
  └── /api/test-connection → api.sanity.io/v2026-02/data/query/{dataset}
       │
       ▼  server-to-server (no CORS)
Sanity API (api.sanity.io)
```

## Directory Layout

```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (HTML, globals.css, editor.css, theme script)
│   ├── page.tsx                  # Main page (was App.tsx)
│   ├── globals.css               # TailwindCSS + CSS variables (light/dark)
│   └── api/
│       ├── query/route.ts        # POST /api/query
│       ├── schema/route.ts       # POST /api/schema
│       └── test-connection/route.ts  # POST /api/test-connection
├── components/
│   ├── ui/                       # Primitives (button, input, dialog)
│   ├── layout/                   # Sidebar, Toolbar, StatusBar
│   ├── connection/               # ConnectionList, ConnectionDialog
│   ├── editor/                   # QueryEditor (CM6 wrapper)
│   ├── schema/                   # SchemaPanel (type tree)
│   ├── results/                  # ResultPanel, JsonTreeViewer, TableView
│   └── history/                  # HistoryPanel
├── hooks/
│   ├── useQuery.ts               # Query execution
│   ├── useSchema.ts              # Schema fetching + caching
│   └── useConnections.ts         # Connection CRUD + status checking
├── stores/                       # Zustand stores
│   ├── connection-store.ts       # Connections + active + statuses
│   ├── schema-store.ts           # Schema cache per connection
│   ├── result-store.ts           # Current query result
│   └── history-store.ts          # Query history
├── lib/
│   ├── groq/
│   │   ├── groq-language.ts      # StreamLanguage GROQ tokenizer
│   │   ├── groq-completions.ts   # Static completion data (keywords, functions, etc.)
│   │   ├── groq-autocomplete.ts  # CM6 CompletionSource with context detection
│   │   └── groq.grammar          # Placeholder for future Lezer grammar
│   ├── sanity-api.ts             # Typed fetch wrappers for /api/*
│   ├── sanity-types.ts           # TypeScript interfaces
│   ├── utils.ts                  # cn(), debounce(), formatDuration(), truncate()
│   ├── use-keyboard.ts           # Global keyboard shortcuts
│   └── use-theme.ts              # Dark/light toggle
└── styles/
    └── editor.css                # CM6 theme overrides
```

## Key Design Decisions

1. **Next.js API routes as Sanity proxy**: Eliminates CORS entirely. Browser calls same-origin `/api/*`, server forwards to Sanity. No CORS config needed.
2. **StreamLanguage over Lezer**: Lezer's `@tokens` DSL lacks character class support for identifiers. StreamLanguage provides the same highlighting quality with simpler code and no build step.
3. **Schema inferred from sample documents**: The `/api/schema` route fetches one sample document per type and infers fields by inspecting values. No Sanity schema API dependency.
4. **Zustand over Redux**: Minimal boilerplate, selective subscriptions prevent unnecessary re-renders, built-in support for external stores.
5. **localStorage for persistence**: Connections, history, theme preference. No backend database. ~5MB limit per origin.
