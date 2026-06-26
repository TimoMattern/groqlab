import { describe, it, expect } from "vitest";
import { inferFields, extractInlineObjectTypes } from "./schema-inference";
import type { SchemaType } from "@/lib/sanity-types";

describe("inferFields", () => {
  it("preserves _type for inline objects", () => {
    const doc = {
      title: "Test",
      poster: {
        _type: "image",
        asset: { _ref: "image-abc-400x300", _type: "reference" },
        caption: "A poster",
      },
    };

    const fields = inferFields(doc);

    const poster = fields.find((f) => f.name === "poster");
    expect(poster).toBeDefined();
    expect(poster?.type).toBe("image");
    expect(poster?.isReference).toBe(false);
    expect(poster?.fields).toBeDefined();
    expect(poster?.fields).toHaveLength(2);
  });

  it("falls back to object when _type is missing", () => {
    const doc = {
      metadata: {
        key: "value",
      },
    };

    const fields = inferFields(doc);
    const metadata = fields.find((f) => f.name === "metadata");
    expect(metadata).toBeDefined();
    expect(metadata?.type).toBe("object");
    expect(metadata?.fields).toHaveLength(1);
  });

  it("detects references without resolving _ref prefix", () => {
    const doc = {
      author: { _ref: "author-abc123", _type: "reference" },
    };

    const fields = inferFields(doc);
    const author = fields.find((f) => f.name === "author");
    expect(author).toBeDefined();
    expect(author?.isReference).toBe(true);
    expect(author?.type).toBe("reference");
  });

  it("detects array references without resolving prefix", () => {
    const doc = {
      authors: [
        { _ref: "author-abc", _type: "reference" },
        { _ref: "author-def", _type: "reference" },
      ],
    };

    const fields = inferFields(doc);
    const authors = fields.find((f) => f.name === "authors");
    expect(authors).toBeDefined();
    expect(authors?.isReference).toBe(true);
    expect(authors?.isArray).toBe(true);
    expect(authors?.type).toBe("reference");
  });

  it("infers scalar types", () => {
    const doc = {
      title: "Hello",
      count: 42,
      score: 3.14,
      active: true,
      empty: null,
    };

    const fields = inferFields(doc);
    expect(fields.find((f) => f.name === "title")?.type).toBe("string");
    expect(fields.find((f) => f.name === "count")?.type).toBe("number");
    expect(fields.find((f) => f.name === "score")?.type).toBe("number");
    expect(fields.find((f) => f.name === "active")?.type).toBe("boolean");
    expect(fields.find((f) => f.name === "empty")?.type).toBe("unknown");
  });

  it("skips underscore-prefixed keys", () => {
    const doc = {
      _type: "movie",
      _id: "abc123",
      title: "Hello",
    };

    const fields = inferFields(doc);
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("title");
  });

  it("recursively infers nested objects", () => {
    const doc = {
      address: {
        street: "123 Main",
        city: "Portland",
        coordinates: {
          lat: 45.5,
          lng: -122.6,
        },
      },
    };

    const fields = inferFields(doc);
    const address = fields.find((f) => f.name === "address");
    expect(address).toBeDefined();
    expect(address?.fields).toBeDefined();

    const coordinates = address?.fields?.find((f) => f.name === "coordinates");
    expect(coordinates).toBeDefined();
    expect(coordinates?.fields).toBeDefined();
    expect(coordinates?.fields).toHaveLength(2);
  });
});

describe("extractInlineObjectTypes", () => {
  it("promotes inline objects with _type to standalone types", () => {
    const types: SchemaType[] = [
      {
        name: "movie",
        fields: [
          { name: "title", type: "string", isArray: false, isReference: false },
          {
            name: "poster",
            type: "image",
            isArray: false,
            isReference: false,
            fields: [
              { name: "asset", type: "reference", isArray: false, isReference: true },
              { name: "caption", type: "string", isArray: false, isReference: false },
            ],
          },
        ],
      },
    ];

    extractInlineObjectTypes(types);

    const imageType = types.find((t) => t.name === "image");
    expect(imageType).toBeDefined();
    expect(imageType?.kind).toBe("object");
    expect(imageType?.fields).toHaveLength(2);

    const assetField = imageType?.fields.find((f) => f.name === "asset");
    expect(assetField).toBeDefined();
    expect(assetField?.isReference).toBe(true);
  });

  it("promotes nameless inline objects using field name", () => {
    const types: SchemaType[] = [
      {
        name: "movie",
        fields: [
          { name: "title", type: "string", isArray: false, isReference: false },
          {
            name: "metadata",
            type: "object",
            isArray: false,
            isReference: false,
            fields: [
              { name: "rating", type: "number", isArray: false, isReference: false },
            ],
          },
        ],
      },
    ];

    extractInlineObjectTypes(types);

    const metaType = types.find((t) => t.name === "metadata");
    expect(metaType).toBeDefined();
    expect(metaType?.fields).toHaveLength(1);

    const movieType = types.find((t) => t.name === "movie");
    const metaField = movieType?.fields.find((f) => f.name === "metadata");
    expect(metaField?.type).toBe("metadata");
  });

  it("does not duplicate already-known types", () => {
    const types: SchemaType[] = [
      {
        name: "movie",
        fields: [
          {
            name: "poster",
            type: "image",
            isArray: false, isReference: false,
            fields: [
              { name: "asset", type: "reference", isArray: false, isReference: true },
            ],
          },
        ],
      },
      {
        name: "event",
        fields: [
          {
            name: "cover",
            type: "image",
            isArray: false, isReference: false,
            fields: [
              { name: "asset", type: "reference", isArray: false, isReference: true },
              { name: "caption", type: "string", isArray: false, isReference: false },
            ],
          },
        ],
      },
    ];

    extractInlineObjectTypes(types);

    const imageTypes = types.filter((t) => t.name === "image");
    expect(imageTypes).toHaveLength(1);
    expect(types).toHaveLength(3);
  });

  it("skips reference fields with inline data", () => {
    const types: SchemaType[] = [
      {
        name: "post",
        fields: [
          {
            name: "author",
            type: "reference",
            isArray: false,
            isReference: true,
            fields: [
              { name: "name", type: "string", isArray: false, isReference: false },
            ],
          },
        ],
      },
    ];

    extractInlineObjectTypes(types);

    const authorType = types.find((t) => t.name === "author");
    expect(authorType).toBeUndefined();
    expect(types).toHaveLength(1);
  });
});
