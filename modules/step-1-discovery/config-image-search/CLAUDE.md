# config-image-search — CLAUDE.md

Two **configs**, NOT a module — api-search + search-discovery provider presets for image/logo discovery. No `manifest.json` / `execute.js`, so the loader skips the folder. When editing a preset, update README.md.

Rules specific to this config:

1. **Config-only, no module code.** api-search field_map values: string / fallback array / null only. search-discovery serp providers: standard serp shape. Do NOT add a provider that needs a capability the module lacks — the logo LOOKUP providers (Brandfetch/Logo.dev) need `{env:}` interpolation in `url_template` AND a custom `image_url`/`image_type` emit, neither of which search-discovery has; those are STOP-AND-REPORT code items, not config.
2. **Pexels rides api-search v1.1.0 header auth** (`Authorization: {env:PEXELS_API_KEY}`). Keep it a `headers` map, not `auth` (Pexels sends the raw key, no "Bearer").
3. **Every item carries `image_url`** for step-8 company-media shape-routing. Preserve it in every provider's field_map.
4. **Stock ≠ brand assets.** Pixabay/Unsplash/Pexels are illustrative stock; entity-specific logos/screenshots come from the search-discovery images vertical (and, once unblocked, the logo lookups). Don't conflate them.
5. Run `node .../config-image-search/test-image-search-config.js` (mocked) after any preset change.
6. **Live-verify DONE (2026-07-07)** — all four providers verified with real keys, each routed through its real module against the live API (harness in `/tmp`, module code untouched): stock (Pixabay/Unsplash/Pexels) via api-search → **15/15 items with `image_url`**, Pexels via the raw-key `Authorization` header (W2-A); image-SERP (Serper `/images`) via search-discovery → `result_type: images` + `image_url` on every item. All **HTTP 200**; no 401/code failures. See README "Live-verify — DONE".
