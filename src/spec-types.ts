import type {
  DatasourceTable,
  IDeterministic,
  ServiceByField,
  Type,
  TypeField,
} from "@deterministic-code/deterministic-specifications-typescript/parser";

export const TYPES_YAML = "types.yaml";
export const DATASOURCE_YAML = "datasource.yaml";
export const DATASOURCE_SEEDS_YAML = "datasource_seeds.yaml";
export const SERVICES_YAML = "services.yaml";
export const ROUTES_YAML = "routes.yaml";

export const typeHasTag = (type: Type, tag: string): boolean =>
  type.tags.includes(tag);

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

type TypeKey = Pick<Type, "inherits" | "fields">;

export const primaryKeyColumn = (
  table: DatasourceTable | undefined,
  type?: Pick<Type, "inherits">,
): string => {
  const fixed = table?.fields.find((f) => f.isFixedId);
  if (fixed) return fixed.name;
  if (type?.inherits === "set") return "id";
  return "id";
};

export const pkName = (type: TypeKey, table?: DatasourceTable): string =>
  primaryKeyColumn(table, type);

export const isPkField = (
  field: TypeField,
  type: TypeKey,
  table?: DatasourceTable,
): boolean => field.name === primaryKeyColumn(table, type);

export const uniqueLookupFields = (
  type: TypeKey,
  table?: DatasourceTable,
): ServiceByField[] => {
  const out: ServiceByField[] = [];
  const add = (name: string) => {
    if (out.some((e) => e.field === name)) return;
    const f = type.fields.find((x) => x.name === name);
    out.push({
      field: name,
      type: typeof f?.type === "string" ? f.type : "string",
      ...(typeof f?.size === "number" ? { size: f.size } : {}),
    });
  };
  if (type.inherits === "set" || table?.fields.some((f) => f.isFixedId)) {
    add(primaryKeyColumn(table, type));
  }
  for (const overlay of table?.fields ?? []) {
    if (overlay.isUnique) add(overlay.name);
  }
  for (const name of table?.uniqueIndexFields ?? []) add(name);
  return out;
};

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
