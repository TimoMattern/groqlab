// @vitest-environment node
// Tests the headless-mode in-process logic: localStorage polyfill, store injection,
// autocomplete via groqCompletionSource, HeadlessDriver, and serialization.
// Runs in Node environment (no jsdom localStorage) to verify the polyfill works.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import type { SchemaType, SchemaField } from "@/lib/sanity-types";

function field(name: string, type: string): SchemaField {
  return { name, type, isArray: false, isReference: false };
}

// ─── Polyfill ─────────────────────────────────────────────────────────────────

function polyfillLocalStorage() {
  if (typeof globalThis.localStorage !== "undefined") return;
  class MockStorage {
    private store = new Map<string, string>();
    getItem(key: string): string | null { return this.store.get(key) ?? null; }
    setItem(key: string, value: string): void { this.store.set(key, value); }
    removeItem(key: string): void { this.store.delete(key); }
    clear(): void { this.store.clear(); }
    get length(): number { return this.store.size; }
    key(index: number): string | null { return [...this.store.keys()][index] ?? null; }
  }
  (globalThis as unknown as Record<string, unknown>).localStorage = new MockStorage();
}

describe("localStorage polyfill", () => {
  beforeAll(() => polyfillLocalStorage());

  it("is available after polyfill", () => {
    expect(globalThis.localStorage).toBeDefined();
  });

  it("supports getItem/setItem/removeItem", () => {
    localStorage.setItem("groqlab:test", "hello");
    expect(localStorage.getItem("groqlab:test")).toBe("hello");
    localStorage.removeItem("groqlab:test");
    expect(localStorage.getItem("groqlab:test")).toBeNull();
  });

  it("supports clear and length", () => {
    localStorage.setItem("a", "1");
    localStorage.setItem("b", "2");
    expect(localStorage.length).toBe(2);
    localStorage.clear();
    expect(localStorage.length).toBe(0);
  });

  it("allows importing connection-store without throwing", async () => {
    const mod = await import("@/stores/connection-store");
    expect(mod.useConnectionStore).toBeDefined();
    expect(mod.getActiveConnection).toBeDefined();
  });
});

// ─── Store injection + autocomplete ───────────────────────────────────────────

