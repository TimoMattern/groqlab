import { CompletionContext, CompletionResult, snippet } from "@codemirror/autocomplete";
import type { Completion } from "@codemirror/autocomplete";
import {
  ALL_COMPLETIONS,
  PIPELINE_STAGE_COMPLETIONS,
  SCORE_CONTEXT_COMPLETIONS,
  ORDER_COMPLETIONS,
  SELECT_COMPLETIONS,
  LOCALE_COMPLETIONS,
  PARAM_COMPLETIONS,
  GLOB_COMPLETIONS,
  getNamespaceCompletions,
  getNamespaceNames,
  KEYWORD_COMPLETIONS,
  FUNCTION_COMPLETIONS,
  SNIPPET_COMPLETIONS,
  LITERAL_COMPLETIONS,
  OPERATOR_COMPLETIONS,
  CompletionKind,
} from "./groq-completions";
import type { GroqCompletion } from "./groq-completions";
import { useSchemaStore } from "@/stores/schema-store";
import { getActiveConnection } from "@/stores/connection-store";
import type { SchemaField, SchemaType } from "@/lib/sanity-types";

// ─── Context types ───────────────────────────────────────────────────────────

type CompletionCtx =
  | { kind: "root" }
  | { kind: "filter"; before: string }
  | { kind: "string-value"; before: string }
  | { kind: "projection"; typeName?: string; before: string }
  | { kind: "pipeline" }
  | { kind: "order-arg"; before: string }
  | { kind: "score-arg" }
  | { kind: "select-arg"; before: string }
  | { kind: "deref"; typeName: string }
  | { kind: "dot-access"; typeName?: string }
  | { kind: "array-projection"; typeName?: string; before: string }
  | { kind: "inline-conditional"; typeName: string }
  | { kind: "namespace"; ns: string }
  | { kind: "negation" }
  | { kind: "at-scope"; typeName?: string }
  | { kind: "param" }
  | { kind: "arithmetic" }
  | { kind: "geo-arg"; fn: string; argIndex: number }
  | { kind: "pt-text-arg" }
  | { kind: "release-arg"; fn: string }
  | { kind: "join-filter"; parentTypeName?: string }
  | { kind: "batch-key" }
  | { kind: "root-object" }
  | { kind: "at-subfilter" }
  | { kind: "post-projection-slice" }
  | { kind: "concat-rhs" }
  | { kind: "array-traversal"; before: string }
  | { kind: "collate-arg" }
  | { kind: "path-arg" }
  | { kind: "object-projection"; fields: { name: string; type: string }[]; typeName?: string; fieldName?: string }
  | { kind: "none" };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COMMON_FIELDS: { name: string; type: string }[] = [
  { name: "_id", type: "string" },
  { name: "_type", type: "string" },
  { name: "_rev", type: "string" },
  { name: "_createdAt", type: "datetime" },
  { name: "_updatedAt", type: "datetime" },
];

function fieldDetail(field: SchemaField): string {
  let t = field.type;
  if (field.isArray) t += "[]";
  if (field.isReference) t += " ->";
  return t;
}

function getSchemaTypes(): SchemaType[] {
  const conn = getActiveConnection();
  if (!conn) return [];
  return useSchemaStore.getState().getTypes(conn.id);
}

function findType(name: string): SchemaType | undefined {
  return getSchemaTypes().find((t) => t.name === name);
}

function resolveTypeName(typeName: string): SchemaType | undefined {
  const types = getSchemaTypes();
  let found = types.find((t) => t.name === typeName);
  if (found) return found;
  return types.find((t) => {
    const lastSegment = t.name.split(".").pop() || "";
    return lastSegment.toLowerCase().startsWith(typeName.toLowerCase());
  });
}

function resolveFieldTargetType(field: SchemaField, fieldName: string): SchemaType | undefined {
  const types = getSchemaTypes();
  // If the field was correctly inferred as a reference, use its type
  if (field.isReference) {
    const targetType = field.type;
    // Try exact match first
    let found = types.find((rt) => rt.name === targetType);
    if (found) return found;
    // If type is literally "reference" (unknown), try convention-based resolution
    if (targetType === "reference") {
      return types.find((rt) => rt.name === fieldName);
    }
    // Try matching by last segment of type name.
    // E.g., _ref prefix "image" should match type "sanity.imageAsset"
    found = types.find((rt) => {
      const lastSegment = rt.name.split(".").pop() || "";
      return lastSegment.toLowerCase().startsWith(targetType.toLowerCase());
    });
    if (found) return found;
    return undefined;
  }
  // Fallback: if field was inferred as "unknown" (null in sample),
  // try matching the field name itself to a type name
  if (field.type === "unknown") {
    return resolveTypeName(fieldName);
  }
  return undefined;
}

/** Fire-and-forget resolve all unresolved refs matching fieldName across all types.
 *  Called when -> deref can't find a target synchronously — the resolve will update
 *  the store and the next keystroke's completion will pick up the resolved type. */
function triggerRefResolve(fieldName: string): void {
  const conn = getActiveConnection();
  if (!conn) return;
  const store = useSchemaStore.getState();
  const types = store.getTypes(conn.id);
  if (!types || types.length === 0) return;

  for (const t of types) {
    const collectPaths = (fields: SchemaField[], path: string): string[] => {
      const paths: string[] = [];
      for (const f of fields) {
        const currentPath = path ? `${path}.${f.name}` : f.name;
        if (f.name === fieldName && f.isReference && f.type === "reference") {
          paths.push(currentPath);
        }
        if (f.fields) {
          paths.push(...collectPaths(f.fields, currentPath));
        }
      }
      return paths;
    };
    const paths = collectPaths(t.fields, "");
    for (const fieldPath of paths) {
      store.resolveRef(conn.id, conn, t.name, fieldPath);
    }
  }
}

/**
 * Collect all unresolved reference field paths in a field tree.
 * Returns dot-separated paths relative to the parent type (e.g. ["poster", "castMembers", "poster.asset"]).
 */
export function collectUnresolvedRefPaths(fields: SchemaField[]): string[] {
  const paths: string[] = [];
  const walk = (fs: SchemaField[], basePath: string): void => {
    for (const f of fs) {
      const currentPath = basePath ? `${basePath}.${f.name}` : f.name;
      if (f.isReference && f.type === "reference") {
        paths.push(currentPath);
      }
      if (f.fields) {
        walk(f.fields, currentPath);
      }
    }
  };
  walk(fields, "");
  return paths;
}

/**
 * Try to resolve a reference field synchronously using convention-based matching.
 * Checks Sanity invariants and field-name-to-type-name convention.
 * Mutates field.type in-place if a match is found.
 */
function trySyncRefResolve(type: SchemaType, fieldPath: string, allTypes: SchemaType[]): boolean {
  const segments = fieldPath.split(".");
  let field: SchemaField | undefined;
  let parentField: SchemaField | undefined;
  let currentFields = type.fields;
  for (let i = 0; i < segments.length; i++) {
    parentField = field;
    field = currentFields.find((f) => f.name === segments[i]);
    if (!field) return false;
    if (field.isReference && field.type !== "reference" && !field.fields) {
      const targetType = allTypes.find((t) => t.name === field!.type);
      currentFields = targetType?.fields ?? [];
    } else {
      currentFields = field.fields ?? [];
    }
  }
  if (!field) return false;
  if (!(field.isReference && field.type === "reference")) return false;

  const fieldName = segments[segments.length - 1];

  const parentName = segments.length > 1 ? segments[segments.length - 2] : undefined;
  if (fieldName === "asset" && (parentName === "image" || parentField?.type === "image" || type.name === "image")) {
    field.type = "sanity.imageAsset";
    return true;
  }
  if (fieldName === "asset" && (parentName === "file" || parentField?.type === "file" || type.name === "file")) {
    field.type = "sanity.fileAsset";
    return true;
  }

  if (allTypes.some((t) => t.name === fieldName)) {
    field.type = fieldName;
    return true;
  }

  return false;
}

