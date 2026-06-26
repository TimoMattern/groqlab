import type { SchemaType } from "@/lib/sanity-types";

export const BUILT_IN_TYPES: SchemaType[] = [
  {
    name: "slug",
    kind: "object",
    fields: [
      { name: "current", type: "string", isArray: false, isReference: false },
      { name: "source", type: "string", isArray: false, isReference: false },
    ],
  },
  {
    name: "geopoint",
    kind: "object",
    fields: [
      { name: "lat", type: "number", isArray: false, isReference: false },
      { name: "lng", type: "number", isArray: false, isReference: false },
      { name: "alt", type: "number", isArray: false, isReference: false },
    ],
  },
  {
    name: "image",
    kind: "object",
    fields: [
      {
        name: "asset",
        type: "sanity.imageAsset",
        isArray: false,
        isReference: true,
      },
      {
        name: "hotspot",
        type: "object",
        isArray: false,
        isReference: false,
        fields: [
          { name: "x", type: "number", isArray: false, isReference: false },
          { name: "y", type: "number", isArray: false, isReference: false },
          { name: "width", type: "number", isArray: false, isReference: false },
          { name: "height", type: "number", isArray: false, isReference: false },
        ],
      },
      {
        name: "crop",
        type: "object",
        isArray: false,
        isReference: false,
        fields: [
          { name: "top", type: "number", isArray: false, isReference: false },
          { name: "bottom", type: "number", isArray: false, isReference: false },
          { name: "left", type: "number", isArray: false, isReference: false },
          { name: "right", type: "number", isArray: false, isReference: false },
        ],
      },
    ],
  },
  {
    name: "file",
    kind: "object",
    fields: [
      {
        name: "asset",
        type: "sanity.fileAsset",
        isArray: false,
        isReference: true,
      },
    ],
  },
  {
    name: "sanity.imageAsset",
    kind: "object",
    fields: [
      { name: "url", type: "string", isArray: false, isReference: false },
      {
        name: "metadata",
        type: "object",
        isArray: false,
        isReference: false,
        fields: [
          {
            name: "dimensions",
            type: "object",
            isArray: false,
            isReference: false,
            fields: [
              { name: "width", type: "number", isArray: false, isReference: false },
              { name: "height", type: "number", isArray: false, isReference: false },
              { name: "aspectRatio", type: "number", isArray: false, isReference: false },
            ],
          },
          { name: "lqip", type: "string", isArray: false, isReference: false },
          { name: "blurHash", type: "string", isArray: false, isReference: false },
        ],
      },
      { name: "originalFilename", type: "string", isArray: false, isReference: false },
    ],
  },
  {
    name: "sanity.fileAsset",
    kind: "object",
    fields: [
      { name: "url", type: "string", isArray: false, isReference: false },
      { name: "originalFilename", type: "string", isArray: false, isReference: false },
      { name: "size", type: "number", isArray: false, isReference: false },
    ],
  },
];
