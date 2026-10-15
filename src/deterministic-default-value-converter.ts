export type SpecToken = {
  spec: RegExp;
  specText?: (arg: string) => string;
};

export type DefaultEntry = SpecToken & {
  native: (arg: string) => string;
  reverse: RegExp;
};

type DefaultToken = { token: string; arg?: string | boolean };

const NUMERIC_LITERAL_TYPES = new Set([
  "number",
  "integer",
  "unsignedinteger",
  "smallinteger",
  "unsignedsmallinteger",
  "biginteger",
  "unsignedbiginteger",
  "float",
  "decimal",
  "reference",
]);

const CALL_FORM = /^([A-Za-z]+)\('(.*)'\)$/;

const callTokenName = (name: string): string =>
  name === "uuid" ? "Uuid" : name;

const identity = (arg: string): string => arg;

const intLit: SpecToken = { spec: /^-?[0-9]+$/, specText: identity };
const uintLit: SpecToken = { spec: /^[0-9]+$/, specText: identity };
const floatLit: SpecToken = {
  spec: /^-?[0-9]+(\.[0-9]+)?$/,
  specText: identity,
};

export class DeterministicDefaultValueConverter {
  static readonly spec: Record<string, Record<string, SpecToken>> = {
    string: { String: { spec: /^.*$/, specText: identity } },
    character: { String: { spec: /^.+$/, specText: identity } },
    number: { Numeric: intLit },
    integer: { Numeric: intLit },
    unsignedinteger: { Numeric: uintLit },
    smallinteger: { Numeric: intLit },
    unsignedsmallinteger: { Numeric: uintLit },
    biginteger: { Numeric: intLit },
    unsignedbiginteger: { Numeric: uintLit },
    float: { Numeric: floatLit },
    decimal: { Numeric: floatLit, String: { spec: /^.*$/, specText: identity } },
    boolean: { Boolean: { spec: /^(true|false)$/, specText: identity } },
    datetime: {
      Now: { spec: /^Now$/ },
      UtcNow: { spec: /^UtcNow$/ },
      DateTime: {
        spec: /^DateTime\('[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(Z|[+-][0-9]{2}:[0-9]{2})'\)$/,
        specText: (arg) => `DateTime('${arg}')`,
      },
    },
    binary: {
      Hex: {
        spec: /^Hex\('([0-9a-fA-F]{2})*'\)$/,
        specText: (arg) => `Hex('${arg}')`,
      },
    },
    uuid: {
      NewId: { spec: /^NewId$/ },
      Empty: { spec: /^Empty$/ },
      Uuid: {
        spec: /^uuid\('[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'\)$/,
        specText: (arg) => `uuid('${arg}')`,
      },
    },
    reference: {},
  };

  readonly dictionary: Record<string, Record<string, DefaultEntry>>;

  constructor(dictionary: Record<string, Record<string, DefaultEntry>>) {
    this.dictionary = dictionary;
  }

  static parse(specType: string, value: unknown): DefaultToken {
    if (value === undefined || value === null) return { token: "None" };
    const v = String(value);
    const call = CALL_FORM.exec(v);
    if (call !== null) {
      return { token: callTokenName(call[1]!), arg: call[2] };
    }
    if (specType === "boolean") {
      const arg = typeof value === "boolean" ? value : v === "true";
      return { token: "Boolean", arg };
    }
    if (NUMERIC_LITERAL_TYPES.has(specType)) {
      return { token: "Numeric", arg: v };
    }
    if (specType === "datetime") {
      if (v === "Now") return { token: "Now" };
      if (v === "UtcNow") return { token: "UtcNow" };
      return { token: "DateTime", arg: v };
    }
    if (specType === "uuid") {
      if (v === "NewId") return { token: "NewId" };
      if (v === "Empty") return { token: "Empty" };
      return { token: "Uuid", arg: v };
    }
    if (specType === "binary") return { token: "Hex", arg: v };
    return { token: "String", arg: v };
  }

  convert(specType: string, text: string): string | null {
    const parsed = DeterministicDefaultValueConverter.parse(specType, text);
    if (parsed.token === "None") return null;
    const entries = this.dictionary[specType];
    if (entries === undefined) {
      throw new Error(`Unknown spec field type: ${specType}`);
    }
    const entry = entries[parsed.token];
    if (entry === undefined) return null;
    if (!entry.spec.test(text)) {
      throw new Error(
        `default_value '${text}' is not a valid ${specType} ${parsed.token} default`,
      );
    }
    const expr = entry.native(
      parsed.arg === undefined ? "" : String(parsed.arg),
    );
    return expr === "" ? null : expr;
  }

  reverseConvert(specType: string, native: string): string {
    const entries = this.dictionary[specType];
    if (entries === undefined) {
      throw new Error(`Unknown spec field type: ${specType}`);
    }
    for (const [token, entry] of Object.entries(entries)) {
      const match = entry.reverse.exec(native);
      if (match === null) continue;
      const arg = match[1] ?? "";
      return entry.specText === undefined ? token : entry.specText(arg);
    }
    throw new Error(
      `Native default '${native}' is not a valid ${specType} default`,
    );
  }
}
