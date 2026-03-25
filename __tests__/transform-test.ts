"use strict";

const defineTest = require("jscodeshift/dist/testUtils").defineTest;
const path = require("path");

describe("nexus to pothos", () => {
  describe("schema input nullability alignment", () => {
    defineTest(
      __dirname,
      "transform-schema-nullability",
      {
        schemaPath: path.join(
          __dirname,
          "../__testfixtures__/schema_input_nullability_alignment.schema.graphql"
        )
      },
      "schema_input_nullability_alignment",
      { parser: "ts", extensions: "ts" }
    );
  });

  describe("schema nullability alignment", () => {
    defineTest(
      __dirname,
      "transform-schema-nullability",
      {
        schemaPath: path.join(
          __dirname,
          "../__testfixtures__/schema_nullability_alignment.schema.graphql"
        )
      },
      "schema_nullability_alignment",
      { parser: "ts", extensions: "ts" }
    );
  });

  describe("expose nullable from object type", () => {
    defineTest(
      __dirname,
      "transform-expose-nullability",
      null,
      "expose_nullable_from_type",
      { parser: "ts", extensions: "ts" }
    );
  });

  describe("mutations and queries", () => {
    defineTest(__dirname, "transform", null, "mutations_and_queries", {
      parser: "ts",
      extensions: "ts"
    });
  });

  describe("object types", () => {
    defineTest(__dirname, "transform", null, "objectType", {
      parser: "ts",
      extensions: "ts"
    });
  });

  describe("enum types", () => {
    defineTest(__dirname, "transform", null, "enums", {
      parser: "ts",
      extensions: "ts"
    });
  });

  describe("relay fields", () => {
    defineTest(__dirname, "transform", null, "relay", {
      parser: "ts",
      extensions: "ts"
    });
  });
});