/**
 * Optimistically resolve all unresolved reference fields in the given type.
 * First tries synchronous convention-based resolution so completions show
 * resolved type names immediately, then fires async API resolution for
 * authoritative type info.
 */
function optimisticallyResolveTypeRefs(typeName: string): void {
  const conn = getActiveConnection();
  if (!conn) return;
  const store = useSchemaStore.getState();
  const types = store.getTypes(conn.id);
  if (!types || types.length === 0) return;

  const t = types.find((t) => t.name === typeName);
  if (!t) return;

  const paths = collectUnresolvedRefPaths(t.fields);
  if (paths.length === 0) return;

  // Sync convention-based resolution first — updates field.type in-place
  // so that completion providers reading fieldDetail() see resolved types.
  let changed = false;
  for (const fieldPath of paths) {
    if (trySyncRefResolve(t, fieldPath, types)) {
      changed = true;
    }
  }
  if (changed) {
    store.setTypes(conn.id, [...types]);
  }

  // Fire async API-based resolution for authoritative type info
  for (const fieldPath of paths) {
    store.resolveRef(conn.id, conn, t.name, fieldPath);
  }
}

function findReferenceTargetType(fieldName: string): SchemaType | undefined {
  const types = getSchemaTypes();
  const searchFields = (fields: SchemaField[]): SchemaField | undefined => {
    for (const f of fields) {
      if (f.name === fieldName) return f;
      if (f.fields) {
        const found = searchFields(f.fields);
        if (found) return found;
      }
    }
    return undefined;
  };
  for (const t of types) {
    const field = searchFields(t.fields);
    if (field) {
      const result = resolveFieldTargetType(field, fieldName);
      if (result) return result;
    }
  }
  return undefined;
}

function findFieldSubFields(fieldName: string): { name: string; type: string }[] | undefined {
  const types = getSchemaTypes();
  const searchFields = (fields: SchemaField[]): SchemaField | undefined => {
    for (const f of fields) {
      if (f.name === fieldName) return f;
      if (f.fields) {
        const found = searchFields(f.fields);
        if (found) return found;
      }
    }
    return undefined;
  };
  for (const t of types) {
    const field = searchFields(t.fields);
    if (!field) continue;
    if (field.fields) {
      return field.fields.map((f) => ({ name: f.name, type: fieldDetail(f) }));
    }
    const targetType = resolveFieldTargetType(field, fieldName);
    if (targetType) return fieldsForType(targetType.name);
  }
  return undefined;
}

function allFields(): { name: string; type: string }[] {
  const fields: { name: string; type: string }[] = [...COMMON_FIELDS];
  const seen = new Set(COMMON_FIELDS.map((f) => f.name));
  for (const t of getSchemaTypes()) {
    for (const f of t.fields) {
      if (!seen.has(f.name)) {
        seen.add(f.name);
        fields.push({ name: f.name, type: fieldDetail(f) });
      }
    }
  }
  return fields;
}

function fieldsForType(typeName: string): { name: string; type: string }[] {
  const t = findType(typeName);
  if (!t) return [...COMMON_FIELDS];
  return [
    ...COMMON_FIELDS,
    ...t.fields.map((f) => ({ name: f.name, type: fieldDetail(f) })),
  ];
}

function makeFieldCompletions(
  fields: { name: string; type: string }[],
  query: string,
  boost = 98,
): Completion[] {
  const out: Completion[] = [];
  for (const f of fields) {
    if (!query || f.name.toLowerCase().includes(query)) {
      out.push({
        label: f.name,
        type: "keyword",
        detail: f.type,
        boost,
        apply: f.name,
      });
    }
  }
  return out;
}

function makeStaticCompletions(
  items: GroqCompletion[],
  query: string,
): Completion[] {
  const out: Completion[] = [];
  for (const c of items) {
    if (!query || c.label.toLowerCase().includes(query)) {
      out.push({
        label: c.label,
        type: c.type === CompletionKind.Function
          ? "function"
          : c.type === CompletionKind.Snippet ? "keyword" : c.type,
        detail: c.detail,
        apply: c.type === CompletionKind.Snippet && c.apply
          ? snippet(c.apply)
          : c.apply ?? c.label,
        boost: c.boost,
      });
    }
  }
  return out;
}

function textBefore(context: CompletionContext): string {
  return context.state.doc.toString().slice(0, context.pos);
}

function wordStart(context: CompletionContext): { from: number; word: string } | null {
  const match = context.matchBefore(/[a-zA-Z_*@^$][a-zA-Z0-9_$-]*/u);
  if (!match) return null;
  return { from: match.from, word: match.text };
}

function wordStartAfter(context: CompletionContext, prefix: string): { from: number; word: string } | null {
  const m = context.matchBefore(new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + /([a-zA-Z_*@^$][a-zA-Z0-9_$-]*)/.source));
  if (!m) return null;
  return { from: m.from + prefix.length, word: m.text };
}

// ─── String scanning utilities ───────────────────────────────────────────────

function isInString(before: string): boolean {
  let inStr = false;
  let char = "";
  for (const ch of before) {
    if (inStr) {
      if (ch === char) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      char = ch;
    }
  }
  return inStr;
}

function braceDepth(before: string): number {
  let depth = 0;
  let inStr = false;
  let char = "";
  for (const ch of before) {
    if (inStr) { if (ch === char) inStr = false; continue; }
    if (ch === '"' || ch === "'") { inStr = true; char = ch; continue; }
    if (ch === "{") depth++;
    if (ch === "}") depth = Math.max(0, depth - 1);
  }
  return depth;
}

