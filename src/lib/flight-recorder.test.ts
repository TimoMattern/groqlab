import { describe, it, expect, beforeEach, vi } from "vitest";
import { FlightRecorder } from "./flight-recorder";
import type { FlightEvent, AutocompleteEvent } from "./flight-recorder";
import { useConnectionStore } from "@/stores/connection-store";
import { useSchemaStore } from "@/stores/schema-store";
import { useResultStore } from "@/stores/result-store";
import { useHistoryStore } from "@/stores/history-store";
import type { SchemaType } from "@/lib/sanity-types";

beforeEach(() => {
  const fr = FlightRecorder.instance as unknown as {
    _enabled: boolean;
    timerId: ReturnType<typeof setInterval> | null;
    record: { events: FlightEvent[] };
    startTs: number;
  };
  fr._enabled = false;
  if (fr.timerId !== null) {
    clearInterval(fr.timerId);
    fr.timerId = null;
  }
  fr.record.events = [];
  fr.startTs = 0;

  // reset stores
  useConnectionStore.setState({
    connections: [],
    activeId: null,
    statuses: {},
  });
  useSchemaStore.setState({ types: {}, isLoading: {}, error: {} });
  useResultStore.setState({ data: null, durationMs: null, documentCount: null, error: null, isLoading: false });
  useHistoryStore.setState({ entries: [] });
});

