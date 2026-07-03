# search-discovery — CLAUDE.md

When modifying this submodule — fixing bugs, changing logic, adjusting options, altering output schema — update README.md to reflect the changes. The README is the contract operators and downstream modules rely on. Stale docs are worse than no docs.

Rules specific to this module:

1. Providers are fully config-driven (api-search precedent) — adding a search engine = a JSON provider config, never code. If a provider genuinely cannot be expressed in the config schema, extend the schema generically; do not special-case a provider id in execute.js.
2. Rule 13 hard line: no vertical flavor (site lists, query wording, directory names) in code or manifest defaults — that belongs in template presets. `providers: []` default stays a loud no-op.
3. Run `node modules/step-1-discovery/search-discovery/test-search-discovery.js` after any change (mocked, free). The Perplexity live test (`test-live-perplexity.js`) costs ~$0.005/request — run it only when the provider plumbing itself changed.
4. `_partialItems` is pushed after EVERY query, not per entity — site_restricted fan-outs must survive mid-entity timeouts (Rule 10).
