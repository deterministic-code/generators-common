import { parse } from "yaml";
import { isFiniteInt, isFiniteNumber, isRecord } from "./yaml-entry.ts";

export type YamlLiteral = string | number | boolean | null;

/** Typed cursor over a YAML value. Missing keys are empty nodes, not throws. */
export class YamlNode {
  readonly value: unknown;
  readonly path: string;

  constructor(value: unknown, path = "$") {
    this.value = value;
    this.path = path;
  }

  static fromYaml(text: string, path = "$"): YamlNode {
    return new YamlNode(parse(text), path);
  }

  get record(): Record<string, unknown> | undefined {
    return isRecord(this.value) ? this.value : undefined;
  }

  child(key: string): YamlNode {
    const rec = this.record;
    return new YamlNode(
      rec === undefined ? undefined : rec[key],
      `${this.path}.${key}`,
    );
  }

  has(key: string): boolean {
    const rec = this.record;
    return rec !== undefined && Object.prototype.hasOwnProperty.call(rec, key);
  }

  str(key: string): string | undefined {
    const value = this.child(key).value;
    return typeof value === "string" ? value : undefined;
  }

  bool(key: string): boolean {
    return this.child(key).value === true;
  }

  finiteNumber(key: string): number | undefined {
    const value = this.child(key).value;
    return isFiniteNumber(value) ? value : undefined;
  }

  finiteInt(key: string): number | undefined {
    const value = this.child(key).value;
    return isFiniteInt(value) ? value : undefined;
  }

  literal(key: string): YamlLiteral | undefined {
    const value = this.child(key).value;
    if (value === null) return null;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }
    return undefined;
  }

  strings(key: string): string[] {
    const value = this.child(key).value;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  items(): YamlNode[] {
    return Array.isArray(this.value)
      ? this.value.map(
          (item, index) => new YamlNode(item, `${this.path}[${index}]`),
        )
      : [];
  }

  namedItems(): Array<{ name: string; node: YamlNode }> {
    return this.items().flatMap((item) => {
      const rec = item.record;
      if (rec === undefined) return [];
      const name = Object.keys(rec)[0];
      if (name === undefined) return [];
      return [
        {
          name,
          node: new YamlNode(rec[name], `${item.path}.${name}`),
        },
      ];
    });
  }

  namedList(key: string): Array<{ name: string; node: YamlNode }> {
    return this.child(key).namedItems();
  }
}
