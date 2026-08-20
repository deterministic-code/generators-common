export type CaseFormat = "Camel" | "Pascal" | "Snake" | "Kebab" | "Auto";

export type ResolvedCaseFormat = Exclude<CaseFormat, "Auto">;

export type CasingOverrides = {
  file_names?: string;
  types?: string;
  fields?: string;
  directories?: string;
};

export type LanguageCasingDefaults = {
  file_names: ResolvedCaseFormat;
  types: ResolvedCaseFormat;
  fields: ResolvedCaseFormat;
  directories: ResolvedCaseFormat;
};

export type ICasingStrategy = {
  convertFileName: (text: string) => string;
  convertTypes: (text: string) => string;
  convertFields: (text: string) => string;
  convertDirectories: (text: string) => string;
};

export const CASE_FORMATS: readonly CaseFormat[] = [
  "Camel",
  "Pascal",
  "Snake",
  "Kebab",
  "Auto",
];

/** Auto defaults from the Default Casings table. Directories follow file names. */
export const LANGUAGE_CASING_DEFAULTS = {
  typescript: {
    file_names: "Camel",
    types: "Pascal",
    fields: "Snake",
    directories: "Camel",
  },
  javascript: {
    file_names: "Camel",
    types: "Pascal",
    fields: "Camel",
    directories: "Camel",
  },
  csharp: {
    file_names: "Camel",
    types: "Pascal",
    fields: "Pascal",
    directories: "Camel",
  },
  java: {
    file_names: "Camel",
    types: "Pascal",
    fields: "Camel",
    directories: "Camel",
  },
  python: {
    file_names: "Camel",
    types: "Pascal",
    fields: "Snake",
    directories: "Camel",
  },
  rust: {
    file_names: "Camel",
    types: "Pascal",
    fields: "Snake",
    directories: "Camel",
  },
  sql: {
    file_names: "Snake",
    types: "Snake",
    fields: "Snake",
    directories: "Snake",
  },
  openapi: {
    file_names: "Kebab",
    types: "Pascal",
    fields: "Camel",
    directories: "Kebab",
  },
} as const satisfies Record<string, LanguageCasingDefaults>;

export type CasingLanguage = keyof typeof LANGUAGE_CASING_DEFAULTS;

const LANGUAGE_ALIASES: Record<string, CasingLanguage> = {
  ts: "typescript",
  typescript: "typescript",
  js: "javascript",
  javascript: "javascript",
  py: "python",
  python: "python",
  cs: "csharp",
  csharp: "csharp",
  "c#": "csharp",
  java: "java",
  rs: "rust",
  rust: "rust",
  sql: "sql",
  openapi: "openapi",
};

const PARSE_CASE: Record<string, CaseFormat> = {
  camel: "Camel",
  pascal: "Pascal",
  snake: "Snake",
  kebab: "Kebab",
  auto: "Auto",
};

const wordsOf = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());

const cap = (word: string): string =>
  word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1);

export const toCase = (name: string, format: ResolvedCaseFormat): string => {
  const words = wordsOf(name);
  if (words.length === 0) return name;
  switch (format) {
    case "Camel":
      return words.map((w, i) => (i === 0 ? w : cap(w))).join("");
    case "Pascal":
      return words.map(cap).join("");
    case "Snake":
      return words.join("_");
    case "Kebab":
      return words.join("-");
  }
};

const parseCaseFormat = (raw: string | undefined, path: string): CaseFormat => {
  if (raw === undefined || raw === "") return "Auto";
  const parsed = PARSE_CASE[raw.toLowerCase()];
  if (parsed === undefined) {
    throw new Error(
      `${path} must be one of [${CASE_FORMATS.join(", ")}] (got "${raw}").`,
    );
  }
  return parsed;
};

export const resolveCasingLanguage = (language: string): CasingLanguage => {
  const key = language.toLowerCase().replace(/[\s_]/g, "");
  const resolved =
    LANGUAGE_ALIASES[key] ?? LANGUAGE_ALIASES[language.toLowerCase()];
  if (resolved === undefined || !(resolved in LANGUAGE_CASING_DEFAULTS)) {
    throw new Error(
      `CasingFactory: unknown language "${language}". Valid: ${Object.keys(LANGUAGE_CASING_DEFAULTS).join(", ")}.`,
    );
  }
  return resolved as CasingLanguage;
};

const resolveLeaf = (
  override: CaseFormat,
  fallback: ResolvedCaseFormat,
): ResolvedCaseFormat => (override === "Auto" ? fallback : override);

class CasingStrategy implements ICasingStrategy {
  #fileNames: ResolvedCaseFormat;
  #types: ResolvedCaseFormat;
  #fields: ResolvedCaseFormat;
  #directories: ResolvedCaseFormat;

  constructor(resolved: LanguageCasingDefaults) {
    this.#fileNames = resolved.file_names;
    this.#types = resolved.types;
    this.#fields = resolved.fields;
    this.#directories = resolved.directories;
  }

  convertFileName(text: string): string {
    return toCase(text, this.#fileNames);
  }

  convertTypes(text: string): string {
    return toCase(text, this.#types);
  }

  convertFields(text: string): string {
    return toCase(text, this.#fields);
  }

  convertDirectories(text: string): string {
    return toCase(text, this.#directories);
  }
}

export const casingOverridesFromSettings = (
  settings: Record<string, string>,
  language: string,
): CasingOverrides => ({
  file_names: settings[`languages.${language}.casing.file_names`],
  types: settings[`languages.${language}.casing.types`],
  fields: settings[`languages.${language}.casing.fields`],
  directories: settings[`languages.${language}.casing.directories`],
});

export const CasingFactory = {
  create: (
    language: string,
    overrides?: CasingOverrides,
  ): ICasingStrategy => {
    const lang = resolveCasingLanguage(language);
    const defaults = LANGUAGE_CASING_DEFAULTS[lang];
    const prefix = `languages.${lang}.casing`;
    const resolved: LanguageCasingDefaults = {
      file_names: resolveLeaf(
        parseCaseFormat(overrides?.file_names, `${prefix}.file_names`),
        defaults.file_names,
      ),
      types: resolveLeaf(
        parseCaseFormat(overrides?.types, `${prefix}.types`),
        defaults.types,
      ),
      fields: resolveLeaf(
        parseCaseFormat(overrides?.fields, `${prefix}.fields`),
        defaults.fields,
      ),
      directories: resolveLeaf(
        parseCaseFormat(overrides?.directories, `${prefix}.directories`),
        defaults.directories,
      ),
    };
    return new CasingStrategy(resolved);
  },
};
