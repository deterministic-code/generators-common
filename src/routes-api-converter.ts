import pluralize from "pluralize";
import { parse as parseYaml } from "yaml";
import type { GenerateContext } from "./generate-context.ts";
import {
  ROUTES_YAML,
  type CustomRouteEntry,
  type DatasourceField,
  type ExpandedDatasourceType,
  type NestedRouteDescriptor,
  type ParsedRoutes,
  type RouteByField,
  type RouteCandidate,
  type ShapedView,
  type ViewField,
  type ViewType,
} from "./parser/specification.ts";
import { fromSettings, type ISettings } from "./settings.ts";
import { DeterministicParser } from "./parser/specification-parser.ts";
import {
  ROUTES_API_VERSION,
  type JsonValue,
  type RoutesApiBody,
  type RoutesApiDoc,
  type RoutesApiRouteDef,
  type RoutesApiRouteEntry,
  type RoutesApiSchema,
} from "./routes-api.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const namedEntries = (value: unknown): Array<[string, unknown]> =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        if (!isRecord(item)) return [];
        const name = Object.keys(item)[0];
        return name === undefined ? [] : [[name, item[name]]];
      })
    : [];

const BY_FIELD_METHODS = ["GET", "PUT", "DELETE"] as const;
const EAGER_SUFFIXES = [
  "_eager_body",
  "_eager_create_body",
  "_eager_patch_body",
  "_eager_row",
  "_eager_create_row",
] as const;
const REF_PREFIX = "#/components/schemas/";

const specName = (raw: string): string => raw.replace(/-/g, "_");

const specPlural = (name: string): string => {
  const parts = specName(name).split("_");
  parts[parts.length - 1] = pluralize.plural(parts[parts.length - 1]!);
  return parts.join("_");
};

const camelIdent = (name: string): string =>
  specName(name).replace(/_([a-z0-9])/gi, (_, ch: string) => ch.toUpperCase());

const pascalIdent = (name: string): string => {
  const camel = camelIdent(name);
  return camel.length === 0 ? camel : camel[0]!.toUpperCase() + camel.slice(1);
};

const pkTypeOf = (
  entity: string,
  datasources: ExpandedDatasourceType[],
): string => {
  const table = datasources.find((d) => d.name === entity);
  const col = table?.primaryKeyColumn ?? "id";
  return table?.fields.find((f) => f.name === col)?.type ?? "integer";
};

const bracePath = (path: string): string =>
  path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");
const TEMPLATE_SAMPLES: Record<string, JsonValue> = {
  datetime: "2026-01-01T00:00:00Z",
  uuid: "00000000-0000-0000-0000-000000000000",
  binary: "",
  boolean: false,
  integer: 0,
  biginteger: 0,
  smallinteger: 0,
  number: 0,
  float: 0,
};

const rec = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const isEagerName = (name: string): boolean =>
  EAGER_SUFFIXES.some((suffix) => name.endsWith(suffix));

const schemaRef = (name: string): { $ref: string } => ({
  $ref: `${REF_PREFIX}${name}`,
});

const idSchema = (idType: string): RoutesApiSchema => {
  if (idType === "uuid") return { type: "string", format: "uuid" };
  if (idType === "biginteger") return { type: "integer", format: "int64" };
  if (idType === "string") return { type: "string", maxLength: 64 };
  return { type: "integer" };
};

const schemaForPrimitive = (
  type: string,
  size?: number,
): RoutesApiSchema => {
  if (type === "string" || type === "character") {
    return size === undefined
      ? { type: "string" }
      : { type: "string", maxLength: size };
  }
  if (type === "decimal") return { type: "string" };
  if (type === "number") return { type: "number" };
  if (type === "integer" || type === "smallinteger") {
    return { type: "integer", format: "int32" };
  }
  if (type === "biginteger") return { type: "integer", format: "int64" };
  if (type === "float") return { type: "number", format: "float" };
  if (type === "boolean") return { type: "boolean" };
  if (type === "datetime") return { type: "string", format: "date-time" };
  if (type === "binary") return { type: "string", format: "byte" };
  if (type === "uuid") return { type: "string", format: "uuid" };
  if (type === "reference") return { type: "integer" };
  throw new Error(`Unknown datasource field type: ${type}`);
};

