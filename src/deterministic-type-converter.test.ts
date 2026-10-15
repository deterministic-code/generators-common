import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DeterministicTypeConverter } from "./deterministic-type-converter.ts";

describe("DeterministicTypeConverter", () => {
  const converter = new DeterministicTypeConverter({
    string: "TEXT",
    integer: "INTEGER",
    uuid: "TEXT",
  });

  it("exposes the dictionary as the mapping table", () => {
    assert.equal(converter.dictionary.integer, "INTEGER");
  });

  it("convert maps a spec type to its native type", () => {
    assert.equal(converter.convert("integer"), "INTEGER");
  });

  it("convert throws for an unknown spec type", () => {
    assert.throws(() => converter.convert("bogus"), /Unknown spec field type/);
  });

  it("reverseConvert maps a unique native type back", () => {
    assert.equal(converter.reverseConvert("INTEGER"), "integer");
  });

  it("reverseConvert throws when several spec types share a native type", () => {
    assert.throws(
      () => converter.reverseConvert("TEXT"),
      /maps to multiple spec types: string, uuid/,
    );
  });
});
