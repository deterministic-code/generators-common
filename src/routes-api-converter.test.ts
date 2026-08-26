import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "./deterministic-reader.ts";
import { loadRoutesApi } from "./routes-api-converter.ts";

const crudRoutes = `includes:
  - types:
      filter: tag == "view_type"
routes: []
`;

const datasourceInclude = `includes:
  - types:
      filter: tag == "datasource_type"
types: []
`;

const routeOf = (
  routes: Array<Record<string, unknown>>,
  name: string,
): Record<string, unknown> => {
  const hit = routes.find((entry) => name in entry);
  assert.ok(hit, `missing route ${name}`);
  return hit[name] as Record<string, unknown>;
};

describe("loadRoutesApi", () => {
  it("expands simple CRUD onto snake collection and {id} member paths", async () => {
    const doc = await loadRoutesApi({
      reader: memoryReader({
        "types.yaml": `types:
  - user:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - email:
            type: string
`,
        "datasource.yaml": datasourceInclude,
        "routes.yaml": crudRoutes,
      }),
      settings: {},
    });
    assert.equal(doc.version, "1.0.0");
    const list = routeOf(doc.routes, "userList");
    assert.equal(list.path, "/api/users");
    assert.equal(list.method, "GET");
    const get = routeOf(doc.routes, "userGet");
    assert.equal(get.path, "/api/users/{id}");
    assert.ok(doc.components.user);
    assert.ok(doc.components.update_user);
  });

  it("expands by-field, readonly lookup, and unresolved custom bodies", async () => {
    const doc = await loadRoutesApi({
      reader: memoryReader({
        "types.yaml": `types:
  - role:
      tags: [datasource_type, view_type, readonly_lookup]
      inherits: set
      fields:
        - name:
            type: string
  - user:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - email:
            type: string
        - role_id:
            type: number
            references: role.id
`,
        "datasource.yaml": `includes:
  - types:
      filter: tag == "datasource_type"
types:
  - role:
      fields:
        - name:
            is_unique: true
  - user:
      fields:
        - email:
            is_unique: true
`,
        "routes.yaml": `includes:
  - types:
      filter: tag == "view_type"
routes:
  - users_by_email:
  - ping:
      method: POST
      path: /api/ping
      request: missing_shape
      response: missing_shape
`,
      }),
      settings: {},
    });
    assert.equal(routeOf(doc.routes, "roleList").path, "/api/roles");
    assert.equal(
      doc.routes.some((entry) => "roleCreate" in entry),
      false,
    );
    const byEmail = routeOf(doc.routes, "userGetByEmail");
    assert.equal(byEmail.path, "/api/users/email/{email}");
    const ping = routeOf(doc.routes, "ping") as {
      request?: { schema: unknown };
    };
    assert.equal(ping.request?.schema, null);
  });

  it("expands nested combined routes with snake segments", async () => {
    const doc = await loadRoutesApi({
      reader: memoryReader({
        "types.yaml": `types:
  - project:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - name:
            type: string
  - task:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - title:
            type: string
        - project_id:
            type: number
            references: project.id
`,
        "datasource.yaml": datasourceInclude,
        "routes.yaml": `includes:
  - types:
      filter: tag == "view_type"
routes: []
combined_routes:
  - project:
      combines:
        - task
`,
      }),
      settings: {},
    });
    assert.equal(routeOf(doc.routes, "projectList").path, "/api/projects");
    assert.equal(
      routeOf(doc.routes, "projectTasksList").path,
      "/api/projects/{id}/tasks",
    );
    assert.equal(
      routeOf(doc.routes, "projectTasksUpdate").path,
      "/api/projects/{id}/tasks/{id}",
    );
  });

  it("expands m2m combined routes and union view components", async () => {
    const doc = await loadRoutesApi({
      reader: memoryReader({
        "types.yaml": `types:
  - organization:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - name:
            type: string
  - tag:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - name:
            type: string
  - org_tag:
      tags: [datasource_type, many_to_many]
      fields:
        - organization_id:
            type: number
            references: organization.id
        - tag_id:
            type: number
            references: tag.id
  - search_result:
      tags: [view_type]
      inherits: organization
`,
        "datasource.yaml": datasourceInclude,
        "routes.yaml": `includes:
  - types:
      filter: tag == "view_type"
combined_routes:
  - organization:
      combines:
        - tag:
            via: org_tag
            target: tag
routes: []
`,
      }),
      settings: {},
    });
    assert.equal(
      routeOf(doc.routes, "organizationTagsList").path,
      "/api/organizations/{id}/tags",
    );
    assert.equal(
      routeOf(doc.routes, "organizationTagsGet").path,
      "/api/organizations/{id}/tags/{tag}",
    );
    assert.ok(doc.components.link_org_tag);
    assert.ok(doc.components.search_result);
  });

  it("stamps optimisticConcurrency on member writes when OCC is on", async () => {
    const files = {
      "types.yaml": `types:
  - item:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - name:
            type: string
  - log:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - message:
            type: string
  - status:
      tags: [datasource_type, view_type, readonly_lookup]
      inherits: set
      fields:
        - name:
            type: string
`,
      "datasource.yaml": `includes:
  - types:
      filter: tag == "datasource_type"
types:
  - item:
      use_optimistic_concurrency: true
  - log:
      use_optimistic_concurrency: false
  - status:
      fields:
        - name:
            is_unique: true
`,
      "routes.yaml": crudRoutes,
    };
    const on = await loadRoutesApi({
      reader: memoryReader(files),
      settings: { "datasource.use_optimistic_concurrency": "false" },
    });
    assert.equal(routeOf(on.routes, "itemUpdate").optimisticConcurrency, true);
    assert.equal(routeOf(on.routes, "itemPatch").optimisticConcurrency, true);
    assert.equal(routeOf(on.routes, "itemDelete").optimisticConcurrency, true);
    assert.equal(routeOf(on.routes, "itemGet").optimisticConcurrency, undefined);
    assert.equal(routeOf(on.routes, "itemCreate").optimisticConcurrency, undefined);
    assert.equal(routeOf(on.routes, "logUpdate").optimisticConcurrency, undefined);
    assert.equal(
      on.routes.some((entry) => "statusUpdate" in entry),
      false,
    );

    const off = await loadRoutesApi({
      reader: memoryReader({
        "types.yaml": `types:
  - user:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - email:
            type: string
`,
        "datasource.yaml": datasourceInclude,
        "routes.yaml": crudRoutes,
      }),
      settings: { "datasource.use_optimistic_concurrency": "false" },
    });
    assert.equal(routeOf(off.routes, "userUpdate").optimisticConcurrency, undefined);
  });

  it("emits CRUD routes in first-parent datasource tree order", async () => {
    const doc = await loadRoutesApi({
      reader: memoryReader({
        "types.yaml": `types:
  - user:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - role_id:
            type: number
            references: role.id
  - role:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - name:
            type: string
  - address:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - user_id:
            type: number
            references: user.id
`,
        "datasource.yaml": datasourceInclude,
        "routes.yaml": crudRoutes,
      }),
      settings: {},
    });
    const names = doc.routes.map((entry) => Object.keys(entry)[0]);
    const firstList = names.filter((name) => name?.endsWith("List"));
    assert.deepEqual(firstList, ["roleList", "userList", "addressList"]);
  });

  it("maps primitive array field types onto OpenAPI arrays", async () => {
    const doc = await loadRoutesApi({
      reader: memoryReader({
        "types.yaml": `types:
  - user:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - aliases:
            type: string[]
        - flags:
            type: boolean[]
`,
        "routes.yaml": crudRoutes,
      }),
      settings: {},
    });
    const user = doc.components.user as {
      properties?: Record<string, { type?: string; items?: { type?: string } }>;
    };
    assert.deepEqual(user.properties?.aliases, {
      type: "array",
      items: { type: "string" },
    });
    assert.deepEqual(user.properties?.flags, {
      type: "array",
      items: { type: "boolean" },
    });
  });

  it("stacks composite identity columns on the member path", async () => {
    const doc = await loadRoutesApi({
      reader: memoryReader({
        "types.yaml": `types:
  - link:
      tags: [datasource_type, view_type]
      inherits: set
      ids: [left_id, right_id]
      fields:
        - left_id:
            type: integer
        - right_id:
            type: integer
`,
        "datasource.yaml": datasourceInclude,
        "routes.yaml": crudRoutes,
      }),
      settings: {},
    });
    const get = routeOf(doc.routes, "linkGet");
    assert.equal(get.path, "/api/links/{left_id}/{right_id}");
    assert.equal(get.primaryKeyField, "left_id");
    assert.deepEqual(get.primaryKeyFields, ["left_id", "right_id"]);
    assert.ok(doc.components.create_link);
  });

  it("builds components from types.yaml when datasource.yaml is omitted", async () => {
    const doc = await loadRoutesApi({
      reader: memoryReader({
        "types.yaml": `types:
  - user:
      tags: [datasource_type, view_type]
      inherits: set
      fields:
        - email:
            type: string
`,
        "routes.yaml": crudRoutes,
      }),
      settings: {},
    });
    assert.ok(doc.components.user);
    assert.ok(doc.components.update_user);
    assert.equal(routeOf(doc.routes, "userList").path, "/api/users");
    assert.equal(routeOf(doc.routes, "userGet").path, "/api/users/{id}");
  });
});
