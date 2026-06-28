# GroqLab — For LLM Agents

Every feature must be documented in `specs/` before implementation.

## Workflow

1. Create `specs/NN-feature-name.md` covering: purpose, data model, component API, store actions, key logic, lessons learned
2. Implement the feature
3. Update the spec with any changes discovered during implementation

## Existing Specs

| # | Feature |
|---|---------|
| 00 | Overview |
| 01 | Connection Management |
| 02 | Query Execution |
| 03 | Schema Introspection |
| 04 | Autocomplete Engine |
| 05 | Query Editor |
| 06 | Results Viewer |
| 07 | Query History |
| 08 | UI Components |
| 09 | State Management |
| 10 | Testing |

## Rules

- No spec = no feature. Specs are the source of truth.
- Spec must include a "Lessons Learned" section (hard-won insights, not generic advice).
- Update existing specs when changing a feature. Don't let them drift.
- Read relevant specs before touching any code.
- Every feature must include tests (unit + component as appropriate). No feature is complete without passing tests.
- Run `npm run typecheck && npm run lint && npm run test` before considering a feature done.

## Headless Mode — Drive GroqLab from the CLI

The headless CLI (`scripts/headless.ts`) lets you drive GroqLab programmatically via `POST /api/headless`. Requires a running dev server (`npm run dev`).

### Setup

Connection defaults are resolved (lowest to highest priority):
1. `groqlab.json` or `.groqlabrc` in cwd or nearest ancestor
2. Env vars: `GROQLAB_PROJECT`, `GROQLAB_DATASET`, `GROQLAB_TOKEN`, `GROQLAB_URL`
3. CLI flags: `--project`, `--dataset`, `--token`, `--url`

Create `.groqlabrc` for permanent defaults:
```
projectId: abc123
dataset: production
token: sk-...
url: http://localhost:3000
```

### Commands

```bash
# Test connection
npx tsx scripts/headless.ts connection test

# Run a GROQ query
npx tsx scripts/headless.ts query '*[_type == "movie"][0..5]'
npx tsx scripts/headless.ts query '*[_type == "movie" && title == $title]' --params '{"title":"WALL·E"}'

# Fetch schema (inferred from document samples)
npx tsx scripts/headless.ts schema

# Autocomplete — returns completions for text before cursor
npx tsx scripts/headless.ts autocomplete '*[_type == "'
npx tsx scripts/headless.ts autocomplete '*[_type == "movie"]['  # with schema for field-aware completions

# Recording — captures every command/response server-side
npx tsx scripts/headless.ts recording start
npx tsx scripts/headless.ts query '*[_type == "movie"][0..2]'
npx tsx scripts/headless.ts recording export ./recording.json
npx tsx scripts/headless.ts recording stop

# Batch — run multiple commands from a JSON file (stops on first error)
npx tsx scripts/headless.ts batch ./session.json
```

### Batch file format

```json
{
  "commands": [
    { "command": "connection.test", "args": { "projectId": "abc", "dataset": "prod" } },
    { "command": "query.execute", "args": { "query": "*[_type == \"movie\"][0..2]", "connection": { "projectId": "abc", "dataset": "prod" } } },
    { "command": "autocomplete.trigger", "args": { "before": "*[_type == \"" } },
    { "command": "recording.export", "args": {} }
  ]
}
```

### Recording

Server-side recording logs every command and its response. Export produces a JSON file with `meta` (version, startedAt) and `events[]`. Each event contains `type`, `command`, `args` (token sanitized), `response`, `durationMs`. Useful for auditing, debugging, and CI.

### Architecture

CLI → `HeadlessDriver` (in `src/lib/headless-driver.ts`) → `POST /api/headless` (in `src/app/api/headless/route.ts`) → Sanity GROQ API.

The `/api/headless` route handles these commands server-side:
- `query.execute` — proxies GROQ to Sanity API
- `connection.test` — verifies a project/dataset is reachable
- `schema.fetch` — infers schema from document samples
- `autocomplete.trigger` — runs the same `groqCompletionSource` used in the browser editor
- `recording.*` — server-side recording lifecycle (start/stop/export/clear/status)

Browser-only commands (`snapshot`, `store.*`, `connection.add`, `connection.setActive`) require `window.__FLIGHT__` in the browser console.

### Key files

| File | Role |
|------|------|
| `scripts/headless.ts` | CLI entry point |
| `src/lib/headless-driver.ts` | Node.js API client |
| `src/lib/headless-config.ts` | Config file loader (groqlab.json / .groqlabrc) |
| `src/app/api/headless/route.ts` | Server-side API route |
| `src/lib/flight-recorder.ts` | Browser-side recording + `window.__FLIGHT__` |
| `specs/16-headless-mode.md` | Full spec |
| `specs/15-flight-recorder.md` | Flight recorder spec |
