import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryReader } from "./deterministic-reader.ts";
import { SpecificationParser } from "./specification-parser.ts";

const serviceClassName = (entity: string) => `${entity}_service`;

describe("SpecificationParser", () => {
  it("load() returns strict datasource, view, service, and route objects", async () => {
    const reader = memoryReader({
      "datasource_types.yaml": `types:
  - user:
      fields:
        - email:
            type: string
            is_unique: true
        - role_id:
            references: role.id
  - role:
      datasource_type: readonly-lookup
      fields:
        - name:
            type: string
            is_unique: true
`,
      "view_types.yaml": `includes:
  - datasource_types:
      include: "*"
types: []
`,
      "services.yaml": `includes:
  - view_type_services:
      filter: 'type is view_type || type is datasource_type'
services: []
`,
      "routes.yaml": `includes:
  - view_type_routes:
      filter: 'type inherits datasource_types'
routes: []
`,
    });
    const spec = await new SpecificationParser(reader).load({
      idType: "integer",
      serviceClassName,
    });
    const user = spec.datasources.find((t) => t.name === "user");
    assert.equal(user?.fields.find((f) => f.name === "role_id")?.type, "number");
    assert.ok(spec.views.some((v) => v.name === "user"));
    assert.ok(spec.services.generics.some((g) => g.name === "user"));
    assert.equal(spec.routes.customs[0]?.name, "getHealth");
    assert.ok(spec.routes.candidates.some((c) => c.name === "user"));
  });
});
