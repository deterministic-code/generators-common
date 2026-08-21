import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "./deterministic-reader.ts";
import { loadRoutesApi } from "./routes-api-converter.ts";

const viewPassThrough = `includes:
  - datasource_types:
      include: "*"
types: []
`;

const crudRoutes = `includes:
  - view_type_routes:
      filter: 'type is view_type || type is datasource_type'
routes: []
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
        "datasource_types.yaml": `types:
  - user:
      fields:
        - email:
            type: string
`,
        "view_types.yaml": viewPassThrough,
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
        "datasource_types.yaml": `types:
  - role:
      datasource_type: readonly-lookup
      fields:
        - name:
            type: string
            is_unique: true
  - user:
      fields:
        - email:
            type: string
            is_unique: true
        - role_id:
            type: number
            references: role.id
`,
        "view_types.yaml": `includes:
  - datasource_types:
      include: "*"
      auto_enrich: true
types: []
`,
        "routes.yaml": `includes:
  - view_type_routes:
      filter: 'type is view_type || type is datasource_type'
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
        "datasource_types.yaml": `types:
  - project:
      fields:
        - name:
            type: string
            is_unique: true
  - task:
      fields:
        - title:
            type: string
        - project_id:
            type: number
            references: project.id
`,
        "view_types.yaml": viewPassThrough,
        "routes.yaml": `includes:
  - view_type_routes:
      filter: 'type is view_type || type is datasource_type'
routes: []
combined_routes:
  - project:
      combined_types:
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
        "datasource_types.yaml": `types:
  - organization:
      fields:
        - name:
            type: string
  - tag:
      fields:
        - name:
            type: string
  - org_tag:
      datasource_type: many-to-many
      fields:
        - organization_id:
            type: number
            references: organization.id
        - tag_id:
            type: number
            references: tag.id
`,
        "view_types.yaml": `includes:
  - datasource_types:
      include: "*"
types:
  - search_result:
      one_of:
        - organization
        - tag
`,
        "routes.yaml": `includes:
  - view_type_routes:
      filter: 'type inherits datasource_types'
combined_routes:
  - organization:
      combined_types:
        - tag:
            via: org_tag
            target: tag
routes: []
`,
      }),
      settings: { "datasource.id_type": "uuid" },
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
    assert.ok(doc.components.search_result?.oneOf);
  });

  it("stamps optimisticConcurrency on member writes when OCC is on", async () => {
    const files = {
      "datasource_types.yaml": `types:
  - item:
      use_optimistic_concurrency: true
      fields:
        - name:
            type: string
  - log:
      use_optimistic_concurrency: false
      fields:
        - message:
            type: string
  - status:
      datasource_type: readonly-lookup
      fields:
        - name:
            type: string
            is_unique: true
`,
      "view_types.yaml": viewPassThrough,
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
        "datasource_types.yaml": `types:
  - user:
      fields:
        - email:
            type: string
`,
        "view_types.yaml": viewPassThrough,
        "routes.yaml": crudRoutes,
      }),
      settings: { "datasource.use_optimistic_concurrency": "false" },
    });
    assert.equal(routeOf(off.routes, "userUpdate").optimisticConcurrency, undefined);
  });
});
