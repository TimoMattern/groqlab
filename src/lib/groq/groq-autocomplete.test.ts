import { describe, it, expect, beforeEach } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext, snippet } from "@codemirror/autocomplete";
import { groqCompletionSource, collectUnresolvedRefPaths } from "./groq-autocomplete";
import { SNIPPET_COMPLETIONS } from "./groq-completions";
import { useConnectionStore } from "@/stores/connection-store";
import { useSchemaStore } from "@/stores/schema-store";
import type { SchemaType, SchemaField } from "@/lib/sanity-types";

function createContext(doc: string, pos: number, explicit = false) {
  const state = EditorState.create({ doc });
  return new CompletionContext(state, pos, explicit);
}

function makeConn(id: string) {
  return {
    id,
    name: `Conn ${id}`,
    projectId: `proj-${id}`,
    dataset: "production",
    createdAt: "2026-01-01T00:00:00Z",
    token: "",
  };
}

function makeType(name: string): SchemaType {
  return {
    name,
    title: name.charAt(0).toUpperCase() + name.slice(1),
    fields: [{ name: "title", type: "string", isArray: false, isReference: false }],
  };
}

beforeEach(() => {
  useConnectionStore.setState({ connections: [], activeId: null });
  useSchemaStore.setState({ types: {}, isLoading: {}, error: {} });
});

