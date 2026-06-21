#!/usr/bin/env tsx

// Polyfill localStorage for Node.js
if (typeof globalThis.localStorage === "undefined") {
  const store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    key: (_index: number) => null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runBenchmark } from "../src/lib/autocomplete-benchmark";
import type { BenchmarkCase } from "../src/lib/autocomplete-benchmark";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parseArgs(): {
  filter?: string;
  priority?: string;
  verbose: boolean;
  json: boolean;
  all: boolean;
} {
  const args = process.argv.slice(2);
  return {
    filter: args.find((a) => a.startsWith("--filter="))?.split("=")[1],
    priority: args.find((a) => a.startsWith("--priority="))?.split("=")[1],
    verbose: args.includes("--verbose"),
    json: args.includes("--json"),
    all: args.includes("--all"),
  };
}

function formatPct(value: number, total: number): string {
  return `${(value * 100).toFixed(1)}% (${Math.round(value * total)}/${total})`;
}

function printSummary(summary: ReturnType<typeof runBenchmark>) {
  const {
    totalCases,
    top1,
    top5,
    top10,
    mrr,
    nullRate,
    precisionAt5,
    precisionAt10,
    aggregateScore,
    distractingNoise,
    durationMs,
  } = summary;

  const w = 58;
  const sep = "─".repeat(w);
  console.log(`┌${sep}┐`);
  console.log(`│ ${"Autocomplete Benchmark".padEnd(w - 2)} │`);
  console.log(`├${"┬".repeat(w).replace(/┬/g, "─")}┤`);
  const rows: [string, string][] = [
    ["Cases", `${totalCases}`],
    ["Top-1", formatPct(top1, totalCases)],
    ["Top-5", formatPct(top5, totalCases)],
    ["Top-10", formatPct(top10, totalCases)],
    ["MRR", mrr.toFixed(4)],
    ["Precision@5", precisionAt5.toFixed(4)],
    ["Precision@10", precisionAt10.toFixed(4)],
    ["Null Rate", formatPct(nullRate, totalCases)],
    ["Noise (total)", `${distractingNoise}`],
    ["Score", aggregateScore.toFixed(4)],
    ["Duration", `${durationMs}ms`],
  ];

  for (const [key, val] of rows) {
    const paddedKey = ` ${key.padEnd(12)}│ ${val.padEnd(w - 17)}`;
    console.log(`│${paddedKey} │`);
  }
  console.log(`└${sep}┘`);
}

function printVerbose(summary: ReturnType<typeof runBenchmark>) {
  const failures = summary.results.filter((r) => !r.top1 || r.detectedContext !== r.context);
  if (failures.length === 0) {
    console.log("\nAll cases passed Top-1 and context check.\n");
    return;
  }

  console.log(`\n${failures.length} case(s) need attention:\n`);
  for (const r of failures) {
    console.log(`  ${r.caseId}: ${r.name}`);
    if (r.detectedContext !== r.context) {
      console.log(`    Context: expected=${r.context} detected=${r.detectedContext}`);
    }
    if (!r.top1) {
      console.log(`    Rank: expected[0]="${r.expected[0]}" not at position 1`);
      console.log(`    Top 10: [${r.returned.slice(0, 10).join(", ")}]`);
    }
    if (r.wasNull && !r.nullIsCorrect) {
      console.log(`    Null: unexpected null return`);
    }
    console.log();
  }
}

const args = parseArgs();

const casesPath = resolve(__dirname, "../src/lib/groq/11-benchmark-cases.json");
const raw = readFileSync(casesPath, "utf-8");
const allCases: BenchmarkCase[] = JSON.parse(raw);

let filtered = allCases;

if (args.priority) {
  filtered = filtered.filter((c) => c.priority === args.priority);
}

if (args.filter) {
  const f = args.filter.toLowerCase();
  filtered = filtered.filter(
    (c) => c.id.toLowerCase().includes(f) || c.name.toLowerCase().includes(f),
  );
}

if (!args.all && !args.priority && !args.filter) {
  filtered = filtered.filter((c) => c.priority === "core");
}

if (filtered.length === 0) {
  console.log("No matching benchmark cases found.");
  process.exit(0);
}

const summary = runBenchmark(filtered);

if (args.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  printSummary(summary);
  if (args.verbose) {
    printVerbose(summary);
  }
}
