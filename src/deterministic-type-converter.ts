export class DeterministicTypeConverter {
  readonly dictionary: Record<string, string>;
  readonly #reverse: Map<string, string[]>;

  constructor(dictionary: Record<string, string>) {
    this.dictionary = dictionary;
    this.#reverse = new Map();
    for (const [specType, native] of Object.entries(dictionary)) {
      const existing = this.#reverse.get(native);
      if (existing === undefined) this.#reverse.set(native, [specType]);
      else existing.push(specType);
    }
  }

  convert(specType: string): string {
    const native = this.dictionary[specType];
    if (native === undefined) {
      throw new Error(`Unknown spec field type: ${specType}`);
    }
    return native;
  }

  reverseConvert(native: string): string {
    const specTypes = this.#reverse.get(native);
    if (specTypes === undefined) {
      throw new Error(`Unknown native field type: ${native}`);
    }
    if (specTypes.length > 1) {
      throw new Error(
        `Native field type ${native} maps to multiple spec types: ${specTypes.join(", ")}`,
      );
    }
    return specTypes[0]!;
  }
}