const converterTypeForSchema = (schema: RoutesApiSchema): string => {
  if (schema.format === "date-time") return "datetime";
  if (schema.format === "byte") return "binary";
  if (schema.format === "uuid") return "uuid";
  if (schema.format === "int32") return "integer";
  if (schema.format === "int64") return "biginteger";
  if (schema.format === "float") return "float";
  if (schema.type === "integer") return "integer";
  if (schema.type === "number") return "number";
  if (schema.type === "boolean") return "boolean";
  return "string";
};

const datasourceFieldSchema = (field: DatasourceField): RoutesApiSchema => {
  let schema: RoutesApiSchema;
  if (
    field.isPrimaryKey === true ||
    field.name === "id" ||
    field.references?.split(".")[1] === "id"
  ) {
    schema = idSchema(field.type);
  } else if (
    field.references !== undefined &&
    (field.type === "reference" || field.type === undefined)
  ) {
    schema = { type: "integer" };
  } else {
    schema = schemaForPrimitive(field.type, field.size);
  }
  if (field.isNullable) schema = { ...schema, nullable: true };
  if (field.hasDefault) schema = { ...schema, default: field.defaultValue };
  if (field.references !== undefined && field.references.length > 0) {
    schema = { ...schema, "x-references": field.references };
  }
  return schema;
};

const viewFieldSchema = (field: ViewField): RoutesApiSchema => {
  if (field.kind === "primitive") {
    const inner = schemaForPrimitive(field.base, field.size);
    if (field.isArray) return { type: "array", items: inner };
    return field.isNullable ? { ...inner, nullable: true } : inner;
  }
  const ref = schemaRef(field.base);
  return field.isArray ? { type: "array", items: ref } : ref;
};

const fieldIsRequired = (field: DatasourceField): boolean =>
  field.isNullable !== true && field.hasDefault !== true;

const omitForView = (
  view: ShapedView,
  dsType: ExpandedDatasourceType | undefined,
): Set<string> => {
  const omit = new Set(view.omit);
  if (dsType?.datasourceType === "readonly-lookup") {
    omit.add("uuid");
    omit.add("created");
    omit.add("updated");
  }
  if (dsType?.fields.some((f) => f.isPrimaryKey === true && f.name !== "id")) {
    const declared = new Set(dsType.fields.map((f) => f.name));
    for (const name of ["id", "uuid", "created", "updated"]) {
      if (!declared.has(name)) omit.add(name);
    }
  }
  return omit;
};

const buildInheritedSchema = (
  view: ShapedView,
  dsType: ExpandedDatasourceType,
): RoutesApiSchema => {
  const omit = omitForView(view, dsType);
  const write =
    view.name.startsWith("update_") ||
    view.name.startsWith("create_") ||
    isEagerName(view.name);
  const properties: Record<string, RoutesApiSchema> = {};
  const required: string[] = [];
  for (const field of dsType.fields) {
    if (omit.has(field.name)) continue;
    properties[field.name] = datasourceFieldSchema(field);
    if (write && fieldIsRequired(field)) {
      required.push(field.name);
    }
  }
  for (const field of view.fields) {
    properties[field.name] = viewFieldSchema(field);
    if (write && !field.isNullable) required.push(field.name);
  }
  for (const enrichment of view.enrichments) {
    const named: RoutesApiSchema = {
      type: "string",
      "x-references": `${enrichment.targetTable}.name`,
    };
    properties[enrichment.newField] = enrichment.isNullable
      ? { ...named, nullable: true }
      : named;
  }
  return write
    ? { type: "object", required, properties }
    : { type: "object", properties };
};

const buildDtoSchema = (fields: ViewField[]): RoutesApiSchema => {
  const properties: Record<string, RoutesApiSchema> = {};
  const required: string[] = [];
  for (const field of fields) {
    properties[field.name] = viewFieldSchema(field);
    if (!field.isNullable) required.push(field.name);
  }
  return { type: "object", required, properties };
};

const buildComponents = (
  views: ViewType[],
  datasources: ExpandedDatasourceType[],
): Record<string, RoutesApiSchema> => {
  const dsByName = new Map(datasources.map((d) => [d.name, d] as const));
  const components: Record<string, RoutesApiSchema> = {};
  for (const view of views) {
    if (view.kind === "union") {
      components[view.name] = {
        oneOf: view.members.map((member) => schemaRef(member)),
      };
      continue;
    }
    const parent = view.inherits !== null ? dsByName.get(view.inherits) : undefined;
    components[view.name] =
      parent === undefined
        ? buildDtoSchema(view.fields)
        : buildInheritedSchema(view, parent);
  }
  return components;
};

