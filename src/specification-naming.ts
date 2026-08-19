import { snakeCase } from "change-case";
import pluralize from "pluralize";

/** Language-specific route/entity naming used while parsing YAML. */
export type SpecificationNaming = {
  pluralPath: (snakeName: string) => string;
  paramName: (snakeName: string) => string;
  entityName: (raw: string) => string;
  byField: (field: string) => string;
};

const snakeToCamel = (name: string): string =>
  name
    .split(/[_-]/)
    .map((part, i) =>
      i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");

const pluralLast = (name: string, sep: "_" | "-"): string => {
  const parts = name.split(sep);
  parts[parts.length - 1] = pluralize.plural(parts[parts.length - 1]!);
  return parts.join(sep);
};

export const typescriptNaming: SpecificationNaming = {
  pluralPath: (name) => pluralLast(name, "_"),
  paramName: (name) => `${name}Id`,
  entityName: (raw) => raw,
  byField: (field) => field,
};

export const rustNaming: SpecificationNaming = {
  pluralPath: (name) => pluralLast(name.replace(/_/g, "-"), "-"),
  paramName: (name) => `${snakeToCamel(name)}Id`,
  entityName: (raw) => raw.replace(/-/g, "_"),
  byField: (field) => snakeCase(field),
};

export const csharpNaming: SpecificationNaming = rustNaming;
