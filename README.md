# @deterministic-code/generators-common

Shared TypeScript helpers used by the language generator packs. The specification parser is dialect-agnostic (YAML names, snake paths). HTTP param/segment casing stays in each language pack.

Pack-specific modules stay in each repo:

- `paths.ts` — output layout per language
- `type-converter` / `type-converters` — native type mapping per language