describe("store injection + autocomplete", () => {
  const connId = "headless-test-conn";

  beforeAll(async () => {
    polyfillLocalStorage();
    const connStore = await import("@/stores/connection-store");
    connStore.useConnectionStore.setState({
      connections: [{
        id: connId,
        projectId: "test-project",
        dataset: "test-dataset",
        token: "",
        name: "Test Connection",
        createdAt: new Date().toISOString(),
      }],
      activeId: connId,
    });
  });

  beforeEach(async () => {
    const schemaStore = await import("@/stores/schema-store");
    schemaStore.useSchemaStore.setState({
      types: {}, isLoading: {}, error: {},
    });
  });

  async function runCompletion(before: string) {
    const [mod, stateMod, autoMod] = await Promise.all([
      import("@/lib/groq/groq-autocomplete"),
      import("@codemirror/state"),
      import("@codemirror/autocomplete"),
    ]);
    const state = stateMod.EditorState.create({ doc: before });
    const ctx = new autoMod.CompletionContext(state, state.doc.length, false);
    return mod.groqCompletionSource(ctx);
  }

  async function injectTypes(types: SchemaType[]) {
    const schemaStore = await import("@/stores/schema-store");
    schemaStore.useSchemaStore.setState({ types: { [connId]: types } });
  }

  // Same as what the API route does before returning JSON.
  // Accept unknown[] for options to handle @codemirror/autocomplete's Completion type
  // which lacks an index signature.
  function serialize(result: { from: number; options: readonly unknown[] } | null) {
    if (!result) return { from: 0, options: [] as Record<string, unknown>[] };
    return {
      from: result.from,
      options: result.options.map((o) => {
        const opt = o as Record<string, unknown>;
        return {
          label: opt.label,
          type: opt.type,
          detail: opt.detail,
          ...(typeof opt.apply === "string" ? { apply: opt.apply } : {}),
          ...(typeof opt.boost === "number" ? { boost: opt.boost } : {}),
        };
      }),
    };
  }

  it("returns schema-free completions when no types injected", async () => {
    const result = await runCompletion("*[_type == \"");
    expect(result).not.toBeNull();
    if (!result) return;
    const hasTypeOptions = result.options.some((o) => o.type === "type");
    expect(hasTypeOptions).toBe(false);
  });

  it("returns type names in string-value context after injection", async () => {
    await injectTypes([
      { name: "movie", fields: [field("title", "string")] },
      { name: "person", fields: [field("name", "string")] },
    ]);

    const result = await runCompletion("*[_type == \"");
    expect(result).not.toBeNull();
    if (!result) return;
    const labels = result.options.map((o) => o.label);
    expect(labels).toContain('"movie"');
    expect(labels).toContain('"person"');
  });

  it("returns field names in projection context after injection", async () => {
    await injectTypes([
      {
        name: "movie",
        fields: [
          field("title", "string"),
          field("releaseDate", "datetime"),
        ],
      },
    ]);

    const result = await runCompletion("movie{");
    expect(result).not.toBeNull();
    if (!result) return;
    const labels = result.options.map((o) => o.label);
    expect(labels).toContain("title");
    expect(labels).toContain("releaseDate");
  });

  it("returns field names in filter context after injection", async () => {
    await injectTypes([
      {
        name: "movie",
        fields: [
          field("title", "string"),
          field("popularity", "number"),
        ],
      },
    ]);

    const result = await runCompletion("*[_type == \"movie\" && pop");
    expect(result).not.toBeNull();
    if (!result) return;
    const labels = result.options.map((o) => o.label);
    expect(labels).toContain("popularity");
  });

  it("returns completions at pipeline stage", async () => {
    const result = await runCompletion("* | ");
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.options.length).toBeGreaterThan(0);
    expect(result.options.some((o) => o.label === "order()")).toBe(true);
  });

  it("returns pipeline stage completions", async () => {
    const result = await runCompletion("*[_type == \"movie\"] | ");
    expect(result).not.toBeNull();
    if (!result) return;
    const labels = result.options.map((o) => o.label);
    expect(labels).toContain("order()");
    expect(labels).toContain("score()");
  });

  it("serialized output has only string-valued apply fields", async () => {
    const result = await runCompletion("*");
    expect(result).not.toBeNull();
    const serialized = serialize(result);
    for (const opt of serialized.options) {
      if (opt.apply !== undefined) {
        expect(typeof opt.apply).toBe("string");
      }
    }
  });

  it("serialized output preserves string apply for non-snippet completions", async () => {
    await injectTypes([
      {
        name: "movie",
        fields: [field("title", "string")],
      },
    ]);

    const result = await runCompletion("movie{");
    expect(result).not.toBeNull();
    const serialized = serialize(result);
    const titleOption = serialized.options.find((o) => o.label === "title");
    expect(titleOption).toBeDefined();
    if (titleOption) {
      expect(titleOption.apply).toBe("title");
    }
  });

  it("serialized output is JSON-serializable", async () => {
    const result = await runCompletion("* | ");
    expect(result).not.toBeNull();
    const serialized = serialize(result);
    const json = JSON.parse(JSON.stringify(serialized));
    expect(json.from).toBeTypeOf("number");
    expect(Array.isArray(json.options)).toBe(true);
    expect(json.options.length).toBeGreaterThan(0);
    expect(json.options[0].label).toBeTypeOf("string");
  });

  it("returns null for empty doc without explicit trigger", async () => {
    const result = await runCompletion("");
    expect(result).toBeNull();
  });

  it("returns from position matching cursor offset", async () => {
    const result = await runCompletion("coun");
    expect(result).not.toBeNull();
    if (!result) return;
    expect(typeof result.from).toBe("number");
    const wordLabels = result.options.filter((o) => o.label.startsWith("count"));
    if (wordLabels.length > 0) {
      expect(result.from).toBeLessThanOrEqual(4);
    }
  });

  it("returns completions for partial function name", async () => {
    const result = await runCompletion("coun");
    expect(result).not.toBeNull();
    if (!result) return;
    const labels = result.options.map((o) => o.label);
    expect(labels).toContain("count()");
  });
});

// ─── HeadlessDriver ───────────────────────────────────────────────────────────

