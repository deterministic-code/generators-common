import {
  primaryKeyColumn,
  typeHasTag,
  type DatasourceTable,
  type IDeterministic,
  type Type,
  type TypeField,
} from "@deterministic-code/deterministic-specifications-typescript/parser";

export const typesWithTag = (types: readonly Type[], tag: string): Type[] =>
  types.filter((type) => typeHasTag(type, tag));

export const datasourceTypesOf = (spec: IDeterministic): Type[] =>
  typesWithTag(spec.expandedTypes, "datasource_type");

export const viewTypesOf = (spec: IDeterministic): Type[] =>
  typesWithTag(spec.expandedTypes, "view_type");

export const authoredViewTypesOf = (spec: IDeterministic): Type[] =>
  typesWithTag(spec.types, "view_type");

export const isManyToMany = (type: Type): boolean =>
  typeHasTag(type, "many_to_many");

export const isReadonlyLookup = (type: Type): boolean =>
  typeHasTag(type, "readonly_lookup");

export const tableKind = (type: Type): string => {
  if (isManyToMany(type)) return "many-to-many";
  if (isReadonlyLookup(type)) return "readonly-lookup";
  return "standard";
};

export const pkName = (type: Type, table?: DatasourceTable): string =>
  primaryKeyColumn(table, type);

export const isPkField = (
  field: TypeField,
  type: Type,
  table?: DatasourceTable,
): boolean => field.name === primaryKeyColumn(table, type);

export const tableByName = (
  spec: IDeterministic,
): Map<string, DatasourceTable> =>
  new Map(spec.datasource.map((table) => [table.name, table]));

export const unionMembers = (type: Type): string[] | undefined =>
  type.kind === "union"
    ? type.union
    : type.kind === "one_of"
      ? type.oneOf
      : undefined;
