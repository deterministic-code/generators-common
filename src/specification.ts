export const DATASOURCE_TYPES_YAML = "datasource_types.yaml";
export const VIEW_TYPES_YAML = "view_types.yaml";
export const SERVICES_YAML = "services.yaml";
export const ROUTES_YAML = "routes.yaml";

export type DatasourceField = {
  name: string;
  type: string;
  isNullable: boolean;
  references?: string;
  isPrimaryKey?: boolean;
  isUnique?: boolean;
  minSize?: number;
  size?: number;
  /** Present when the YAML author set `default_value` (including `null`). */
  hasDefault?: boolean;
  defaultValue?: string | number | boolean | null;
};

export type DatasourceType = {
  name: string;
  datasourceType: string;
  fields: DatasourceField[];
  /** Single-column unique index field names (from `indexes:`). */
  uniqueIndexFields: string[];
  target?: string | null;
  optimisticConcurrency?: boolean;
};

export type PrimaryKey = { column: string; idType: string };

export type ViewFieldKind = "primitive" | "datasource" | "view";

export type ViewField = {
  name: string;
  type: string;
  kind: ViewFieldKind;
  base: string;
  isArray: boolean;
  isNullable: boolean;
  size?: number;
  minSize?: number;
};

export type ViewEnrichment = {
  fkColumn: string;
  prefix: string;
  targetTable: string;
  newField: string;
  targetIsReadonlyLookup: boolean;
  isNullable: boolean;
};

export type ShapedView = {
  kind: "shaped";
  name: string;
  inherits: string | null;
  fields: ViewField[];
  enrichments: ViewEnrichment[];
  omit: string[];
};

export type UnionView = {
  kind: "union";
  name: string;
  members: string[];
};

export type ViewType = ShapedView | UnionView;

export type ServiceByField = {
  field: string;
  type: string;
  size?: number;
};

export type ServiceCandidate = {
  name: string;
  kind: "datasource_type" | "view_type";
  inheritsNamespace: string;
  datasourceType: string | null;
  byFields: ServiceByField[];
};

export type CustomServiceEntry = {
  name: string;
  module?: string;
  methods: string[];
};

export type ParsedServices = {
  generics: ServiceCandidate[];
  customs: CustomServiceEntry[];
};

export type RouteByField = {
  byField: string;
  methods?: string[];
  byFieldUnique: boolean;
};

export type RouteCandidate = {
  name: string;
  kind: "datasource_type" | "view_type";
  inheritsNamespace: string;
  datasourceType: string;
  target: string | null;
  optimisticConcurrency?: boolean;
  byFields: RouteByField[];
};

export type CustomRouteEntry = {
  /** Original single-key route map entry, e.g. { getHealth: { ... } } */
  entry: Record<string, unknown>;
  name: string;
};

export type DirectFkDescriptor = {
  kind: "direct-fk";
  parent: string;
  parentParam: string;
  parentBasePath: string;
  child: { name: string };
  fkColumn: string;
  segment: string;
  segmentTail: string;
};

export type M2mDescriptor = {
  kind: "m2m";
  parent: string;
  parentParam: string;
  parentBasePath: string;
  junction: string;
  target: string;
  targetParam: string;
  parentFkField: string;
  childFkField: string;
  segment: string;
  segmentTail: string;
};

export type NestedRouteDescriptor = DirectFkDescriptor | M2mDescriptor;

export type ParsedRoutes = {
  candidates: RouteCandidate[];
  customs: CustomRouteEntry[];
  nested: NestedRouteDescriptor[];
  childrenOnly: Set<string>;
  datasources: DatasourceType[];
};

export type Specification = {
  datasources: DatasourceType[];
  views: ViewType[];
  services: ParsedServices;
  routes: ParsedRoutes;
};

const PRIMITIVES = new Set([
  "string",
  "character",
  "number",
  "integer",
  "smallinteger",
  "biginteger",
  "float",
  "decimal",
  "boolean",
  "datetime",
  "binary",
  "uuid",
  "reference",
]);
const DS_PREFIX = "datasource_types.";

export const parseFieldType = (
  raw: string,
): { kind: ViewFieldKind; base: string; isArray: boolean } => {
  const isArray = raw.endsWith("[]");
  const base = isArray ? raw.slice(0, -2) : raw;
  if (PRIMITIVES.has(base)) return { kind: "primitive", base, isArray };
  if (base.startsWith(DS_PREFIX)) {
    return { kind: "datasource", base: base.slice(DS_PREFIX.length), isArray };
  }
  return { kind: "view", base, isArray };
};

