# Media Discovery — an api-search CONFIG (+ rss-feeds handoff)

**Step 1 — Discovery** · **provider config, NOT a module** · v1.0.0

Discovers an entity's **podcast presence** via the built `api-search` module, and hands each podcast's RSS feed to the built `rss-feeds` module for episode enumeration (brief: `docs/submodule-briefs-rev-2026-07-03/step1-youtube-podcast-discovery.md`). This is **config only** — an api-search `providers` preset (`providers.json`). No new module.

## What's here (`providers.json`)

| Provider | Auth | Status | Notes |
|---|---|---|---|
| **Apple Podcasts** (iTunes Search API) | none | **live** | `search_input: entity_names` → per-entity podcast search. `field_map.url = ["feedUrl", "collectionViewUrl"]` — every item carries the podcast's RSS feed for the rss-feeds handoff. |

**Wiring into a template:** point an `api-search` step's options at this preset (`search_input`, `max_results`, `providers`, `provider_params`). Then feed the resulting `url` (the podcast `feedUrl`) into an `rss-feeds` step to enumerate episodes. Vertical qualifiers ("{entity} igaming podcast") belong in template keyword config when using `search_input: keywords` — never in the provider config.

## rss-feeds handoff (enumeration)

- **Podcast episodes:** the `feedUrl` from iTunes results IS a standard RSS feed — `rss-feeds` (built) parses episodes directly. No API key, no quota.
- (YouTube channel RSS — `https://www.youtube.com/feeds/videos.xml?channel_id={id}` — is the analogous free enumeration path once a channel is discovered, but channel discovery is blocked; see below.)

## ⛔ YouTube — deliberately NOT in this preset (blocked on two grounds)

The brief's YouTube (video/channel search) provider is **excluded** here because it needs things that don't exist yet:

1. **api-search code dependency (the only code dependency, per the brief's Open Q1):** YouTube responses carry IDs, not URLs (`id.videoId`). The config needs an api-search `field_map` **template form** — `"url": {"template": "https://www.youtube.com/watch?v={id.videoId}"}` — which api-search does **not** support today (its `field_map` handles string paths / fallback arrays / null only). Without it, YouTube items have no `url` and violate api-search's item-key contract. This is a small, generic, Rule-13-clean api-search enhancement — but it is **code**, tracked separately (STOP-AND-REPORTED during this config unit; not written here).
2. **Missing key:** `YOUTUBE_DATA_API_KEY` is not among the approved existing keys (the brief marks it "new"; `GOOGLE_AI_API_KEY` / the GSC service-account GCP project are unverified candidates for YouTube-Data-API enablement). Even with the code, it couldn't run.

The ready-to-ship YouTube provider config (for when both unblock) is documented in the brief §"Example template configurations". PodcastIndex (HMAC headers) is likewise deferred — api-search's v1.1.0 header auth is *static* headers only, not computed signatures.

## Testing

- `node modules/step-1-discovery/config-media-discovery/test-media-discovery-config.js` — 15 assertions, `tools.http` mocked. Proves the preset is config-only (every `field_map` value is an api-search-supported form — no `{template}`) and that it **routes through the real api-search** (iTunes podcast search → items keyed by `feedUrl`, `media=podcast` param applied, entity-name search wired).
- `node modules/step-1-discovery/config-media-discovery/test-live-media-discovery-config.js` — **free live test** (iTunes Search API, no credentials). **Passed 2026-07-07**: entity "NPR" → 5 real podcasts, every item carrying a real RSS feed url (`feeds.npr.org/…/podcast.xml`) for the rss-feeds handoff.

## Inert by default

A config folder with **no `manifest.json` / `execute.js`** — the module loader skips it (benign "no manifest — skipped" log, like the `pipeline-*` folders). It changes nothing about `api-search` (git-verified untouched) and does nothing until a template's api-search step is pointed at it. Zero production effect on merge.
