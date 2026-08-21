import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  content,
  patch,
  stripAttributes,
  type GenerateEntry,
} from "./generate-entry.ts";
import { finalizeEntries, ReferenceVerifier } from "./reference-verifier.ts";

describe("ReferenceVerifier", () => {
  it("succeeds when imports and uses match declared modules and exports", () => {
    const entries: GenerateEntry[] = [
      content("types/user.ts", "export class User {}", {
        module: "types/user.ts",
        exports: "User",
      }),
      content("services/userService.ts", "import { User }", {
        module: "services/userService.ts",
        exports: "UserService",
        imports: "types/user.ts",
        uses: "User",
      }),
    ];
    assert.doesNotThrow(() => new ReferenceVerifier().verify(entries));
  });

  it("fails on casing mismatch for uses", () => {
    const entries: GenerateEntry[] = [
      content("types/user.ts", "", {
        module: "types/user.ts",
        exports: "User",
      }),
      content("services/userService.ts", "", {
        module: "services/userService.ts",
        uses: "user",
      }),
    ];
    assert.throws(
      () => new ReferenceVerifier().verify(entries),
      /uses "user".*did you mean "User"/,
    );
  });

  it("fails on casing mismatch for imports", () => {
    const entries: GenerateEntry[] = [
      content("types/User.ts", "", { module: "types/User.ts" }),
      content("services/userService.ts", "", {
        module: "services/userService.ts",
        imports: "types/user.ts",
      }),
    ];
    assert.throws(
      () => new ReferenceVerifier().verify(entries),
      /import "types\/user\.ts".*did you mean "types\/User\.ts"/,
    );
  });

  it("fails when module is missing", () => {
    const entries: GenerateEntry[] = [
      content("services/userService.ts", "", {
        module: "services/userService.ts",
        imports: "types/missing.ts",
      }),
    ];
    assert.throws(
      () => new ReferenceVerifier().verify(entries),
      /import "types\/missing\.ts"/,
    );
  });

  it("allows the same export name from different modules", () => {
    const entries: GenerateEntry[] = [
      content("a.ts", "", { module: "a.ts", exports: "User" }),
      content("b.ts", "", { module: "b.ts", exports: "User" }),
    ];
    assert.doesNotThrow(() => new ReferenceVerifier().verify(entries));
  });

  it("fails on duplicate module identity", () => {
    const entries: GenerateEntry[] = [
      content("a.ts", "", { module: "shared.ts", exports: "A" }),
      content("b.ts", "", { module: "shared.ts", exports: "B" }),
    ];
    assert.throws(
      () => new ReferenceVerifier().verify(entries),
      /duplicateModule "shared\.ts"/,
    );
  });

  it("fails on namespaceRef mismatch", () => {
    const entries: GenerateEntry[] = [
      content("User.cs", "", {
        module: "User.cs",
        namespace: "Backend.Types.Datasource",
      }),
      content("UserService.cs", "", {
        module: "UserService.cs",
        namespaceRefs: "Backend.Types.DataSource",
      }),
    ];
    assert.throws(
      () => new ReferenceVerifier().verify(entries),
      /namespaceRef "Backend\.Types\.DataSource".*did you mean "Backend\.Types\.Datasource"/,
    );
  });

  it("ignores entries without attributes", () => {
    const entries: GenerateEntry[] = [
      content("plain.ts", "export const x = 1;"),
      patch("docker-compose.yml", "services:\n  app:\n", "typescript"),
      content("svc.ts", "", {
        module: "svc.ts",
        imports: "plain.ts",
      }),
    ];
    assert.doesNotThrow(() => new ReferenceVerifier().verify(entries));
  });

  it("stripAttributes removes attributes after success", () => {
    const entries: GenerateEntry[] = [
      content("a.ts", "body", { module: "a.ts", exports: "A" }),
      content("b.ts", "body", {
        module: "b.ts",
        imports: "a.ts",
        uses: "A",
      }),
    ];
    const finalized = finalizeEntries(entries);
    assert.deepEqual(finalized, [
      { kind: "content", filename: "a.ts", contents: "body" },
      { kind: "content", filename: "b.ts", contents: "body" },
    ]);
  });

  it("stripAttributes leaves patches and plain content unchanged", () => {
    const entries: GenerateEntry[] = [
      content("a.ts", "body"),
      patch("pkg.json", "{}", "typescript"),
    ];
    assert.deepEqual(stripAttributes(entries), entries);
  });

  it("accepts comma-separated list values", () => {
    const entries: GenerateEntry[] = [
      content("a.ts", "", {
        module: "a.ts",
        exports: "Foo, Bar",
        namespace: "Ns.A",
      }),
      content("b.ts", "", {
        module: "b.ts",
        imports: "a.ts",
        uses: "Foo,Bar",
        namespaceRefs: "Ns.A",
      }),
    ];
    assert.doesNotThrow(() => new ReferenceVerifier().verify(entries));
  });
});