const idTypeFromFieldType = (fieldType: string): string => {
  if (
    fieldType === "string" ||
    fieldType === "uuid" ||
    fieldType === "biginteger"
  ) {
    return fieldType;
  }
  return "integer";
};

/** First non-`id` `primary_key` field, else the project `id` / `idType`. */
export const primaryKeyFor = (
  entity: string,
  datasources: DatasourceType[],
  defaultIdType: string,
): PrimaryKey => {
  const table = datasources.find((d) => d.name === entity);
  const custom = table?.fields.find((f) => f.isPrimaryKey && f.name !== "id");
  if (custom === undefined) return { column: "id", idType: defaultIdType };
  return { column: custom.name, idType: idTypeFromFieldType(custom.type) };
};

/** Unique lookup columns: `is_unique` fields plus single-column unique indexes. */
export const uniqueLookupFields = (
  type: DatasourceType,
): ServiceByField[] => {
  const out: ServiceByField[] = [];
  const add = (name: string) => {
    if (out.some((e) => e.field === name)) return;
    const f = type.fields.find((x) => x.name === name);
    out.push({
      field: name,
      type: f?.type ?? "string",
      ...(f?.size !== undefined ? { size: f.size } : {}),
    });
  };
  for (const f of type.fields) {
    if (f.isUnique) add(f.name);
  }
  for (const name of type.uniqueIndexFields) add(name);
  return out;
};

const ID_FIELD_TYPE: Record<string, string> = {
  integer: "number",
  biginteger: "biginteger",
  uuid: "uuid",
  string: "string",
};

/** Spec type a type-less `references: X.id` inherits from `datasource.id_type`. */
export const inheritedIdType = (idType: string): string =>
  ID_FIELD_TYPE[idType] ?? "number";

export type SystemColumn = {
  name: string;
  type: string;
  isNullable: boolean;
};

export const systemColumns = (idType: string): SystemColumn[] => [
  { name: "id", type: inheritedIdType(idType), isNullable: false },
  ...(idType !== "uuid"
    ? [{ name: "uuid", type: "uuid", isNullable: false }]
    : []),
  { name: "created", type: "datetime", isNullable: false },
  { name: "updated", type: "datetime", isNullable: false },
];

export const declaredFields = <T extends { name: string }>(
  fields: T[],
  idType: string,
): T[] => (idType === "uuid" ? fields.filter((f) => f.name !== "uuid") : fields);

export const tableFields = <T extends { name: string }>(
  fields: T[],
  idType: string,
): Array<T | SystemColumn> => {
  const injected = systemColumns(idType);
  const seen = new Set(injected.map((f) => f.name));
  return [
    ...injected,
    ...declaredFields(fields, idType).filter((f) => !seen.has(f.name)),
  ];
};

export const entityUsesOptimisticConcurrency = (
  table: { datasourceType?: string | null; optimisticConcurrency?: boolean },
  globalFlag: boolean,
): boolean => {
  if (table.datasourceType === "many-to-many") return false;
  if (table.datasourceType === "readonly-lookup") return false;
  if (table.optimisticConcurrency !== undefined) {
    return table.optimisticConcurrency;
  }
  return globalFlag === true;
};

type OccDatasourceDoc = {
  types?: Array<
    Record<
      string,
      {
        datasource_type?: string | null;
        use_optimistic_concurrency?: boolean;
      }
    >
  >;
};

/** entityName → effective OCC from a raw datasource_types doc. */
export const optimisticConcurrencyByEntity = (
  data: OccDatasourceDoc | null | undefined,
  globalFlag: boolean,
): Map<string, boolean> => {
  const out = new Map<string, boolean>();
  const types = Array.isArray(data?.types) ? data.types : [];
  for (const entry of types) {
    const pair = Object.entries(entry)[0];
    if (!pair) continue;
    const [name, def] = pair;
    out.set(
      name,
      entityUsesOptimisticConcurrency(
        {
          datasourceType: def?.datasource_type,
          optimisticConcurrency:
            def?.use_optimistic_concurrency === undefined
              ? undefined
              : def.use_optimistic_concurrency === true,
        },
        globalFlag,
      ),
    );
  }
  return out;
};
