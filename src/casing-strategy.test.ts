import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCasingStrategy,
  type ICasingStrategy,
} from "./casing-strategy.ts";

type ResolvedFormat = "Camel" | "Pascal" | "Snake" | "Kebab";
type Leaf = "file_names" | "types" | "fields" | "directories";

const FORMATS: readonly ResolvedFormat[] = [
  "Camel",
  "Pascal",
  "Snake",
  "Kebab",
];

const LEAVES: readonly Leaf[] = [
  "file_names",
  "types",
  "fields",
  "directories",
];

const convert = (
  casing: ICasingStrategy,
  leaf: Leaf,
  text: string,
): string => {
  switch (leaf) {
    case "file_names":
      return casing.convertFileName(text);
    case "types":
      return casing.convertTypes(text);
    case "fields":
      return casing.convertFields(text);
    case "directories":
      return casing.convertDirectories(text);
  }
};

const EXPECTED: Record<string, Record<ResolvedFormat, string>> = {
  notification_type: {
    Camel: "notificationType",
    Pascal: "NotificationType",
    Snake: "notification_type",
    Kebab: "notification-type",
  },
  "notification-type": {
    Camel: "notificationType",
    Pascal: "NotificationType",
    Snake: "notification_type",
    Kebab: "notification-type",
  },
  notificationType: {
    Camel: "notificationType",
    Pascal: "NotificationType",
    Snake: "notification_type",
    Kebab: "notification-type",
  },
  NotificationType: {
    Camel: "notificationType",
    Pascal: "NotificationType",
    Snake: "notification_type",
    Kebab: "notification-type",
  },
  role_id: {
    Camel: "roleId",
    Pascal: "RoleId",
    Snake: "role_id",
    Kebab: "role-id",
  },
  xml_http_request: {
    Camel: "xmlHttpRequest",
    Pascal: "XmlHttpRequest",
    Snake: "xml_http_request",
    Kebab: "xml-http-request",
  },
  HTTPResponse: {
    Camel: "httpResponse",
    Pascal: "HttpResponse",
    Snake: "http_response",
    Kebab: "http-response",
  },
  user: {
    Camel: "user",
    Pascal: "User",
    Snake: "user",
    Kebab: "user",
  },
  a: {
    Camel: "a",
    Pascal: "A",
    Snake: "a",
    Kebab: "a",
  },
};

describe("createCasingStrategy conversion matrix", () => {
  for (const input of Object.keys(EXPECTED)) {
    for (const format of FORMATS) {
      for (const leaf of LEAVES) {
        it(`${JSON.stringify(input)} × ${format} × ${leaf}`, () => {
          const casing = createCasingStrategy("typescript", {
            [`languages.typescript.casing.${leaf}`]: format,
          });
          assert.equal(convert(casing, leaf, input), EXPECTED[input]![format]);
        });
      }
    }
  }

  it('returns "" unchanged for every format and leaf', () => {
    for (const format of FORMATS) {
      for (const leaf of LEAVES) {
        const casing = createCasingStrategy("typescript", {
          [`languages.typescript.casing.${leaf}`]: format,
        });
        assert.equal(convert(casing, leaf, ""), "");
      }
    }
  });

  it('returns "   " unchanged for every format and leaf', () => {
    for (const format of FORMATS) {
      for (const leaf of LEAVES) {
        const casing = createCasingStrategy("typescript", {
          [`languages.typescript.casing.${leaf}`]: format,
        });
        assert.equal(convert(casing, leaf, "   "), "   ");
      }
    }
  });
});

