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

export const isDictionaryType = (type: Type | undefined): boolean =>
  type?.inherits === "dictionary";

export const viewTypesOf = (spec: IDeterministic): Type[] =>
  typesWithTag(spec.expandedTypes, "view_type").filter(
    (type) => !isDictionaryType(type),
  );

export const authoredViewTypesOf = (spec: IDeterministic): Type[] =>
  typesWithTag(spec.types, "view_type").filter((type) => !isDictionaryType(type));

export const isManyToMany = (type: Type): boolean =>
  typeHasTag(type, "many_to_many");

export const isReadonlyLookup = (type: Type): boolean =>
  typeHasTag(type, "readonly_lookup");

/** Nested eager collections (`address[]`, `settings{}`) are view relations, not persisted columns. */
export const isCollectionField = (field: TypeField): boolean =>
  field.kind === "type" && (field.isArray || field.isMap === true);

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

const referenceTarget = (
  references: NonNullable<TypeField["references"]>,
): [string, string] => {
  if (Array.isArray(references)) return [references[0], references[1]];
  const [table, col] = references.split(".");
  return [table ?? "", col ?? ""];
};

/** Walk `references` to the parent field type; collections keep `[]` / `{}`. */
export const fieldTypeOf = (
  field: TypeField,
  typesByName: ReadonlyMap<string, Type>,
  seen: Set<string> = new Set(),
): string => {
  if (field.type.endsWith("[]") || field.type.endsWith("{}")) {
    return field.type;
  }
  if (field.references !== undefined) {
    const [logicalTable, logicalCol] = referenceTarget(field.references);
    const key = `${logicalTable}.${logicalCol}`;
    if (!seen.has(key)) {
      seen.add(key);
      const parent = typesByName
        .get(logicalTable)
        ?.fields.find((item) => item.name === logicalCol);
      if (parent !== undefined) return fieldTypeOf(parent, typesByName, seen);
    }
  }
  return field.type || "string";
};

const splitDot = (value: string): [string, string] | undefined => {
  const i = value.indexOf(".");
  return i === -1 ? undefined : [value.slice(0, i), value.slice(i + 1)];
};

const identityNamesOf = (
  type: Type | undefined,
  byName: Map<string, Type>,
  stack: Set<string> = new Set(),
): Set<string> => {
  if (!type) return new Set();
  if (stack.has(type.name)) return new Set();
  const local = identityColumns(type);
  if (local.length > 0) return new Set(local);
  if (type.inherits && type.inherits !== "dictionary") {
    stack.add(type.name);
    return identityNamesOf(byName.get(type.inherits), byName, stack);
  }
  return new Set();
};

export const isOwnerIdentityRef = (
  references: TypeField["references"],
  selfName: string,
  byName: Map<string, Type>,
): boolean => {
  if (references === undefined) return false;
  const parts = (Array.isArray(references) ? references : [references]).map(
    (ref) => {
      const split = splitDot(ref);
      return split ? { type: split[0], field: split[1] } : { type: "", field: ref };
    },
  );
  const owner = parts[0]!.type;
  if (!owner || owner === selfName) return false;
  const identity = identityNamesOf(byName.get(owner), byName);
  return parts.every((p) => p.type === owner && identity.has(p.field));
};

export const dictionaryEntryFields = (
  dict: Type,
): { key: TypeField; value: TypeField } | undefined => {
  const key = dict.fields.find((f) => f.name === "key");
  const value = dict.fields.find((f) => f.name === "value");
  if (key === undefined || value === undefined) return undefined;
  return { key, value };
};

export const dictionaryOfField = (
  field: TypeField,
  byName: Map<string, Type>,
): Type | undefined => {
  if (field.isMap !== true) return undefined;
  const dict = byName.get(field.base);
  return isDictionaryType(dict) ? dict : undefined;
};

export const persistedColumnFields = (
  type: Type,
  byName: Map<string, Type>,
): TypeField[] => {
  if (!isDictionaryType(type)) return columnFields(type.fields);
  const value = type.fields.find((f) => f.name === "value");
  if (
    value === undefined ||
    value.kind !== "type" ||
    value.isArray ||
    value.isMap === true
  ) {
    return columnFields(type.fields);
  }
  const nested = byName.get(value.base);
  if (nested === undefined) return columnFields(type.fields);
  return [
    ...columnFields(type.fields.filter((f) => f.name !== "value")),
    ...columnFields(nested.fields),
  ];
};

export const dictionaryUniqueColumns = (
  type: Type,
  byName: Map<string, Type>,
): string[] => {
  if (!isDictionaryType(type)) return [];
  const owners = type.fields
    .filter((f) => isOwnerIdentityRef(f.references, type.name, byName))
    .map((f) => f.name);
  return type.fields.some((f) => f.name === "key") ? [...owners, "key"] : owners;
};
