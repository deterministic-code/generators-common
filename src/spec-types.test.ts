import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  identityColumns,
  isPkField,
  pkName,
  uniqueLookupFields,
} from "./spec-types.ts";

const field = (name: string, extras: { isId?: boolean; type?: string } = {}) => ({
  name,
  type: extras.type ?? "string",
  kind: "primitive" as const,
  base: extras.type ?? "string",
  isArray: false,
  isNullable: false,
  ...(extras.isId ? { isId: true } : {}),
});

describe("identityColumns", () => {
  it("injects id for a set with no authored identity", () => {
    assert.deepEqual(
      identityColumns({ inherits: "set", fields: [field("email")] }),
      ["id"],
    );
  });

  it("uses the is_id field", () => {
    assert.deepEqual(
      identityColumns({
        inherits: "set",
        fields: [field("code", { isId: true, type: "integer" }), field("email")],
      }),
      ["code"],
    );
  });

  it("uses authored ids for a composite key", () => {
    assert.deepEqual(
      identityColumns({
        inherits: "set",
        ids: ["left_id", "right_id"],
        fields: [field("left_id"), field("right_id")],
      }),
      ["left_id", "right_id"],
    );
  });
});

describe("pk helpers", () => {
  it("marks only identity fields as the primary key", () => {
    const type = {
      inherits: "set" as const,
      fields: [field("code", { isId: true, type: "integer" }), field("email")],
    };
    assert.equal(pkName(type), "code");
    assert.equal(isPkField(type.fields[0]!, type), true);
    assert.equal(isPkField(type.fields[1]!, type), false);
  });

  it("includes identity columns in unique lookups", () => {
    const type = {
      inherits: "set" as const,
      ids: ["left_id", "right_id"],
      fields: [field("left_id", { type: "integer" }), field("right_id", { type: "integer" })],
    };
    assert.deepEqual(uniqueLookupFields(type), [
      { field: "left_id", type: "integer" },
      { field: "right_id", type: "integer" },
    ]);
  });
});
