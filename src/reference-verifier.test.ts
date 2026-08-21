import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  content,
  patch,
  stripAttributes,
  type GenerateEntry,
  type ReferenceAttributes,
} from "./generate-entry.ts";
import {
  finalizeEntries,
  isRelativeModulePath,
  pickReferenceAttributes,
  referenceAttributesFromEntries,
  ReferenceVerifier,
} from "./reference-verifier.ts";

describe("ReferenceVerifier", () => {
  it("succeeds when imports and uses match declared modules and exports", () => {
    const attrs: ReferenceAttributes[] = [
      {
        module: "types/generated/views/user.ts",
        exports: "User",
      },
      {
        module: "services/generated/userService.ts",
        exports: "UserService, IUserService",
        imports: "types/generated/views/user.ts",
        uses: "User",
      },
    ];
    assert.doesNotThrow(() => new ReferenceVerifier().verify(attrs));
  });

  it("fails on casing mismatch for uses", () => {
    assert.throws(
      () =>
        new ReferenceVerifier().verify([
          { module: "types/generated/views/user.ts", exports: "User" },
          { module: "services/generated/userService.ts", uses: "user" },
        ]),
      /uses "user".*did you mean "User"/,
    );
  });

  it("fails on casing mismatch for imports", () => {
    assert.throws(
      () =>
        new ReferenceVerifier().verify([
          { module: "types/generated/views/User.ts" },
          {
            module: "services/generated/userService.ts",
            imports: "types/generated/views/user.ts",
          },
        ]),
      /import "types\/generated\/views\/user\.ts".*did you mean "types\/generated\/views\/User\.ts"/,
    );
  });

  it("fails when module is missing", () => {
    assert.throws(
      () =>
        new ReferenceVerifier().verify([
          {
            module: "services/generated/userService.ts",
            imports: "types/generated/views/missing.ts",
          },
        ]),
      /import "types\/generated\/views\/missing\.ts"/,
    );
  });

  it("allows the same export name from different modules", () => {
    assert.doesNotThrow(() =>
      new ReferenceVerifier().verify([
        { module: "types/generated/datasource/user.ts", exports: "User" },
        { module: "types/generated/views/user.ts", exports: "User" },
      ]),
    );
  });

  it("fails on duplicate module identity", () => {
    assert.throws(
      () =>
        new ReferenceVerifier().verify([
          { module: "shared.ts", exports: "A" },
          { module: "shared.ts", exports: "B" },
        ]),
      /duplicateModule "shared\.ts"/,
    );
  });

  it("fails on namespaceRef mismatch", () => {
    assert.throws(
      () =>
        new ReferenceVerifier().verify([
          {
            module: "User.cs",
            namespace: "Backend.Types.Datasource",
          },
          {
            module: "UserService.cs",
            namespaceRefs: "Backend.Types.DataSource",
          },
        ]),
      /namespaceRef "Backend\.Types\.DataSource".*did you mean "Backend\.Types\.Datasource"/,
    );
  });

  it("rejects relative ../../ paths in imports", () => {
    assert.throws(
      () =>
        new ReferenceVerifier().verify([
          { module: "types/generated/views/user.ts", exports: "User" },
          {
            module: "services/generated/userService.ts",
            imports: "../../types/generated/views/user",
            uses: "User",
          },
        ]),
      /relativePath.*\.\.\/\.\./,
    );
  });

  it("accepts comma-separated list values", () => {
    assert.doesNotThrow(() =>
      new ReferenceVerifier().verify([
        {
          module: "a.ts",
          exports: "Foo, Bar",
          namespace: "Ns.A",
        },
        {
          module: "b.ts",
          imports: "a.ts",
          uses: "Foo,Bar",
          namespaceRefs: "Ns.A",
        },
      ]),
    );
  });
});

describe("reference attribute helpers", () => {
  it("pickReferenceAttributes drops non-verifier keys", () => {
    assert.deepEqual(
      pickReferenceAttributes({
        module: "a.ts",
        exports: "A",
        typeName: "A",
        typeImportPath: "../../a",
      }),
      { module: "a.ts", exports: "A" },
    );
  });

  it("isRelativeModulePath detects ./ and ../", () => {
    assert.equal(isRelativeModulePath("../../types/user"), true);
    assert.equal(isRelativeModulePath("./user"), true);
    assert.equal(isRelativeModulePath("types/generated/views/user.ts"), false);
  });

  it("referenceAttributesFromEntries feeds verifier; finalize strips", () => {
    const entries: GenerateEntry[] = [
      content("user.ts", "{{#exports}}…{{/exports}}", {
        module: "types/generated/views/user.ts",
        exports: "User",
        typeName: "User",
      }),
      content("userService.ts", "{{#imports}}…{{/imports}}", {
        module: "services/generated/userService.ts",
        exports: "UserService",
        imports: "types/generated/views/user.ts",
        uses: "User",
        typeImportPath: "../../types/generated/views/user",
      }),
      content("plain.ts", "no attrs"),
      patch("pkg.json", "{}", "typescript"),
    ];
    const attrs = referenceAttributesFromEntries(entries);
    assert.deepEqual(attrs, [
      { module: "types/generated/views/user.ts", exports: "User" },
      {
        module: "services/generated/userService.ts",
        exports: "UserService",
        imports: "types/generated/views/user.ts",
        uses: "User",
      },
    ]);
    assert.doesNotThrow(() => new ReferenceVerifier().verify(attrs));
    assert.deepEqual(finalizeEntries(entries), [
      {
        kind: "content",
        filename: "user.ts",
        contents: "{{#exports}}…{{/exports}}",
      },
      {
        kind: "content",
        filename: "userService.ts",
        contents: "{{#imports}}…{{/imports}}",
      },
      { kind: "content", filename: "plain.ts", contents: "no attrs" },
      { kind: "patch", filename: "pkg.json", content: "{}", section: "typescript" },
    ]);
  });

  it("stripAttributes leaves patches and plain content unchanged", () => {
    const entries: GenerateEntry[] = [
      content("a.ts", "body"),
      patch("pkg.json", "{}", "typescript"),
    ];
    assert.deepEqual(stripAttributes(entries), entries);
  });
});
