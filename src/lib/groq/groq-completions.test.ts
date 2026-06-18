import { describe, it, expect } from "vitest";
import {
  ALL_COMPLETIONS,
  KEYWORD_COMPLETIONS,
  FUNCTION_COMPLETIONS,
  SNIPPET_COMPLETIONS,
  LITERAL_COMPLETIONS,
  OPERATOR_COMPLETIONS,
  PIPELINE_STAGE_COMPLETIONS,
  LOCALE_COMPLETIONS,
  PARAM_COMPLETIONS,
  GLOB_COMPLETIONS,
} from "./groq-completions";

describe("groq-completions", () => {
  it("exported arrays have the correct counts", () => {
    expect(ALL_COMPLETIONS.length).toBeGreaterThan(0);
    expect(KEYWORD_COMPLETIONS.length).toBeGreaterThan(0);
    expect(FUNCTION_COMPLETIONS.length).toBeGreaterThan(0);
    expect(SNIPPET_COMPLETIONS.length).toBeGreaterThan(0);
    expect(LITERAL_COMPLETIONS.length).toBeGreaterThan(0);
    expect(OPERATOR_COMPLETIONS.length).toBeGreaterThan(0);
  });

  it("all completions have label and type", () => {
    for (const c of ALL_COMPLETIONS) {
      expect(c.label).toBeTruthy();
      expect(c.type).toBeTruthy();
      expect(c.detail).toBeTruthy();
    }
  });

  it("snippet completions have apply", () => {
    for (const c of SNIPPET_COMPLETIONS) {
      expect(c.apply).toBeTruthy();
    }
  });

  it("snippet apply strings use CM6 curly-brace placeholder syntax", () => {
    for (const c of SNIPPET_COMPLETIONS) {
      expect(c.apply).toMatch(/[$][{]\d+[}]/);
    }
  });

  it("snippet apply uses ${0} for final cursor position", () => {
    for (const c of SNIPPET_COMPLETIONS) {
      expect(c.apply).toMatch(/[$][{]0[}]$/);
    }
  });

  it("keyword completions contain in, match, order, and, or, not, @, ^", () => {
    const labels = KEYWORD_COMPLETIONS.map((c) => c.label);
    expect(labels).toContain("in");
    expect(labels).toContain("match");
    expect(labels).toContain("order");
    expect(labels).toContain("and");
    expect(labels).toContain("or");
    expect(labels).toContain("not");
    expect(labels).toContain("select");
    expect(labels).toContain("asc");
    expect(labels).toContain("desc");
    expect(labels).toContain("collate");
    expect(labels).toContain("@");
    expect(labels).toContain("^");
  });

  it("function completions contain all cheat sheet functions", () => {
    const labels = FUNCTION_COMPLETIONS.map((c) => c.label);
    expect(labels).toContain("count()");
    expect(labels).toContain("defined()");
    expect(labels).toContain("dateTime()");
    expect(labels).toContain("now()");
    expect(labels).toContain("select()");
    expect(labels).toContain("coalesce()");
    expect(labels).toContain("round()");
    expect(labels).toContain("upper()");
    expect(labels).toContain("lower()");
    expect(labels).toContain("string()");
    expect(labels).toContain("number()");
    expect(labels).toContain("length()");
    expect(labels).toContain("boost()");
    expect(labels).toContain("score()");
    expect(labels).toContain("references()");
    expect(labels).toContain("path()");
    expect(labels).toContain("global()");
    expect(labels).toContain("pt::text()");
    expect(labels).toContain("sanity::dataset()");
    expect(labels).toContain("sanity::versionOf()");
    expect(labels).toContain("sanity::partOfRelease()");
    expect(labels).toContain("user::attributes()");
    expect(labels).toContain("geo::distance()");
    expect(labels).toContain("geo::contains()");
    expect(labels).toContain("geo::intersects()");
    expect(labels).toContain("array::join()");
    expect(labels).toContain("array::compact()");
    expect(labels).toContain("array::unique()");
    expect(labels).toContain("array::intersects()");
    expect(labels).toContain("text::semanticSimilarity()");
    expect(labels).toContain("text::query()");
    expect(labels).toContain("string::startsWith()");
  });

  it("literal completions contain true false null", () => {
    const labels = LITERAL_COMPLETIONS.map((c) => c.label);
    expect(labels).toContain("true");
    expect(labels).toContain("false");
    expect(labels).toContain("null");
  });

  it("operator completions contain all cheat sheet operators", () => {
    const labels = OPERATOR_COMPLETIONS.map((c) => c.label);
    expect(labels).toContain("==");
    expect(labels).toContain("!=");
    expect(labels).toContain("<");
    expect(labels).toContain("<=");
    expect(labels).toContain(">");
    expect(labels).toContain(">=");
    expect(labels).toContain("&&");
    expect(labels).toContain("||");
    expect(labels).toContain("..");
    expect(labels).toContain("->");
    expect(labels).toContain("**");
    expect(labels).toContain("=>");
    expect(labels).toContain("+");
    expect(labels).toContain("-");
    expect(labels).toContain("/");
    expect(labels).toContain("%");
    expect(labels).toContain("!");
  });

  it("snippet completions contain all expected patterns", () => {
    const labels = SNIPPET_COMPLETIONS.map((c) => c.label);
    expect(labels).toContain('*[_type == ""]');
    expect(labels).toContain('*[_type == ""][0..10]');
    expect(labels).toContain("* | order()");
    expect(labels).toContain("order()");
    expect(labels).toContain('{..., "": ->{}}');
    expect(labels).toContain("count(*)");
    expect(labels).toContain('*[_type == ""][]->{}');
    expect(labels).toContain('*[_type == ""] | score() | order(_score desc)');
    expect(labels).toContain('*[_type == ""] | order(lower("") asc)');
    expect(labels).toContain('{"name": *[_type == ""]}');
    expect(labels).toContain('*[_type == ""]{...}');
  });

  it("ALL_COMPLETIONS is the union of all base arrays", () => {
    const total =
      KEYWORD_COMPLETIONS.length +
      FUNCTION_COMPLETIONS.length +
      SNIPPET_COMPLETIONS.length +
      LITERAL_COMPLETIONS.length +
      OPERATOR_COMPLETIONS.length +
      PIPELINE_STAGE_COMPLETIONS.length +
      LOCALE_COMPLETIONS.length +
      PARAM_COMPLETIONS.length +
      GLOB_COMPLETIONS.length;
    expect(ALL_COMPLETIONS.length).toBe(total);
  });

  it("all completions have valid types", () => {
    const validTypes = [
      "keyword", "function", "snippet", "operator", "literal",
      "type", "field", "param", "namespace", "stage", "locale", "glob", "special",
    ];
    for (const c of ALL_COMPLETIONS) {
      expect(validTypes).toContain(c.type);
    }
  });

  it("all completions have a boost between 0 and 100", () => {
    for (const c of ALL_COMPLETIONS) {
      expect(c.boost).toBeGreaterThanOrEqual(0);
      expect(c.boost).toBeLessThanOrEqual(100);
    }
  });
});
