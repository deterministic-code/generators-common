import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Paths } from "./paths.ts";

describe("Paths", () => {
  const paths = new Paths();

  it("returns logical type and repository directories", () => {
    assert.equal(paths.typesDir("view"), "types/view");
    assert.equal(paths.typesDir("datasource"), "types/datasource");
    assert.equal(paths.repositoriesDir(), "repositories");
  });

  it("pluralizes the last token of a repository stem", () => {
    assert.equal(paths.repositoryStem("contact"), "contacts_repository");
    assert.equal(
      paths.repositoryStem("contact_group_member"),
      "contact_group_members_repository",
    );
    assert.equal(paths.repositoryStem("address_type"), "address_types_repository");
  });
});
