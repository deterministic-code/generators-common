# @deterministic-code/generators-common

Shared TypeScript helpers used by the language generator packs. The specification parser lives in [`@deterministic-code/deterministic-specifications-typescript/parser`](https://github.com/deterministic-code/deterministic-specifications-typescript). HTTP param/segment casing stays in each language pack.

`GenerateEntry` content may include optional `attributes` for generation-time reference checks (`ReferenceVerifier` / `verifyEntries` / `finalizeEntries`). `finalizeEntries` also checks that declared export/use names appear in file text. Writers must strip attributes before emitting files.

Pack-specific modules stay in each repo:

- `paths.ts` — output layout per language
- `type-converter` / `type-converters` — native type mapping per language
