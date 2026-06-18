# GroqLab

> **⚠️ ALPHA — 100% Vibe Coded. This is a toy project to mess around with LLM agents. No hand-written code. Not planned to be supported, maintained, or used for anything real. Expect rough edges, bugs, and breaking changes. Use at your own risk.**

Browser-based IDE for writing, executing, and debugging GROQ queries against Sanity CMS datasets. Postman for Sanity's query language.

## Features

- **Connection Manager** — save Sanity project/dataset pairs with status checking
- **Query Editor** — CodeMirror 6 with GROQ syntax highlighting & schema-aware autocomplete
- **Schema Browser** — tree view of document types and fields, click to insert
- **Results Viewer** — JSON Tree, Table (sortable), Raw (formatted JSON)
- **Query History** — persisted to localStorage, click to reuse
- **Dark/Light Theme** — toggle persisted in localStorage

## Tech Stack

Next.js 16, React 19, TypeScript 5.7, CodeMirror 6, TailwindCSS v4, Zustand v5, Vitest

## Getting Started

```bash
npm install
npm run dev       # http://localhost:3000
npm run build     # production build
npm run start     # serve production build
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run typecheck` | TypeScript type check |
| `npm run lint` | ESLint |
| `npm run test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
