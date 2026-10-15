import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DeterministicDefaultValueConverter } from "./deterministic-default-value-converter.ts";
import { parseDefaultToken } from "./default-token.ts";

const EMPTY = "00000000-0000-0000-0000-000000000000";
const spec = DeterministicDefaultValueConverter.spec;

const sqlString = (arg: string): string => `'${arg.replace(/'/g, "''")}'`;

describe("DeterministicDefaultValueConverter", () => {
  const converter = new DeterministicDefaultValueConverter({
    uuid: {
      NewId: {
        ...spec.uuid.NewId!,
        native: () => "NEWID()",
        reverse: /^NEWID\(\)$/,
      },
      Empty: {
        ...spec.uuid.Empty!,
        native: () => sqlString(EMPTY),
        reverse: new RegExp(`^'${EMPTY}'$`),
      },
      Uuid: {
        ...spec.uuid.Uuid!,
        native: sqlString,
        reverse: /^'([0-9a-fA-F-]{36})'$/,
      },
    },
    datetime: {
      Now: {
        ...spec.datetime.Now!,
        native: () => "GETDATE()",
        reverse: /^GETDATE\(\)$/,
      },
      DateTime: {
        ...spec.datetime.DateTime!,
        native: sqlString,
        reverse: /^'(.*)'$/,
      },
    },
  });

  it("exposes the dictionary as the mapping table", () => {
    assert.equal(converter.dictionary.uuid!.NewId!.native(""), "NEWID()");
  });

  it("parseDefaultToken is the class parser", () => {
    assert.deepEqual(parseDefaultToken("uuid", "NewId"), { token: "NewId" });
    assert.deepEqual(
      parseDefaultToken("uuid", "uuid('11111111-1111-4111-8111-111111111111')"),
      { token: "Uuid", arg: "11111111-1111-4111-8111-111111111111" },
    );
  });

  it("convert renders a bare NewId token", () => {
    assert.equal(converter.convert("uuid", "NewId"), "NEWID()");
  });

  it("convert renders uuid('…') with the quoted argument", () => {
    assert.equal(
      converter.convert(
        "uuid",
        "uuid('11111111-1111-4111-8111-111111111111')",
      ),
      "'11111111-1111-4111-8111-111111111111'",
    );
  });

  it("convert rejects NewId('…') because NewId has no argument", () => {
    assert.throws(
      () => converter.convert("uuid", "NewId('asdf-asdf-asdf-asdf')"),
      /not a valid uuid NewId default/,
    );
  });

  it("convert renders DateTime('…')", () => {
    assert.equal(
      converter.convert("datetime", "DateTime('2026-01-01T00:00:00Z')"),
      "'2026-01-01T00:00:00Z'",
    );
  });

  it("reverseConvert maps NEWID() back to NewId", () => {
    assert.equal(converter.reverseConvert("uuid", "NEWID()"), "NewId");
  });

  it("reverseConvert rebuilds uuid('…') from a quoted literal", () => {
    assert.equal(
      converter.reverseConvert(
        "uuid",
        "'11111111-1111-4111-8111-111111111111'",
      ),
      "uuid('11111111-1111-4111-8111-111111111111')",
    );
  });
});
