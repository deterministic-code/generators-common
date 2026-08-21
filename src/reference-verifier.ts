import {
  stripAttributes,
  type GenerateEntry,
  type ReferenceAttributes,
} from "./generate-entry.ts";

/** Well-known keys ReferenceVerifier reads from attribute bags. */
export const REFERENCE_ATTRIBUTE_KEYS = [
  "module",
  "exports",
  "namespace",
  "imports",
  "uses",
  "namespaceRefs",
] as const;

export type ReferenceAttributeKey = (typeof REFERENCE_ATTRIBUTE_KEYS)[number];

type Mismatch = {
  from: string;
  kind:
    | "import"
    | "uses"
    | "namespaceRef"
    | "duplicateModule"
    | "duplicateNamespace"
    | "relativePath"
    | "missingExport"
    | "missingUse"
    | "missingNamespace"
    | "missingNamespaceRef";
  expected: string;
  hint?: string;
};

const IDENT_CHAR = /[A-Za-z0-9_]/;

/** True when `name` appears in `text` as a whole identifier (not a substring). */
export const containsIdent = (text: string, name: string): boolean => {
  if (name.length === 0) return false;
  let from = 0;
  while (from < text.length) {
    const index = text.indexOf(name, from);
    if (index < 0) return false;
    const before = index === 0 ? "" : text[index - 1]!;
    const after = text[index + name.length] ?? "";
    if (!IDENT_CHAR.test(before) && !IDENT_CHAR.test(after)) return true;
    from = index + 1;
  }
  return false;
};

const findIdentIgnoreCase = (
  text: string,
  name: string,
): string | undefined => {
  if (name.length === 0) return undefined;
  const lower = name.toLowerCase();
  const haystack = text.toLowerCase();
  let from = 0;
  while (from < haystack.length) {
    const index = haystack.indexOf(lower, from);
    if (index < 0) return undefined;
    const actual = text.slice(index, index + name.length);
    const before = index === 0 ? "" : text[index - 1]!;
    const after = text[index + name.length] ?? "";
    if (!IDENT_CHAR.test(before) && !IDENT_CHAR.test(after) && actual !== name) {
      return actual;
    }
    from = index + 1;
  }
  return undefined;
};

/** Split a comma-separated attribute value into trimmed non-empty parts. */
export const listAttribute = (value: string | undefined): string[] =>
  value === undefined
    ? []
    : value
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0);

const findCaseInsensitive = (
  needle: string,
  haystack: Iterable<string>,
): string | undefined => {
  const lower = needle.toLowerCase();
  for (const key of haystack) {
    if (key.toLowerCase() === lower && key !== needle) return key;
  }
  return undefined;
};

/** True when a path is emit-relative (`./`, `../`) rather than a Rel module key. */
export const isRelativeModulePath = (path: string): boolean =>
  path.startsWith("./") || path.startsWith("../") || path.includes("/../") || path.includes("/./");

/** Keep only verifier keys from a generic attribute bag. */
export const pickReferenceAttributes = (
  attrs: ReferenceAttributes,
): ReferenceAttributes => {
  const out: ReferenceAttributes = {};
  for (const key of REFERENCE_ATTRIBUTE_KEYS) {
    const value = attrs[key];
    if (value !== undefined && value !== "") out[key] = value;
  }
  return out;
};

/**
 * Collect verifier attribute bags from generate entries.
 * Only well-known keys are kept; relative `../` paths belong in fill tokens, not here.
 */
export const referenceAttributesFromEntries = (
  entries: GenerateEntry[],
): ReferenceAttributes[] =>
  entries.flatMap((entry) => {
    if (entry.kind !== "content" || entry.attributes === undefined) return [];
    const picked = pickReferenceAttributes(entry.attributes);
    return Object.keys(picked).length === 0 ? [] : [picked];
  });

/**
 * Verifies module / export / namespace graphs using attribute strings only.
 * `module` and `imports` must be project-relative Rel keys (e.g. `types/generated/views/user.ts`),
 * never `../../…` — relative specs are computed at fill time from Rel pairs.
 */
