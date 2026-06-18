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
