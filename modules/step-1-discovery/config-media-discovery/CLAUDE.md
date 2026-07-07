# config-media-discovery — CLAUDE.md

This is a **config**, NOT a module — an api-search `providers` preset (`providers.json`) for podcast discovery. No `manifest.json` / `execute.js`, so the module loader skips it. When editing the preset, update README.md.

Rules specific to this config:

1. **Config-only, no module code.** Every `field_map` value MUST use an api-search-supported form (string path / fallback array / null). The `{template:...}` field_map form does NOT exist in api-search yet — do not add a provider that needs it (YouTube) until that generic enhancement ships. The test enforces "no `{template}` form."
2. **iTunes needs no auth/key** (free). Keep it that way — it's the free live-test path for the whole media-discovery design.
3. **The url IS the RSS feed.** `field_map.url = ["feedUrl", "collectionViewUrl"]` — downstream, that url is fed to the built `rss-feeds` module to enumerate episodes. Preserve the feedUrl-first ordering.
4. **YouTube + PodcastIndex are deferred** (see README): YouTube needs the api-search field_map template form + a YouTube Data API key; PodcastIndex needs HMAC header auth (api-search v1.1.0 has static headers only). Both are STOP-AND-REPORT items, not something to hack around in config.
5. Run `node .../config-media-discovery/test-media-discovery-config.js` (mocked) after any preset change; `test-live-media-discovery-config.js` is free (iTunes, no key) — re-run it if the iTunes provider config changes.
6. **Live-verified 2026-07-07** — entity "NPR" → 5 real podcasts through real api-search, each with an RSS feed url.
