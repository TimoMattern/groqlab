/**
 * Debug REPL for GROQ autocomplete.
 *
 * Usage:
 *   npx tsx scripts/debug-autocomplete.ts                          # interactive mode
 *   npx tsx scripts/debug-autocomplete.ts --query "castMembers[]." # single shot
 *   npx tsx scripts/debug-autocomplete.ts --file queries.txt       # batch from file
 *
 * Commands (interactive):
 *   <query>            Test autocomplete at end of query
 *   query|N            Test autocomplete at position N
 *   :schema            Show loaded schema types
 *   :load <json>       Load schema from JSON file
 *   :movie             Load the Sanity movie dataset schema
 *   :help              Show available commands
 *   :quit              Exit
 */

import { createInterface } from "readline/promises";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { useSchemaStore } from "../src/stores/schema-store";
import { useConnectionStore } from "../src/stores/connection-store";
import { detectContext, groqCompletionSource } from "../src/lib/groq/groq-autocomplete";
import type { SchemaType, SchemaField } from "../src/lib/sanity-types";

// ─── Movie dataset schema ──────────────────────────────────────────────────────

const MOVIE_SCHEMA: SchemaType[] = [
  {
    name: "movie",
    title: "Movie",
    fields: [
      { name: "title", type: "string", isArray: false, isReference: false },
      { name: "slug", type: "slug", isArray: false, isReference: false },
      { name: "overview", type: "block", isArray: true, isReference: false },
      {
        name: "castMembers",
        type: "person",
        isArray: true,
        isReference: true,
      },
      {
        name: "director",
        type: "person",
        isArray: false,
        isReference: true,
      },
      {
        name: "poster",
        type: "image",
        isArray: false,
        isReference: false,
      },
      { name: "releaseDate", type: "string", isArray: false, isReference: false },
      { name: "popularity", type: "number", isArray: false, isReference: false },
      {
        name: "genres",
        type: "string",
        isArray: true,
        isReference: false,
      },
    ],
  },
  {
    name: "person",
    title: "Person",
    fields: [
      { name: "name", type: "string", isArray: false, isReference: false },
      { name: "slug", type: "slug", isArray: false, isReference: false },
      { name: "image", type: "image", isArray: false, isReference: false },
      { name: "bio", type: "block", isArray: true, isReference: false },
    ],
  },
  {
    name: "screening",
    title: "Screening",
    fields: [
      { name: "title", type: "string", isArray: false, isReference: false },
      {
        name: "movie",
        type: "movie",
        isArray: false,
        isReference: true,
      },
      { name: "begin", type: "string", isArray: false, isReference: false },
      { name: "end", type: "string", isArray: false, isReference: false },
      { name: "location", type: "geopoint", isArray: false, isReference: false },
    ],
  },
  {
    name: "plotSummary",
    title: "Plot Summary",
    fields: [
      { name: "title", type: "string", isArray: false, isReference: false },
      { name: "summary", type: "text", isArray: false, isReference: false },
      {
        name: "characters",
        type: "string",
        isArray: true,
        isReference: false,
      },
    ],
  },
  {
    name: "plotSummaries",
    title: "Plot Summaries",
    fields: [
      { name: "title", type: "string", isArray: false, isReference: false },
      { name: "summaries", type: "plotSummary", isArray: true, isReference: false },
    ],
  },
  {
    name: "castMember",
    title: "Cast Member",
    fields: [
      {
        name: "characterName",
        type: "string",
        isArray: false,
        isReference: false,
      },
      {
        name: "person",
        type: "person",
        isArray: false,
        isReference: true,
      },
      {
        name: "externalId",
        type: "number",
        isArray: false,
        isReference: false,
      },
    ],
  },
];

function formatSchema(schemas: SchemaType[]): string {
  return schemas
    .map((t) => {
      const fields = t.fields
        .map((f) => {
          const arr = f.isArray ? "[]" : "";
          const ref = f.isReference ? " ->" : "";
          return `  ${f.name}: ${f.type}${arr}${ref}`;
        })
        .join("\n");
      return `${t.name} (${t.title ?? ""})\n${fields}`;
    })
    .join("\n\n");
}

// ─── Setup ─────────────────────────────────────────────────────────────────────

