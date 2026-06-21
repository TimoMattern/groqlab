import type { Completion } from "@codemirror/autocomplete";

export const enum CompletionKind {
  Keyword = "keyword",
  Function = "function",
  Snippet = "snippet",
  Operator = "operator",
  Literal = "literal",
  Type = "type",
  Field = "field",
  Param = "param",
  Namespace = "namespace",
  Stage = "stage",
  Locale = "locale",
  Glob = "glob",
  Special = "special",
}

export interface GroqCompletion {
  label: string;
  type: CompletionKind;
  detail: string;
  apply?: string;
  boost?: number;
}

export const KEYWORD_COMPLETIONS: GroqCompletion[] = [
  { label: "order", type: CompletionKind.Keyword, detail: "Sort results", boost: 90 },
  { label: "asc", type: CompletionKind.Keyword, detail: "Sort ascending", boost: 85 },
  { label: "desc", type: CompletionKind.Keyword, detail: "Sort descending", boost: 85 },
  { label: "select", type: CompletionKind.Keyword, detail: "Conditional projection", boost: 80 },
  { label: "collate", type: CompletionKind.Keyword, detail: "Locale-aware sorting", boost: 75 },
  { label: "in", type: CompletionKind.Keyword, detail: "Array membership", boost: 80 },
  { label: "match", type: CompletionKind.Keyword, detail: "String pattern match", boost: 80 },
  { label: "and", type: CompletionKind.Keyword, detail: "Logical AND", boost: 65 },
  { label: "or", type: CompletionKind.Keyword, detail: "Logical OR", boost: 65 },
  { label: "not", type: CompletionKind.Keyword, detail: "Logical NOT", boost: 60 },
  { label: "@", type: CompletionKind.Special, detail: "Current value", boost: 95 },
  { label: "^", type: CompletionKind.Special, detail: "Parent reference", boost: 95 },
  { label: "...", type: CompletionKind.Keyword, detail: "Spread operator", boost: 90 },
];

export const LITERAL_COMPLETIONS: GroqCompletion[] = [
  { label: "true", type: CompletionKind.Literal, detail: "Boolean true", boost: 95 },
  { label: "false", type: CompletionKind.Literal, detail: "Boolean false", boost: 95 },
  { label: "null", type: CompletionKind.Literal, detail: "Null value", boost: 95 },
];

export const OPERATOR_COMPLETIONS: GroqCompletion[] = [
  { label: "==", type: CompletionKind.Operator, detail: "Equal to", boost: 60 },
  { label: "!=", type: CompletionKind.Operator, detail: "Not equal to", boost: 60 },
  { label: "<", type: CompletionKind.Operator, detail: "Less than", boost: 55 },
  { label: "<=", type: CompletionKind.Operator, detail: "Less than or equal", boost: 55 },
  { label: ">", type: CompletionKind.Operator, detail: "Greater than", boost: 55 },
  { label: ">=", type: CompletionKind.Operator, detail: "Greater than or equal", boost: 55 },
  { label: "&&", type: CompletionKind.Operator, detail: "Logical AND", boost: 50 },
  { label: "||", type: CompletionKind.Operator, detail: "Logical OR", boost: 50 },
  { label: "..", type: CompletionKind.Operator, detail: "Range (inclusive)", boost: 50 },
  { label: "...", type: CompletionKind.Operator, detail: "Range (exclusive)", boost: 50 },
  { label: "->", type: CompletionKind.Operator, detail: "Dereference", boost: 50 },
  { label: "**", type: CompletionKind.Operator, detail: "Exponentiation", boost: 50 },
  { label: "=>", type: CompletionKind.Operator, detail: "Conditional arrow", boost: 45 },
  { label: "+", type: CompletionKind.Operator, detail: "Addition / concat", boost: 45 },
  { label: "-", type: CompletionKind.Operator, detail: "Subtraction", boost: 45 },
  { label: "/", type: CompletionKind.Operator, detail: "Division", boost: 45 },
  { label: "%", type: CompletionKind.Operator, detail: "Modulo", boost: 45 },
  { label: "!", type: CompletionKind.Operator, detail: "Logical NOT", boost: 45 },
];

