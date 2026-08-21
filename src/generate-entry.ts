export type ReferenceAttributes = Record<string, string>;

export type GenerateEntry =
  | {
      kind: "content";
      filename: string;
      contents: string;
      attributes?: ReferenceAttributes;
    }
  | { kind: "patch"; filename: string; content: string; section?: string };

export const content = (
  filename: string,
  contents: string,
  attributes?: ReferenceAttributes,
): GenerateEntry =>
  attributes === undefined
    ? { kind: "content", filename, contents }
    : { kind: "content", filename, contents, attributes };

export const patch = (
  filename: string,
  fileContent: string,
  section?: string,
): GenerateEntry =>
  section
    ? { kind: "patch", filename, content: fileContent, section }
    : { kind: "patch", filename, content: fileContent };

export const stripAttributes = (entries: GenerateEntry[]): GenerateEntry[] =>
  entries.map((entry) => {
    if (entry.kind !== "content" || entry.attributes === undefined) {
      return entry;
    }
    const { attributes: _attributes, ...rest } = entry;
    return rest;
  });
