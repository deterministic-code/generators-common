import type { IDeterministicReader } from "./deterministic-reader.ts";

export type GenerateContext = {
  reader: IDeterministicReader;
  settings: Record<string, string>;
};
