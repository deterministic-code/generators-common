import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DatasourceTable, Type, TypeField } from "@deterministic-code/deterministic-specifications-typescript/parser";
import {
  columnFields,
  identityColumns,
  isCollectionField,
  isPkField,
  primaryKeyColumn,
  uniqueLookupFields,
} from "./spec-types.ts";

const field = (name: string, extras: Partial<TypeField> = {}): TypeField => ({
  name,
  type: extras.type ?? "integer",
  kind: "primitive",
  base: extras.base ?? extras.type ?? "integer",
  isArray: false,
  isNullable: false,
  ...extras,
});

const typeOf = (partial: Partial<Type> & { name?: string }): Type => ({
  name: partial.name ?? "item",
  tags: partial.tags ?? ["datasource_type"],
  kind: partial.kind ?? "inherit",
  inherits: partial.inherits,
  ids: partial.ids,
  fields: partial.fields ?? [],
});

const tableOf = (
  fields: DatasourceTable["fields"] = [],
): DatasourceTable => ({
  name: "item",
  fields,
  indexes: [],
  uniqueIndexFields: [],
});

describe("identityColumns", () => {
  it("returns type-level ids in declared order", () => {
    const type = typeOf({
      inherits: "set",
      ids: ["left_id", "right_id"],
      fields: [field("left_id"), field("right_id")],
    });
    assert.deepEqual(identityColumns(type), ["left_id", "right_id"]);
    assert.equal(primaryKeyColumn(undefined, type), "left_id");
    assert.equal(isPkField(field("right_id"), type), true);
    assert.equal(isPkField(field("name", { type: "string" }), type), false);
  });

  it("uses a field marked is_id when ids is absent", () => {
    const type = typeOf({
      fields: [field("code", { isId: true }), field("name", { type: "string" })],
    });
    assert.deepEqual(identityColumns(type), ["code"]);
  });

  it("uses is_fixed_id overlay when no authored identity", () => {
    const type = typeOf({
      fields: [field("key", { type: "string" })],
    });
    const table = tableOf([{ name: "key", isFixedId: true }]);
    assert.deepEqual(identityColumns(type, table), ["key"]);
    assert.equal(primaryKeyColumn(table, type), "key");
  });

  it("injects id when inherits set and nothing is authored", () => {
    const type = typeOf({
      inherits: "set",
      fields: [field("email", { type: "string" })],
    });
    assert.deepEqual(identityColumns(type), ["id"]);
  });

  it("includes every identity column in uniqueLookupFields", () => {
    const type = typeOf({
      inherits: "set",
      ids: ["left_id", "right_id"],
      fields: [field("left_id"), field("right_id")],
    });
    assert.deepEqual(
      uniqueLookupFields(type).map((e) => e.field),
      ["left_id", "right_id"],
    );
  });
});

describe("columnFields", () => {
  it("drops type-kind arrays and keeps scalars", () => {
    const addresses = field("addresses", {
      type: "address[]",
      kind: "type",
      base: "address",
      isArray: true,
    });
    const email = field("email", { type: "string" });
    const settings = field("settings", {
      type: "contact_settings{}",
      kind: "type",
      base: "contact_settings",
      isMap: true,
    });
    assert.equal(isCollectionField(addresses), true);
    assert.equal(isCollectionField(settings), true);
    assert.equal(isCollectionField(email), false);
    assert.deepEqual(
      columnFields([email, addresses, settings]).map((f) => f.name),
      ["email"],
    );
  });
});