function setupSchema(types: SchemaType[]) {
  const connId = "debug";
  useConnectionStore.setState({
    connections: [
      {
        id: connId,
        name: "Debug",
        projectId: "debug",
        dataset: "debug",
        createdAt: new Date().toISOString(),
      },
    ],
    activeId: connId,
  });
  useSchemaStore.getState().setTypes(connId, types);
}

// ─── Debug test ────────────────────────────────────────────────────────────────

interface DebugResult {
  context: ReturnType<typeof detectContext>;
  queryWithoutCursor: string;
  cursor: number;
  explicit: boolean;
  completions: { label: string; boost: number; detail: string }[] | null;
  from: number;
  error?: string;
}

function testAutocomplete(doc: string, cursor: number, explicit = false): DebugResult {
  const queryWithoutCursor = doc.slice(0, cursor);
  const before = queryWithoutCursor;

  const ctx = detectContext(before);
  const state = EditorState.create({ doc: before });
  const cmCtx = new CompletionContext(state, cursor, false);

  let completions: DebugResult["completions"] = null;
  let from = cursor;
  let error: string | undefined;

  try {
    const result = groqCompletionSource(cmCtx);
    if (result) {
      from = result.from;
      completions = result.options
        .map((o) => ({
          label: o.label,
          boost: o.boost ?? 0,
          detail: (o as any).detail ?? "",
        }))
        .sort((a, b) => b.boost - a.boost);
    }
  } catch (e) {
    error = String(e);
  }

  return {
    context: ctx,
    queryWithoutCursor,
    cursor,
    explicit,
    completions,
    from,
    error,
  };
}

function formatDebugResult(r: DebugResult): string {
  const lines: string[] = [];
  const ctx = r.context;

  // Context info
  lines.push(`Context:     ${ctx.kind}`);
  if ("typeName" in ctx && ctx.typeName) lines.push(`  typeName:   ${ctx.typeName}`);
  if ("fields" in ctx && ctx.fields) lines.push(`  fields:     ${ctx.fields.map((f) => f.name).join(", ")}`);
  if ("before" in ctx && ctx.before) {
    const beforeStr = ctx.before.length > 60 ? ctx.before.slice(-60) : ctx.before;
    lines.push(`  before:     "${beforeStr.replace(/\n/g, "\\n")}"`);
  }

  lines.push(`Cursor:      ${r.cursor}`);
  lines.push(`Query:       "${r.queryWithoutCursor.replace(/\n/g, "\\n")}"`);

  if (r.error) {
    lines.push(`\nERROR: ${r.error}`);
    return lines.join("\n");
  }

  if (r.completions === null) {
    lines.push(`\nCompletions: null (no completions returned)`);
    return lines.join("\n");
  }

  lines.push(`From:        ${r.from}`);
  lines.push(`Count:       ${r.completions.length}`);
  lines.push(`\nCompletions (sorted by boost):`);

  const top20 = r.completions.slice(0, 20);
  for (const c of top20) {
    lines.push(`  ${c.boost.toString().padStart(3)}  ${c.label.padEnd(20)} ${c.detail}`);
  }
  if (r.completions.length > 20) {
    lines.push(`  ... and ${r.completions.length - 20} more`);
  }

  return lines.join("\n");
}

// ─── Parse query with optional position ────────────────────────────────────────

