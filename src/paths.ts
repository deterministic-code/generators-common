import { createDatasourceNaming, type IDatasourceNaming } from "./datasource-naming.ts";

export type TypeKind = "datasource" | "view";

export class Paths {
  private readonly naming: IDatasourceNaming;

  constructor(naming: IDatasourceNaming = createDatasourceNaming({})) {
    this.naming = naming;
  }

  typesDir = (kind: TypeKind): string => `types/${kind}`;

  repositoriesDir = (): string => "repositories";

  repositoryStem = (specName: string): string =>
    `${this.naming.physicalStem(specName)}_repository`;
}