function parenDepth(before: string): number {
  let depth = 0;
  let inStr = false;
  let char = "";
  for (const ch of before) {
    if (inStr) { if (ch === char) inStr = false; continue; }
    if (ch === '"' || ch === "'") { inStr = true; char = ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
  }
  return depth;
}

function bracketDepth(before: string): number {
  let depth = 0;
  let inStr = false;
  let char = "";
  for (const ch of before) {
    if (inStr) { if (ch === char) inStr = false; continue; }
    if (ch === '"' || ch === "'") { inStr = true; char = ch; continue; }
    if (ch === "[") depth++;
    if (ch === "]") depth = Math.max(0, depth - 1);
  }
  return depth;
}

function trimAfterLast(str: string, ch: string): string {
  const idx = str.lastIndexOf(ch);
  return idx >= 0 ? str.slice(0, idx) : str;
}

function textAfterLast(str: string, ch: string): string {
  const idx = str.lastIndexOf(ch);
  return idx >= 0 ? str.slice(idx + 1) : str;
}

function isAfter(str: string, pattern: RegExp): boolean {
  const trimmed = str.trimEnd();
  const match = trimmed.match(pattern);
  return !!match;
}

function skipStringAndParen(s: string): string {
  let out = "";
  let inStr = false;
  let char = "";
  let paren = 0;
  for (const ch of s) {
    if (inStr) {
      if (ch === char) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; char = ch; continue; }
    if (ch === "(") { paren++; continue; }
    if (ch === ")") { paren = Math.max(0, paren - 1); continue; }
    if (paren > 0) continue;
    out += ch;
  }
  return out;
}

// ─── Array type resolver ──────────────────────────────────────────────────────

function resolveArrayFieldType(
  field: SchemaField,
  parentTypeName?: string,
): CompletionCtx | undefined {
  if (!field.isArray) return undefined;

  if (field.isReference) {
    const targetType = resolveFieldTargetType(field, field.name);
    if (targetType) return { kind: "deref", typeName: targetType.name };
    triggerRefResolve(field.name);
  }
  if (field.fields) {
    return {
      kind: "object-projection",
      fields: field.fields.map((f) => ({ name: f.name, type: fieldDetail(f) })),
      typeName: parentTypeName,
      fieldName: field.name,
    };
  }
  // Fallback: try resolving field.type as a type name
  if (field.type && field.type !== "array" && field.type !== "reference") {
    const elementType = findType(field.type);
    if (elementType) {
      return { kind: "deref", typeName: elementType.name };
    }
  }
  // Convention fallback: if field name matches a type name, use it as element type
  // This handles cases where schema inference produced "array" type (empty/incomplete data)
  const byName = resolveTypeName(field.name);
  if (byName) {
    return { kind: "deref", typeName: byName.name };
  }
  return undefined;
}

// ─── Context detection ───────────────────────────────────────────────────────

function resolveProjectionWithArrayDeref(
  typeName: string,
  afterBrace: string,
  before: string,
): CompletionCtx {
  const resolvedType = findType(typeName);
  if (!resolvedType) return { kind: "projection", typeName, before };

  // Check for field[]-> deref
  const arrDerefArrow = afterBrace.match(
    /(?:['"]?\w+['"]?\s*:\s*)?(\w+)\[\]\s*->/,
  );
  if (arrDerefArrow) {
    const field = resolvedType.fields.find((f) => f.name === arrDerefArrow[1]);
    if (field) {
      const resolved = resolveArrayFieldType(field, typeName);
      if (resolved) return resolved;
    }
    return { kind: "projection", typeName, before };
  }

  // Check for field[]. access
  const arrDeref = afterBrace.match(
    /(?:['"]?\w+['"]?\s*:\s*)?(\w+)\[\]\./,
  );
  if (arrDeref) {
    const field = resolvedType.fields.find((f) => f.name === arrDeref[1]);
    if (field) {
      const resolved = resolveArrayFieldType(field, typeName);
      if (resolved) return resolved;
    }
  }
  return { kind: "projection", typeName, before };
}

export function detectContext(before: string): CompletionCtx {
  const trimmed = before.trimEnd();

  // 1. Inside comment
  const lastComment = before.lastIndexOf("//");
  if (lastComment >= 0) {
    const beforeComment = before.slice(0, lastComment);
    if (!isInString(beforeComment)) {
      return { kind: "none" };
    }
  }

  // 2. Bare number literal — suppress completions
  if (/^\s*\d+\.?\d*\s*$/.test(before)) {
    return { kind: "none" };
  }

  // 3. Inside string
  if (isInString(before)) {
    return { kind: "string-value", before };
  }

  // 2. After $ for params
  if (trimmed.endsWith("$") || /[$][a-zA-Z0-9_]*$/.test(trimmed)) {
    const lastDollar = trimmed.lastIndexOf("$");
    if (lastDollar >= 0) {
      const afterDollar = trimmed.slice(lastDollar + 1);
      if (afterDollar.length === 0 || /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(afterDollar)) {
        return { kind: "param" };
      }
    }
  }

  // 3. collate arg — after "collate " inside order()
  if (isAfter(trimmed, /collate(\s+|$)/)) {
    return { kind: "collate-arg" };
  }

  // 4. path() arg
  if (/path\(\s*"([^"]*)?$/.test(before) || /path\(\s*'([^']*)?$/.test(before) || /path\(\s*$/.test(before)) {
    return { kind: "path-arg" };
  }

  // 6. Post-projection slice: }[ or }[0.. or }[0...
  if (/}\s*\[\s*(\d+\.\.\.?\s*)?$/.test(trimmed) || /}\s*\[\s*$/.test(trimmed)) {
    return { kind: "post-projection-slice" };
  }
  // Also detect after projection with explicit range start
  if (/}\s*\[\s*\d+\.\.\.?\s*$/.test(trimmed)) {
    return { kind: "post-projection-slice" };
  }

  // 7. Inside select()
  if (/select\(\s*([^)]*)$/.test(before) && parenDepth(before) > 0) {
    const inside = before.match(/select\(\s*([^)]*)$/)?.[1] ?? "";
    if (inside.includes("=>")) {
      const afterArrow = textAfterLast(inside, "=>").trim();
      if (afterArrow.length === 0 || !afterArrow.includes(",")) {
        return { kind: "select-arg", before };
      }
      // After comma in select
      return { kind: "select-arg", before };
    }
    return { kind: "select-arg", before };
  }

  // 8. Inside order()
  if (/order\(\s*([^)]*)$/.test(before) && parenDepth(before) > 0) {
    const inside = before.match(/order\(\s*([^)]*)$/)?.[1] ?? "";
    const afterComma = textAfterLast(inside, ",").trim();
    const afterField = afterComma.split(/\s+/).filter(Boolean);
    if (afterField.length === 0) {
      return { kind: "order-arg", before };
    }
    const lastWord = afterField[afterField.length - 1];
    if (lastWord === "asc" || lastWord === "desc" || lastWord === "collate") {
      return { kind: "order-arg", before };
    }
    return { kind: "order-arg", before };
  }

  // 9. geo:: functions — checked BEFORE score() so nested calls inside score() resolve correctly
  for (const fn of ["geo::distance", "geo::contains", "geo::intersects"]) {
    const re = new RegExp(fn + "\\(");
    if (re.test(before) && parenDepth(before) > 0) {
      const inside = before.slice(before.lastIndexOf(fn + "(") + fn.length + 1);
      const argCount = inside.split(",").length - 1;
      return { kind: "geo-arg", fn, argIndex: argCount };
    }
    if (before.endsWith(fn)) {
      return { kind: "geo-arg", fn, argIndex: 0 };
    }
  }

  // 10. sanity::versionOf / sanity::partOfRelease — checked BEFORE score() for nesting
  for (const fn of ["sanity::versionOf", "sanity::partOfRelease"]) {
    if ((new RegExp(fn + "\\(").test(before) && parenDepth(before) > 0) || before.endsWith(fn)) {
      return { kind: "release-arg", fn };
    }
  }

  // 11. pt::text()
  if ((/pt::text\(\s*([^)]*)$/.test(before) && parenDepth(before) > 0) || before.endsWith("pt::text")) {
    return { kind: "pt-text-arg" };
  }

  // 12. Inside score()
  if (/score\(\s*([^)]*)$/.test(before) && parenDepth(before) > 0) {
    return { kind: "score-arg" };
  }

  // 13. namespace :: after (checked after function-specific namespace checks)
  for (const ns of getNamespaceNames()) {
    const re = new RegExp(ns + "::$");
    if (isAfter(trimmed, re)) {
      return { kind: "namespace", ns };
    }
    const partialRe = new RegExp(ns + "::[a-zA-Z0-9_]*(?![a-zA-Z0-9_(])$");
    if (isAfter(trimmed, partialRe)) {
      return { kind: "namespace", ns };
    }
  }

  // 14. ! negation
  if (isAfter(trimmed, /!\s*$/)) {
    return { kind: "negation" };
  }

  // 14. @ in [...] subfilter
  if (/\[@\s*(in|==|!=)?\s*$/.test(skipStringAndParen(before))) {
    return { kind: "at-subfilter" };
  }

  // 16. Join filter: *[_type == "X" && references(^._id)] or similar
  // Check before projection because references() can appear inside a subquery within a projection
  if (/references\(\s*$/.test(trimmed) && bracketDepth(before) > 0) {
    return { kind: "join-filter" };
  }

  // 17. Projection scope: inside { ... }
  if (braceDepth(before) > 0) {
    const depth = braceDepth(before);
    // Find the opening brace at current depth
    let openBracePos = -1;
    let d = 0;
    let inStr = false;
    let char = "";
    for (let i = 0; i < before.length; i++) {
      const ch = before[i];
      if (inStr) { if (ch === char) inStr = false; continue; }
      if (ch === '"' || ch === "'") { inStr = true; char = ch; continue; }
      if (ch === "{") { d++; if (d === depth) { openBracePos = i; } }
      if (ch === "}") { d--; }
    }

    if (openBracePos >= 0) {
      const textBeforeBrace = before.slice(0, openBracePos).trim();

      // ->{} deref projection (before the opening brace)
      const derefMatch = textBeforeBrace.match(/(\w[\w.]*)\s*->\s*$/);
      if (derefMatch) {
        const fieldName = derefMatch[1].split(".").pop()!;
        const refType = findReferenceTargetType(fieldName);
        if (refType) {
          return { kind: "deref", typeName: refType.name };
        }
        triggerRefResolve(fieldName);
      }

      // -> deref inside projection (after the opening brace)
      const afterBrace = before.slice(openBracePos + 1).trimEnd();
      const derefInside = afterBrace.match(/(\w[\w]*)\s*->\s*$/);
      if (derefInside) {
        const fieldName = derefInside[1];
        const refType = findReferenceTargetType(fieldName);
        if (refType) {
          return { kind: "deref", typeName: refType.name };
        }
        triggerRefResolve(fieldName);
        return { kind: "deref", typeName: "" };
      }

      // array[] inside projection — traversal continuations
      const arrayEnd = afterBrace.match(/(\w[\w]*)\[\]\s*$/);
      if (arrayEnd) {
        return { kind: "array-traversal", before };
      }

      // array[]{} projection
      if (/\]\s*$/.test(textBeforeBrace) && !/^\[/.test(textBeforeBrace.trim())) {
        const arrFieldMatch = textBeforeBrace.match(/(\w[\w]*)\s*\[\]\s*$/);
        if (arrFieldMatch) {
          const arrFieldName = arrFieldMatch[1];
          const arrType = findType(arrFieldName);
          if (arrType) {
            return { kind: "array-projection", typeName: arrType.name, before };
          }
          // Try to see if it's an array field of the filtered type
          return { kind: "array-projection", before };
        }
      }

      // inline conditional: _type == "X" => {
      const condMatch = textBeforeBrace.match(/_type\s*==\s*([""'])([^"']+)\1\s*=>\s*$/);
      if (condMatch) {
        return { kind: "inline-conditional", typeName: condMatch[2] };
      }

      // Normal projection: resolve type from _type filter
      const exactMatch = textBeforeBrace.match(/_type\s*==\s*([""'])([^"']+)\1\s*\]\s*$/);
      if (exactMatch) {
        return resolveProjectionWithArrayDeref(exactMatch[2], afterBrace, before);
      }
      const inMatch = textBeforeBrace.match(/_type\s+in\s+\[([""'])([^"']+)\1\]\s*\]\s*$/);
      if (inMatch) {
        return resolveProjectionWithArrayDeref(inMatch[2], afterBrace, before);
      }

      // After "alias": inside projection — check if we're after a colon
      if (isAfter(trimmed, /:\s*$/)) {
        return { kind: "projection", before };
      }

      // Check for object field projection: poster{} — show poster's sub-fields
      // Match the last word/identifier before the opening brace (may follow other projection content)
      const plainFieldMatch = textBeforeBrace.match(/(\w[\w]*)\s*$/);
      if (plainFieldMatch) {
        const subFields = findFieldSubFields(plainFieldMatch[1]);
        if (subFields) {
          const typeFilterMatch = textBeforeBrace.match(/_type\s*==\s*([""'])([^"']+)\1\s*\]/);
          const parentTypeName = typeFilterMatch ? typeFilterMatch[2] : undefined;
          return { kind: "object-projection", fields: subFields, typeName: parentTypeName, fieldName: plainFieldMatch[1] };
        }
      }

      // Check for field[]. inside projection without type filter — resolve array element type
      const lastArrDot = (() => {
        const idx = afterBrace.lastIndexOf("[]");
        if (idx < 0 || idx + 2 >= afterBrace.length) return null;
        if (afterBrace[idx + 2] !== ".") return null;
        const beforeField = afterBrace.slice(0, idx).trimEnd();
        const afterColon = beforeField.lastIndexOf(":") >= 0
          ? beforeField.slice(beforeField.lastIndexOf(":") + 1).trim()
          : beforeField;
        const m = afterColon.match(/(\w[\w]*)$/);
        return m ? m[1] : null;
      })();
      if (lastArrDot) {
        for (const t of getSchemaTypes()) {
          const field = t.fields.find((f) => f.name === lastArrDot);
          if (field && field.isArray) {
            const resolved = resolveArrayFieldType(field);
            if (resolved) return resolved;
          }
        }
        // Fallback: show all fields from all types
        return { kind: "projection", before };
      }

      // Check if it's a batched query (root { without leading filter)
      if (openBracePos === 0 || /^\s*$/.test(before.slice(0, openBracePos))) {
        return { kind: "root-object" };
      }

      return { kind: "projection", before };
    }
    return { kind: "projection", before };
  }

  // 18. Pipeline after |
  const afterPipe = textAfterLast(skipStringAndParen(before), "|").trim();
  if (before.includes("|") && !before.includes("||") && afterPipe.length > 0) {
    const pipeParts = before.split("|");
    const lastPipe = pipeParts[pipeParts.length - 1] ?? "";
    if (lastPipe.trim().length <= 5) {
      return { kind: "pipeline" };
    }
  }
  if (isAfter(trimmed, /\|\s*$/)) {
    return { kind: "pipeline" };
  }

  // 19. -> deref (not in projection)
  if (isAfter(trimmed, /->\s*$/)) {
    const beforeArrow = before.slice(0, before.lastIndexOf("->")).trim();
    const fieldName = beforeArrow.split(/[.\[\]'"]/).filter(Boolean).pop() ?? "";
    const refType = findReferenceTargetType(fieldName);
    if (refType) {
      return { kind: "deref", typeName: refType.name };
    }
    triggerRefResolve(fieldName);
    return { kind: "deref", typeName: "" };
  }

  // 20. Dot access: *[filter]. or [N]. or [N..M].
  // Also catch partial typing after the dot: *[filter].ti| or [0].ti|
  if (isAfter(trimmed, /\]\s*['"]?\s*\.\s*$/) || /\]\s*['"]?\s*\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    const beforeDot = before.slice(0, before.lastIndexOf(".")).trimEnd();
    const beforeBracket = beforeDot.slice(0, beforeDot.lastIndexOf("]")).trimEnd();

    // *[filter]. — try to resolve type from filter
    const filterMatch = beforeBracket.match(/_type\s*==\s*([""'])([^"']+)\1\s*$/);
    if (filterMatch) {
      return { kind: "dot-access", typeName: filterMatch[2] };
    }
    const filterInMatch = beforeBracket.match(/_type\s+in\s+\[([""'])([^"']+)\1\]\s*$/);
    if (filterInMatch) {
      return { kind: "dot-access", typeName: filterInMatch[2] };
    }
    return { kind: "dot-access" };
  }

  // 21. @ scope / ^ scope
  if (isAfter(trimmed, /[@^]\s*\.\s*$/)) {
    return { kind: "at-scope" };
  }

  // Bare dot without valid preceding token — suppress completions
  if (/[a-zA-Z0-9_)\]}]\s*\.\s*$/.test(trimmed) || /[a-zA-Z0-9_)\]}]\s*\.[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    const dotPos = before.lastIndexOf(".");
    if (dotPos > 0) {
      const charBefore = before[dotPos - 1];
      if (!/[\])}@^]/.test(charBefore)) {
        return { kind: "none" };
      }
    }
  }

  // 22. Concat RHS: after array/object literal + (before arithmetic to intercept)
  if (isAfter(trimmed, /\]\s*\+\s*$/) || isAfter(trimmed, /\}\s*\+\s*$/)) {
    return { kind: "concat-rhs" };
  }

  // 22. Array traversal (outside projection): field[] at cursor
  if (isAfter(trimmed, /\w\[\]\s*$/)) {
    return { kind: "array-traversal", before };
  }

  // 23. Arithmetic: after number, numeric expression, or arithmetic operator
  if (!isAfter(trimmed, /[=!<>]=?\s*$/) && !isInString(before)) {
    if (isAfter(trimmed, /[\d)]\s*$/) || isAfter(trimmed, /(?:[+\-\/%]|\*\*)\s*$/)) {
      const lastChar = trimmed[trimmed.length - 1];
      if (lastChar === ")" || /^\d$/.test(lastChar) || /[+\-*/%]/.test(lastChar)) {
        if (!/^\w+\(\s*$/.test(trimmed)) {
          return { kind: "arithmetic" };
        }
      }
    }
  }

  // 22. Root object (no leading filter, starts with {)
  if (/^\s*\{\s*$/.test(trimmed) || /^\s*\{\s*"[^"]*":\s*$/.test(trimmed)) {
    return { kind: "root-object" };
  }

  // 23. Filter brackets
  if (bracketDepth(before) > 0) {
    return { kind: "filter", before };
  }

  return { kind: "root" };
}

