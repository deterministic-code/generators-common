/// <reference path="./pluralize-module.d.ts" />
import pluralize from "pluralize";

const lastToken = (name: string, convert: (token: string) => string): string =>
  name ? name.replace(/[^_]+$/, (token) => convert(token)) : name;

export class Pluralizer {
  singular = (name: string): string => lastToken(name, pluralize.singular);

  plural = (name: string): string => lastToken(name, pluralize.plural);
}
