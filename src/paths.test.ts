import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDatasourceNaming } from "./datasource-naming.ts";
import { Paths } from "./paths.ts";

describe("Paths", () => {
  const paths = new Paths();

  it("returns logical type and repository directories", () => {
    assert.equal(paths.typesDir("view"), "types/view");
    assert.equal(paths.typesDir("datasource"), "types/datasource");
    assert.equal(paths.repositoriesDir(), "repositories");
  });

  it("singularizes the type stem and pluralizes the repository stem", () => {
    assert.equal(paths.typeStem("categories"), "category");
    assert.equal(paths.typeStem("users"), "user");
    assert.equal(paths.typeStem("address_type"), "address_type");
    assert.equal(paths.repositoryStem("contact"), "contacts_repository");
    assert.equal(paths.repositoryStem("categories"), "categories_repository");
    assert.equal(
      paths.repositoryStem("contact_group_member"),
      "contact_group_members_repository",
    );
    assert.equal(paths.repositoryStem("address_type"), "address_types_repository");
  });

  it("does not take the table pluralize flag", () => {
    const off = createDatasourceNaming({
      "datasource.pluralize_datatable_names": "false",
    });
    assert.equal(off.physicalStem("users"), "users");
    assert.equal(off.physicalStem("user"), "user");
    assert.equal(paths.typeStem("users"), "user");
    assert.equal(paths.repositoryStem("users"), "users_repository");
    assert.equal(paths.repositoryStem("user"), "users_repository");
  });
});