// ─── Completion providers per context ────────────────────────────────────────

function rootCompletions(query: string): Completion[] {
  const out = [
    ...makeStaticCompletions(SNIPPET_COMPLETIONS, query),
    ...makeStaticCompletions(FUNCTION_COMPLETIONS, query),
    ...makeStaticCompletions(LITERAL_COMPLETIONS, query),
    ...makeStaticCompletions(KEYWORD_COMPLETIONS.filter((k) =>
      ["order", "select", "collate", "in", "match", "and", "or", "not"].includes(k.label)
    ), query),
    { label: "*", type: "atom" as const, detail: "All documents", boost: 95, apply: "*" },
  ];
  if (!query || "@".includes(query)) {
    out.push({ label: "@", type: "atom" as const, detail: "Current value", boost: 95, apply: "@" });
  }
  if (!query || "^".includes(query)) {
    out.push({ label: "^", type: "atom" as const, detail: "Parent reference", boost: 95, apply: "^" });
  }
  return out;
}

function filterCompletions(before: string, query: string): Completion[] {
  const out: Completion[] = [];

  // Functions usable in filters
  out.push(...makeStaticCompletions(
    FUNCTION_COMPLETIONS.filter((f) =>
      !["score()", "boost()", "select()", "filter()", "project()", "slice()"].includes(f.label)
    ), query,
  ));
  out.push(...makeStaticCompletions(LITERAL_COMPLETIONS, query));
  out.push(...makeStaticCompletions(
    OPERATOR_COMPLETIONS.filter((o) => ["==", "!=", "<", "<=", ">", ">=", "&&", "||", "!", "in", "match"].includes(o.label)),
    query,
  ));
  out.push(...makeStaticCompletions(
    KEYWORD_COMPLETIONS.filter((k) => ["in", "match", "and", "or", "not"].includes(k.label)),
    query,
  ));

  // Field names in filter (all types merged — no type scoping in filter)
  if (!query || query.length > 0) {
    const fields = allFields();
    for (const f of fields) {
      if (!query || f.name.toLowerCase().includes(query)) {
        out.push({
          label: f.name,
          type: "keyword",
          detail: f.type,
          boost: 88,
          apply: f.name,
        });
      }
    }
  }

    out.push({ label: "@", type: "atom" as const, detail: "Current value", boost: 97, apply: "@" });
    out.push({ label: "^", type: "atom" as const, detail: "Parent reference", boost: 97, apply: "^" });
  out.push({ label: "!", type: "operator" as const, detail: "Logical NOT", boost: 90, apply: "!" });
  out.push({ label: "*", type: "atom" as const, detail: "All documents subquery", boost: 80, apply: "*" });

  return out;
}