describe("HeadlessDriver", () => {
  let originalFetch: typeof globalThis.fetch | undefined;

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch;
  });

  async function getDriver() {
    polyfillLocalStorage();
    const { HeadlessDriver } = await import("./headless-driver");
    return new HeadlessDriver({ baseUrl: "http://localhost:3000" });
  }

  it("constructs with default baseUrl", async () => {
    polyfillLocalStorage();
    const { HeadlessDriver } = await import("./headless-driver");
    const driver = new HeadlessDriver();
    expect(driver).toBeDefined();
  });

  it("constructs with custom baseUrl", async () => {
    polyfillLocalStorage();
    const { HeadlessDriver } = await import("./headless-driver");
    const driver = new HeadlessDriver({ baseUrl: "http://localhost:9090" });
    expect(driver).toBeDefined();
  });

  it("executeCommand throws on HTTP error", async () => {
    const driver = await getDriver();
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "bad request" }), { status: 400 });

    await expect(driver.executeCommand("unknown.cmd", {}))
      .rejects.toThrow("bad request");
  });

  it("executeCommand returns data on success", async () => {
    const driver = await getDriver();
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ data: { result: "ok" }, commandId: "123", durationMs: 5 }),
        { status: 200 },
      );

    const response = await driver.executeCommand("query.execute", { query: "*" });
    expect(response.data).toEqual({ result: "ok" });
    expect(response.commandId).toBe("123");
  });

  it("query returns data field", async () => {
    const driver = await getDriver();
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ data: [{ _id: "1" }], commandId: "x", durationMs: 5 }),
        { status: 200 },
      );

    const result = await driver.query("*[_type == \"movie\"]", {
      projectId: "p", dataset: "d",
    });
    expect(result).toEqual([{ _id: "1" }]);
  });

  it("testConnection returns success", async () => {
    const driver = await getDriver();
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ data: { success: true, projectName: "p/d" }, commandId: "x", durationMs: 5 }),
        { status: 200 },
      );

    const result = await driver.testConnection("p", "d");
    expect(result.success).toBe(true);
  });

  it("testConnection returns error", async () => {
    const driver = await getDriver();
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ data: { success: false, error: "timeout" }, commandId: "x", durationMs: 5 }),
        { status: 200 },
      );

    const result = await driver.testConnection("p", "d");
    expect(result.success).toBe(false);
    expect(result.error).toBe("timeout");
  });

  it("autocomplete returns completion result", async () => {
    const driver = await getDriver();
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          data: { from: 0, options: [{ label: "count()", type: "function", detail: "Count results" }] },
          commandId: "x", durationMs: 5,
        }),
        { status: 200 },
      );

    const result = await driver.autocomplete("coun");
    expect(result.from).toBe(0);
    expect(result.options[0].label).toBe("count()");
  });
});

// ─── Config file ──────────────────────────────────────────────────────────────