describe("createCasingStrategy Auto defaults", () => {
  const samples: Array<{
    language: string;
    file: string;
    type: string;
    field: string;
    directory: string;
  }> = [
    {
      language: "typescript",
      file: "notificationType",
      type: "NotificationType",
      field: "notification_type",
      directory: "notificationType",
    },
    {
      language: "javascript",
      file: "notificationType",
      type: "NotificationType",
      field: "notificationType",
      directory: "notificationType",
    },
    {
      language: "csharp",
      file: "notificationType",
      type: "NotificationType",
      field: "NotificationType",
      directory: "notificationType",
    },
    {
      language: "java",
      file: "notificationType",
      type: "NotificationType",
      field: "notificationType",
      directory: "notificationType",
    },
    {
      language: "python",
      file: "notificationType",
      type: "NotificationType",
      field: "notification_type",
      directory: "notificationType",
    },
    {
      language: "rust",
      file: "notificationType",
      type: "NotificationType",
      field: "notification_type",
      directory: "notificationType",
    },
    {
      language: "sql",
      file: "notification_type",
      type: "notification_type",
      field: "notification_type",
      directory: "notification_type",
    },
    {
      language: "openapi",
      file: "notification-type",
      type: "NotificationType",
      field: "notificationType",
      directory: "notification-type",
    },
  ];

  for (const sample of samples) {
    it(`uses Default Casings for ${sample.language} when overrides are omitted`, () => {
      const casing = createCasingStrategy(sample.language);
      assert.equal(casing.convertFileName("notification_type"), sample.file);
      assert.equal(casing.convertTypes("notification_type"), sample.type);
      assert.equal(casing.convertFields("notification_type"), sample.field);
      assert.equal(
        casing.convertDirectories("notification_type"),
        sample.directory,
      );
    });
  }

  it("treats Auto the same as an omitted override", () => {
    const omitted = createCasingStrategy("typescript");
    const explicit = createCasingStrategy("typescript", {
      "languages.typescript.casing.file_names": "Auto",
      "languages.typescript.casing.types": "auto",
      "languages.typescript.casing.fields": "AUTO",
      "languages.typescript.casing.directories": "Auto",
    });
    assert.equal(
      omitted.convertFileName("project_setting"),
      explicit.convertFileName("project_setting"),
    );
    assert.equal(
      omitted.convertTypes("project_setting"),
      explicit.convertTypes("project_setting"),
    );
    assert.equal(
      omitted.convertFields("project_setting"),
      explicit.convertFields("project_setting"),
    );
    assert.equal(
      omitted.convertDirectories("project_setting"),
      explicit.convertDirectories("project_setting"),
    );
  });

  it("treats an empty settings value as Auto", () => {
    const omitted = createCasingStrategy("typescript");
    const blank = createCasingStrategy("typescript", {
      "languages.typescript.casing.file_names": "",
      "languages.typescript.casing.types": "",
      "languages.typescript.casing.fields": "",
      "languages.typescript.casing.directories": "",
    });
    assert.equal(
      omitted.convertFileName("role_id"),
      blank.convertFileName("role_id"),
    );
    assert.equal(omitted.convertTypes("role_id"), blank.convertTypes("role_id"));
    assert.equal(
      omitted.convertFields("role_id"),
      blank.convertFields("role_id"),
    );
    assert.equal(
      omitted.convertDirectories("role_id"),
      blank.convertDirectories("role_id"),
    );
  });

  it("resolves language aliases", () => {
    assert.equal(
      createCasingStrategy("ts").convertFields("role_id"),
      createCasingStrategy("typescript").convertFields("role_id"),
    );
    assert.equal(
      createCasingStrategy("TypeScript").convertFields("role_id"),
      createCasingStrategy("typescript").convertFields("role_id"),
    );
    assert.equal(
      createCasingStrategy("js").convertFields("role_id"),
      createCasingStrategy("javascript").convertFields("role_id"),
    );
    assert.equal(
      createCasingStrategy("py").convertFields("role_id"),
      createCasingStrategy("python").convertFields("role_id"),
    );
    assert.equal(createCasingStrategy("C#").convertFields("role_id"), "RoleId");
    assert.equal(createCasingStrategy("cs").convertFields("role_id"), "RoleId");
    assert.equal(
      createCasingStrategy("c_sharp").convertFields("role_id"),
      "RoleId",
    );
    assert.equal(
      createCasingStrategy("rs").convertFileName("user_service"),
      "userService",
    );
  });
});