describe("groq-autocomplete", () => {
  it("returns null for empty input without explicit trigger", () => {
    const ctx = createContext("", 0);
    const result = groqCompletionSource(ctx);
    expect(result).toBeNull();
  });

  it("returns true on explicit trigger at cursor", () => {
    const ctx = createContext("* | ", 4, true);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      expect(result.options.length).toBeGreaterThan(0);
    }
  });

  it("returns completions matching partial keyword 'ord'", () => {
    const ctx = createContext("* | ord", 6);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      expect(result.from).toBe(4);
      const labels = result.options.map((o) => o.label);
      expect(labels).toContain("order()");
    }
  });

  it("returns completions matching partial function 'count'", () => {
    const ctx = createContext("coun", 4);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      const labels = result.options.map((o) => o.label);
      expect(labels).toContain("count()");
    }
  });

  it("returns completions matching partial 'in'", () => {
    const ctx = createContext("*[_type i", 9);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      const labels = result.options.map((o) => o.label);
      expect(labels).toContain("in");
    }
  });

  it("returns default filter items when partial word matches nothing", () => {
    const ctx = createContext("*[_type == \"post\" && zz", 22);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      const labels = result.options.map((o) => o.label);
      expect(labels).toContain("@");
      expect(labels).toContain("^");
      expect(labels).toContain("!");
    }
  });

  it("returns star snippet on star input", () => {
    const ctx = createContext("*", 1);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      const labels = result.options.map((o) => o.label);
      expect(labels).toContain('*[_type == ""]');
    }
  });

  it("returns options with expected shape", () => {
    const ctx = createContext("* | ", 4, true);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result && result.options.length > 0) {
      const first = result.options[0];
      expect(first).toHaveProperty("label");
      expect(first).toHaveProperty("type");
      expect(first).toHaveProperty("detail");
      expect(first).toHaveProperty("boost");
    }
  });

  it("snippet completions apply is a function", () => {
    const ctx = createContext("*", 1);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      const snippetOptions = result.options.filter(
        (o) => o.type === "keyword" && o.label.startsWith("*"),
      );
      expect(snippetOptions.length).toBeGreaterThan(0);
      for (const opt of result.options) {
        const matchingComp = SNIPPET_COMPLETIONS.find((s) => s.label === opt.label);
        if (matchingComp) {
          expect(typeof opt.apply).toBe("function");
        }
      }
    }
  });

  it("non-snippet completions apply is a string", () => {
    const ctx = createContext("* | ", 4, true);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      for (const opt of result.options) {
        const matchingComp = SNIPPET_COMPLETIONS.find((s) => s.label === opt.label);
        if (!matchingComp) {
          expect(typeof opt.apply).toBe("string");
        }
      }
    }
  });

  it("returns schema type completions with bare apply (no quotes) inside string", () => {
    useConnectionStore.setState({
      connections: [makeConn("c1")],
      activeId: "c1",
    });
    useSchemaStore.getState().setTypes("c1", [makeType("movie")]);

    const ctx = createContext('*[_type == "mov', 15);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      expect(result.from).toBe(12);
      const typeOption = result.options.find((o) => o.label === '"movie"');
      expect(typeOption).toBeDefined();
      expect(typeOption && typeOption.apply).toBe("movie");
    }
  });

  it("returns namespace function completion for 'sanity::dat'", () => {
    const ctx = createContext("sanity::dat", 10);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      const labels = result.options.map((o) => o.label);
      expect(labels).toContain("sanity::dataset()");
    }
  });

  it("returns namespace function completion for 'geo::dist'", () => {
    const ctx = createContext("geo::dist", 8);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      const labels = result.options.map((o) => o.label);
      expect(labels).toContain("geo::distance()");
    }
  });

  it("returns array function completion for 'array::jo'", () => {
    const ctx = createContext("array::jo", 8);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      const labels = result.options.map((o) => o.label);
      expect(labels).toContain("array::join()");
    }
  });

  it("returns text function completion for 'pt::tex'", () => {
    const ctx = createContext("pt::tex", 6);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      const labels = result.options.map((o) => o.label);
      expect(labels).toContain("pt::text()");
    }
  });

  it("returns dateTime function completion for 'dateT'", () => {
    const ctx = createContext("*[dateT", 6);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      const labels = result.options.map((o) => o.label);
      expect(labels).toContain("dateTime()");
    }
  });

  it("returns now function completion for 'no'", () => {
    const ctx = createContext("no", 2);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      const labels = result.options.map((o) => o.label);
      expect(labels).toContain("now()");
    }
  });

  it("returns select function completion for 'sele'", () => {
    const ctx = createContext("sele", 4);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      const labels = result.options.map((o) => o.label);
      expect(labels).toContain("select()");
    }
  });

  it("returns string::startsWith completion for 'starts'", () => {
    const ctx = createContext("string::starts", 13);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      const labels = result.options.map((o) => o.label);
      expect(labels).toContain("string::startsWith()");
    }
  });

  it("returns pipeline stage completions after pipe with explicit trigger", () => {
    const ctx = createContext("* | ", 4, true);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      const labels = result.options.map((o) => o.label);
      expect(labels).toContain("order()");
      expect(labels).toContain("filter()");
      expect(labels).toContain("score()");
    }
  });

  it("returns new snippet completions on star input", () => {
    const ctx = createContext("*", 1);
    const result = groqCompletionSource(ctx);
    expect(result).toBeTruthy();
    if (result) {
      const labels = result.options.map((o) => o.label);
      expect(labels).toContain('*[_type == ""][]->{}');
      expect(labels).toContain('*[_type == ""] | score() | order(_score desc)');
      expect(labels).toContain('*[_type == ""] | order(lower("") asc)');
    }
  });

  it("snippet templates produce correct output text via snippet()", () => {
    const cases: { template: string; expectedText: string }[] = [
      { template: '*[_type == "${1}"]${0}', expectedText: '*[_type == ""]' },
      { template: '*[_type == "${1}"][0..10]${0}', expectedText: '*[_type == ""][0..10]' },
      { template: "* | order(${1})${0}", expectedText: "* | order()" },
      { template: "order(${1})${0}", expectedText: "order()" },
      { template: '{..., "${1}": ${2}->{${3}}}${0}', expectedText: '{..., "": ->{}}' },
      { template: "count(*)${0}", expectedText: "count(*)" },
      { template: '*[_type == "${1}"]${2}->{${3}}${0}', expectedText: '*[_type == ""]->{}' },
      { template: '*[_type == "${1}"] | score(${2}) | order(_score desc)${0}', expectedText: '*[_type == ""] | score() | order(_score desc)' },
      { template: '*[_type == "${1}"] | order(lower(${2}) asc)${0}', expectedText: '*[_type == ""] | order(lower() asc)' },
    ];

    for (const { template, expectedText } of cases) {
      const apply = snippet(template);
      expect(typeof apply).toBe("function");

      const doc = "*";
      const state = EditorState.create({
        doc,
        selection: { anchor: doc.length, head: doc.length },
      });
      const from = 0;
      const to = doc.length;

      let dispatchedTx: unknown = null;
      const mockEditor = {
        state,
        dispatch: (tr: unknown) => {
          dispatchedTx = tr;
        },
      };
      apply(mockEditor, null, from, to);

      expect(dispatchedTx).not.toBeNull();
      const tx = dispatchedTx as { newDoc: { toString: () => string } };
      const resultText = tx.newDoc.toString();
      expect(resultText).toBe(expectedText);
    }
  });

  describe("projection field suggestions", () => {
    function setupWithMovieType() {
      const conn = makeConn("c1");
      useConnectionStore.setState({ connections: [conn], activeId: "c1" });
      useSchemaStore.getState().setTypes("c1", [{
        name: "movie",
        title: "Movie",
        fields: [
          { name: "title", type: "string", isArray: false, isReference: false },
          { name: "releaseDate", type: "datetime", isArray: false, isReference: false },
          { name: "popularity", type: "number", isArray: false, isReference: false },
          { name: "castMembers", type: "array", isArray: true, isReference: false },
          { name: "poster", type: "image", isArray: false, isReference: false },
        ],
      }]);
      return conn;
    }

    it("suggests common fields and schema fields inside projection", () => {
      setupWithMovieType();
      const ctx = createContext('*[_type == "movie"]{', '*[_type == "movie"]{'.length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("_id");
        expect(labels).toContain("_type");
        expect(labels).toContain("_rev");
        expect(labels).toContain("_createdAt");
        expect(labels).toContain("_updatedAt");
        expect(labels).toContain("title");
        expect(labels).toContain("releaseDate");
        expect(labels).toContain("popularity");
        expect(labels).toContain("castMembers");
        expect(labels).toContain("poster");
      }
    });

    it("suggests fields matching partial input inside projection", () => {
      setupWithMovieType();
      const ctx = createContext('*[_type == "movie"]{pop', '*[_type == "movie"]{pop'.length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("popularity");
        expect(labels).not.toContain("title");
        expect(labels).not.toContain("releaseDate");
      }
    });

    it("suggests common fields when no type filter is present", () => {
      setupWithMovieType();
      const ctx = createContext("*{", 2);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("_id");
        expect(labels).toContain("_type");
        expect(labels).toContain("title");
        expect(labels).toContain("popularity");
      }
    });

    it("suggests fields after comma inside projection", () => {
      setupWithMovieType();
      const ctx = createContext('*[_type == "movie"]{title, ', '*[_type == "movie"]{title, '.length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("releaseDate");
        expect(labels).toContain("popularity");
      }
    });

    it("suggests fields on multi-line projection", () => {
      setupWithMovieType();
      const doc = '*[_type == "movie"]{\n  title,\n  ';
      const ctx = createContext(doc, doc.length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("releaseDate");
        expect(labels).toContain("popularity");
        expect(labels).toContain("_id");
        expect(labels).toContain("_type");
      }
    });

    it("suggests fields after spread inside projection", () => {
      setupWithMovieType();
      const ctx = createContext('*[_type == "movie"]{..., ', '*[_type == "movie"]{..., '.length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("releaseDate");
        expect(labels).toContain("popularity");
        expect(labels).toContain("title");
      }
    });

    it("includes general completions alongside field suggestions inside projection", () => {
      setupWithMovieType();
      const ctx = createContext('*[_type == "movie"]{', '*[_type == "movie"]{'.length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("count()");
        expect(labels).toContain("defined()");
        expect(labels).toContain("coalesce()");
      }
    });

    it("does NOT suggest fields outside projection context", () => {
      setupWithMovieType();
      const ctx = createContext("*[_type == \"movie\"] | o", "*[_type == \"movie\"] | o".length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).not.toContain("title");
        expect(labels).not.toContain("_id");
      }
    });

    it("suggests fields inside filter brackets matching partial input", () => {
      setupWithMovieType();
      const ctx = createContext("*[_type == \"movie\" && t", "*[_type == \"movie\" && t".length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("title");
        expect(labels).not.toContain("_id");
        expect(labels).toContain("_type");
        expect(labels).toContain("_createdAt");
      }
    });

    it("uses field type as detail for completions", () => {
      setupWithMovieType();
      const ctx = createContext('*[_type == "movie"]{', '*[_type == "movie"]{'.length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const titleOption = result.options.find((o) => o.label === "title");
        expect(titleOption).toBeDefined();
        if (titleOption) expect(titleOption.detail).toBe("string");

        const castOption = result.options.find((o) => o.label === "castMembers");
        expect(castOption).toBeDefined();
        if (castOption) expect(castOption.detail).toBe("array[]");
      }
    });
  });

  describe("cheat sheet query patterns", () => {
    const patterns: { doc: string; expectedLabels: string[] }[] = [
      { doc: "*[dateT", expectedLabels: ["dateTime()"] },
      { doc: "coalesce", expectedLabels: ["coalesce()"] },
      { doc: "*[ref", expectedLabels: ["references()"] },
      { doc: "*[_type == \"movie\"] | sco", expectedLabels: ["score()"] },
      { doc: "*[_type == \"movie\"] | or", expectedLabels: ["order()"] },
      { doc: "*[sanit", expectedLabels: ["sanity::dataset()", "sanity::versionOf()", "sanity::partOfRelease()"] },
      { doc: "*[geo::dist", expectedLabels: ["geo::distance()"] },
      { doc: "*[geo::cont", expectedLabels: ["geo::contains()"] },
      { doc: "*[geo::inter", expectedLabels: ["geo::intersects()"] },
      { doc: "*[array::joi", expectedLabels: ["array::join()"] },
      { doc: "*[array::comp", expectedLabels: ["array::compact()"] },
      { doc: "*[array::uniq", expectedLabels: ["array::unique()"] },
      { doc: "*[array::inter", expectedLabels: ["array::intersects()"] },
      { doc: "*[user::attr", expectedLabels: ["user::attributes()"] },
      { doc: "*[string::start", expectedLabels: ["string::startsWith()"] },
      { doc: "*[text::seman", expectedLabels: ["text::semanticSimilarity()"] },
      { doc: "*[text::quer", expectedLabels: ["text::query()"] },
      { doc: "*[pt::tex", expectedLabels: ["pt::text()"] },
      { doc: "*[re", expectedLabels: ["references()"] },
      { doc: "rou", expectedLabels: ["round()"] },
      { doc: "upp", expectedLabels: ["upper()"] },
      { doc: "low", expectedLabels: ["lower()"] },
      { doc: "stri", expectedLabels: ["string()", "string::startsWith()"] },
      { doc: "*[_type == \"movie\"]{title, 'cast': castMembers[].person->num", expectedLabels: ["number()"] },
    ];

    for (const { doc, expectedLabels } of patterns) {
      it(`completes '${doc.slice(0, 40)}${doc.length > 40 ? "..." : ""}' with expected completions`, () => {
        const ctx = createContext(doc, doc.length);
        const result = groqCompletionSource(ctx);
        expect(result).toBeTruthy();
        if (result) {
          const labels = result.options.map((o) => o.label);
          for (const expected of expectedLabels) {
            expect(labels).toContain(expected);
          }
        }
      });
    }

    it("returns unconditional filter items when partial word matches no fields", () => {
      const ctx = createContext("*[_type == \"movie\" && popula", "*[_type == \"movie\" && popula".length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("@");
        expect(labels).toContain("^");
        expect(labels).toContain("!");
        expect(labels).toContain("*");
      }
    });

    it("returns filter completions for partial word after negation", () => {
      const ctx = createContext("*[_type == \"movie\" && !awar", "*[_type == \"movie\" && !awar".length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("@");
      }
    });

    it("returns filter completions inside star-bracket", () => {
      const ctx = createContext("*[", 2);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("defined()");
      }
    });

    it("returns pipeline stage completions after pipe", () => {
      const ctx = createContext("* | ", 4);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("order()");
      }
    });

    it("returns completions when typing partial word inside filter string with quotes", () => {
      const ctx = createContext("*[\"yolo\" in ta", "*[\"yolo\" in ta".length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("sanity::dataset()");
        expect(labels).toContain("string::startsWith()");
        expect(labels).toContain("geo::distance()");
        expect(labels).toContain("geo::contains()");
      }
    });

    it("returns pipeline stage completions at pipe position with explicit trigger", () => {
      const ctx = createContext("* | ", 4, true);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("order()");
      }
    });

    it("returns root completions for @ at start of query with explicit trigger", () => {
      const ctx = createContext("@", 1, true);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("@");
      }
    });
  });

  describe("single-quote type filter projection", () => {
    function setupWithMovieType() {
      const conn = makeConn("sq1");
      useConnectionStore.setState({ connections: [conn], activeId: "sq1" });
      useSchemaStore.getState().setTypes("sq1", [{
        name: "movie",
        title: "Movie",
        fields: [
          { name: "title", type: "string", isArray: false, isReference: false },
          { name: "releaseDate", type: "datetime", isArray: false, isReference: false },
        ],
      }]);
    }

    it("suggests fields with single-quoted _type filter", () => {
      setupWithMovieType();
      const ctx = createContext("*[_type == 'movie']{", "*[_type == 'movie']{".length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("_id");
        expect(labels).toContain("_type");
        expect(labels).toContain("title");
        expect(labels).toContain("releaseDate");
      }
    });

    it("suggests fields with single-quoted _type in filter", () => {
      setupWithMovieType();
      const ctx = createContext("*[_type in ['movie']]{", "*[_type in ['movie']]{".length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("title");
      }
    });

    it("suggests fields with mixed quotes", () => {
      setupWithMovieType();
      const ctx = createContext('*[_type == "movie"]{', '*[_type == "movie"]{'.length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("title");
      }
    });
  });

  describe("dot-notation field completions", () => {
    function setupWithMovieType() {
      const conn = makeConn("dot1");
      useConnectionStore.setState({ connections: [conn], activeId: "dot1" });
      useSchemaStore.getState().setTypes("dot1", [{
        name: "movie",
        title: "Movie",
        fields: [
          { name: "title", type: "string", isArray: false, isReference: false },
          { name: "releaseDate", type: "datetime", isArray: false, isReference: false },
        ],
      }]);
    }

    it("suggests fields matching partial input after bracket-dot", () => {
      setupWithMovieType();
      const ctx = createContext(
        '*[_type == "movie"][0].ti',
        '*[_type == "movie"][0].ti'.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("title");
        expect(labels).not.toContain("releaseDate");
      }
    });

    it("suggests fields after bracket-dot with range index", () => {
      setupWithMovieType();
      const ctx = createContext(
        '*[_type == "movie"][0..5].rel',
        '*[_type == "movie"][0..5].rel'.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("releaseDate");
      }
    });

    it("suggests all fields when cursor is right after dot", () => {
      setupWithMovieType();
      const ctx = createContext(
        '*[_type == "movie"][0].',
        '*[_type == "movie"][0].'.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("title");
        expect(labels).toContain("releaseDate");
        expect(labels).toContain("_id");
        expect(labels).toContain("_type");
      }
    });

  });

  describe("inline conditional completions", () => {
    function setupWithDualTypes() {
      const conn = makeConn("cond1");
      useConnectionStore.setState({ connections: [conn], activeId: "cond1" });
      useSchemaStore.getState().setTypes("cond1", [
        {
          name: "movie",
          title: "Movie",
          fields: [
            { name: "title", type: "string", isArray: false, isReference: false },
            { name: "releaseDate", type: "datetime", isArray: false, isReference: false },
          ],
        },
        {
          name: "person",
          title: "Person",
          fields: [
            { name: "name", type: "string", isArray: false, isReference: false },
            { name: "bio", type: "string", isArray: false, isReference: false },
          ],
        },
      ]);
    }

    it("suggests fields for inline conditional type inside projection", () => {
      setupWithDualTypes();
      const ctx = createContext(
        '*[_type == "movie"]{_type == "person" => {',
        '*[_type == "movie"]{_type == "person" => {'.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("name");
        expect(labels).toContain("bio");
        expect(labels).not.toContain("title");
      }
    });

    it("suggests fields for inline conditional with single quotes", () => {
      setupWithDualTypes();
      const ctx = createContext(
        "*[_type == 'movie']{_type == 'person' => {",
        "*[_type == 'movie']{_type == 'person' => {".length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("name");
        expect(labels).toContain("bio");
      }
    });

    it("falls back to outer type when no inline conditional matches", () => {
      setupWithDualTypes();
      const ctx = createContext(
        '*[_type == "person"]{_type == "movie" => {ti',
        '*[_type == "person"]{_type == "movie" => {ti'.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("title");
        expect(labels).not.toContain("name");
      }
    });
  });

  describe("namespace :: prefix matching", () => {
    it("suggests namespace functions when typing partial after ::", () => {
      const ctx = createContext("geo::dist", 8);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("geo::distance()");
      }
    });

    it("suggests array namespace functions with explicit trigger on ::", () => {
      const ctx = createContext("array::", 7, true);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("array::join()");
        expect(labels).toContain("array::compact()");
        expect(labels).toContain("array::unique()");
        expect(labels).toContain("array::intersects()");
      }
    });
  });

  describe("nested projection with dereference", () => {
    function setupWithReferencedTypes() {
      const conn = makeConn("nest1");
      useConnectionStore.setState({ connections: [conn], activeId: "nest1" });
      useSchemaStore.getState().setTypes("nest1", [
        {
          name: "movie",
          title: "Movie",
          fields: [
            { name: "title", type: "string", isArray: false, isReference: false },
            { name: "castMembers", type: "array", isArray: true, isReference: false },
          ],
        },
        {
          name: "person",
          title: "Person",
          fields: [
            { name: "name", type: "string", isArray: false, isReference: false },
            { name: "bio", type: "string", isArray: false, isReference: false },
          ],
        },
      ]);
      return conn;
    }

    function setupWithImageAsset() {
      const conn = makeConn("nest2");
      useConnectionStore.setState({ connections: [conn], activeId: "nest2" });
      useSchemaStore.getState().setTypes("nest2", [
        {
          name: "movie",
          title: "Movie",
          fields: [
            { name: "title", type: "string", isArray: false, isReference: false },
            {
              name: "poster",
              type: "object",
              isArray: false,
              isReference: false,
              fields: [
                {
                  name: "asset",
                  type: "image",
                  isArray: false,
                  isReference: true,
                },
                { name: "alt", type: "string", isArray: false, isReference: false },
              ],
            },
          ],
        },
        {
          name: "sanity.imageAsset",
          title: "Image Asset",
          fields: [
            { name: "path", type: "string", isArray: false, isReference: false },
            { name: "url", type: "string", isArray: false, isReference: false },
            { name: "extension", type: "string", isArray: false, isReference: false },
          ],
        },
      ]);
      return conn;
    }

    it("suggests fields for referenced type inside ->{}", () => {
      setupWithReferencedTypes();
      const ctx = createContext(
        '*[_type == "movie"]{castMembers[].person->{',
        '*[_type == "movie"]{castMembers[].person->{'.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("name");
        expect(labels).toContain("bio");
      }
    });

    it("suggests fields for outer type when not in deref", () => {
      setupWithReferencedTypes();
      const ctx = createContext(
        '*[_type == "movie"]{castMembers[].person->{name}, ',
        '*[_type == "movie"]{castMembers[].person->{name}, '.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("title");
        expect(labels).toContain("castMembers");
      }
    });

    it("suggests pipeline stage completions on explicit trigger after pipe", () => {
      const ctx = createContext("* | ", 4, true);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("order()");
        expect(labels).toContain("filter()");
        expect(labels).not.toContain("+");
        expect(labels).not.toContain("-");
      }
    });

    it("suggests sub-fields inside nested sub-object projection: poster{|}", () => {
      setupWithImageAsset();
      const ctx = createContext(
        '*[_type == "movie"]{poster{',
        '*[_type == "movie"]{poster{'.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("asset");
        expect(labels).toContain("alt");
        // Sub-object projection shows only the sub-object's own fields, not document-level fields
        expect(labels).not.toContain("_id");
        expect(labels).toContain("...");
      }
    });

    it("suggests sub-fields matching partial input inside sub-object: poster{a|}", () => {
      setupWithImageAsset();
      const ctx = createContext(
        '*[_type == "movie"]{poster{a',
        '*[_type == "movie"]{poster{a'.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("asset");
        expect(labels).toContain("alt");
        expect(labels).not.toContain("title");
      }
    });

    it("suggests referenced type fields after -> inside nested sub-object: poster{asset->|}", () => {
      setupWithImageAsset();
      const ctx = createContext(
        '*[_type == "movie"]{poster{asset->',
        '*[_type == "movie"]{poster{asset->'.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("path");
        expect(labels).toContain("url");
        expect(labels).toContain("extension");
        expect(labels).toContain("_id");
        expect(labels).toContain("_type");
      }
    });
  });

  describe("select context", () => {
    it("suggests condition => value pairs inside select()", () => {
      const ctx = createContext("select(", "select(".length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain(' => ""');
        expect(labels).toContain("==");
      }
    });

    it("suggests values after => in select()", () => {
      const ctx = createContext('select(popularity > 20 => , "', 28);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
    });
  });

  describe("param context", () => {
    it("suggests param names after $", () => {
      const ctx = createContext("*[$", 3);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("$start");
        expect(labels).toContain("$end");
      }
    });
  });

  describe("arithmetic context", () => {
    it("suggests arithmetic operators", () => {
      const ctx = createContext("1 + ", 4);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("+");
        expect(labels).toContain("-");
        expect(labels).toContain("*");
        expect(labels).toContain("/");
      }
    });
  });

  describe("geo function context", () => {
    it("suggests geo fields as first arg of geo::distance()", () => {
      const ctx = createContext("*[geo::distance(", 15);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("geoPoint");
        expect(labels).toContain("location");
      }
    });
  });

  describe("pt::text context", () => {
    it("suggests block field names inside pt::text()", () => {
      const ctx = createContext("pt::text(", 8);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("body");
        expect(labels).toContain("content");
      }
    });
  });

  describe("release versioning context", () => {
    it("suggests string placeholder inside sanity::versionOf()", () => {
      const ctx = createContext("sanity::versionOf(", 17);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain('"document-id"');
      }
    });
  });

  describe("join / subquery context", () => {
    it("suggests ^._id inside references() in subquery", () => {
      const ctx = createContext(
        '*[_type == "person"]{"movies": *[_type == "movie" && references(',
        '*[_type == "person"]{"movies": *[_type == "movie" && references('.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("^._id");
        expect(labels).toContain("references()");
      }
    });
  });

  describe("batch / root object context", () => {
    it("suggests key pattern in root object literal", () => {
      const ctx = createContext("{", 1);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain('"name": ');
        expect(labels).toContain("*");
      }
    });
  });

  describe("@ in [...] sub-filter", () => {
    it("suggests @ in/== completions after [@", () => {
      const ctx = createContext("*[_type == \"movie\"][@", "*[_type == \"movie\"][@".length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("@ in [");
      }
    });
  });

  describe("post-projection slice", () => {
    it("suggests range start after projection }[", () => {
      const ctx = createContext('*[_type == "movie"]{title}[', '*[_type == "movie"]{title}['.length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("0..");
        expect(labels).toContain("0...");
      }
    });
  });

  describe("collate locale context", () => {
    it("suggests locale strings after collate keyword in order()", () => {
      const ctx = createContext("* | order(title collate ", "* | order(title collate ".length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain('"en"');
        expect(labels).toContain('"de"');
      }
    });
  });

  describe("path() glob context", () => {
    it("suggests glob patterns inside path()", () => {
      const ctx = createContext("*[path(", "*[path(".length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain('"drafts.*"');
        expect(labels).toContain('"a.b.c.*"');
      }
    });
  });

  describe("concat-rhs context (array/object concatenation)", () => {
    it("suggests array literal after array +", () => {
      const ctx = createContext("[1,2] + ", "[1,2] + ".length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("[");
        expect(labels).toContain("{");
      }
    });

    it("suggests array literal after object +", () => {
      const ctx = createContext('{"a":1} + ', 10);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("[");
        expect(labels).toContain("{");
      }
    });
  });

  describe("-> deref inside projection", () => {
    function setupWithRefTypes() {
      const conn = makeConn("derefproj");
      useConnectionStore.setState({ connections: [conn], activeId: "derefproj" });
      useSchemaStore.getState().setTypes("derefproj", [
        {
          name: "movie",
          title: "Movie",
          fields: [
            { name: "title", type: "string", isArray: false, isReference: false },
            { name: "poster", type: "image", isArray: false, isReference: true },
          ],
        },
        {
          name: "image",
          title: "Image",
          fields: [
            { name: "url", type: "string", isArray: false, isReference: false },
            { name: "alt", type: "string", isArray: false, isReference: false },
          ],
        },
      ]);
    }

    it("suggests referenced type fields after -> inside projection", () => {
      setupWithRefTypes();
      const ctx = createContext(
        '*[_type == "movie"]{poster->',
        '*[_type == "movie"]{poster->'.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("url");
        expect(labels).toContain("alt");
        expect(labels).toContain("_id");
        expect(labels).toContain("_type");
      }
    });
  });

  describe("array-traversal context", () => {
    it("suggests continuations after array[] in projection", () => {
      const ctx = createContext(
        '*[_type == "movie"]{tags[]',
        '*[_type == "movie"]{tags[]'.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("->");
        expect(labels).toContain("{}");
        expect(labels).toContain(".");
      }
    });
  });

  describe("edge cases (should return null)", () => {
    it("returns null inside a comment", () => {
      const ctx = createContext("*[_type == \"movie\"] // this is a comment", "*[_type == \"movie\"] // this is a comment".length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeNull();
    });

    it("returns null for bare number literal", () => {
      const ctx = createContext("42", 2);
      const result = groqCompletionSource(ctx);
      expect(result).toBeNull();
    });

    it("returns null for bare dot without bracket", () => {
      const ctx = createContext("title.ti", "title.ti".length);
      const result = groqCompletionSource(ctx);
      expect(result).toBeNull();
    });
  });

  describe("^ scope access", () => {
    it("returns fields after ^.", () => {
      const ctx = createContext("^.", 2);
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("_id");
        expect(labels).toContain("_type");
      }
    });
  });

  describe("array[] projection field suggestions", () => {
    function setupWithRefArray() {
      const conn = makeConn("arrproj");
      useConnectionStore.setState({ connections: [conn], activeId: "arrproj" });
      useSchemaStore.getState().setTypes("arrproj", [
        {
          name: "movie",
          title: "Movie",
          fields: [
            { name: "title", type: "string", isArray: false, isReference: false },
            {
              name: "castMembers",
              type: "person",
              isArray: true,
              isReference: true,
            },
          ],
        },
        {
          name: "person",
          title: "Person",
          fields: [
            { name: "name", type: "string", isArray: false, isReference: false },
            { name: "bio", type: "string", isArray: false, isReference: false },
          ],
        },
      ]);
    }

    it("suggests array element fields after castMembers[]. with type filter (correct inference)", () => {
      setupWithRefArray();
      const ctx = createContext(
        '*[_type == "movie"]{"cast": castMembers[].',
        '*[_type == "movie"]{"cast": castMembers[].'.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("name");
        expect(labels).toContain("bio");
        expect(labels).toContain("_id");
      }
    });

    it("suggests array element fields after castMembers[]. with type filter no alias (correct inference)", () => {
      setupWithRefArray();
      const ctx = createContext(
        '*[_type == "movie"]{castMembers[].',
        '*[_type == "movie"]{castMembers[].'.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("name");
        expect(labels).toContain("bio");
      }
    });

    it("suggests array element fields after castMembers[]. with type filter and partial word", () => {
      setupWithRefArray();
      const ctx = createContext(
        '*[_type == "movie"]{castMembers[].na',
        '*[_type == "movie"]{castMembers[].na'.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("name");
        expect(labels).not.toContain("bio");
      }
    });

    it("suggests array element fields after castMembers[]. with no type filter and no alias", () => {
      setupWithRefArray();
      const ctx = createContext(
        '{castMembers[].',
        '{castMembers[].'.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("name");
        expect(labels).toContain("bio");
      }
    });

    it("suggests array element fields after castMembers[]. with no type filter but with alias", () => {
      setupWithRefArray();
      const ctx = createContext(
        '{"cast": castMembers[].',
        '{"cast": castMembers[].'.length,
      );
      const result = groqCompletionSource(ctx);
      expect(result).toBeTruthy();
      if (result) {
        const labels = result.options.map((o) => o.label);
        expect(labels).toContain("name");
        expect(labels).toContain("bio");
      }
    });
  });
});

