/// <reference path="./pluralize-module.d.ts" />
import pluralize from "pluralize";
import { parse as parseYaml } from "yaml";
import type { GenerateContext } from "./generate-context.ts";
import {
  DeterministicParser,
  type CustomRouteEntry,
  type DatasourceTable,
  type NestedRouteDescriptor,
  type ParsedRoutes,
  type RouteByField,
  type RouteCandidate,
  type Type,
  type TypeField,
} from "@deterministic-code/deterministic-specifications-typescript/parser";
import { fromSettings, type ISettings, type OccTable } from "./settings.ts";
import { primaryKeyColumn, ROUTES_YAML, typeHasTag } from "./spec-types.ts";
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

const refString = (
  references: TypeField["references"],
): string | undefined =>
  typeof references === "string" ? references : undefined;

const pkTypeOf = (
  entity: string,
  types: Type[],
  tables: DatasourceTable[],
): string => {
  const type = types.find((d) => d.name === entity);
  const table = tables.find((d) => d.name === entity);
  const col = primaryKeyColumn(table, type);
  return type?.fields.find((f) => f.name === col)?.type ?? "integer";
};

const isReadonlyLookup = (type: Type | undefined): boolean =>
  type !== undefined && typeHasTag(type, "readonly_lookup");

const isManyToMany = (type: Type | undefined): boolean =>
  type !== undefined && typeHasTag(type, "many_to_many");

const isDatasourceType = (type: Type | undefined): boolean =>
  type !== undefined && typeHasTag(type, "datasource_type");

const occTable = (
  type: Type | undefined,
  table: DatasourceTable | undefined,
): { tags?: string[]; useOptimisticConcurrency?: boolean } => ({
  ...(type !== undefined ? { tags: type.tags } : {}),
  ...(table?.useOptimisticConcurrency !== undefined
    ? { useOptimisticConcurrency: table.useOptimisticConcurrency }
    : {}),
});

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

const fieldSchema = (
  field: TypeField,
  pkName: string | undefined,
): RoutesApiSchema => {
  const references = refString(field.references);
  let schema: RoutesApiSchema;
  if (
    field.name === pkName ||
    field.name === "id" ||
    references?.split(".")[1] === "id"
  ) {
    schema = idSchema(field.type);
  } else if (field.kind === "type") {
    const ref = schemaRef(field.base);
    schema = field.isArray ? { type: "array", items: ref } : ref;
  } else if (
    references !== undefined &&
    (field.type === "reference" || field.type === undefined)
  ) {
    schema = { type: "integer" };
  } else {
    const size = typeof field.size === "number" ? field.size : undefined;
    const inner = schemaForPrimitive(field.type, size);
    schema = field.isArray ? { type: "array", items: inner } : inner;
  }
  if (field.isNullable) schema = { ...schema, nullable: true };
  if (field.hasDefault) schema = { ...schema, default: field.defaultValue };
  if (references !== undefined && references.length > 0) {
    schema = { ...schema, "x-references": references };
  }
  return schema;
};

const fieldIsRequired = (field: TypeField): boolean =>
  field.isNullable !== true && field.hasDefault !== true;

const buildDtoSchema = (
  fields: TypeField[],
  write: boolean,
  pkName?: string,
): RoutesApiSchema => {
  const properties: Record<string, RoutesApiSchema> = {};
  const required: string[] = [];
  for (const field of fields) {
    properties[field.name] = fieldSchema(field, pkName);
    if (write ? fieldIsRequired(field) : !field.isNullable) {
      required.push(field.name);
    }
  }
  return write
    ? { type: "object", required, properties }
    : { type: "object", properties };
};

const unionMembers = (type: Type): string[] | undefined =>
  type.kind === "union"
    ? type.union
    : type.kind === "one_of"
      ? type.oneOf
      : undefined;