describe("FlightRecorder", () => {
  describe("singleton", () => {
    it("provides a single instance", () => {
      expect(FlightRecorder.instance).toBeDefined();
      expect(FlightRecorder.instance).toBe(FlightRecorder.instance);
    });
  });

  describe("start / stop / clear", () => {
    it("is disabled by default", () => {
      expect(FlightRecorder.instance.isEnabled()).toBe(false);
    });

    it("start enables recording", () => {
      FlightRecorder.instance.start();
      expect(FlightRecorder.instance.isEnabled()).toBe(true);
    });

    it("start creates initial snapshot", () => {
      FlightRecorder.instance.start();
      const exported = FlightRecorder.instance.export();
      expect(exported.events.length).toBe(1);
      expect(exported.events[0].type).toBe("store-snapshot");
    });

    it("stop disables recording", () => {
      FlightRecorder.instance.start();
      FlightRecorder.instance.stop();
      expect(FlightRecorder.instance.isEnabled()).toBe(false);
    });

    it("stop adds a final snapshot", () => {
      FlightRecorder.instance.start();
      FlightRecorder.instance.stop();
      const exported = FlightRecorder.instance.export();
      const lastEvent = exported.events[exported.events.length - 1];
      expect(lastEvent.type).toBe("store-snapshot");
      expect((lastEvent as { trigger: string }).trigger).toBe("stop");
    });

    it("clear resets events", () => {
      FlightRecorder.instance.start();
      FlightRecorder.instance.stop();
      FlightRecorder.instance.clear();
      expect(FlightRecorder.instance.export().events).toHaveLength(0);
    });

    it("start with interval sets up periodic snapshots", () => {
      vi.useFakeTimers();
      FlightRecorder.instance.start(100);
      const initialCount = FlightRecorder.instance.export().events.length;
      vi.advanceTimersByTime(250);
      expect(FlightRecorder.instance.export().events.length).toBeGreaterThan(initialCount);
      FlightRecorder.instance.stop();
      vi.useRealTimers();
    });

    it("start does nothing if already enabled", () => {
      FlightRecorder.instance.start();
      FlightRecorder.instance.start(50);
      const events = FlightRecorder.instance.export().events;
      // only the first start's initial snapshot should be present
      expect(events.length).toBe(1);
    });

    it("stop does nothing if not enabled", () => {
      FlightRecorder.instance.stop();
      expect(FlightRecorder.instance.export().events).toHaveLength(0);
    });
  });

  describe("recording events", () => {
    it("records store snapshots only when enabled", () => {
      FlightRecorder.instance.recordSnapshot("test");
      expect(FlightRecorder.instance.export().events).toHaveLength(0);

      FlightRecorder.instance.start();
      FlightRecorder.instance.recordSnapshot("test");
      expect(FlightRecorder.instance.export().events.length).toBeGreaterThanOrEqual(2);
      const snapshotEvents = FlightRecorder.instance
        .export()
        .events.filter((e) => e.type === "store-snapshot" && (e as { trigger: string }).trigger === "test");
      expect(snapshotEvents.length).toBe(1);
    });

    it("stores full (un-summarized) schema types in snapshots", () => {
      FlightRecorder.instance.start();
      FlightRecorder.instance.recordSnapshot("test");
      const snapshot = FlightRecorder.instance
        .export()
        .events.find((e) => e.type === "store-snapshot" && (e as { trigger: string }).trigger === "test") as
        | { stores: { schemaStore: { fullTypes: unknown; types: unknown } } }
        | undefined;
      expect(snapshot).toBeDefined();
      if (!snapshot) return;
      expect(snapshot.stores.schemaStore).toBeDefined();
      expect(snapshot.stores.schemaStore.fullTypes).toBeDefined();
      const fullTypes = snapshot.stores.schemaStore.fullTypes as Record<string, unknown[]>;
      if (Object.keys(fullTypes).length > 0) {
        const firstEntry = Object.values(fullTypes)[0]?.[0] as Record<string, unknown> | undefined;
        if (firstEntry && "fields" in firstEntry) {
          const fields = firstEntry.fields as Record<string, unknown>[];
          if (fields.length > 0) {
            const field = fields[0];
            expect(typeof field.type).toBe("string");
          }
        }
      }
    });

    it("records user events", () => {
      FlightRecorder.instance.start();
      FlightRecorder.instance.recordUser("keystroke", "a");
      FlightRecorder.instance.recordUser("click", "#run-btn");
      const userEvts = FlightRecorder.instance
        .export()
        .events.filter((e) => e.type === "user") as { kind: string; payload: string }[];
      expect(userEvts).toHaveLength(2);
      expect(userEvts[0].kind).toBe("keystroke");
      expect(userEvts[0].payload).toBe("a");
      expect(userEvts[1].kind).toBe("click");
      expect(userEvts[1].payload).toBe("#run-btn");
    });

    it("records api-call events", () => {
      FlightRecorder.instance.start();
      FlightRecorder.instance.recordApiCall("/api/query", "POST", { q: "test" }, 200, { data: [] }, 42);
      const apiEvts = FlightRecorder.instance
        .export()
        .events.filter((e) => e.type === "api-call") as {
        endpoint: string; method: string; statusCode: number; durationMs: number;
      }[];
      expect(apiEvts).toHaveLength(1);
      expect(apiEvts[0].endpoint).toBe("/api/query");
      expect(apiEvts[0].method).toBe("POST");
      expect(apiEvts[0].statusCode).toBe(200);
      expect(apiEvts[0].durationMs).toBe(42);
    });

    it("records action events", () => {
      FlightRecorder.instance.start();
      FlightRecorder.instance.recordAction("schemaStore", "resolveRef", ["post", "author"], { resolved: true }, 5);
      const actionEvts = FlightRecorder.instance
        .export()
        .events.filter((e) => e.type === "action") as {
        store: string; action: string; args: unknown[]; durationMs: number;
      }[];
      expect(actionEvts).toHaveLength(1);
      expect(actionEvts[0].store).toBe("schemaStore");
      expect(actionEvts[0].action).toBe("resolveRef");
      expect(actionEvts[0].args).toEqual(["post", "author"]);
    });

    it("records autocomplete events", () => {
      FlightRecorder.instance.start();
      FlightRecorder.instance.recordAutocomplete({
        before: "*[_type == ",
        query: "post",
        context: { kind: "filter", before: "_type == " },
        fieldTypesBefore: { title: "string" },
        fieldTypesAfter: { title: "string" },
        options: [{ label: "post", detail: "document" }],
        resolvesTriggered: [],
      });
      const acEvts = FlightRecorder.instance
        .export()
        .events.filter((e) => e.type === "autocomplete") as AutocompleteEvent[];
      expect(acEvts).toHaveLength(1);
      expect(acEvts[0].before).toBe("*[_type == ");
      expect(acEvts[0].query).toBe("post");
      expect(acEvts[0].options).toHaveLength(1);
    });

    it("records input events (keystrokes)", () => {
      FlightRecorder.instance.start();
      FlightRecorder.instance.recordInput("*[_type == \"m", 13, "input.type");
      FlightRecorder.instance.recordInput("*[_type == \"movie\"]", 19, "input.type");

      const inputEvts = FlightRecorder.instance
        .export()
        .events.filter((e) => e.type === "input") as {
        text: string; cursor: number; origin: string;
      }[];
      expect(inputEvts).toHaveLength(2);
      expect(inputEvts[0].text).toBe('*[_type == "m');
      expect(inputEvts[0].cursor).toBe(13);
      expect(inputEvts[0].origin).toBe("input.type");
      expect(inputEvts[1].text).toBe("*[_type == \"movie\"]");
      expect(inputEvts[1].cursor).toBe(19);
    });
  });

  describe("export", () => {
    it("returns a deep copy", () => {
      FlightRecorder.instance.start();
      const exp1 = FlightRecorder.instance.export();
      const exp2 = FlightRecorder.instance.export();
      expect(exp1).toEqual(exp2);
      // mutations on exported copy don't affect internal state
      exp1.events.pop();
      expect(FlightRecorder.instance.export().events.length).not.toBe(exp1.events.length);
    });

    it("includes meta", () => {
      FlightRecorder.instance.start();
      const rec = FlightRecorder.instance.export();
      expect(rec.meta.version).toBe(1);
      expect(rec.meta.startedAt).toBeDefined();
    });
  });

  describe("executeCommand", () => {
    it("handles recording.start and recording.stop", async () => {
      const r1 = await FlightRecorder.instance.executeCommand({
        id: "1", command: "recording.start", args: {}, timestamp: 0,
      });
      expect(r1).toBe(true);
      expect(FlightRecorder.instance.isEnabled()).toBe(true);

      const r2 = await FlightRecorder.instance.executeCommand({
        id: "2", command: "recording.stop", args: {}, timestamp: 0,
      });
      expect(r2).toBe(true);
      expect(FlightRecorder.instance.isEnabled()).toBe(false);
    });

    it("handles recording.export", async () => {
      FlightRecorder.instance.start();
      const exported = await FlightRecorder.instance.executeCommand({
        id: "3", command: "recording.export", args: {}, timestamp: 0,
      }) as { events: FlightEvent[] };
      expect(exported.events.length).toBeGreaterThanOrEqual(1);
    });

    it("handles recording.clear", async () => {
      FlightRecorder.instance.start();
      await FlightRecorder.instance.executeCommand({
        id: "4", command: "recording.clear", args: {}, timestamp: 0,
      });
      expect(FlightRecorder.instance.export().events).toHaveLength(0);
    });

    it("handles store.get for known store", async () => {
      useConnectionStore.setState({ activeId: "c1", connections: [{ id: "c1", name: "Test", projectId: "p1", dataset: "d1", token: "t1", createdAt: "2024-01-01" }] });
      const state = await FlightRecorder.instance.executeCommand({
        id: "5", command: "store.get", args: { store: "connection" }, timestamp: 0,
      }) as { activeId: string };
      expect(state.activeId).toBe("c1");
    });

    it("handles store.get with path", async () => {
      useConnectionStore.setState({ activeId: "c1" });
      const activeId = await FlightRecorder.instance.executeCommand({
        id: "6", command: "store.get", args: { store: "connection", path: "activeId" }, timestamp: 0,
      });
      expect(activeId).toBe("c1");
    });

    it("rejects store.get for unknown store", async () => {
      await expect(
        FlightRecorder.instance.executeCommand({
          id: "7", command: "store.get", args: { store: "bogus" }, timestamp: 0,
        }),
      ).rejects.toThrow("Unknown store");
    });

    it("rejects store.set as not implemented", async () => {
      await expect(
        FlightRecorder.instance.executeCommand({
          id: "8", command: "store.set", args: { store: "connection", path: "activeId", value: "c2" }, timestamp: 0,
        }),
      ).rejects.toThrow("not implemented");
    });

    it("handles autocomplete.detectContext", async () => {
      const result = await FlightRecorder.instance.executeCommand({
        id: "9", command: "autocomplete.detectContext", args: { before: "*[_type == " }, timestamp: 0,
      }) as { kind: string };
      expect(result.kind).toBe("filter");
    });

    it("rejects unknown command", async () => {
      await expect(
        FlightRecorder.instance.executeCommand({
          id: "10", command: "nonsense", args: {}, timestamp: 0,
        }),
      ).rejects.toThrow("Unknown command");
    });
  });

  describe("size limits", () => {
    it("stops recording when max events reached", { timeout: 15000 }, () => {
      FlightRecorder.instance.start();
      const fr = FlightRecorder.instance as unknown as {
        _enabled: boolean;
        pushEvent: (e: FlightEvent) => void;
      };
      // pushEvent checks _enabled at start — fill to just under limit
      for (let i = 0; i < 9999; i++) {
        fr.pushEvent({
          type: "user",
          ts: i,
          kind: "keystroke",
          payload: "",
        });
      }
      expect(fr._enabled).toBe(true);
      // one more should trigger stop
      fr.pushEvent({
        type: "user",
        ts: 9999,
        kind: "keystroke",
        payload: "",
      });
      expect(fr._enabled).toBe(false);
      expect(FlightRecorder.instance.export().events.length).toBeLessThanOrEqual(10000);
    });
  });

  describe("snapshot content", () => {
    it("includes summary fields", () => {
      const types: SchemaType[] = [
        { name: "post", title: "Post", fields: [
          { name: "title", type: "string", isReference: false, isArray: false },
          { name: "author", type: "reference", isReference: true, isArray: false },
        ]},
      ];
      useSchemaStore.getState().setTypes("conn-1", types);
      FlightRecorder.instance.start();
      const snapshots = FlightRecorder.instance
        .export()
        .events.filter((e) => e.type === "store-snapshot") as { summary: {
          totalTypes: number; totalFields: number; unresolvedRefs: number;
          connectionCount: number; activeConnectionId: string | null;
        } }[];
      expect(snapshots.length).toBeGreaterThanOrEqual(1);
      const s = snapshots[0].summary;
      expect(s.totalTypes).toBe(1);
      expect(s.totalFields).toBe(2);
      expect(s.unresolvedRefs).toBe(1);
      expect(s.connectionCount).toBe(0);
    });
  });
});
