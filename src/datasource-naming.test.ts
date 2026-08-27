import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDatasourceNaming } from "./datasource-naming.ts";

type Format = "Camel" | "Pascal" | "Snake" | "Kebab";
type Pluralize = "on" | "off";

const FORMATS: readonly Format[] = ["Camel", "Pascal", "Snake", "Kebab"];
const PLURALIZE: readonly Pluralize[] = ["on", "off"];

const ENTITY = "notification_type";
const FIELD = "channel_name";

const settingsFor = (
  leaf: "types" | "fields",
  format: Format,
  pluralize: Pluralize = "on",
): Record<string, string> => ({
  [`datasource.casing.${leaf}`]: format,
  ...(pluralize === "off"
    ? { "datasource.pluralize_datatable_names": "false" }
    : {}),
});

const TYPES = {
  tableName: {
    on: {
      Camel: "notificationTypes",
      Pascal: "NotificationTypes",
      Snake: "notification_types",
      Kebab: "notification-types",
    },
    off: {
      Camel: "notificationType",
      Pascal: "NotificationType",
      Snake: "notification_type",
      Kebab: "notification-type",
    },
  },
  userTable: {
    on: {
      Camel: "users",
      Pascal: "Users",
      Snake: "users",
      Kebab: "users",
    },
    off: {
      Camel: "user",
      Pascal: "User",
      Snake: "user",
      Kebab: "user",
    },
  },
} as const;

const FIELDS = {
  channel_name: {
    Camel: "channelName",
    Pascal: "ChannelName",
    Snake: "channel_name",
    Kebab: "channel-name",
  },
  role_id: {
    Camel: "roleId",
    Pascal: "RoleId",
    Snake: "role_id",
    Kebab: "role-id",
  },
} as const;

describe("createDatasourceNaming Auto defaults", () => {
  it("uses SQL Snake defaults and last-token pluralize", () => {
    const naming = createDatasourceNaming({});
    assert.equal(naming.resolveTable(ENTITY), "notification_types");
    assert.equal(naming.resolveTable("user"), "users");
    assert.equal(naming.columnName(FIELD), "channel_name");
    assert.equal(naming.resolveColumn(FIELD), "channel_name");
    assert.equal(naming.physicalStem(ENTITY), "notification_types");
    assert.equal(naming.tableName("notification_types"), "notification_types");
  });
});

describe("createDatasourceNaming conversion matrix", () => {
  for (const format of FORMATS) {
    for (const pluralize of PLURALIZE) {
      it(`types × ${format} × pluralize ${pluralize}`, () => {
        const naming = createDatasourceNaming(
          settingsFor("types", format, pluralize),
        );
        assert.equal(
          naming.resolveTable(ENTITY),
          TYPES.tableName[pluralize][format],
        );
        assert.equal(
          naming.resolveTable("user"),
          TYPES.userTable[pluralize][format],
        );
        assert.equal(naming.columnName(FIELD), "channel_name");
      });
    }
  }

  for (const format of FORMATS) {
    it(`fields × ${format}`, () => {
      const naming = createDatasourceNaming(settingsFor("fields", format));
      assert.equal(naming.columnName("channel_name"), FIELDS.channel_name[format]);
      assert.equal(naming.resolveColumn("channel_name"), FIELDS.channel_name[format]);
      assert.equal(naming.columnName("role_id"), FIELDS.role_id[format]);
      assert.equal(naming.resolveTable(ENTITY), "notification_types");
    });
  }
});

describe("createDatasourceNaming overrides", () => {
  it("treats Auto and empty as omitted", () => {
    const omitted = createDatasourceNaming({});
    const explicit = createDatasourceNaming({
      "datasource.casing.types": "auto",
      "datasource.casing.fields": "AUTO",
    });
    assert.equal(omitted.resolveTable(ENTITY), explicit.resolveTable(ENTITY));
    assert.equal(omitted.columnName(FIELD), explicit.columnName(FIELD));
  });

  it("ignores languages.sql.casing keys", () => {
    const naming = createDatasourceNaming({
      "languages.sql.casing.types": "Pascal",
      "languages.sql.casing.fields": "Camel",
    });
    assert.equal(naming.resolveTable(ENTITY), "notification_types");
    assert.equal(naming.columnName(FIELD), "channel_name");
  });

  it("throws on an unknown case format", () => {
    assert.throws(
      () => createDatasourceNaming({ "datasource.casing.types": "screaming" }),
      /datasource\.casing\.types must be one of/,
    );
  });
});