describe("collectUnresolvedRefPaths", () => {
  it("returns empty array for fields with no refs", () => {
    const fields: SchemaField[] = [
      { name: "title", type: "string", isArray: false, isReference: false },
      { name: "score", type: "number", isArray: false, isReference: false },
    ];
    expect(collectUnresolvedRefPaths(fields)).toEqual([]);
  });

  it("collects top-level unresolved refs", () => {
    const fields: SchemaField[] = [
      { name: "title", type: "string", isArray: false, isReference: false },
      { name: "poster", type: "reference", isArray: false, isReference: true },
      { name: "actor", type: "reference", isArray: false, isReference: true },
    ];
    expect(collectUnresolvedRefPaths(fields)).toEqual(["poster", "actor"]);
  });

  it("skips resolved refs (type !== 'reference')", () => {
    const fields: SchemaField[] = [
      { name: "poster", type: "sanity.imageAsset", isArray: false, isReference: true },
    ];
    expect(collectUnresolvedRefPaths(fields)).toEqual([]);
  });

  it("collects nested unresolved refs inside object fields", () => {
    const fields: SchemaField[] = [
      {
        name: "metadata",
        type: "object",
        isArray: false,
        isReference: false,
        fields: [
          { name: "author", type: "reference", isArray: false, isReference: true },
        ],
      },
    ];
    expect(collectUnresolvedRefPaths(fields)).toEqual(["metadata.author"]);
  });

  it("collects array refs", () => {
    const fields: SchemaField[] = [
      { name: "castMembers", type: "reference", isArray: true, isReference: true },
    ];
    expect(collectUnresolvedRefPaths(fields)).toEqual(["castMembers"]);
  });

  it("collects multiple nested paths", () => {
    const fields: SchemaField[] = [
      { name: "poster", type: "reference", isArray: false, isReference: true },
      {
        name: "seo",
        type: "object",
        isArray: false,
        isReference: false,
        fields: [
          { name: "image", type: "reference", isArray: false, isReference: true },
          {
            name: "metadata",
            type: "object",
            isArray: false,
            isReference: false,
            fields: [
              { name: "author", type: "reference", isArray: false, isReference: true },
            ],
          },
        ],
      },
    ];
    expect(collectUnresolvedRefPaths(fields)).toEqual([
      "poster",
      "seo.image",
      "seo.metadata.author",
    ]);
  });
});
