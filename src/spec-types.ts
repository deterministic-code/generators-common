import type {
  DatasourceTable,
  IDeterministic,
  ServiceByField,
  Type,
  TypeField,
} from "@deterministic-code/deterministic-specifications-typescript/parser";

export const TYPES_YAML = "types.yaml";
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

/** Nested eager collections (`address[]`) are view relations, not persisted columns. */
export const isCollectionField = (field: TypeField): boolean =>
  field.isArray && field.kind === "type";

export const columnFields = (fields: readonly TypeField[]): TypeField[] =>
  fields.filter((field) => !isCollectionField(field));

export const tableKind = (type: Type): string => {
  if (isManyToMany(type)) return "many-to-many";
  if (isReadonlyLookup(type)) return "readonly-lookup";
  return "standard";
};

type TypeKey = Pick<Type, "inherits" | "fields" | "ids">;

const markedIds = (type: TypeKey): string[] =>
  type.fields.filter((f) => f.isId === true).map((f) => f.name);

/** Ordered identity columns: `ids`, else `is_id`, else `is_fixed_id`, else injected `id`. */
export const identityColumns = (
  type?: TypeKey,
  table?: DatasourceTable,
): string[] => {
  if (type?.ids !== undefined && type.ids.length > 0) return [...type.ids];
  const marked = type !== undefined ? markedIds(type) : [];
  if (marked.length > 0) return marked;
  const fixed = table?.fields.find((f) => f.isFixedId);
  if (fixed) return [fixed.name];
  if (type?.inherits === "set" || type === undefined) return ["id"];
  return [];
};

export const primaryKeyColumn = (
  table: DatasourceTable | undefined,
  type?: TypeKey,
): string => identityColumns(type, table)[0] ?? "id";

export const pkName = (type: TypeKey, table?: DatasourceTable): string =>
  primaryKeyColumn(table, type);

export const isPkField = (
  field: TypeField,
  type: TypeKey,
  table?: DatasourceTable,
): boolean => identityColumns(type, table).includes(field.name);

export const uniqueLookupFields = (
  type: TypeKey,
  table?: DatasourceTable,
): ServiceByField[] => {
  const out: ServiceByField[] = [];
  const add = (name: string) => {
    if (out.some((e) => e.field === name)) return;
    const f = type.fields.find((x) => x.name === name);
    if (f !== undefined && isCollectionField(f)) return;
    out.push({
      field: name,
      type: typeof f?.type === "string" ? f.type : "string",
      ...(typeof f?.size === "number" ? { size: f.size } : {}),
    });
  };
  for (const name of identityColumns(type, table)) add(name);
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
