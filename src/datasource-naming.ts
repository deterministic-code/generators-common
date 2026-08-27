/// <reference path="./pluralize-module.d.ts" />
import { createCasingStrategy } from "./casing-strategy.ts";
import pluralize from "pluralize";

const SNAKE_STEM = /^[a-z_][a-z0-9_]*$/;
const lastTokenPluralize = (name: string): string =>
  name ? name.replace(/[^_]+$/, (token) => pluralize(token)) : name;

export type IDatasourceNaming = {
  isVerbatim: (mapping: string) => boolean
  physicalStem: (logicalOrMapping: string) => string
  tableName: (stem: string) => string
  columnName: (stem: string) => string
  resolveTable: (logical: string, mapping?: string) => string
  resolveColumn: (logical: string, mapping?: string) => string
};

/** Physical table/column names from `datasource.casing` + last-token pluralize. */
export const createDatasourceNaming = (
  settings: Record<string, string>,
): IDatasourceNaming => {
  const casing = createCasingStrategy("sql", settings, {
    prefix: "datasource.casing",
  });
  const pluralizeNames =
    String(settings["datasource.pluralize_datatable_names"]) !== "false";
  const isVerbatim = (mapping: string): boolean => !SNAKE_STEM.test(mapping);
  const tableName = (stem: string): string => casing.convertTypes(stem);
  const columnName = (stem: string): string => casing.convertFields(stem);
  const physicalStem = (name: string): string =>
    isVerbatim(name)
      ? name
      : pluralizeNames
        ? lastTokenPluralize(name)
        : name;
  const resolve = (
    convert: (stem: string) => string,
    logical: string,
    mapping?: string,
  ): string => {
    const stem = mapping ?? logical;
    return isVerbatim(stem) ? stem : convert(stem);
  };
  return {
    isVerbatim,
    physicalStem,
    tableName,
    columnName,
    resolveTable: (logical, mapping) =>
      resolve((stem) => tableName(physicalStem(stem)), logical, mapping),
    resolveColumn: (logical, mapping) => resolve(columnName, logical, mapping),
  };
};
