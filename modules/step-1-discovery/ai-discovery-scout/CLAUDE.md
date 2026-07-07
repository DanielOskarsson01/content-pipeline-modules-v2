# ai-discovery-scout — CLAUDE.md

When modifying this submodule — fixing bugs, changing logic, adjusting options, altering output schema — update README.md to reflect the changes. The README is the contract operators and downstream modules rely on. Stale docs are worse than no docs.

Rules specific to this module:

1. **The scout runs NO search-API calls.** It proposes from model knowledge and verifies via HTTP. Search belongs to `search-discovery`. Do not add a search-provider path here — that collapses a deliberate module boundary.
2. **Verification is the anti-hallucination gate — keep it ON by default** (`keep_unverified: false`). An LLM will confidently invent plausible URLs; never make `keep_unverified: true` a template default without a Step-2 filter behind it.
3. Rule 13 hard line: no vertical vocabulary (platform names, directory names, iGaming/company/job terms) in the default prompt or code — it all belongs in the `prompt` preset. `lead_type` is a free string from the LLM, NOT a code-validated enum (the original's fixed `direct|youtube|linkedin|...` enum baked a content-type worldview into code — deleted).
4. `parseLeadsResponse` handles the array shape `[{...}]` AND the object shape `{leads:[...], suggested_queries:[...]}`; the corrective JSON retry follows the seo-planner v2.2.1 precedent (reformat the prior response, don't regenerate). Keep it loud on a second failure.
5. Run `node modules/step-1-discovery/ai-discovery-scout/test-ai-discovery-scout.js` after any change (mocked, free). The live test (`test-live-ai-discovery-scout.js`, needs `ANTHROPIC_API_KEY` via `~/.zprofile`) is **live-verified 2026-07-07** (real Haiku parse + real-HTTP liveness gate); re-run it when the prompt/parse/verify plumbing changes. Do NOT reach into skeleton production or read secret files for the key.
6. `_partialItems` is pushed after EVERY entity (Rule 10) — LLM + verification are the slow parts; a multi-entity run must survive a mid-run timeout.