function stringValueCompletions(before: string, query: string): Completion[] {
  const types = getSchemaTypes();
  const out: Completion[] = [];

  // Detect if this looks like a _type comparison string (e.g. _type == "...")
  const isTypeComparison = /_type\s*==\s*["'][^"']*$/.test(before) || /_type\s+in\s+\[["'][^"']*$/.test(before);

  if (isTypeComparison) {
    // Offer type names
    for (const t of types) {
      const quoted = `"${t.name}"`;
      if (!query || quoted.toLowerCase().includes(query)) {
        out.push({
          label: quoted,
          type: "type",
          detail: t.title ?? t.name,
          boost: 99,
          apply: t.name,
        });
      }
    }
    // Globs are very relevant in type comparisons (e.g. "drafts.*")
    for (const c of GLOB_COMPLETIONS) {
      if (!query || c.label.toLowerCase().includes(query)) {
        out.push({
          label: c.label,
          type: c.type === CompletionKind.Glob ? "keyword" : c.type,
          detail: c.detail,
          apply: c.apply ?? c.label,
          boost: 95,
        });
      }
    }
    // Locales are less relevant in type comparisons
    for (const c of LOCALE_COMPLETIONS) {
      if (!query || c.label.toLowerCase().includes(query)) {
        out.push({
          label: c.label,
          type: c.type === CompletionKind.Locale ? "keyword" : c.type,
          detail: c.detail,
          apply: c.apply ?? c.label,
          boost: 80,
        });
      }
    }
  } else {
    // Non-type strings: locales first, then globs
    for (const c of LOCALE_COMPLETIONS) {
      if (!query || c.label.toLowerCase().includes(query)) {
        out.push({
          label: c.label,
          type: c.type === CompletionKind.Locale ? "keyword" : c.type,
          detail: c.detail,
          apply: c.apply ?? c.label,
          boost: 90,
        });
      }
    }
    for (const c of GLOB_COMPLETIONS) {
      if (!query || c.label.toLowerCase().includes(query)) {
        out.push({
          label: c.label,
          type: c.type === CompletionKind.Glob ? "keyword" : c.type,
          detail: c.detail,
          apply: c.apply ?? c.label,
          boost: 85,
        });
      }
    }
  }

  return out;
}

function projectionCompletions(typeName: string | undefined, before: string, query: string): Completion[] {
  const out: Completion[] = [];

  if (typeName) {
    const t = findType(typeName);
    if (t) {
      // Common fields get 98
      for (const f of COMMON_FIELDS) {
        if (!query || f.name.toLowerCase().includes(query)) {
          out.push({ label: f.name, type: "keyword", detail: f.type, boost: 98, apply: f.name });
        }
      }
      // Type-specific fields get 99 (they're the primary reason the type was resolved)
      for (const f of t.fields) {
        const detail = fieldDetail(f);
        if (!query || f.name.toLowerCase().includes(query)) {
          out.push({ label: f.name, type: "keyword", detail, boost: 99, apply: f.name });
        }
      }
    } else {
      out.push(...makeFieldCompletions(allFields(), query, 98));
    }
  } else {
    out.push(...makeFieldCompletions(allFields(), query, 98));
  }

  // Spread
  if (!query || "...".includes(query)) {
    out.push({ label: "...", type: "keyword", detail: "Spread all attributes", boost: 95, apply: "..." });
  }

  // Current/parent references
  if (!query || "@".includes(query)) {
    out.push({ label: "@", type: "atom", detail: "Current value", boost: 97, apply: "@" });
  }
  if (!query || "^".includes(query)) {
    out.push({ label: "^", type: "atom", detail: "Parent reference", boost: 97, apply: "^" });
  }

  // Computed field functions
  out.push(...makeStaticCompletions(
    FUNCTION_COMPLETIONS.filter((f) =>
      ["count()", "coalesce()", "select()", "round()", "upper()", "lower()", "string()", "number()", "defined()", "length()", "array::join()", "array::compact()", "array::unique()"].includes(f.label)
    ), query,
  ));

  // Alias pattern suggestion
  if (!query || query.length === 0) {
    out.push({
      label: '"name": ',
      type: "keyword",
      detail: "Aliased field",
      boost: 90,
      apply: '"${1}": ${0}',
    });
  }

  return out;
}

function pipelineCompletions(query: string): Completion[] {
  return makeStaticCompletions(PIPELINE_STAGE_COMPLETIONS, query);
}

function orderArgCompletions(query: string): Completion[] {
  const types = getSchemaTypes();
  const fields: { name: string; type: string }[] = [...COMMON_FIELDS];
  const seen = new Set<string>();

  for (const t of types) {
    for (const f of t.fields) {
      const key = f.name + "|" + f.type;
      if (!seen.has(key)) {
        seen.add(key);
        fields.push({ name: f.name, type: fieldDetail(f) });
      }
    }
  }

  const out: Completion[] = makeFieldCompletions(fields, query, 90);
  out.push(...makeStaticCompletions(ORDER_COMPLETIONS, query));
  return out;
}

function scoreArgCompletions(query: string): Completion[] {
  const fields = allFields();
  const out: Completion[] = makeStaticCompletions(SCORE_CONTEXT_COMPLETIONS, query);
  // Field match patterns
  for (const f of fields) {
    if (!query || f.name.toLowerCase().includes(query)) {
      out.push({
        label: `${f.name} match ""`,
        type: "function",
        detail: `Score by ${f.name} match`,
        boost: 80,
        apply: `${f.name} match "\${1}"\${0}`,
      });
    }
  }
  return out;
}

function selectArgCompletions(before: string, query: string): Completion[] {
  const out: Completion[] = [];

  // After => value context
  const inside = before.match(/select\(\s*([^)]*)$/)?.[1] ?? "";
  const afterArrow = textAfterLast(inside, "=>").trim();

  if (afterArrow.length > 0 && !afterArrow.includes(",") && inside.includes("=>")) {
    // We're after => — suggest return values
    out.push({ label: '""', type: "literal", detail: "String value", boost: 95, apply: '""' });
    out.push(...makeStaticCompletions(LITERAL_COMPLETIONS, query));
    const fields = allFields();
    for (const f of fields) {
      if (!query || f.name.toLowerCase().includes(query)) {
        out.push({ label: f.name, type: "keyword", detail: f.type, boost: 85, apply: f.name });
      }
    }
    return out;
  }

  // Before => — suggest conditions
  out.push({ label: ' => ""', type: "operator", detail: "Condition then value", boost: 95, apply: ' => "${1}"${0}' });
  out.push({ label: "defined()", type: "function", detail: "Check if field exists", boost: 93, apply: "defined(${1})${0}" });
  out.push(...makeStaticCompletions(
    OPERATOR_COMPLETIONS.filter((o) => ["==", "!=", "<", "<=", ">", ">=", "&&", "||"].includes(o.label)),
    query,
  ));
  const fields = allFields();
  for (const f of fields) {
    if (!query || f.name.toLowerCase().includes(query)) {
      out.push({ label: f.name, type: "keyword", detail: f.type, boost: 85, apply: f.name });
    }
  }
  return out;
}

function derefCompletions(typeName: string, query: string): Completion[] {
  const t = findType(typeName);
  const out: Completion[] = [];

  // Common fields get 98
  for (const f of COMMON_FIELDS) {
    if (!query || f.name.toLowerCase().includes(query)) {
      out.push({ label: f.name, type: "keyword", detail: f.type, boost: 98, apply: f.name });
    }
  }

  // Type-specific fields get 99 (they're the primary reason the type was resolved)
  if (t) {
    for (const f of t.fields) {
      const detail = fieldDetail(f);
      if (!query || f.name.toLowerCase().includes(query)) {
        out.push({ label: f.name, type: "keyword", detail, boost: 99, apply: f.name });
      }
    }
  }

  return out;
}

function dotAccessCompletions(typeName: string | undefined, query: string): Completion[] {
  const fields = typeName ? fieldsForType(typeName) : allFields();
  return makeFieldCompletions(fields, query, 98);
}

function arrayProjectionCompletions(typeName: string | undefined, before: string, query: string): Completion[] {
  const fields = typeName ? fieldsForType(typeName) : allFields();
  return makeFieldCompletions(fields, query, 98);
}

function inlineConditionalCompletions(typeName: string, query: string): Completion[] {
  const fields = fieldsForType(typeName);
  return makeFieldCompletions(fields, query, 98);
}

function namespaceCompletions(ns: string, query: string): Completion[] {
  return makeStaticCompletions(getNamespaceCompletions(ns), query);
}

function negationCompletions(query: string): Completion[] {
  const out: Completion[] = [];
  if (!query || "defined()".includes(query)) {
    out.push({ label: "defined()", type: "function", detail: "Check if field exists", boost: 95, apply: "defined(${1})${0}" });
  }
  if (!query || "(".includes(query)) {
    out.push({ label: "(", type: "operator", detail: "Group expression", boost: 90, apply: "(${1})${0}" });
  }
  const fields = allFields();
  for (const f of fields) {
    if (!query || f.name.toLowerCase().includes(query)) {
      out.push({ label: f.name, type: "keyword", detail: f.type, boost: 85, apply: f.name });
    }
  }
  return out;
}

function atScopeCompletions(typeName: string | undefined, query: string): Completion[] {
  const fields = typeName ? fieldsForType(typeName) : allFields();
  return makeFieldCompletions(fields, query, 95);
}

function paramCompletions(query: string): Completion[] {
  return makeStaticCompletions(PARAM_COMPLETIONS, query);
}

function arithmeticCompletions(query: string): Completion[] {
  const out: Completion[] = [];
  const ops = ["+", "-", "*", "/", "**", "%"];
  for (const op of ops) {
    if (!query || op.includes(query)) {
      out.push({ label: op, type: "operator", detail: `Arithmetic operator`, boost: 90, apply: op });
    }
  }
  out.push(...makeStaticCompletions(
    FUNCTION_COMPLETIONS.filter((f) => ["round()", "string()", "number()"].includes(f.label)),
    query,
  ));
  return out;
}

function geoArgCompletions(fn: string, argIndex: number, query: string): Completion[] {
  const out: Completion[] = [];
  if (argIndex === 0) {
    // First arg: geospatial field names
    const geoFields = ["geoPoint", "location", "coordinates", "deliveryZone", "serviceArea", "region", "routeLine", "neighborhoodRegion"];
    for (const f of geoFields) {
      if (!query || f.includes(query)) {
        out.push({ label: f, type: "keyword", detail: "Geospatial field", boost: 90, apply: f });
      }
    }
    // Also suggest schema fields that look geospatial
    const fields = allFields();
    for (const f of fields) {
      if (f.type === "geopoint" || f.type === "polygon" || (f.name.toLowerCase().includes("geo") && (!query || f.name.toLowerCase().includes(query)))) {
        out.push({ label: f.name, type: "keyword", detail: f.type, boost: 85, apply: f.name });
      }
    }
  } else {
    // Second arg: $param
    out.push(...makeStaticCompletions(
      PARAM_COMPLETIONS.filter((p) => p.label.includes("Location") || p.label === "$currentLocation"),
      query,
    ));
  }
  return out;
}

function ptTextArgCompletions(query: string): Completion[] {
  const fields = allFields();
  const out: Completion[] = [];
  for (const f of fields) {
    if (f.type === "block" || f.type.includes("block") || (f.type === "array" && (!query || f.name.toLowerCase().includes(query)))) {
      out.push({ label: f.name, type: "keyword", detail: "Portable Text field", boost: 90, apply: f.name });
    }
  }
  // Also suggest common block field names
  const blockNames = ["body", "content", "bio", "description", "excerpt", "text"];
  for (const n of blockNames) {
    if (!query || n.includes(query)) {
      out.push({ label: n, type: "keyword", detail: "Likely Portable Text field", boost: 80, apply: n });
    }
  }
  return out;
}

function releaseArgCompletions(_fn: string, query: string): Completion[] {
  if (!query || query.length === 0) {
    return [{
      label: '"document-id"',
      type: "literal",
      detail: "Document ID",
      boost: 90,
      apply: '"${1}"${0}',
    }];
  }
  return [];
}

function joinFilterCompletions(query: string): Completion[] {
  const out: Completion[] = [];
  if (!query || "^".includes(query)) {
    out.push({ label: "^._id", type: "keyword", detail: "Parent document ID", boost: 95, apply: "^._id" });
  }
  if (!query || "references".includes(query)) {
    out.push({ label: "references()", type: "function", detail: "Check reference to parent", boost: 90, apply: "references(${1})${0}" });
  }
  // Field comparisons with ^
  const fields = allFields();
  for (const f of fields) {
    if (!query || f.name.toLowerCase().includes(query)) {
      out.push({ label: `^._${f.name}`, type: "keyword", detail: `Parent ${f.name}`, boost: 85, apply: `^._${f.name}` });
    }
  }
  return out;
}

function batchKeyCompletions(query: string): Completion[] {
  const out: Completion[] = [];
  if (!query || '"name":'.includes(query)) {
    out.push({ label: '"name": ', type: "keyword", detail: "Batch query key", boost: 95, apply: '"${1}": ${0}' });
  }
  return out;
}

function rootObjectCompletions(query: string): Completion[] {
  const out: Completion[] = [];
  if (!query || ".".includes(query)) {
    out.push({ label: "...", type: "keyword", detail: "Spread all attributes", boost: 96, apply: "..." });
  }
  if (!query || '"name":'.includes(query)) {
    out.push({ label: '"name": ', type: "keyword", detail: "Computed property", boost: 95, apply: '"${1}": ${0}' });
  }
  if (!query || '*'.includes(query)) {
    out.push({ label: '*', type: "atom", detail: "Subquery", boost: 90, apply: '*' });
  }
  return out;
}

function atSubfilterCompletions(query: string): Completion[] {
  const out: Completion[] = [];
  if (!query || "@ in [".includes(query)) {
    out.push({ label: '@ in [', type: "keyword", detail: "Filter current element in array", boost: 95, apply: '@ in [' });
  }
  if (!query || '@ == "'.includes(query)) {
    out.push({ label: '@ == "', type: "keyword", detail: "Filter current element equals", boost: 90, apply: '@ == "' });
  }
  if (!query || '@ match "'.includes(query)) {
    out.push({ label: '@ match "', type: "keyword", detail: "Filter current element matches", boost: 85, apply: '@ match "' });
  }
  return out;
}

function postProjectionSliceCompletions(query: string): Completion[] {
  const out: Completion[] = [];
  if (!query || "0".includes(query)) {
    out.push({ label: "0", type: "literal", detail: "Single element access", boost: 96, apply: "0" });
  }
  if (!query || "0..".includes(query)) {
    out.push({ label: "0..", type: "keyword", detail: "Inclusive range start", boost: 95, apply: "0.." });
  }
  if (!query || "0...".includes(query)) {
    out.push({ label: "0...", type: "keyword", detail: "Exclusive range start", boost: 90, apply: "0..." });
  }
  out.push(...makeStaticCompletions(
    PARAM_COMPLETIONS.filter((p) => ["$start", "$limit"].includes(p.label)),
    query,
  ));
  // If already has a range start, suggest range end
  if (/\[\s*\d+\.\.\.?\s*$/.test(query)) {
    out.push({ label: "10", type: "literal", detail: "Range end", boost: 85, apply: "10" });
    out.push(...makeStaticCompletions(
      PARAM_COMPLETIONS.filter((p) => ["$end", "$limit"].includes(p.label)),
      query,
    ));
  }
  return out;
}

function concatRhsCompletions(query: string): Completion[] {
  const out: Completion[] = [];
  if (!query || "*".includes(query)) {
    out.push({ label: "*", type: "atom", detail: "All documents subquery", boost: 96, apply: "*" });
  }
  if (!query || "[".includes(query)) {
    out.push({ label: "[", type: "keyword", detail: "Array literal", boost: 90, apply: "[${1}]${0}" });
  }
  if (!query || "{".includes(query)) {
    out.push({ label: "{", type: "keyword", detail: "Object literal", boost: 85, apply: "{${1}}${0}" });
  }
  // Field names (array/object fields most relevant for concatenation)
  const fields = allFields();
  for (const f of fields) {
    if (!query || f.name.toLowerCase().includes(query)) {
      out.push({ label: f.name, type: "keyword", detail: f.type, boost: 80, apply: f.name });
    }
  }
  return out;
}

function arrayTraversalCompletions(_before: string, query: string): Completion[] {
  const out: Completion[] = [];
  if (!query || "->".includes(query)) {
    out.push({ label: "->", type: "operator", detail: "Dereference reference array", boost: 95, apply: "->" });
  }
  if (!query || "{}".includes(query)) {
    out.push({ label: "{}", type: "keyword", detail: "Project array elements", boost: 90, apply: "{$0}" });
  }
  if (!query || ".".includes(query)) {
    out.push({ label: ".", type: "operator", detail: "Access element fields", boost: 85, apply: "." });
  }
  if (!query || '["'.includes(query)) {
    out.push({ label: '[', type: "keyword", detail: "Filter array elements", boost: 80, apply: "[${1}]${0}" });
  }
  return out;
}

function collateArgCompletions(query: string): Completion[] {
  const out = makeStaticCompletions(LOCALE_COMPLETIONS, query);
  // If query doesn't match any locale (e.g. the word "collate" itself), show all
  if (out.length === 0) {
    return makeStaticCompletions(LOCALE_COMPLETIONS, "");
  }
  return out;
}

function objectProjectionCompletions(fields: { name: string; type: string }[], query: string): Completion[] {
  const out: Completion[] = makeFieldCompletions(fields, query, 98);
  if (!query || "...".includes(query)) {
    out.push({ label: "...", type: "keyword", detail: "Spread all attributes", boost: 95, apply: "..." });
  }
  return out;
}

function pathArgCompletions(query: string): Completion[] {
  const out = makeStaticCompletions(GLOB_COMPLETIONS, query);
  // Wildcard suggestions inside string
  if (!query || "*".includes(query)) {
    out.push({ label: "*", type: "glob", detail: "Single-level wildcard", boost: 95, apply: "*" });
    out.push({ label: "**", type: "glob", detail: "Multi-level wildcard", boost: 95, apply: "**" });
  }
  return out;
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export function groqCompletionSource(
  context: CompletionContext,
): CompletionResult | null {
  const explicit = context.explicit;
  const before = textBefore(context);
  const word = wordStart(context);
  const query = word?.word.toLowerCase() ?? "";

  // Detect context
  const ctx = detectContext(before);
  let options: Completion[] = [];
  let from = word?.from ?? context.pos;

  switch (ctx.kind) {
    case "root": {
      if (!word && !explicit) {
        // Still show on '*' or '(' typed (function call opened)
        if (!before.trim().endsWith("*") && !before.trim().endsWith("(")) return null;
      }
      options = rootCompletions(query);
      break;
    }

    case "filter": {
      options = filterCompletions(ctx.before, query);
      break;
    }

    case "string-value": {
      options = stringValueCompletions(ctx.before, query);
      if (options.length === 0) return null;
      // Adjust 'from' to the string content start
      const strMatch = before.match(/["']([^"']*)$/);
      if (strMatch) from = context.pos - strMatch[1].length;
      break;
    }

    case "projection": {
      if (ctx.typeName) optimisticallyResolveTypeRefs(ctx.typeName);
      options = projectionCompletions(ctx.typeName, ctx.before, query);
      if (options.length === 0 && !explicit) return null;
      break;
    }

    case "object-projection": {
      if (ctx.typeName) optimisticallyResolveTypeRefs(ctx.typeName);
      const liveFields = ctx.fieldName ? findFieldSubFields(ctx.fieldName) ?? ctx.fields : ctx.fields;
      options = objectProjectionCompletions(liveFields, query);
      if (options.length === 0 && !explicit) return null;
      break;
    }

    case "pipeline": {
      options = pipelineCompletions(query);
      if (options.length === 0) return null;
      break;
    }

    case "order-arg": {
      options = orderArgCompletions(query);
      break;
    }

    case "score-arg": {
      options = scoreArgCompletions(query);
      break;
    }

    case "select-arg": {
      options = selectArgCompletions(ctx.before, query);
      break;
    }

    case "deref": {
      if (ctx.typeName) optimisticallyResolveTypeRefs(ctx.typeName);
      options = derefCompletions(ctx.typeName, query);
      break;
    }

    case "dot-access": {
      if (ctx.typeName) optimisticallyResolveTypeRefs(ctx.typeName);
      options = dotAccessCompletions(ctx.typeName, query);
      break;
    }

    case "array-projection": {
      if (ctx.typeName) optimisticallyResolveTypeRefs(ctx.typeName);
      options = arrayProjectionCompletions(ctx.typeName, ctx.before, query);
      break;
    }

    case "inline-conditional": {
      optimisticallyResolveTypeRefs(ctx.typeName);
      options = inlineConditionalCompletions(ctx.typeName, query);
      break;
    }

    case "namespace": {
      options = namespaceCompletions(ctx.ns, query);
      break;
    }

    case "negation": {
      options = negationCompletions(query);
      break;
    }

    case "at-scope": {
      if (ctx.typeName) optimisticallyResolveTypeRefs(ctx.typeName);
      options = atScopeCompletions(ctx.typeName, query);
      break;
    }

    case "param": {
      options = paramCompletions(query);
      from = before.lastIndexOf("$");
      break;
    }

    case "arithmetic": {
      options = arithmeticCompletions(query);
      break;
    }

    case "geo-arg": {
      const functionJustCompleted = before.trimEnd().endsWith(ctx.fn);
      options = geoArgCompletions(ctx.fn, ctx.argIndex, functionJustCompleted ? "" : query);
      if (functionJustCompleted) from = context.pos;
      break;
    }

    case "pt-text-arg": {
      const functionJustCompleted = before.trimEnd().endsWith("pt::text");
      options = ptTextArgCompletions(functionJustCompleted ? "" : query);
      if (functionJustCompleted) from = context.pos;
      break;
    }

    case "release-arg": {
      const functionJustCompleted = before.trimEnd().endsWith(ctx.fn);
      options = releaseArgCompletions(ctx.fn, functionJustCompleted ? "" : query);
      if (functionJustCompleted) from = context.pos;
      break;
    }

    case "join-filter": {
      options = joinFilterCompletions(query);
      break;
    }

    case "batch-key": {
      options = batchKeyCompletions(query);
      break;
    }

    case "root-object": {
      options = rootObjectCompletions(query);
      break;
    }

    case "at-subfilter": {
      options = atSubfilterCompletions(query);
      break;
    }

    case "post-projection-slice": {
      options = postProjectionSliceCompletions(query);
      break;
    }

    case "concat-rhs": {
      options = concatRhsCompletions(query);
      break;
    }

    case "array-traversal": {
      options = arrayTraversalCompletions(ctx.before, query);
      break;
    }

    case "collate-arg": {
      options = collateArgCompletions(query);
      break;
    }

    case "path-arg": {
      options = pathArgCompletions(query);
      break;
    }

    case "none": {
      return null;
    }
  }

  if (options.length === 0) return null;

  return {
    from,
    options,
    validFor: /^$|^[a-zA-Z_*@^$][a-zA-Z0-9_$-]*$/u,
  };
}
