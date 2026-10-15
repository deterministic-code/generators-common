import { DeterministicDefaultValueConverter } from "./deterministic-default-value-converter.ts";

/** The all-zero uuid, shared by the SQL and language default renderers for the `Empty` uuid token. */
export const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

/** Tokens whose value is produced fresh per row (a generator, not a constant). */
export const GENERATIVE_TOKENS = new Set(["Now", "UtcNow", "NewId"]);

export const parseDefaultToken = DeterministicDefaultValueConverter.parse;

export const hexToBytes = (hex: string): number[] => {
  const out: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) {
    out.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
};
