/// <reference path="./mustache-module.d.ts" />
import Mustache from "mustache";

export const fill = (text: string, tokens: Record<string, unknown>): string =>
  Mustache.render(text, tokens, undefined, {
    escape: (value: unknown) => String(value),
  });
