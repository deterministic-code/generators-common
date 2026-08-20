import Mustache from "mustache";

export const fill = (text: string, tokens: Record<string, unknown>): string =>
  Mustache.render(text, tokens, undefined, {
    escape: (value) => String(value),
  });
