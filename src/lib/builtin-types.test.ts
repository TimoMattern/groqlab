import { describe, it, expect } from "vitest";
import { BUILT_IN_TYPES } from "./builtin-types";

describe("builtin-types", () => {
  it("has exactly 6 types", () => {
    expect(BUILT_IN_TYPES).toHaveLength(6);
  });

  it("all types have kind 'object'", () => {
    for (const t of BUILT_IN_TYPES) {
      expect(t.kind).toBe("object");
    }
  });

  it("slug has current and source string fields", () => {
    const slug = BUILT_IN_TYPES.find((t) => t.name === "slug");
    expect(slug).toBeDefined();
    expect(slug?.fields).toHaveLength(2);
    expect(slug?.fields[0]).toMatchObject({ name: "current", type: "string", isReference: false });
    expect(slug?.fields[1]).toMatchObject({ name: "source", type: "string", isReference: false });
  });

  it("geopoint has lat, lng, alt number fields", () => {
    const geo = BUILT_IN_TYPES.find((t) => t.name === "geopoint");
    expect(geo).toBeDefined();
    expect(geo?.fields).toHaveLength(3);
    for (const f of geo?.fields ?? []) {
      expect(f.type).toBe("number");
      expect(f.isReference).toBe(false);
    }
    expect(geo?.fields.map((f) => f.name)).toEqual(["lat", "lng", "alt"]);
  });

  it("image has asset ref, hotspot and crop objects", () => {
    const image = BUILT_IN_TYPES.find((t) => t.name === "image");
    expect(image).toBeDefined();
    expect(image?.fields).toHaveLength(3);

    const asset = image?.fields[0];
    expect(asset?.name).toBe("asset");
    expect(asset?.type).toBe("sanity.imageAsset");
    expect(asset?.isReference).toBe(true);

    const hotspot = image?.fields[1];
    expect(hotspot?.name).toBe("hotspot");
    expect(hotspot?.isReference).toBe(false);
    expect(hotspot?.fields).toBeDefined();
    expect(hotspot?.fields?.map((f) => f.name)).toEqual(["x", "y", "width", "height"]);

    const crop = image?.fields[2];
    expect(crop?.name).toBe("crop");
    expect(crop?.isReference).toBe(false);
    expect(crop?.fields).toBeDefined();
    expect(crop?.fields?.map((f) => f.name)).toEqual(["top", "bottom", "left", "right"]);
  });

  it("file has asset ref to sanity.fileAsset", () => {
    const file = BUILT_IN_TYPES.find((t) => t.name === "file");
    expect(file).toBeDefined();
    expect(file?.fields).toHaveLength(1);
    expect(file?.fields[0]).toMatchObject({ name: "asset", type: "sanity.fileAsset", isReference: true });
  });

  it("sanity.imageAsset has url, metadata (with nested dimensions), originalFilename", () => {
    const ia = BUILT_IN_TYPES.find((t) => t.name === "sanity.imageAsset");
    expect(ia).toBeDefined();
    expect(ia?.fields).toHaveLength(3);

    const url = ia?.fields[0];
    expect(url).toMatchObject({ name: "url", type: "string" });

    const meta = ia?.fields[1];
    expect(meta?.name).toBe("metadata");
    expect(meta?.fields).toBeDefined();
    const dims = meta?.fields?.find((f) => f.name === "dimensions");
    expect(dims).toBeDefined();
    expect(dims?.fields?.map((f) => f.name)).toEqual(["width", "height", "aspectRatio"]);

    const ogFn = ia?.fields[2];
    expect(ogFn).toMatchObject({ name: "originalFilename", type: "string" });
  });

  it("sanity.fileAsset has url, originalFilename, size", () => {
    const fa = BUILT_IN_TYPES.find((t) => t.name === "sanity.fileAsset");
    expect(fa).toBeDefined();
    expect(fa?.fields).toHaveLength(3);
    expect(fa?.fields.map((f) => f.name)).toEqual(["url", "originalFilename", "size"]);
    expect(fa?.fields[2]).toMatchObject({ name: "size", type: "number" });
  });
});
