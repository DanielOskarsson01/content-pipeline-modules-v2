# url-heuristics — CLAUDE.md

When modifying this submodule — fixing bugs, changing logic, adjusting options, altering output schema — update README.md to reflect the changes. The README is the contract operators and downstream modules rely on. Stale docs are worse than no docs.

Run `node modules/step-2-validation/url-heuristics/test-url-heuristics.js` after any change; all assertions must pass. Keep this module a pure function of (items, options): no network, no LLM, no credentials — that property is load-bearing (it is the zero-cost pre-filter before url-relevance's LLM spend).
