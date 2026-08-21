import {
  stripAttributes,
  type GenerateEntry,
  type ReferenceAttributes,
} from "./generate-entry.ts";

type ContentEntry = Extract<GenerateEntry, { kind: "content" }>;

type Mismatch = {
  from: string;
  kind:
    | "import"
    | "uses"
    | "namespaceRef"
    | "duplicateModule"
    | "duplicateNamespace";
  expected: string;
  hint?: string;
};

/** Split a comma-separated attribute value into trimmed non-empty parts. */
const list = (value: string | undefined): string[] =>
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

const moduleKey = (entry: ContentEntry): string =>
  entry.attributes?.module ?? entry.filename;

export class ReferenceVerifier {
  verify(entries: GenerateEntry[]): void {
    const contents = entries.filter(
      (e): e is ContentEntry => e.kind === "content",
    );

    const modules = new Map<string, ContentEntry>();
    const exports = new Map<string, ContentEntry>();
    const namespaces = new Map<string, ContentEntry>();
    const mismatches: Mismatch[] = [];

    for (const entry of contents) {
      const attrs: ReferenceAttributes | undefined = entry.attributes;
      if (attrs === undefined) continue;

      const mod = moduleKey(entry);
      const existingMod = modules.get(mod);
      if (existingMod !== undefined && existingMod !== entry) {
        mismatches.push({
          from: entry.filename,
          kind: "duplicateModule",
          expected: mod,
        });
      } else {
        modules.set(mod, entry);
      }

      for (const name of list(attrs.exports)) {
        // Same export name from different modules is allowed (e.g. view + datasource).
        if (!exports.has(name)) exports.set(name, entry);
      }

      if (attrs.namespace !== undefined && attrs.namespace !== "") {
        const existingNs = namespaces.get(attrs.namespace);
        if (existingNs !== undefined && existingNs !== entry) {
          mismatches.push({
            from: entry.filename,
            kind: "duplicateNamespace",
            expected: attrs.namespace,
            hint: `also declared in ${existingNs.filename}`,
          });
        } else {
          namespaces.set(attrs.namespace, entry);
        }
      }
    }

    for (const entry of contents) {
      if (entry.attributes !== undefined) continue;
      const mod = entry.filename;
      if (!modules.has(mod)) modules.set(mod, entry);
    }

    for (const entry of contents) {
      const attrs = entry.attributes;
      if (attrs === undefined) continue;

      for (const imp of list(attrs.imports)) {
        if (!modules.has(imp)) {
          const hint = findCaseInsensitive(imp, modules.keys());
          mismatches.push({
            from: entry.filename,
            kind: "import",
            expected: imp,
            hint: hint === undefined ? undefined : `did you mean "${hint}"?`,
          });
        }
      }

      for (const use of list(attrs.uses)) {
        if (!exports.has(use)) {
          const hint = findCaseInsensitive(use, exports.keys());
          mismatches.push({
            from: entry.filename,
            kind: "uses",
            expected: use,
            hint: hint === undefined ? undefined : `did you mean "${hint}"?`,
          });
        }
      }

      for (const ns of list(attrs.namespaceRefs)) {
        if (!namespaces.has(ns)) {
          const hint = findCaseInsensitive(ns, namespaces.keys());
          mismatches.push({
            from: entry.filename,
            kind: "namespaceRef",
            expected: ns,
            hint: hint === undefined ? undefined : `did you mean "${hint}"?`,
          });
        }
      }
    }

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

export const finalizeEntries = (entries: GenerateEntry[]): GenerateEntry[] => {
  new ReferenceVerifier().verify(entries);
  return stripAttributes(entries);
};