export const FUNCTION_COMPLETIONS: GroqCompletion[] = [
  { label: "count()", type: CompletionKind.Function, detail: "Count items", boost: 90 },
  { label: "defined()", type: CompletionKind.Function, detail: "Check if field exists", boost: 85 },
  { label: "length()", type: CompletionKind.Function, detail: "Length of string/array", boost: 85 },
  { label: "string()", type: CompletionKind.Function, detail: "Convert to string", boost: 80 },
  { label: "number()", type: CompletionKind.Function, detail: "Convert to number", boost: 80 },
  { label: "select()", type: CompletionKind.Function, detail: "Conditional projection", boost: 80 },
  { label: "dateTime()", type: CompletionKind.Function, detail: "Parse datetime", boost: 80 },
  { label: "now()", type: CompletionKind.Function, detail: "Current timestamp", boost: 75 },
  { label: "round()", type: CompletionKind.Function, detail: "Round a number", boost: 75 },
  { label: "upper()", type: CompletionKind.Function, detail: "Uppercase string", boost: 75 },
  { label: "lower()", type: CompletionKind.Function, detail: "Lowercase string", boost: 75 },
  { label: "coalesce()", type: CompletionKind.Function, detail: "First non-null value", boost: 70 },
  { label: "boost()", type: CompletionKind.Function, detail: "Boost search score", boost: 70 },
  { label: "pt::text()", type: CompletionKind.Function, detail: "Portable Text to plain text", boost: 70 },
  { label: "score()", type: CompletionKind.Function, detail: "Search score", boost: 65 },
  { label: "references()", type: CompletionKind.Function, detail: "Check reference", boost: 65 },
  { label: "filter()", type: CompletionKind.Function, detail: "Filter pipeline stage", boost: 65 },
  { label: "project()", type: CompletionKind.Function, detail: "Project pipeline stage", boost: 65 },
  { label: "slice()", type: CompletionKind.Function, detail: "Slice pipeline stage", boost: 65 },
  { label: "array::join()", type: CompletionKind.Function, detail: "Join array elements", boost: 70 },
  { label: "array::intersects()", type: CompletionKind.Function, detail: "Check array overlap", boost: 70 },
  { label: "array::compact()", type: CompletionKind.Function, detail: "Remove nulls from array", boost: 65 },
  { label: "array::unique()", type: CompletionKind.Function, detail: "Unique array values", boost: 65 },
  { label: "text::semanticSimilarity()", type: CompletionKind.Function, detail: "AI semantic ranking", boost: 65 },
  { label: "text::query()", type: CompletionKind.Function, detail: "Full-text query", boost: 65 },
  { label: "sanity::dataset()", type: CompletionKind.Function, detail: "Get current dataset name", boost: 65 },
  { label: "path()", type: CompletionKind.Function, detail: "Field path matching", boost: 60 },
  { label: "global()", type: CompletionKind.Function, detail: "Access global parameter", boost: 60 },
  { label: "sanity::versionOf()", type: CompletionKind.Function, detail: "Get document versions", boost: 60 },
  { label: "sanity::partOfRelease()", type: CompletionKind.Function, detail: "Get release documents", boost: 60 },
  { label: "geo::distance()", type: CompletionKind.Function, detail: "Geospatial distance", boost: 60 },
  { label: "geo::contains()", type: CompletionKind.Function, detail: "Check point in region", boost: 60 },
  { label: "geo::intersects()", type: CompletionKind.Function, detail: "Check geometry overlap", boost: 60 },
  { label: "string::startsWith()", type: CompletionKind.Function, detail: "String starts with check", boost: 60 },
  { label: "user::attributes()", type: CompletionKind.Function, detail: "Get user attributes", boost: 55 },
];

export const SNIPPET_COMPLETIONS: GroqCompletion[] = [
  {
    label: '*[_type == ""]',
    type: CompletionKind.Snippet,
    detail: "Filter by document type",
    apply: '*[_type == "${1}"]${0}',
    boost: 95,
  },
  {
    label: '*[_type == ""][0..10]',
    type: CompletionKind.Snippet,
    detail: "Filter with range limit",
    apply: '*[_type == "${1}"][0..10]${0}',
    boost: 90,
  },
  {
    label: '* | order()',
    type: CompletionKind.Snippet,
    detail: "Ordered results",
    apply: "* | order(${1})${0}",
    boost: 85,
  },
  {
    label: "order()",
    type: CompletionKind.Snippet,
    detail: "Sort by field",
    apply: "order(${1})${0}",
    boost: 80,
  },
  {
    label: '{..., "": ->{}}',
    type: CompletionKind.Snippet,
    detail: "Spread with dereference",
    apply: '{..., "${1}": ${2}->{${3}}}${0}',
    boost: 75,
  },
  {
    label: "count(*)",
    type: CompletionKind.Snippet,
    detail: "Count all documents",
    apply: "count(*)${0}",
    boost: 70,
  },
  {
    label: '*[_type == ""][]->{}',
    type: CompletionKind.Snippet,
    detail: "Filter with dereference",
    apply: '*[_type == "${1}"]${2}->{${3}}${0}',
    boost: 70,
  },
  {
    label: '*[_type == ""] | score() | order(_score desc)',
    type: CompletionKind.Snippet,
    detail: "Score results and sort",
    apply: '*[_type == "${1}"] | score(${2}) | order(_score desc)${0}',
    boost: 65,
  },
  {
    label: '*[_type == ""] | order(lower("") asc)',
    type: CompletionKind.Snippet,
    detail: "Case-insensitive sort",
    apply: '*[_type == "${1}"] | order(lower(${2}) asc)${0}',
    boost: 60,
  },
  {
    label: '{"name": *[_type == ""]}',
    type: CompletionKind.Snippet,
    detail: "Batch query container",
    apply: '{"${1}": *[_type == "${2}"]}${0}',
    boost: 65,
  },
  {
    label: '*[_type == ""]{...}',
    type: CompletionKind.Snippet,
    detail: "Filter with spread projection",
    apply: '*[_type == "${1}"]{...}${0}',
    boost: 85,
  },
];

