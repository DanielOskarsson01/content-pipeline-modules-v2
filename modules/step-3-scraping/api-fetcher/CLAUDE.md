# api-fetcher — CLAUDE.md

When modifying this submodule — fixing bugs, changing logic, adjusting options, altering output schema — update README.md to reflect the changes. The README is the contract operators and downstream modules rely on. Stale docs are worse than no docs.

Rules specific to this module:

1. Providers are fully config-driven (api-search precedent) — adding an API source = a JSON provider config, never code. If a provider genuinely cannot be expressed in the config schema, extend the schema generically; do not special-case a provider id, vertical, or field name in execute.js.
2. Rule 13 hard line: no vertical flavor (provider names, endpoints, field names, RSS tag names) in code or manifest defaults — it all belongs in template presets. `providers: []` default stays a loud no-op.
3. The XML→JSON parser is generic on purpose (elements→keys, repeated→arrays, attributes→`@name`, CDATA→text). Keep it that way — RSS/Atom tag knowledge lives in each provider's `results_path` + `field_map`, not in the parser.
4. Run `node modules/step-3-scraping/api-fetcher/test-api-fetcher.js` after any change (mocked, free). The live test (`test-live-api-fetcher.js`) is credential-free (iTunes + podcast RSS) — run it when the fetch/parse plumbing itself changed.
5. `_partialItems` is pushed after EVERY provider fetch per entity (Rule 10) — a multi-provider/multi-identifier run must survive a mid-entity timeout.
6. `empty_ok` is deliberate (not the usual Step-3 `requires_items`): identifiers come from entity seed columns, so the module runs without Step-1 URLs. Don't "fix" it to `requires_items`.