export class ReferenceVerifier {
  verify(attributes: readonly ReferenceAttributes[]): void {
    const modules = new Map<string, string>();
    const exports = new Map<string, string>();
    const namespaces = new Map<string, string>();
    const mismatches: Mismatch[] = [];

    for (const attrs of attributes) {
      const from = attrs.module ?? "(unknown module)";

      if (attrs.module !== undefined) {
        if (isRelativeModulePath(attrs.module)) {
          mismatches.push({
            from,
            kind: "relativePath",
            expected: attrs.module,
            hint: "use a Rel module key (e.g. types/generated/views/user.ts), not a relative import spec",
          });
        }
        if (modules.has(attrs.module)) {
          mismatches.push({
            from,
            kind: "duplicateModule",
            expected: attrs.module,
            hint: `also declared as ${modules.get(attrs.module)}`,
          });
        } else {
          modules.set(attrs.module, from);
        }
      }

      for (const name of listAttribute(attrs.exports)) {
        if (!exports.has(name)) exports.set(name, from);
      }

      if (attrs.namespace !== undefined && attrs.namespace !== "") {
        const existingNs = namespaces.get(attrs.namespace);
        if (existingNs !== undefined && existingNs !== from) {
          mismatches.push({
            from,
            kind: "duplicateNamespace",
            expected: attrs.namespace,
            hint: `also declared as ${existingNs}`,
          });
        } else {
          namespaces.set(attrs.namespace, from);
        }
      }
    }

    for (const attrs of attributes) {
      const from = attrs.module ?? "(unknown module)";

      for (const imp of listAttribute(attrs.imports)) {
        if (isRelativeModulePath(imp)) {
          mismatches.push({
            from,
            kind: "relativePath",
            expected: imp,
            hint: "imports must be Rel module keys, not ../../ paths",
          });
          continue;
        }
        if (!modules.has(imp)) {
          const hint = findCaseInsensitive(imp, modules.keys());
          mismatches.push({
            from,
            kind: "import",
            expected: imp,
            hint: hint === undefined ? undefined : `did you mean "${hint}"?`,
          });
        }
      }

      for (const use of listAttribute(attrs.uses)) {
        if (!exports.has(use)) {
          const hint = findCaseInsensitive(use, exports.keys());
          mismatches.push({
            from,
            kind: "uses",
            expected: use,
            hint: hint === undefined ? undefined : `did you mean "${hint}"?`,
          });
        }
      }

      for (const ns of listAttribute(attrs.namespaceRefs)) {
        if (!namespaces.has(ns)) {
          const hint = findCaseInsensitive(ns, namespaces.keys());
          mismatches.push({
            from,
            kind: "namespaceRef",
            expected: ns,
            hint: hint === undefined ? undefined : `did you mean "${hint}"?`,
          });
        }
      }
    }

    this.throwIf(mismatches);
  }

  /**
   * Declared `exports` / `uses` / namespace names must appear as identifiers
   * in that entry's generated text. Catches template glue (`I{{entity}}Service`)
   * when the attribute bag used the casing helper.
   */
  verifyContents(entries: readonly GenerateEntry[]): void {
    const mismatches: Mismatch[] = [];
    for (const entry of entries) {
      if (entry.kind !== "content" || entry.attributes === undefined) continue;
      const attrs = pickReferenceAttributes(entry.attributes);
      if (Object.keys(attrs).length === 0) continue;
      const from = attrs.module ?? entry.filename;
      const body = entry.contents;
      const check = (
        names: string[],
        kind: "missingExport" | "missingUse" | "missingNamespace" | "missingNamespaceRef",
      ): void => {
        for (const name of names) {
          if (containsIdent(body, name)) continue;
          const hint = findIdentIgnoreCase(body, name);
          mismatches.push({
            from,
            kind,
            expected: name,
            hint:
              hint === undefined
                ? "not in file"
                : `file has "${hint}"`,
          });
        }
      };
      check(listAttribute(attrs.exports), "missingExport");
      check(listAttribute(attrs.uses), "missingUse");
      if (attrs.namespace !== undefined && attrs.namespace !== "") {
        check([attrs.namespace], "missingNamespace");
      }
      check(listAttribute(attrs.namespaceRefs), "missingNamespaceRef");
    }
    this.throwIf(mismatches);
  }

  private throwIf(mismatches: Mismatch[]): void {
    if (mismatches.length === 0) return;
    const lines = mismatches.map((m) => {
      const base = `${m.from}: ${m.kind} "${m.expected}"`;
      return m.hint === undefined ? base : `${base} (${m.hint})`;
    });
    throw new Error(
      `ReferenceVerifier: ${mismatches.length} mismatch(es):\n${lines.join("\n")}`,
    );
  }
}

/** Graph check plus content/attribute consistency. */
export const verifyEntries = (entries: GenerateEntry[]): void => {
  const verifier = new ReferenceVerifier();
  verifier.verify(referenceAttributesFromEntries(entries));
  verifier.verifyContents(entries);
};

export const finalizeEntries = (entries: GenerateEntry[]): GenerateEntry[] => {
  verifyEntries(entries);
  return stripAttributes(entries);
};
