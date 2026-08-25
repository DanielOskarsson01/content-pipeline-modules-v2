# url-canonicalizer — CLAUDE.md

When modifying this submodule — fixing bugs, changing logic, adjusting options, altering output schema — update README.md to reflect the changes. The README is the contract operators rely on. Stale docs are worse than no docs.

Rules specific to this module:

1. **Default (v1) behavior is frozen byte-identical.** The live v1 template (3a284997) still schedules this module with defaults. Any change to the default-off code path must keep `test-url-canonicalizer.js` section [A] (A/B vs git HEAD) green. New behavior goes behind `v2_behavior` or a new option.
2. **The v2 emit shapes are load-bearing against skeleton semantics.** Redirect emits must stay unflagged (must not match `flagged_when`) and must carry `original_url` = the old URL — that pair is what makes the skeleton's `transform` apply the rewrite (see README "v2 behavior" for the file:line citations). Unchanged rows are deliberately NOT emitted in v2 — do not "fix" that; a re-emit gets replaced wholesale and re-attributed at approval.
3. Run `node modules/step-2-validation/url-canonicalizer/test-url-canonicalizer.js` after any change (mocked, free).
