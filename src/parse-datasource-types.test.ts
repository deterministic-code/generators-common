import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SpecificationParser,
  primaryKeyFor,
} from "./specification-parser.ts";

describe("parseDatasourceTypes", () => {
  it("reads types: and inherits a type-less references: parent.id", () => {
    const types = new SpecificationParser().parseDatasourceTypes({
      idType: "integer",
      yaml: `types:
  - user:
      fields:
        - role_id:
            references: role.id
  - role:
      fields:
        - name:
            type: string
`,
    });
    assert.deepEqual(
      types.map((t) => t.name),
      ["user", "role"],
    );
    assert.equal(types[0]?.datasourceType, "standard");
    assert.deepEqual(types[0]?.fields, [
      {
        name: "role_id",
        type: "number",
        isNullable: false,
        references: "role.id",
      },
    ]);
  });

  it("uses an explicit primary_key type when the reference targets that column", () => {
    const types = new SpecificationParser().parseDatasourceTypes({
      idType: "integer",
      yaml: `types:
  - child:
      fields:
        - parent_code:
            references: parent.code
  - parent:
      fields:
        - code:
            type: string
            primary_key: true
`,
    });
    assert.equal(types[0]?.fields[0]?.type, "string");
  });

  it("throws when a type-less reference cannot be resolved", () => {
    assert.throws(
      () =>
        new SpecificationParser().parseDatasourceTypes({
          idType: "integer",
          yaml: `types:
  - user:
      fields:
        - role_id:
            references: missing.id
`,
        }),
      /type-less reference "role_id"/,
    );
  });
});

describe("primaryKeyFor", () => {
  it("defaults to id and the project idType", () => {
    const types = new SpecificationParser().parseDatasourceTypes({
      idType: "uuid",
      yaml: `types:
  - user:
      fields:
        - email:
            type: string
`,
    });
    assert.deepEqual(primaryKeyFor("user", types, "uuid"), {
      column: "id",
      idType: "uuid",
    });
  });

  it("uses a custom non-id primary_key field", () => {
    const types = new SpecificationParser().parseDatasourceTypes({
      idType: "integer",
      yaml: `types:
  - parent:
      fields:
        - code:
            type: string
            primary_key: true
`,
    });
    assert.deepEqual(primaryKeyFor("parent", types, "integer"), {
      column: "code",
      idType: "string",
    });
  });

  it("falls back when the entity is missing", () => {
    assert.deepEqual(primaryKeyFor("missing", [], "biginteger"), {
      column: "id",
      idType: "biginteger",
    });
  });
});