export const PIPELINE_STAGE_COMPLETIONS: GroqCompletion[] = [
  { label: "order()", type: CompletionKind.Stage, detail: "Sort results", boost: 95, apply: "order(${1})${0}" },
  { label: "filter()", type: CompletionKind.Stage, detail: "Filter results", boost: 90, apply: "filter(${1})${0}" },
  { label: "project()", type: CompletionKind.Stage, detail: "Project results", boost: 85, apply: "project(${1})${0}" },
  { label: "score()", type: CompletionKind.Stage, detail: "Score results", boost: 85, apply: "score(${1})${0}" },
  { label: "select()", type: CompletionKind.Stage, detail: "Conditional projections", boost: 80, apply: "select(${1})${0}" },
  { label: "slice()", type: CompletionKind.Stage, detail: "Slice array", boost: 80, apply: "slice(${1})${0}" },
];

export const LOCALE_COMPLETIONS: GroqCompletion[] = [
  { label: '"en"', type: CompletionKind.Locale, detail: "English", boost: 90, apply: "en" },
  { label: '"de"', type: CompletionKind.Locale, detail: "German", boost: 80, apply: "de" },
  { label: '"fr"', type: CompletionKind.Locale, detail: "French", boost: 80, apply: "fr" },
  { label: '"es"', type: CompletionKind.Locale, detail: "Spanish", boost: 80, apply: "es" },
  { label: '"sv"', type: CompletionKind.Locale, detail: "Swedish", boost: 75, apply: "sv" },
  { label: '"nb"', type: CompletionKind.Locale, detail: "Norwegian Bokmål", boost: 75, apply: "nb" },
  { label: '"da"', type: CompletionKind.Locale, detail: "Danish", boost: 75, apply: "da" },
  { label: '"ja"', type: CompletionKind.Locale, detail: "Japanese", boost: 75, apply: "ja" },
  { label: '"zh"', type: CompletionKind.Locale, detail: "Chinese", boost: 75, apply: "zh" },
  { label: '"ar"', type: CompletionKind.Locale, detail: "Arabic", boost: 75, apply: "ar" },
];

export const PARAM_COMPLETIONS: GroqCompletion[] = [
  { label: "$start", type: CompletionKind.Param, detail: "Slice start param", boost: 90 },
  { label: "$end", type: CompletionKind.Param, detail: "Slice end param", boost: 90 },
  { label: "$limit", type: CompletionKind.Param, detail: "Result limit param", boost: 85 },
  { label: "$offset", type: CompletionKind.Param, detail: "Result offset param", boost: 85 },
  { label: "$term", type: CompletionKind.Param, detail: "Search term param", boost: 80 },
  { label: "$currentLocation", type: CompletionKind.Param, detail: "Geopoint param", boost: 80 },
  { label: "$userLocation", type: CompletionKind.Param, detail: "User location param", boost: 75 },
  { label: "$prop", type: CompletionKind.Param, detail: "Dynamic property param", boost: 70 },
  { label: "$refId", type: CompletionKind.Param, detail: "Reference ID param", boost: 70 },
];

export const GLOB_COMPLETIONS: GroqCompletion[] = [
  { label: '"drafts.*"', type: CompletionKind.Glob, detail: "All draft documents", boost: 90, apply: "drafts.*" },
  { label: '"drafts.**"', type: CompletionKind.Glob, detail: "All draft documents (recursive)", boost: 85, apply: "drafts.**" },
  { label: '"translations.*"', type: CompletionKind.Glob, detail: "All translations", boost: 80, apply: "translations.*" },
  { label: '"a.b.c.*"', type: CompletionKind.Glob, detail: "Single-level path match", boost: 75, apply: "a.b.c.*" },
  { label: '"a.b.c.**"', type: CompletionKind.Glob, detail: "Recursive path match", boost: 75, apply: "a.b.c.**" },
];

