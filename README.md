# @deterministic-code/generators-common

Shared TypeScript helpers used by the language generator packs. The specification parser lives in [`@deterministic-code/deterministic-generators-common/parser`](https://github.com/deterministic-code/deterministic-generators-common). HTTP param/segment casing stays in each language pack.

`GenerateEntry` content may include optional `attributes` for generation-time reference checks (`ReferenceVerifier` / `verifyEntries` / `finalizeEntries`). `finalizeEntries` also checks that declared export/use names appear in file text. Writers must strip attributes before emitting files.

`Paths` (`./paths`) is output layout: type and repository directories, and plural repository stems. Casing stays on `ICasingStrategy`.

Pack-specific modules stay in each repo:

- `type-converter` / `type-converters` — native type mapping per language