const walkSchema = (
  schema: RoutesApiSchema,
  components: Record<string, RoutesApiSchema>,
  stack: string[],
  depth: number,
): JsonValue => {
  if (depth > 32) return null;
  if (typeof schema.$ref === "string") {
    if (!schema.$ref.startsWith(REF_PREFIX)) return null;
    const name = schema.$ref.slice(REF_PREFIX.length);
    const seen = stack.filter((prior) => prior === name).length;
    if (seen > 1) return name;
    const target = components[name];
    return target === undefined
      ? name
      : walkSchema(target, components, [...stack, name], depth + 1);
  }
  if (schema.oneOf !== undefined && schema.oneOf.length > 0) {
    return walkSchema(schema.oneOf[0]!, components, stack, depth);
  }
  if (schema.type === "array") {
    return [
      walkSchema(schema.items ?? {}, components, stack, depth + 1),
    ];
  }
  if (schema.type === "object" || schema.properties !== undefined) {
    const out: Record<string, JsonValue> = {};
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      out[key] = walkSchema(sub, components, stack, depth + 1);
    }
    return out;
  }
  return TEMPLATE_SAMPLES[converterTypeForSchema(schema)] ?? "string";
};

const resolveBody = (
  name: string | undefined,
  components: Record<string, RoutesApiSchema>,
): RoutesApiBody | undefined => {
  if (name === undefined || name.length === 0) return undefined;
  if (components[name] === undefined) {
    return { name, schema: null, example: null };
  }
  const schema = schemaRef(name);
  return {
    name,
    schema,
    example: walkSchema(schema, components, [], 0),
  };
};

const entry = (
  name: string,
  def: Omit<RoutesApiRouteDef, "request" | "response"> & {
    request?: string;
    response?: string;
  },
  components: Record<string, RoutesApiSchema>,
): RoutesApiRouteEntry => {
  const request = resolveBody(def.request, components);
  const response = resolveBody(def.response, components);
  const out: RoutesApiRouteDef = {
    path: def.path,
    method: def.method,
    entity: def.entity,
    isCustom: def.isCustom,
  };
  if (request !== undefined) out.request = request;
  if (response !== undefined) out.response = response;
  if (def.byField !== undefined) out.byField = def.byField;
  if (def.byFieldUnique !== undefined) out.byFieldUnique = def.byFieldUnique;
  if (def.primaryKeyField !== undefined) out.primaryKeyField = def.primaryKeyField;
  if (def.optimisticConcurrency === true) out.optimisticConcurrency = true;
  return { [name]: out };
};

const occWrite = (
  table: { datasourceType?: string | null; optimisticConcurrency?: boolean },
  settings: ISettings,
): { optimisticConcurrency: true } | Record<string, never> =>
  settings.usesOptimisticConcurrency(table)
    ? { optimisticConcurrency: true }
    : {};

const crudEntries = (
  candidate: RouteCandidate,
  args: {
    datasources: ExpandedDatasourceType[];
    eager: Set<string>;
    components: Record<string, RoutesApiSchema>;
    settings: ISettings;
    collectionPath?: string;
    memberPath?: string;
  },
): RoutesApiRouteEntry[] => {
  const entity = candidate.name;
  const collection = args.collectionPath ?? `/api/${specPlural(entity)}`;
  const table = args.datasources.find((d) => d.name === entity);
  const column = table?.primaryKeyColumn ?? "id";
  const member = args.memberPath ?? `${collection}/{${column}}`;
  const readonly = candidate.datasourceType === "readonly-lookup";
  const eager = args.eager.has(entity);
  const post = eager
    ? `${entity}_eager_create_body`
    : column !== "id"
      ? `create_${entity}`
      : `update_${entity}`;
  const put = eager ? `${entity}_eager_body` : `update_${entity}`;
  const patch = eager ? `${entity}_eager_patch_body` : `update_${entity}`;
  const camel = camelIdent(entity);
  const meta = {
    entity,
    isCustom: false,
    primaryKeyField: column === "id" ? null : column,
  };
  const occ = occWrite(candidate, args.settings);
  const { components } = args;
  const routes = [
    entry(
      `${camel}List`,
      { path: collection, method: "GET", response: entity, ...meta },
      components,
    ),
    entry(
      `${camel}Get`,
      { path: member, method: "GET", response: entity, ...meta },
      components,
    ),
  ];
  if (readonly) return routes;
  return [
    ...routes,
    entry(
      `${camel}Create`,
      {
        path: collection,
        method: "POST",
        request: post,
        response: entity,
        ...meta,
      },
      components,
    ),
    entry(
      `${camel}Update`,
      {
        path: member,
        method: "PUT",
        request: put,
        response: entity,
        ...meta,
        ...occ,
      },
      components,
    ),
    entry(
      `${camel}Patch`,
      {
        path: member,
        method: "PATCH",
        request: patch,
        response: entity,
        ...meta,
        ...occ,
      },
      components,
    ),
    entry(
      `${camel}Delete`,
      { path: member, method: "DELETE", ...meta, ...occ },
      components,
    ),
  ];
};