function parseInput(input: string): { query: string; cursor: number } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.includes("|")) {
    const parts = trimmed.split("|");
    const query = parts.slice(0, -1).join("|");
    const posStr = parts[parts.length - 1].trim();
    const pos = parseInt(posStr, 10);
    if (!isNaN(pos) && pos >= 0 && pos <= query.length) {
      return { query, cursor: pos };
    }
  }

  // If input ends with a number preceded by whitespace, try as position
  const posMatch = trimmed.match(/^(.*?)\s+(\d+)$/);
  if (posMatch) {
    const query = posMatch[1];
    const pos = parseInt(posMatch[2], 10);
    if (pos >= 0 && pos <= query.length) {
      return { query, cursor: pos };
    }
  }

  return { query: trimmed, cursor: trimmed.length };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  setupSchema(MOVIE_SCHEMA);

  const args = process.argv.slice(2);

  // Single shot mode
  if (args.length > 0 && !args[0].startsWith("--")) {
    const parsed = parseInput(args.join(" "));
    if (parsed) {
      const result = testAutocomplete(parsed.query, parsed.cursor);
      console.log(formatDebugResult(result));
    }
    return;
  }

  // --query flag
  const queryIdx = args.indexOf("--query");
  if (queryIdx >= 0 && queryIdx + 1 < args.length) {
    const parsed = parseInput(args[queryIdx + 1]);
    if (parsed) {
      const result = testAutocomplete(parsed.query, parsed.cursor);
      console.log(formatDebugResult(result));
    }
    return;
  }

  // --file flag
  const fileIdx = args.indexOf("--file");
  if (fileIdx >= 0 && fileIdx + 1 < args.length) {
    const fs = await import("fs");
    const content = fs.readFileSync(args[fileIdx + 1], "utf-8");
    const queries = content.split("\n").filter((l: string) => l.trim() && !l.trim().startsWith("#"));
    for (const line of queries) {
      const parsed = parseInput(line);
      if (parsed) {
        const result = testAutocomplete(parsed.query, parsed.cursor);
        console.log(`\n=== ${line} ===`);
        console.log(formatDebugResult(result));
      }
    }
    return;
  }

  // Interactive mode
  console.log(`GROQ Autocomplete Debug REPL`);
  console.log(`─────────────────────────────`);
  console.log(`Schema: movie dataset (${MOVIE_SCHEMA.length} types)`);
  console.log(`Type a GROQ query to see autocomplete results.`);
  console.log(`Append |N to set cursor position (e.g. "castMembers[].|34").`);
  console.log(`Type :help for commands.`);
  console.log(``);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "groq> ",
  });

  rl.prompt();

  for await (const line of rl) {
    const trimmed = line.trim();

    if (trimmed === ":quit" || trimmed === ":q" || trimmed === ":exit") {
      break;
    }

    if (trimmed === ":help") {
      console.log(`Commands:`);
      console.log(`  <query>           Test autocomplete at end of query`);
      console.log(`  <query>|N         Test autocomplete at position N`);
      console.log(`  :schema           Show loaded schema types`);
      console.log(`  :load <file>      Load schema from JSON file`);
      console.log(`  :movie            Reload movie dataset schema`);
      console.log(`  :help             Show this help`);
      console.log(`  :quit             Exit`);
      console.log(``);
      rl.prompt();
      continue;
    }

    if (trimmed === ":schema") {
      const state = useSchemaStore.getState();
      const connId = useConnectionStore.getState().activeId!;
      const types = state.getTypes(connId);
      if (types.length === 0) {
        console.log("No schema loaded.");
      } else {
        console.log(formatSchema(types));
      }
      console.log(``);
      rl.prompt();
      continue;
    }

    if (trimmed === ":movie") {
      setupSchema(MOVIE_SCHEMA);
      console.log(`Loaded movie dataset schema (${MOVIE_SCHEMA.length} types).`);
      console.log(``);
      rl.prompt();
      continue;
    }

    if (trimmed.startsWith(":load ")) {
      const filePath = trimmed.slice(6).trim();
      try {
        const fs = await import("fs");
        const content = fs.readFileSync(filePath, "utf-8");
        const types = JSON.parse(content);
        setupSchema(types);
        console.log(`Loaded ${types.length} types from ${filePath}.`);
      } catch (e: any) {
        console.log(`Error loading schema: ${e.message}`);
      }
      console.log(``);
      rl.prompt();
      continue;
    }

    if (trimmed === "") {
      rl.prompt();
      continue;
    }

    // Parse input with pipe separator for position
    let query = trimmed;
    let cursor = trimmed.length;

    const pipeIdx = trimmed.lastIndexOf("|");
    const bracketPipeIdx = trimmed.lastIndexOf("|");
    if (bracketPipeIdx > 0 && bracketPipeIdx < trimmed.length - 1) {
      const afterPipe = trimmed.slice(bracketPipeIdx + 1);
      const num = parseInt(afterPipe, 10);
      if (!isNaN(num) && String(num).length === afterPipe.trim().length) {
        // Only treat as position if the whole remainder is a number (like |34)
        query = trimmed.slice(0, bracketPipeIdx);
        cursor = num;
      }
    }

    const result = testAutocomplete(query, cursor);
    console.log(formatDebugResult(result));
    console.log(``);
    rl.prompt();
  }

  rl.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
