import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Pluralizer } from "./pluralizer.ts";

describe("Pluralizer", () => {
  const pluralizer = new Pluralizer();

  it("singularizes and pluralizes the last token", () => {
    assert.equal(pluralizer.singular("categories"), "category");
    assert.equal(pluralizer.singular("users"), "user");
    assert.equal(pluralizer.singular("address_type"), "address_type");
    assert.equal(pluralizer.singular("contacts_base"), "contacts_base");
    assert.equal(pluralizer.plural("category"), "categories");
    assert.equal(pluralizer.plural("user"), "users");
    assert.equal(pluralizer.plural("address_type"), "address_types");
    assert.equal(pluralizer.plural(pluralizer.singular("categories")), "categories");
    assert.equal(pluralizer.plural(""), "");
    assert.equal(pluralizer.singular(""), "");
  });
});
