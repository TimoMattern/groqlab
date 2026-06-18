import { describe, it, expect, beforeEach } from "vitest";
import { useSchemaStore } from "./schema-store";
import type { SchemaType } from "@/lib/sanity-types";

function mockType(name: string): SchemaType {
  return { name, title: name, fields: [] };
}

beforeEach(() => {
  useSchemaStore.setState({ types: {}, isLoading: {}, error: {} });
});

describe("schema-store", () => {
  it("starts empty", () => {
    const { types, isLoading, error } = useSchemaStore.getState();
    expect(types).toEqual({});
    expect(isLoading).toEqual({});
    expect(error).toEqual({});
  });

  it("setTypes stores types per connection", () => {
    const t = [mockType("post")];
    useSchemaStore.getState().setTypes("conn-1", t);
    expect(useSchemaStore.getState().types["conn-1"]).toHaveLength(1);
    expect(useSchemaStore.getState().types["conn-1"][0].name).toBe("post");
  });

  it("setTypes replaces types for same connection", () => {
    useSchemaStore.getState().setTypes("conn-1", [mockType("post")]);
    useSchemaStore.getState().setTypes("conn-1", [mockType("page")]);
    expect(useSchemaStore.getState().types["conn-1"]).toHaveLength(1);
    expect(useSchemaStore.getState().types["conn-1"][0].name).toBe("page");
  });

  it("setLoading tracks loading per connection", () => {
    useSchemaStore.getState().setLoading("conn-1", true);
    expect(useSchemaStore.getState().isLoading["conn-1"]).toBe(true);
    useSchemaStore.getState().setLoading("conn-1", false);
    expect(useSchemaStore.getState().isLoading["conn-1"]).toBe(false);
  });

  it("setError tracks errors per connection", () => {
    useSchemaStore.getState().setError("conn-1", "Network error");
    expect(useSchemaStore.getState().error["conn-1"]).toBe("Network error");
    useSchemaStore.getState().setError("conn-1", null);
    expect(useSchemaStore.getState().error["conn-1"]).toBeNull();
  });

  it("getTypes returns empty array for unknown connection", () => {
    expect(useSchemaStore.getState().getTypes("unknown")).toEqual([]);
  });

  it("getTypes returns stored types", () => {
    useSchemaStore.getState().setTypes("conn-1", [mockType("post")]);
    expect(useSchemaStore.getState().getTypes("conn-1")).toHaveLength(1);
  });

  it("getIsLoading returns false for unknown connection", () => {
    expect(useSchemaStore.getState().getIsLoading("unknown")).toBe(false);
  });

  it("getError returns null for unknown connection", () => {
    expect(useSchemaStore.getState().getError("unknown")).toBeNull();
  });

  it("clear removes data for a specific connection only", () => {
    useSchemaStore.getState().setTypes("conn-1", [mockType("post")]);
    useSchemaStore.getState().setTypes("conn-2", [mockType("author")]);
    useSchemaStore.getState().setLoading("conn-1", true);
    useSchemaStore.getState().setError("conn-1", "err");

    useSchemaStore.getState().clear("conn-1");

    expect(useSchemaStore.getState().getTypes("conn-1")).toEqual([]);
    expect(useSchemaStore.getState().getTypes("conn-2")).toHaveLength(1);
    expect(useSchemaStore.getState().getIsLoading("conn-1")).toBe(false);
    expect(useSchemaStore.getState().getError("conn-1")).toBeNull();
  });
});
