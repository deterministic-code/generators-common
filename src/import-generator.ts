export type IImportGenerator = {
  datasource: (entity: string) => string;
  datasourceRel: (entity: string) => string;
  datasourceQual: (entity: string) => string;
  datasourceValidator: (entity: string) => string;
  datasourceValidatorRel: (entity: string) => string;
  view: (entity: string) => string;
  viewRel: (entity: string) => string;
  viewQual: (entity: string) => string;
  viewValidator: (entity: string) => string;
  viewValidatorRel: (entity: string) => string;
  service: (entity: string) => string;
  serviceRel: (entity: string) => string;
  serviceCustom: (name: string, module?: string) => string;
  serviceCustomRel: (entity: string) => string;
  serviceTest: (entity: string) => string;
  serviceTestRel: (entity: string) => string;
  serviceIntegrationTest: (entity: string) => string;
  serviceIntegrationTestRel: (entity: string) => string;
  serviceUse: (entity: string, symbol: string) => string;
  route: (entity: string) => string;
  routeRel: (entity: string) => string;
  routeCustom: (name: string, module?: string) => string;
  routeTest: (entity: string) => string;
  enrichment: (targetTable: string) => string;
  test: (srcFile: string, fileBase: string) => string;
  testSpec: (srcFile: string, fileBase: string) => string;
  index: (beside: string) => string;
  spec: (fromFile: string, toFile: string) => string;
  routeModule: (entity: string) => string;
  appWiring: () => string;
  validatorFn: (
    kind: "datasource" | "view",
    entity: string,
    fn: string,
  ) => string;
  apiPath: (entity: string) => string;
  frontend: (relPath: string) => string;
};
