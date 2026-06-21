import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { groqCompletionSource, detectContext } from "@/lib/groq/groq-autocomplete";
import { useConnectionStore } from "@/stores/connection-store";
import { useSchemaStore } from "@/stores/schema-store";
import type { SchemaType } from "@/lib/sanity-types";

export interface BenchmarkCase {
  id: string;
  name: string;
  query: string;
  cursor: number;
  expected: string[];
  unexpected?: string[];
  context: string;
  schema?: SchemaType[];
  priority: "core" | "edge" | "regression";
  explicit?: boolean;
}

export interface BenchmarkResult {
  caseId: string;
  name: string;
  context: string;
  detectedContext: string;
  returned: string[];
  expected: string[];
  unexpected: string[];
  top1: boolean;
  top5: boolean;
  top10: boolean;
  reciprocalRank: number;
  precisionAt5: number;
  precisionAt10: number;
  wasNull: boolean;
  nullIsCorrect: boolean;
}

export interface BenchmarkSummary {
  totalCases: number;
  top1: number;
  top5: number;
  top10: number;
  mrr: number;
  nullRate: number;
  precisionAt5: number;
  precisionAt10: number;
  aggregateScore: number;
  distractingNoise: number;
  results: BenchmarkResult[];
  durationMs: number;
}

const BENCHMARK_CONN_ID = "__benchmark__";

function seedStores(schema?: BenchmarkCase["schema"]) {
  useConnectionStore.setState({
    connections: [{
      id: BENCHMARK_CONN_ID,
      name: "Benchmark",
      projectId: "benchmark",
      dataset: "production",
      createdAt: new Date().toISOString(),
    }],
    activeId: BENCHMARK_CONN_ID,
  });

  useSchemaStore.setState({ types: {}, isLoading: {}, error: {} });

  if (schema) {
    useSchemaStore.getState().setTypes(BENCHMARK_CONN_ID, schema);
  }
}

function runCase(caseData: BenchmarkCase): BenchmarkResult {
  seedStores(caseData.schema);

  const state = EditorState.create({ doc: caseData.query });
  const ctx = new CompletionContext(state, caseData.cursor, caseData.explicit ?? false);

  const result = groqCompletionSource(ctx);

  // CodeMirror sorts completions internally by:
  // 1. Exact prefix match (label starts with query) comes first
  // 2. Then substring match (label contains query but doesn't start with it)
  // 3. Within each group, higher boost = first
  // 4. Insertion order as tiebreaker (not needed once boost differs)
  // We replicate this for accurate ranking measurement.
  const beforeCursor = caseData.query.slice(0, caseData.cursor);
  const queryMatch = beforeCursor.match(/[a-zA-Z_*@^$][a-zA-Z0-9_$-]*$/u);
  const queryStr = (queryMatch ? queryMatch[0] : "").toLowerCase();

  const returned = result
    ? [...result.options].sort((a, b) => {
        const aStarts = queryStr.length > 0 && a.label.toLowerCase().startsWith(queryStr);
        const bStarts = queryStr.length > 0 && b.label.toLowerCase().startsWith(queryStr);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        const diff = (b.boost ?? 0) - (a.boost ?? 0);
        if (diff !== 0) return diff;
        return 0;
      }).map((o) => o.label)
    : [];

  const before = caseData.query.slice(0, caseData.cursor);
  const detectedContext = detectContext(before).kind;

  const unexpected = caseData.unexpected ?? [];

  let reciprocalRank = 0;
  let top1 = false;
  let top5 = false;
  let top10 = false;

  const wasNull = result === null;
  const nullIsCorrect = caseData.expected.length === 0;

  if (caseData.expected.length === 0) {
    // No expected items — pass if null was returned (correct rejection)
    top1 = wasNull;
    top5 = wasNull;
    top10 = wasNull;
  } else {
    for (let i = 0; i < returned.length; i++) {
      if (caseData.expected.includes(returned[i])) {
        const rank = i + 1;
        reciprocalRank = 1 / rank;
        if (rank === 1) top1 = true;
        if (rank <= 5) top5 = true;
        if (rank <= 10) top10 = true;
        break;
      }
    }
  }

  const precisionAt5 = returned.length > 0
    ? returned.slice(0, 5).filter((l) => caseData.expected.includes(l)).length / Math.min(5, returned.length)
    : 0;

  const precisionAt10 = returned.length > 0
    ? returned.slice(0, 10).filter((l) => caseData.expected.includes(l)).length / Math.min(10, returned.length)
    : 0;

  return {
    caseId: caseData.id,
    name: caseData.name,
    context: caseData.context,
    detectedContext,
    returned,
    expected: caseData.expected,
    unexpected,
    top1,
    top5,
    top10,
    reciprocalRank,
    precisionAt5,
    precisionAt10,
    wasNull,
    nullIsCorrect,
  };
}

export function runBenchmark(cases: BenchmarkCase[]): BenchmarkSummary {
  const start = performance.now();
  const results = cases.map(runCase);
  const durationMs = Math.round(performance.now() - start);

  const totalCases = results.length;
  const top1Count = results.filter((r) => r.top1).length;
  const top5Count = results.filter((r) => r.top5).length;
  const top10Count = results.filter((r) => r.top10).length;
  const nullCount = results.filter((r) => r.wasNull && !r.nullIsCorrect).length;

  const mrr = totalCases > 0
    ? results.reduce((sum, r) => sum + r.reciprocalRank, 0) / totalCases
    : 0;

  const avgPrecisionAt5 = totalCases > 0
    ? results.reduce((sum, r) => sum + r.precisionAt5, 0) / totalCases
    : 0;

  const avgPrecisionAt10 = totalCases > 0
    ? results.reduce((sum, r) => sum + r.precisionAt10, 0) / totalCases
    : 0;

  const nullRate = nullCount / totalCases;

  const distractingNoise = results.reduce((sum, r) => {
    const top10Returned = r.returned.slice(0, 10);
    const noise = top10Returned.filter((l) => {
      const isExpected = r.expected.includes(l);
      const isUnexpected = r.unexpected.length > 0 && r.unexpected.includes(l);
      return !isExpected || isUnexpected;
    }).length;
    return sum + noise;
  }, 0);

  const aggregateScore =
    0.40 * mrr +
    0.25 * (top5Count / totalCases) +
    0.15 * (top1Count / totalCases) +
    0.10 * (1 - nullRate) +
    0.10 * (1 - distractingNoise / Math.max(1, totalCases * 20));

  return {
    totalCases,
    top1: top1Count / totalCases,
    top5: top5Count / totalCases,
    top10: top10Count / totalCases,
    mrr,
    nullRate,
    precisionAt5: avgPrecisionAt5,
    precisionAt10: avgPrecisionAt10,
    aggregateScore,
    distractingNoise,
    results,
    durationMs,
  };
}