const byFieldEntries = (
  entity: string,
  field: RouteByField,
  readonly: boolean,
  components: Record<string, RoutesApiSchema>,
): RoutesApiRouteEntry[] => {
  const methods = (field.methods ?? [...BY_FIELD_METHODS]).filter((method) =>
    readonly ? method === "GET" : true,
  );
  const collection = `/api/${specPlural(entity)}/${field.byField}`;
  const member = `${collection}/{${field.byField}}`;
  const camel = camelIdent(entity);
  const byPascal = pascalIdent(field.byField);
  const meta = {
    entity,
    isCustom: false,
    byField: field.byField,
    byFieldUnique: field.byFieldUnique,
    response: entity,
  };
  const out: RoutesApiRouteEntry[] = [];
  if (methods.includes("GET")) {
    out.push(
      entry(`${camel}GetBy${byPascal}`, { path: member, method: "GET", ...meta }, components),
    );
  }
  if (methods.includes("PUT")) {
    out.push(
      entry(
        `${camel}UpdateBy${byPascal}`,
        { path: member, method: "PUT", request: `update_${entity}`, ...meta },
        components,
      ),
    );
  }
  if (methods.includes("DELETE")) {
    out.push(
      entry(
        `${camel}DeleteBy${byPascal}`,
        {
          path: member,
          method: "DELETE",
          entity,
          isCustom: false,
          byField: field.byField,
          byFieldUnique: field.byFieldUnique,
        },
        components,
      ),
    );
  }
  return out;
};

const customEntry = (
  custom: CustomRouteEntry,
  components: Record<string, RoutesApiSchema>,
): RoutesApiRouteEntry | null => {
  if (custom.path === undefined || custom.method === undefined) {
    return null;
  }
  return entry(
    custom.name,
    {
      path: bracePath(custom.path),
      method: custom.method,
      entity: custom.entity,
      isCustom: true,
      request: custom.request,
      response: custom.response,
    },
    components,
  );
};

const nestedPaths = (
  nested: NestedRouteDescriptor,
): { collection: string; member: string } => {
  const collection = bracePath(`${nested.parentBasePath}${nested.segment}`);
  return {
    collection,
    member:
      nested.kind === "m2m"
        ? `${collection}/{${nested.targetParam}}`
        : `${collection}/{id}`,
  };
};

const combinedPrefix = (nested: NestedRouteDescriptor): string =>
  camelIdent(nested.parent) + pascalIdent(specName(nested.segmentTail));

const combinedEntries = (
  nested: NestedRouteDescriptor,
  components: Record<string, RoutesApiSchema>,
  datasources: ExpandedDatasourceType[],
  settings: ISettings,
): { routes: RoutesApiRouteEntry[]; extra: Record<string, RoutesApiSchema> } => {
  const { collection, member } = nestedPaths(nested);
  const prefix = combinedPrefix(nested);
  if (nested.kind === "direct-fk") {
    const child = nested.child.name;
    const table = datasources.find((d) => d.name === child);
    const occ = table === undefined ? {} : occWrite(table, settings);
    const meta = { entity: child, isCustom: false };
    return {
      extra: {},
      routes: [
        entry(`${prefix}List`, { path: collection, method: "GET", response: child, ...meta }, components),
        entry(`${prefix}Create`, { path: collection, method: "POST", request: `update_${child}`, response: child, ...meta }, components),
        entry(`${prefix}Update`, { path: member, method: "PUT", request: `update_${child}`, response: child, ...meta, ...occ }, components),
        entry(`${prefix}Delete`, { path: member, method: "DELETE", ...meta, ...occ }, components),
      ],
    };
  }
  const target = nested.target;
  const linkName = `link_${nested.junction}`;
  const extra: Record<string, RoutesApiSchema> = {
    [linkName]: {
      type: "object",
      required: [nested.childFkField],
      properties: {
        [nested.childFkField]: {
          ...idSchema(pkTypeOf(nested.target, datasources)),
          "x-references": `${nested.target}.id`,
        },
      },
    },
  };
  const merged = { ...components, ...extra };
  const meta = { entity: target, isCustom: false };
  return {
    extra,
    routes: [
      entry(`${prefix}List`, { path: collection, method: "GET", response: target, ...meta }, merged),
      entry(`${prefix}LinkByBody`, { path: collection, method: "POST", request: linkName, response: target, ...meta }, merged),
      entry(`${prefix}Get`, { path: member, method: "GET", response: target, ...meta }, merged),
      entry(`${prefix}Link`, { path: member, method: "POST", response: target, ...meta }, merged),
      entry(`${prefix}Unlink`, { path: member, method: "DELETE", ...meta }, merged),
    ],
  };
};

