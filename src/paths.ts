import { Pluralizer } from "./pluralizer.ts";

export type TypeKind = "datasource" | "view";

export class Paths {
  private readonly pluralizer = new Pluralizer();

  typesDir = (kind: TypeKind): string => `types/${kind}`;

  repositoriesDir = (): string => "repositories";

  typeStem = (specName: string): string => this.pluralizer.singular(specName);

  repositoryStem = (specName: string): string =>
    `${this.pluralizer.plural(this.typeStem(specName))}_repository`;
}