export const NAMESPACE_MAP: Record<string, GroqCompletion[]> = {
  sanity: [
    { label: "sanity::dataset()", type: CompletionKind.Function, detail: "Get current dataset name", boost: 95 },
    { label: "sanity::versionOf()", type: CompletionKind.Function, detail: "Get document versions", boost: 90 },
    { label: "sanity::partOfRelease()", type: CompletionKind.Function, detail: "Get release documents", boost: 90 },
  ],
  geo: [
    { label: "geo::distance()", type: CompletionKind.Function, detail: "Geospatial distance", boost: 95 },
    { label: "geo::contains()", type: CompletionKind.Function, detail: "Check point in region", boost: 95 },
    { label: "geo::intersects()", type: CompletionKind.Function, detail: "Check geometry overlap", boost: 95 },
  ],
  array: [
    { label: "array::join()", type: CompletionKind.Function, detail: "Join array elements", boost: 95 },
    { label: "array::compact()", type: CompletionKind.Function, detail: "Remove nulls from array", boost: 95 },
    { label: "array::unique()", type: CompletionKind.Function, detail: "Unique array values", boost: 95 },
    { label: "array::intersects()", type: CompletionKind.Function, detail: "Check array overlap", boost: 95 },
  ],
  text: [
    { label: "text::semanticSimilarity()", type: CompletionKind.Function, detail: "AI semantic ranking", boost: 95 },
    { label: "text::query()", type: CompletionKind.Function, detail: "Full-text query", boost: 95 },
  ],
  string: [
    { label: "string::startsWith()", type: CompletionKind.Function, detail: "String starts with check", boost: 95 },
  ],
  pt: [
    { label: "pt::text()", type: CompletionKind.Function, detail: "Portable Text to plain text", boost: 95 },
  ],
  user: [
    { label: "user::attributes()", type: CompletionKind.Function, detail: "Get user attributes", boost: 95 },
  ],
};

export const ALL_COMPLETIONS: GroqCompletion[] = [
  ...KEYWORD_COMPLETIONS,
  ...LITERAL_COMPLETIONS,
  ...OPERATOR_COMPLETIONS,
  ...FUNCTION_COMPLETIONS,
  ...SNIPPET_COMPLETIONS,
  ...PIPELINE_STAGE_COMPLETIONS,
  ...LOCALE_COMPLETIONS,
  ...PARAM_COMPLETIONS,
  ...GLOB_COMPLETIONS,
];

export const SCORE_CONTEXT_COMPLETIONS: GroqCompletion[] = [
  { label: 'boost(condition, n)', type: CompletionKind.Function, detail: "Weighted score boost", boost: 95, apply: "boost(${1}, ${2})${0}" },
  { label: 'text::semanticSimilarity("")', type: CompletionKind.Function, detail: "AI semantic ranking", boost: 90, apply: 'text::semanticSimilarity("${1}")${0}' },
  { label: 'text::query("")', type: CompletionKind.Function, detail: "Full-text query", boost: 85, apply: 'text::query("${1}")${0}' },
  { label: '@ match text::query("")', type: CompletionKind.Function, detail: "Hybrid text query", boost: 80, apply: '@ match text::query("${1}")${0}' },
];

export const ORDER_COMPLETIONS: GroqCompletion[] = [
  { label: "asc", type: CompletionKind.Keyword, detail: "Sort ascending", boost: 95 },
  { label: "desc", type: CompletionKind.Keyword, detail: "Sort descending", boost: 95 },
  { label: "collate", type: CompletionKind.Keyword, detail: "Locale-aware sorting", boost: 85 },
  { label: "lower()", type: CompletionKind.Function, detail: "Case-insensitive sort", boost: 80, apply: "lower(${1})${0}" },
  { label: "upper()", type: CompletionKind.Function, detail: "Case-sensitive sort", boost: 75, apply: "upper(${1})${0}" },
];

export const SELECT_COMPLETIONS: GroqCompletion[] = [
  { label: ' => ""', type: CompletionKind.Operator, detail: "Condition then value", boost: 95, apply: ' => "${1}"${0}' },
  { label: " => true", type: CompletionKind.Operator, detail: "Condition then true", boost: 90, apply: " => true${0}" },
  { label: " => false", type: CompletionKind.Operator, detail: "Condition then false", boost: 90, apply: " => false${0}" },
  { label: " => null", type: CompletionKind.Operator, detail: "Condition then null", boost: 90, apply: " => null${0}" },
  { label: " => {}", type: CompletionKind.Operator, detail: "Condition then object", boost: 85, apply: " => {${1}}${0}" },
];

export function getNamespaceCompletions(ns: string): GroqCompletion[] {
  return NAMESPACE_MAP[ns] ?? [];
}

export function getNamespaceNames(): string[] {
  return Object.keys(NAMESPACE_MAP);
}