const parentCrudEntries = (
  parent: string,
  parentRoute: string,
  args: {
    datasources: ExpandedDatasourceType[];
    eager: Set<string>;
    components: Record<string, RoutesApiSchema>;
    settings: ISettings;
  },
): RoutesApiRouteEntry[] => {
  const ds = args.datasources.find((d) => d.name === parent);
  if (ds === undefined || ds.datasourceType === "many-to-many") return [];
  const memberPath = bracePath(parentRoute);
  const collectionPath = memberPath.replace(/\/\{[^}]+\}$/, "");
  if (collectionPath === memberPath) return [];
  return crudEntries(
    {
      name: parent,
      kind: "datasource_type",
      inheritsNamespace: "datasource_types",
      datasourceType: ds.datasourceType,
      target: ds.target ?? null,
      byFields: [],
    },
    { ...args, collectionPath, memberPath },
  );
};

const eagerRoots = (routesYaml: string): Set<string> => {
  const out = new Set<string>();
  for (const [, block] of namedEntries(rec(parseYaml(routesYaml)).includes)) {
    const paths = rec(block).eager_write_path;
    if (!Array.isArray(paths)) continue;
    for (const path of paths) {
      const root = String(path).split(".")[0];
      if (root !== undefined && root.length > 0) out.add(root);
    }
  }
  return out;
};

const combinedParentsWithRoute = (routesYaml: string): Map<string, string> => {
  const out = new Map<string, string>();
  for (const [name, body] of namedEntries(rec(parseYaml(routesYaml)).combined_routes)) {
    const route = rec(body).route;
    if (typeof route === "string") out.set(name, route);
  }
  return out;
};

const parseRoutesApi = (args: {
  parsed: ParsedRoutes;
  views: ViewType[];
  datasources: ExpandedDatasourceType[];
  routesYaml: string;
  settings: ISettings;
}): RoutesApiDoc => {
  const components = buildComponents(args.views, args.datasources);
  const eager = eagerRoots(args.routesYaml);
  const routedParents = combinedParentsWithRoute(args.routesYaml);
  const routes: RoutesApiRouteEntry[] = [];
  const crudArgs = {
    datasources: args.datasources,
    eager,
    components,
    settings: args.settings,
  };

  for (const custom of args.parsed.customs) {
    const item = customEntry(custom, components);
    if (item !== null) routes.push(item);
  }

  for (const candidate of args.parsed.candidates) {
    if (candidate.kind !== "datasource_type") continue;
    if (isEagerName(candidate.name)) continue;
    if (routedParents.has(candidate.name)) continue;
    routes.push(...crudEntries(candidate, crudArgs));
    const readonly = candidate.datasourceType === "readonly-lookup";
    for (const field of candidate.byFields) {
      routes.push(...byFieldEntries(candidate.name, field, readonly, components));
    }
  }

  for (const [parent, route] of routedParents) {
    routes.push(...parentCrudEntries(parent, route, crudArgs));
  }

  for (const nested of args.parsed.nested) {
    const { routes: items, extra } = combinedEntries(
      nested,
      components,
      args.datasources,
      args.settings,
    );
    Object.assign(components, extra);
    routes.push(...items);
  }

  return { version: ROUTES_API_VERSION, routes, components };
};

/** Expand authored YAML into the routes-api IR (snake paths, `{param}`). */
export const loadRoutesApi = async (
  ctx: GenerateContext,
): Promise<RoutesApiDoc> => {
  const [spec, routesYaml] = await Promise.all([
    DeterministicParser(ctx.reader).parse(ctx.settings),
    ctx.reader.read(ROUTES_YAML),
  ]);
  return parseRoutesApi({
    parsed: spec.routes,
    views: spec.viewTypes,
    datasources: spec.expandedDatasourceTypes,
    routesYaml,
    settings: fromSettings(ctx.settings),
  });
};