const buildComponents = (
  types: Type[],
  tables: DatasourceTable[],
): Record<string, RoutesApiSchema> => {
  const tableByName = new Map(tables.map((d) => [d.name, d] as const));
  const components: Record<string, RoutesApiSchema> = {};
  for (const type of types) {
    const members = unionMembers(type);
    if (members !== undefined) {
      components[type.name] = {
        oneOf: members.map((member) => schemaRef(member)),
      };
      continue;
    }
    const pkName = primaryKeyColumn(tableByName.get(type.name), type);
    const write =
      type.name.startsWith("update_") ||
      type.name.startsWith("create_") ||
      isEagerName(type.name);
    components[type.name] = buildDtoSchema(type.fields, write, pkName);
    if (isDatasourceType(type) && !isManyToMany(type)) {
      const updateName = `update_${type.name}`;
      if (components[updateName] === undefined) {
        components[updateName] = buildDtoSchema(type.fields, true, pkName);
      }
      if (pkName !== "id") {
        const createName = `create_${type.name}`;
        if (components[createName] === undefined) {
          components[createName] = buildDtoSchema(type.fields, true, pkName);
        }
      }
    }
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
  table: OccTable,
  settings: ISettings,
): { optimisticConcurrency: true } | Record<string, never> =>
  settings.usesOptimisticConcurrency(table)
    ? { optimisticConcurrency: true }
    : {};

const crudEntries = (
  candidate: RouteCandidate,
  args: {
    types: Type[];
    tables: DatasourceTable[];
    eager: Set<string>;
    components: Record<string, RoutesApiSchema>;
    settings: ISettings;
    collectionPath?: string;
    memberPath?: string;
  },
): RoutesApiRouteEntry[] => {
  const entity = candidate.name;
  const collection = args.collectionPath ?? `/api/${specPlural(entity)}`;
  const type = args.types.find((d) => d.name === entity);
  const table = args.tables.find((d) => d.name === entity);
  const column = primaryKeyColumn(table, type);
  const member = args.memberPath ?? `${collection}/{${column}}`;
  const readonly = isReadonlyLookup(type);
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
  const occ = occWrite(occTable(type, table), args.settings);
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
  types: Type[],
  tables: DatasourceTable[],
  settings: ISettings,
): { routes: RoutesApiRouteEntry[]; extra: Record<string, RoutesApiSchema> } => {
  const { collection, member } = nestedPaths(nested);
  const prefix = combinedPrefix(nested);
  if (nested.kind === "direct-fk") {
    const child = nested.child.name;
    const type = types.find((d) => d.name === child);
    const table = tables.find((d) => d.name === child);
    const occ = type === undefined ? {} : occWrite(occTable(type, table), settings);
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
          ...idSchema(pkTypeOf(nested.target, types, tables)),
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
    types: Type[];
    tables: DatasourceTable[];
    eager: Set<string>;
    components: Record<string, RoutesApiSchema>;
    settings: ISettings;
  },
): RoutesApiRouteEntry[] => {
  const type = args.types.find((d) => d.name === parent);
  if (type === undefined || isManyToMany(type) || !isDatasourceType(type)) {
    return [];
  }
  const memberPath = bracePath(parentRoute);
  const collectionPath = memberPath.replace(/\/\{[^}]+\}$/, "");
  if (collectionPath === memberPath) return [];
  return crudEntries(
    {
      name: parent,
      tags: type.tags,
      inherits: type.inherits,
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
  types: Type[];
  tables: DatasourceTable[];
  routesYaml: string;
  settings: ISettings;
}): RoutesApiDoc => {
  const components = buildComponents(args.types, args.tables);
  const eager = eagerRoots(args.routesYaml);
  const routedParents = combinedParentsWithRoute(args.routesYaml);
  const routes: RoutesApiRouteEntry[] = [];
  const typeByName = new Map(args.types.map((t) => [t.name, t] as const));
  const crudArgs = {
    types: args.types,
    tables: args.tables,
    eager,
    components,
    settings: args.settings,
  };

  for (const custom of args.parsed.customs) {
    const item = customEntry(custom, components);
    if (item !== null) routes.push(item);
  }

  for (const candidate of args.parsed.candidates) {
    const type = typeByName.get(candidate.name);
    if (!isDatasourceType(type) || isManyToMany(type)) continue;
    if (isEagerName(candidate.name)) continue;
    if (routedParents.has(candidate.name)) continue;
    routes.push(...crudEntries(candidate, crudArgs));
    const readonly = isReadonlyLookup(type);
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
      args.types,
      args.tables,
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
    types: spec.expandedTypes,
    tables: spec.datasource,
    routesYaml,
    settings: fromSettings(ctx.settings),
  });
};
