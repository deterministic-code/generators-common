import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CasingFactory,
  LANGUAGE_CASING_DEFAULTS,
  casingOverridesFromSettings,
  toCase,
} from "./casing-strategy.ts";

describe("toCase", () => {
  it("splits snake, kebab, and camel input", () => {
    assert.equal(toCase("notification_type", "Camel"), "notificationType");
    assert.equal(toCase("notification-type", "Pascal"), "NotificationType");
    assert.equal(toCase("notificationType", "Snake"), "notification_type");
    assert.equal(toCase("NotificationType", "Kebab"), "notification-type");
  });

  it("returns the original string when there are no words", () => {
    assert.equal(toCase("", "Camel"), "");
    assert.equal(toCase("   ", "Snake"), "   ");
  });
});

describe("CasingFactory Auto defaults", () => {
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
      const casing = CasingFactory.create(sample.language);
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
    const omitted = CasingFactory.create("typescript");
    const explicit = CasingFactory.create("typescript", {
      file_names: "Auto",
      types: "auto",
      fields: "AUTO",
      directories: "Auto",
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

  it("resolves language aliases", () => {
    assert.equal(
      CasingFactory.create("ts").convertFields("role_id"),
      CasingFactory.create("typescript").convertFields("role_id"),
    );
    assert.equal(
      CasingFactory.create("C#").convertFields("role_id"),
      "RoleId",
    );
    assert.equal(CasingFactory.create("rs").convertFileName("user_service"), "userService");
  });
});

describe("CasingFactory overrides", () => {
  it("applies per-leaf overrides without changing the others", () => {
    const casing = CasingFactory.create("typescript", {
      file_names: "Pascal",
      fields: "Camel",
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
    const casing = CasingFactory.create("rust", {
      file_names: "Snake",
      types: "Kebab",
      fields: "Pascal",
      directories: "Camel",
    });
    assert.equal(casing.convertFileName("NotificationType"), "notification_type");
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
    const casing = CasingFactory.create(
      "typescript",
      casingOverridesFromSettings(settings, "typescript"),
    );
    assert.equal(casing.convertFileName("user_summary"), "user-summary");
    assert.equal(casing.convertTypes("user_summary"), "user_summary");
    assert.equal(casing.convertFields("user_summary"), "UserSummary");
    assert.equal(casing.convertDirectories("user_summary"), "UserSummary");
  });

  it("throws on an unknown language", () => {
    assert.throws(
      () => CasingFactory.create("cobol"),
      /unknown language "cobol"/,
    );
  });

  it("throws on an unknown case format", () => {
    assert.throws(
      () => CasingFactory.create("typescript", { file_names: "screaming" }),
      /file_names must be one of/,
    );
  });
});

describe("LANGUAGE_CASING_DEFAULTS", () => {
  it("matches the Default Casings table for file, field, and type names", () => {
    assert.deepEqual(LANGUAGE_CASING_DEFAULTS.typescript, {
      file_names: "Camel",
      types: "Pascal",
      fields: "Snake",
      directories: "Camel",
    });
    assert.deepEqual(LANGUAGE_CASING_DEFAULTS.javascript, {
      file_names: "Camel",
      types: "Pascal",
      fields: "Camel",
      directories: "Camel",
    });
    assert.deepEqual(LANGUAGE_CASING_DEFAULTS.csharp, {
      file_names: "Camel",
      types: "Pascal",
      fields: "Pascal",
      directories: "Camel",
    });
    assert.deepEqual(LANGUAGE_CASING_DEFAULTS.java, {
      file_names: "Camel",
      types: "Pascal",
      fields: "Camel",
      directories: "Camel",
    });
    assert.deepEqual(LANGUAGE_CASING_DEFAULTS.python, {
      file_names: "Camel",
      types: "Pascal",
      fields: "Snake",
      directories: "Camel",
    });
    assert.deepEqual(LANGUAGE_CASING_DEFAULTS.rust, {
      file_names: "Camel",
      types: "Pascal",
      fields: "Snake",
      directories: "Camel",
    });
  });
});