describe("createCasingStrategy overrides", () => {
  it("applies per-leaf overrides without changing the others", () => {
    const casing = createCasingStrategy("typescript", {
      "languages.typescript.casing.file_names": "Pascal",
      "languages.typescript.casing.fields": "Camel",
    });
    assert.equal(casing.convertFileName("notification_type"), "NotificationType");
    assert.equal(casing.convertTypes("notification_type"), "NotificationType");
    assert.equal(casing.convertFields("notification_type"), "notificationType");
    assert.equal(
      casing.convertDirectories("notification_type"),
      "notificationType",
    );
  });

  it("accepts snake, kebab, pascal, and camel overrides", () => {
    const casing = createCasingStrategy("rust", {
      "languages.rust.casing.file_names": "Snake",
      "languages.rust.casing.types": "Kebab",
      "languages.rust.casing.fields": "Pascal",
      "languages.rust.casing.directories": "Camel",
    });
    assert.equal(
      casing.convertFileName("NotificationType"),
      "notification_type",
    );
    assert.equal(casing.convertTypes("notification_type"), "notification-type");
    assert.equal(casing.convertFields("notification_type"), "NotificationType");
    assert.equal(
      casing.convertDirectories("notification_type"),
      "notificationType",
    );
  });

  it("reads dotted settings keys", () => {
    const settings = {
      "languages.typescript.casing.file_names": "Kebab",
      "languages.typescript.casing.types": "Snake",
      "languages.typescript.casing.fields": "Pascal",
      "languages.typescript.casing.directories": "Pascal",
    };
    const casing = createCasingStrategy("typescript", settings);
    assert.equal(casing.convertFileName("user_summary"), "user-summary");
    assert.equal(casing.convertTypes("user_summary"), "user_summary");
    assert.equal(casing.convertFields("user_summary"), "UserSummary");
    assert.equal(casing.convertDirectories("user_summary"), "UserSummary");
  });

  it("throws on an unknown language", () => {
    assert.throws(
      () => createCasingStrategy("cobol"),
      /unknown language "cobol"/,
    );
  });

  for (const leaf of LEAVES) {
    it(`throws on an unknown case format for ${leaf}`, () => {
      assert.throws(
        () =>
          createCasingStrategy("typescript", {
            [`languages.typescript.casing.${leaf}`]: "screaming",
          }),
        new RegExp(`${leaf} must be one of`),
      );
    });
  }
});

describe("createCasingStrategy prefix", () => {
  it("reads datasource.casing keys with SQL Snake Auto defaults", () => {
    const casing = createCasingStrategy(
      "sql",
      {
        "datasource.casing.types": "Pascal",
        "datasource.casing.fields": "Camel",
      },
      { prefix: "datasource.casing" },
    );
    assert.equal(casing.convertTypes("notification_type"), "NotificationType");
    assert.equal(casing.convertFields("channel_name"), "channelName");
    assert.equal(casing.convertFileName("notification_type"), "notification_type");
    assert.equal(
      casing.convertDirectories("notification_type"),
      "notification_type",
    );
  });

  it("throws with the custom prefix in the error path", () => {
    assert.throws(
      () =>
        createCasingStrategy(
          "sql",
          { "datasource.casing.types": "screaming" },
          { prefix: "datasource.casing" },
        ),
      /datasource\.casing\.types must be one of/,
    );
  });

  it("ignores languages.sql.casing when a custom prefix is set", () => {
    const casing = createCasingStrategy(
      "sql",
      {
        "languages.sql.casing.types": "Pascal",
        "datasource.casing.types": "Kebab",
      },
      { prefix: "datasource.casing" },
    );
    assert.equal(casing.convertTypes("notification_type"), "notification-type");
  });
});