describe("createDatasourceNaming verbatim and mapping", () => {
  it("treats omitted and snake stems as cased", () => {
    const naming = createDatasourceNaming({});
    assert.equal(naming.isVerbatim("user"), false);
    assert.equal(naming.isVerbatim("email_address"), false);
  });

  it("treats mixed-case mappings as verbatim", () => {
    const naming = createDatasourceNaming({});
    assert.equal(naming.isVerbatim("OldRvwsTbl"), true);
    assert.equal(naming.isVerbatim("UsrProfiles"), true);
    assert.equal(naming.isVerbatim("CntID"), true);
  });

  it("resolveTable pluralizes a snake mapping", () => {
    const naming = createDatasourceNaming({});
    assert.equal(naming.resolveTable("users_base", "user"), "users");
  });

  it("resolveTable keeps a snake mapping singular when pluralize is off", () => {
    const naming = createDatasourceNaming({
      "datasource.pluralize_datatable_names": "false",
    });
    assert.equal(naming.resolveTable("users_base", "user"), "user");
  });

  it("resolveTable keeps a non-snake mapping verbatim", () => {
    const naming = createDatasourceNaming({
      "datasource.casing.types": "Pascal",
    });
    assert.equal(naming.resolveTable("old_reviews", "OldRvwsTbl"), "OldRvwsTbl");
    assert.equal(naming.physicalStem("OldRvwsTbl"), "OldRvwsTbl");
  });

  it("resolveColumn applies field casing and keeps verbatim overlays", () => {
    const naming = createDatasourceNaming({
      "datasource.casing.fields": "Camel",
    });
    assert.equal(naming.resolveColumn("email", "email_address"), "emailAddress");
    assert.equal(naming.resolveColumn("key", "CntID"), "CntID");
    assert.equal(naming.resolveColumn("first_name"), "firstName");
  });
});

describe("createDatasourceNaming tableName pluralize", () => {
  it("pluralizes when the flag is true or empty", () => {
    assert.equal(
      createDatasourceNaming({
        "datasource.pluralize_datatable_names": "true",
      }).resolveTable("user"),
      "users",
    );
    assert.equal(
      createDatasourceNaming({
        "datasource.pluralize_datatable_names": "",
      }).resolveTable("user"),
      "users",
    );
  });

  it("handles irregular and already-plural names", () => {
    const naming = createDatasourceNaming({});
    assert.equal(naming.resolveTable("person"), "people");
    assert.equal(naming.resolveTable("category"), "categories");
    assert.equal(naming.resolveTable("users"), "users");
    assert.equal(naming.resolveTable(""), "");
    assert.equal(naming.physicalStem("backend_type"), "backend_types");
    assert.equal(naming.physicalStem("task_step"), "task_steps");
    assert.equal(naming.physicalStem("local_setting"), "local_settings");
    assert.equal(naming.physicalStem("man"), "men");
    assert.equal(naming.physicalStem("child"), "children");
    assert.equal(naming.physicalStem("mouse"), "mice");
    assert.equal(naming.physicalStem("candy"), "candies");
    assert.equal(naming.physicalStem("key"), "keys");
    assert.equal(naming.physicalStem("analytics"), "analytics");
    assert.equal(naming.physicalStem("news"), "news");
    assert.equal(naming.physicalStem("series"), "series");
    assert.equal(naming.physicalStem("leaf"), "leaves");
    assert.equal(naming.physicalStem("knife"), "knives");
    assert.equal(naming.physicalStem(""), "");
  });

  it("leaves the stem unchanged when pluralize is off", () => {
    const naming = createDatasourceNaming({
      "datasource.pluralize_datatable_names": "false",
    });
    assert.equal(naming.physicalStem("backend"), "backend");
    assert.equal(naming.physicalStem("backend_type"), "backend_type");
    assert.equal(naming.resolveTable("contact"), "contact");
  });
});
