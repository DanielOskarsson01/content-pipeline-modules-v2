# keyword-data — module rules

1. **Generic engine, config providers (Rule 13).** All provider knowledge (base URL, auth env names, endpoint paths) lives in the `provider` option. No provider- or pipeline-specific logic in `execute.js` beyond the DataForSEO-shaped response envelope (`tasks[0].cost/status_code/result[0].items`).
2. **Loud failures only.** Missing creds, provider errors (incl. the shared account's daily money cap `40203`), HTTP failures, and cost-cap trips are `status: error` items with `meta.status: 'error'`. Never a silent empty (the LinkedIn-401-reported-approved failure class).
3. **Cost is read, not estimated.** Every call's `tasks[].cost` is accumulated onto `meta.api_usage`. The `cost_cap_usd` check runs before each call.
4. **`gsc_terms` is a placeholder.** It is filled by skeleton-side GSC hydration (specs `template-v3/keyword-data/KEYWORD_DATA.md` §6), never by this module — modules don't touch the DB (Rule 2).
5. **Term derivation is field-shape based** (`analysis_json` on the latest pool item that has it) with a seed-fields fallback; only conventional generic field names are harvested. Record which path ran in `derivation`.
6. **Update README.md on any change (Rule 7).** Tests: `test-keyword-data.js` must pass mocked; repo-wide `test-manifests-loadable.js` must stay green.