describe("headless-config", () => {
  let tmpDir: string;
  let fsModule: typeof import("fs");
  let pathModule: typeof import("path");

  beforeEach(async () => {
    fsModule = await import("fs");
    pathModule = await import("path");
    tmpDir = fsModule.mkdtempSync("/tmp/groqlab-config-test-");
  });

  afterEach(() => {
    fsModule.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(data: Record<string, string>, name = "groqlab.json") {
    fsModule.writeFileSync(
      pathModule.join(tmpDir, name),
      JSON.stringify(data),
      "utf-8",
    );
  }

  function setupEnv(env: Record<string, string>) {
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
  }

  function clearEnv(keys: string[]) {
    for (const k of keys) Reflect.deleteProperty(process.env, k);
  }

  async function loadConfigModule() {
    return import("./headless-config");
  }

  it("returns empty config when no file, env, or flags", async () => {
    const { loadConfig } = await loadConfigModule();
    const config = loadConfig({}, tmpDir);
    expect(config).toEqual({});
  });

  it("loads from groqlab.json in cwd", async () => {
    writeConfig({ projectId: "p123", dataset: "prod" });
    const { loadConfig } = await loadConfigModule();
    const config = loadConfig({}, tmpDir);
    expect(config.projectId).toBe("p123");
    expect(config.dataset).toBe("prod");
  });

  it("loads from .groqlabrc (key-value format)", async () => {
    fsModule.writeFileSync(
      pathModule.join(tmpDir, ".groqlabrc"),
      "projectId: p456\ndataset: stage\n",
      "utf-8",
    );
    const { loadConfig } = await loadConfigModule();
    const config = loadConfig({}, tmpDir);
    expect(config.projectId).toBe("p456");
    expect(config.dataset).toBe("stage");
  });

  it("walks up to parent directory", async () => {
    writeConfig({ projectId: "parent-proj", dataset: "parent-ds" });
    const nested = pathModule.join(tmpDir, "a", "b", "c");
    fsModule.mkdirSync(nested, { recursive: true });
    const { loadConfig } = await loadConfigModule();
    const config = loadConfig({}, nested);
    expect(config.projectId).toBe("parent-proj");
  });

  it("env vars override file config", async () => {
    writeConfig({ projectId: "from-file", dataset: "ds-file" });
    setupEnv({ GROQLAB_PROJECT: "from-env" });
    const { loadConfig } = await loadConfigModule();
    const config = loadConfig({}, tmpDir);
    expect(config.projectId).toBe("from-env");
    expect(config.dataset).toBe("ds-file");
    clearEnv(["GROQLAB_PROJECT"]);
  });

  it("CLI flags override env vars", async () => {
    setupEnv({ GROQLAB_PROJECT: "from-env", GROQLAB_DATASET: "ds-env" });
    const { loadConfig } = await loadConfigModule();
    const config = loadConfig({ project: "from-flag" }, tmpDir);
    expect(config.projectId).toBe("from-flag");
    expect(config.dataset).toBe("ds-env");
    clearEnv(["GROQLAB_PROJECT", "GROQLAB_DATASET"]);
  });

  it("parses key aliases like projectid, project_id, project-id", async () => {
    for (const key of ["projectid", "project_id", "project-id"]) {
      const dir = fsModule.mkdtempSync("/tmp/groqlab-alias-test-");
      fsModule.writeFileSync(pathModule.join(dir, ".groqlabrc"), `${key}: my-proj\ndataset: ds\n`, "utf-8");
      const { loadConfig } = await loadConfigModule();
      const config = loadConfig({}, dir);
      expect(config.projectId).toBe("my-proj");
      fsModule.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("parses the user's actual .groqlabrc format", async () => {
    fsModule.writeFileSync(
      pathModule.join(tmpDir, ".groqlabrc"),
      "token: sk-secret\nprojectid: e5kh449y\ndataset: production\n",
      "utf-8",
    );
    const { loadConfig } = await loadConfigModule();
    const config = loadConfig({}, tmpDir);
    expect(config.projectId).toBe("e5kh449y");
    expect(config.dataset).toBe("production");
    expect(config.token).toBe("sk-secret");
  });

  it("ignores comments and blank lines in .groqlabrc", async () => {
    fsModule.writeFileSync(
      pathModule.join(tmpDir, ".groqlabrc"),
      "# this is a comment\n\nprojectId: p\ndataset: d\n",
      "utf-8",
    );
    const { loadConfig } = await loadConfigModule();
    const config = loadConfig({}, tmpDir);
    expect(config.projectId).toBe("p");
    expect(config.dataset).toBe("d");
  });

  it("requireConnection exits when missing project/dataset", async () => {
    const { loadConfig, requireConnection } = await loadConfigModule();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit"); });
    const config = loadConfig({}, tmpDir);
    expect(() => requireConnection(config)).toThrow("exit");
    exitSpy.mockRestore();
  });

  it("requireConnection returns connection when present", async () => {
    writeConfig({ projectId: "p", dataset: "d", token: "t" });
    const { loadConfig, requireConnection } = await loadConfigModule();
    const config = loadConfig({}, tmpDir);
    const conn = requireConnection(config);
    expect(conn).toEqual({ projectId: "p", dataset: "d", token: "t" });
  });
});

// ─── Test utils ───────────────────────────────────────────────────────────────

describe("createTestDriver", () => {
  it("creates a HeadlessDriver with default baseUrl", async () => {
    polyfillLocalStorage();
    const { createTestDriver } = await import("./headless-test-utils");
    const { HeadlessDriver } = await import("./headless-driver");
    const driver = createTestDriver();
    expect(driver).toBeInstanceOf(HeadlessDriver);
  });

  it("creates a HeadlessDriver with custom baseUrl", async () => {
    polyfillLocalStorage();
    const { createTestDriver } = await import("./headless-test-utils");
    const driver = createTestDriver("http://localhost:9090");
    expect(driver).toBeDefined();
  });
});
