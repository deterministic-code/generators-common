export type ReferenceAttributes = Record<string, string>;

export type PatchAppendIfNotExists = "None" | "End" | "Start";

export type GenerateEntry =
  | {
      kind: "content";
      filename: string;
      contents: string;
      attributes?: ReferenceAttributes;
    }
  | {
      kind: "patch";
      filename: string;
      content: string;
      section?: string;
      appendIfNotExists?: PatchAppendIfNotExists;
    };

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
  appendIfNotExists?: PatchAppendIfNotExists,
): GenerateEntry => {
  if (section === undefined && appendIfNotExists === undefined) {
    return { kind: "patch", filename, content: fileContent };
  }
  return {
    kind: "patch",
    filename,
    content: fileContent,
    ...(section === undefined ? {} : { section }),
    ...(appendIfNotExists === undefined ? {} : { appendIfNotExists }),
  };
};

export const stripAttributes = (entries: GenerateEntry[]): GenerateEntry[] =>
  entries.map((entry) => {
    if (entry.kind !== "content" || entry.attributes === undefined) {
      return entry;
    }
    const { attributes: _attributes, ...rest } = entry;
    return rest;
  });
