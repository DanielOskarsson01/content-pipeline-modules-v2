# API Fetcher

**Step 3 — Scraping (structured-source enrichment)** · `add` · `empty_ok` · cost: `medium` · v1.3.0

Generic identifier-driven structured-API fetcher. Given an entity carrying an API identifier (a channel id, a podcast feed URL, a company registry number), it fetches structured records from the matching API and adds them to the pool as items with `source_api`, `data_json`, `raw_text`, `fetch_date`, `status`. Adding a new API source = a JSON provider config, **not** code (canonical brief: `docs/submodule-briefs-rev-2026-07-03/step3-api-data-fetcher.md`).

**Reaching Step 4/5:** Step-5 generation (content-analyzer/writer) reads `text_content`, **not** `raw_text` — and Step-4 content-filter drops any item with `word_count < 50`. So by default a structured record is invisible to generation and filtered out before it. Set **`emit_text_content: true`** to also write `text_content` (a mirror of the flattened `raw_text`) and `word_count`, so the record survives content-filter and lands in `{entity_content}`. `text_content` is in `downloadable_fields`, so the skeleton persists it and re-hydrates it into content-analyzer via `requires_columns` (`§7b` hydration, `server/services/poolHydration.js`). Off by default = byte-identical legacy output. This is the LinkedIn-company enrichment bridge (see the Bright Data company block below).

**Why a new module (not a config of api-search):** `api-search` (Step 1) is keyword-search discovery into an empty pool — one identifier-less call per keyword, flat responses. This is identifier-driven *enrichment*: per-entity lookups, multi-endpoint chaining (fetch A, use a field of A in request B), XML/RSS support, and structured `data_json` output. Same config *pattern*, different behaviour class.

**Rule 13:** code knows only the generic engine — resolve-identifier → chain-endpoints → parse (JSON/XML) → map-fields → flatten-raw-text → emit. Endpoints, params, field maps, auth, and RSS tag names all arrive via the `providers` option. The defaults carry zero vertical assumptions (`providers: []` is a loud no-op).

## Why `empty_ok` at Step 3

Unlike the scrapers (which need Step-1 URLs in the pool), this module's identifiers usually come from an **entity seed column** (Step 0 CSV) — a `youtube_channel_id`, `company_number`, or `feed_url` field. So it must run even when no Step-1 URLs exist. Identifiers can *also* come from a pool-item field (set by Step-1 discovery); the entity seed field is checked first, then pool items. No identifier for an entity → that provider is skipped for it **with a note, never an error**.

## Provider config (`providers` option, presets enabled)

```json
{
  "id": "podcast-rss",
  "name": "Podcast RSS",
  "response_format": "xml",
  "identifier_source": { "entity_field": "feed_url", "item_field": "feed_url" },
  "endpoints": [
    {
      "id": "feed",
      "url": "{identifier}",
      "results_path": "rss.channel.item",
      "field_map": {
        "url": ["link", "enclosure.@url"],
        "title": "title",
        "audio": "enclosure.@url",
        "publishedAt": "pubDate",
        "description": "description"
      }
    }
  ]
}
```

**This exact block is live-verified (2026-07-06)** against a real Simplecast feed — episodes with title, page URL, and audio enclosure URL extracted from the `<enclosure url="...">` attribute. Zero credentials.

Two-hop chaining (YouTube "channel → uploads playlist → videos"; needs a new free `YOUTUBE_API_KEY`, **not yet live-verified**):

```json
{
  "id": "youtube",
  "name": "YouTube Data API v3",
  "response_format": "json",
  "identifier_source": { "entity_field": "youtube_channel_id", "item_field": "youtube_channel_id" },
  "auth": { "type": "query_param", "key": "key", "env_var": "YOUTUBE_API_KEY" },
  "endpoints": [
    { "id": "channel", "url": "https://www.googleapis.com/youtube/v3/channels",
      "params": { "part": "snippet,statistics,contentDetails", "id": "{identifier}" },
      "results_path": "items",
      "field_map": { "uploads_playlist": "contentDetails.relatedPlaylists.uploads", "title": "snippet.title", "subscribers": "statistics.subscriberCount" } },
    { "id": "videos", "url": "https://www.googleapis.com/youtube/v3/playlistItems",
      "params": { "part": "snippet", "playlistId": "{channel.uploads_playlist}", "maxResults": "{max_items}" },
      "results_path": "items",
      "field_map": { "url": "snippet.resourceId.videoId", "title": "snippet.title", "publishedAt": "snippet.publishedAt" },
      "url_template": "https://www.youtube.com/watch?v={url}" }
  ]
}
```

iTunes Lookup (JSON, **no auth**, live-verified 2026-07-06):

```json
{
  "id": "itunes-lookup",
  "name": "iTunes Lookup",
  "response_format": "json",
  "identifier_source": { "entity_field": "itunes_id" },
  "endpoints": [
    { "id": "lookup", "url": "https://itunes.apple.com/lookup", "params": { "id": "{identifier}" },
      "results_path": "results",
      "field_map": { "url": "feedUrl", "title": "collectionName", "episodes": "trackCount", "genre": "primaryGenreName" } }
  ]
}
```

Companies House (UK registry, JSON, `basic` auth = key as username; needs a free `COMPANIES_HOUSE_API_KEY`, **not yet live-verified**):

```json
{
  "id": "companies-house",
  "name": "Companies House (UK)",
  "response_format": "json",
  "identifier_source": { "entity_field": "company_number" },
  "auth": { "type": "basic", "env_var": "COMPANIES_HOUSE_API_KEY" },
  "endpoints": [
    { "id": "profile", "url": "https://api.company-information.service.gov.uk/company/{identifier}",
      "results_path": "",
      "field_map": { "url_id": "company_number", "title": "company_name", "status": "company_status", "incorporated": "date_of_creation" },
      "url_template": "https://find-and-update.company-information.service.gov.uk/company/{url_id}" }
  ]
}
```

POST + `bearer` auth (a synchronous dataset/actor run that returns a top-level array; needs a `DATASET_API_TOKEN`, **not yet live-verified**):

```json
{
  "id": "dataset-run",
  "name": "Sync dataset run (POST)",
  "response_format": "json",
  "identifier_source": { "entity_field": "dataset_query" },
  "auth": { "type": "bearer", "env_var": "DATASET_API_TOKEN" },
  "endpoints": [
    { "id": "run", "method": "POST",
      "url": "https://api.example.com/v2/run-sync-get-dataset-items",
      "body": { "query": "{identifier}", "maxItems": "{max_items}" },
      "field_map": { "url": "url", "title": "title", "text": "text" } }
  ]
}
```

Placeholders (`{identifier}`, `{max_items}`, `{endpoint_id.field}`) interpolate into the `body`'s string values just as they do in `url`/`params`. `results_path` is omitted, so the response — a bare top-level JSON array — is mapped directly. `Authorization: Bearer <DATASET_API_TOKEN>` is set from the env var; missing token → provider skipped like any other auth type. **Async trigger→poll→download** dataset APIs (Bright Data Datasets: POST a trigger, poll a `snapshot_id`, then download) are **not** covered — a single POST per endpoint has no poll-until-ready step; see Limitations.

POST + `bearer`, `empty_is_error` set (the harvestapi LinkedIn **employees** actor — it returns `201 []` for every company, so a silent empty must be surfaced as an error, not a legitimate `not_found`):

```json
{
  "id": "linkedin-company-employees",
  "name": "LinkedIn Company Employees (harvestapi via Apify)",
  "response_format": "json",
  "empty_is_error": true,
  "identifier_source": { "entity_field": "linkedin" },
  "auth": { "type": "bearer", "env_var": "APIFY_TOKEN" },
  "endpoints": [
    { "id": "employees", "method": "POST",
      "url": "https://api.apify.com/v2/acts/harvestapi~linkedin-company-employees/run-sync-get-dataset-items",
      "body": { "companies": ["{identifier}"], "maxItems": "{max_items}" },
      "field_map": { "url": "linkedinUrl", "title": "position", "text": "name" } }
  ]
}
```

POST + `bearer`, `empty_is_error` — **Bright Data LinkedIn People via the synchronous Datasets *Search* endpoint** (`gd_l1viktl72bvl7bjuj0`; live-verified 2026-08-10). Unlike the async Filter route noted above, Search returns records **inline** in `hits[]` (HTTP 200, ~3s, no `snapshot_id`, no poll) — so it is a **plain api-fetcher config, no poll primitive needed**. Server-side `includes` only reduces volume; clean role selection is done by the Step-4 `decision-maker-selector` (word-boundary regex — `includes CTO` would match "dire*cto*r"). Full block + B4 filter reasoning: `docs/brightdata-linkedin-people-filter-provider.md`.

```json
{
  "id": "brightdata-linkedin-people",
  "name": "Bright Data — LinkedIn People (Datasets Search API, synchronous)",
  "response_format": "json",
  "auth": { "type": "bearer", "env_var": "BRIGHTDATA_API_KEY" },
  "identifier_source": { "entity_field": "company_name", "item_field": "current_company_name" },
  "empty_is_error": true,
  "endpoints": [
    { "id": "search", "method": "POST",
      "url": "https://api.brightdata.com/datasets/search/gd_l1viktl72bvl7bjuj0",
      "body": { "size": 100, "filter": { "operator": "and", "filters": [
        { "name": "current_company_name", "operator": "includes", "value": "{identifier}" },
        { "operator": "or", "filters": [
          { "name": "position", "operator": "includes", "value": "Head" },
          { "name": "position", "operator": "includes", "value": "Chief" },
          { "name": "position", "operator": "includes", "value": "Founder" },
          { "name": "position", "operator": "includes", "value": "Director" }
        ] } ] } },
      "results_path": "hits",
      "field_map": { "name": "name", "title": "position", "company": "current_company_name",
        "company_id": "current_company_company_id", "url": "url", "location": "location" } }
  ]
}
```

POST + `bearer`, `empty_is_error`, **`emit_text_content` ON** — **Bright Data LinkedIn *Company* via the synchronous Datasets *Search* endpoint** (`gd_l1vikfnt1wgvvqz95w`; field_map live-verified against pushgaming.com 2026-08-25, and the record shape 2026-08-11 — `brightdata-live-findings-2026-08-11/`). Keyed on the entity's **bare website domain** (`website includes {identifier}` resolves 1:1 for most companies). The record carries the full company profile (`about`, `description`, `specialties`, `industries`, `company_size`, `headquarters`, `followers`) **and a populated `updates[]` array of up to 10 recent posts inline** (post `text`, `date`, `post_url`, `likes_count`) — so a company's profile *and* its recent LinkedIn posts arrive in **one synchronous ~1.3 s call, no poll**. Because the field_map maps `updates`, those posts flow into `raw_text` → `text_content`, giving Step-5 the company's own words.

```json
{
  "id": "linkedin-company",
  "name": "Bright Data — LinkedIn Company (Datasets Search API, synchronous)",
  "response_format": "json",
  "auth": { "type": "bearer", "env_var": "BRIGHTDATA_API_KEY" },
  "identifier_source": { "entity_field": "website" },
  "empty_is_error": true,
  "endpoints": [
    { "id": "search", "method": "POST",
      "url": "https://api.brightdata.com/datasets/search/gd_l1vikfnt1wgvvqz95w",
      "body": { "size": 1, "filter": { "name": "website", "operator": "includes", "value": "{identifier}" } },
      "results_path": "hits",
      "field_map": { "url": "url", "title": "name", "about": "about", "description": "description",
        "specialties": "specialties", "industries": "industries", "company_size": "company_size",
        "headquarters": "headquarters", "followers": "followers", "updates": "updates" } }
  ]
}
```

Set the module option **`emit_text_content: true`** for this provider (it's the point of the block — without it the company record is dropped at Step 4). **Also set `domain_source: pool_url_host`** (v1.3.0): the block keys on the entity's bare website domain, but the seed `website` column does **not** survive to Step 3 — the per-step entity is rebuilt from the pool with only `{entity_name}`, so `identifier_source: {entity_field: "website"}` resolves to nothing and the provider goes inert (R0 finding: 0 LinkedIn records). `pool_url_host` derives the domain from the entity's own pool item urls instead, so the lookup fires without any seed carry. Env var is **`BRIGHTDATA_API_KEY`** (the working key name — *not* `BRIGHT_DATA_API_KEY`). Live notes: `updates[]` is **bimodal per record** — either populated to the 10-post cap or empty `[]` (Bright Data has no cached feed for that company); the profile fields alone still clear the 50-word bar, so an empty-`updates` company is still kept. A few domains resolve to >1 or 0 hits (`size: 1` keeps cost at ~1 record either way; the top hit is used). Cost ≈ **$0.0025 / company** (1 record at list price). `updates[]` gives ≤10 most-recent posts for free inside the company fetch; deeper/older post history needs the async posts dataset (BACKLOG #56 — not this module).

### Config schema

- **`response_format`** — `"json"` (default) or `"xml"`. XML (RSS/Atom) is converted to a JSON object generically: elements → keys, repeated siblings → arrays, attributes → `@name` keys (e.g. `enclosure.@url`), CDATA/text → strings. `results_path` / `field_map` then apply identically. RSS tag names live in config, not code.
- **`identifier_source`** — `{ entity_field, item_field }`. Entity seed field checked first, then each pool item's `item_field`. All resolved identifiers (deduped) are fetched.
- **`endpoints[]`** — executed in order. `{identifier}`, `{max_items}`, and `{endpoint_id.field}` placeholders chain responses (a later endpoint reads a mapped field from the first record of an earlier one). An endpoint whose chained placeholder can't be resolved is **skipped with a reason** (not a failure).
- **`method`** — `"GET"` (default) or `"POST"`. Only these two are supported; an unknown verb is treated as GET **with a warning** (config typo guard). Omit for GET; existing configs are unaffected.
- **`body`** — POST only. **Prefer a JSON object** (the engine sends it as the request body and the platform JSON-serializes it, so interpolated values are JSON-escaped and safe). A string body is also accepted but its interpolated values are inserted **raw / unescaped** — only use a string body when the identifiers can't break its format. Every string leaf is run through the same placeholder substitution as the URL/params, so `{identifier}`/`{max_items}`/`{endpoint_id.field}` interpolate; an unresolved placeholder skips the endpoint with a reason. Ignored on GET endpoints.
- **`results_path`** — dot-notation into the response for the record array. `""` / omitted = the response itself (single-object endpoints like Companies House); a single object is coerced to a one-element array.
- **`field_map`** — canonical name → dot-path string, fallback array (first non-empty wins), or `null`. Maps into `data_json` and `raw_text`.
- **`url`** — every emitted item needs one (the pool `item_key`). It comes from the `field_map` `url`, or — for bare ids — from `url_template` (`{field}` placeholders over the mapped record + `{identifier}`). An endpoint that maps no `url` and declares no `url_template` is **chain-only**: it runs and feeds later endpoints but emits no pool items (e.g. a YouTube `channel` hop that only supplies `uploads_playlist`).
- **`raw_text_template`** — optional per-endpoint `{field}` template for `raw_text`. Default is `Key: value` lines over the mapped fields.
- **`auth.type`** — `none` | `query_param` (`key` → query param) | `header` (`key` → header name, value verbatim) | `bearer` (`Authorization: Bearer <env value>`) | `basic` (`env` value as username, empty password — Companies House). Missing env var → provider skipped (see `skip_providers_without_auth`).
- **`empty_is_error`** — provider-level, default `false`. When `true`, a **2xx response with zero records** on the first endpoint becomes an **error** (`meta.errors` incremented, `meta.status: "error"`, and an item with `status: "error"` + `reason: "empty_result"`) instead of a `not_found`. Set it for endpoints that MUST return a record for a valid identifier — e.g. the harvestapi `linkedin-company-employees` actor, which returns `201 []` for every company (a silent empty that otherwise looks like a legitimate not_found). Leave it off (default) for lookup/registry/search configs where empty is a valid answer (iTunes, Companies House, YouTube).

## Options

| Option | Default | When to Change | What It Does |
|---|---|---|---|
| `providers` | `[]` | Always (empty = no-op) | Provider config array (presets: save/name/star in UI). No providers = loud no-op. |
| `provider_params` | `{}` | Extra static query params (e.g. registry page size) | Merged into every endpoint request, keyed by provider id: `{"companies-house": {"items_per_page": "20"}}`. |
| `max_items` | `25` | Lower to conserve quota; raise for deeper history | Caps records kept per endpoint AND substitutes into `{max_items}` params. |
| `requests_per_minute` | `30` | Lower for strict registries (Companies House 600/5min) | Global token-bucket across all providers/entities/endpoints. |
| `raw_text_max_chars` | `20000` | Lower to shrink Step-5 input | Truncates each item's flattened `raw_text`. |
| `skip_providers_without_auth` | `true` | `false` to try an unauthenticated call | Missing auth env var → skip provider with a warning (true) vs call without the key (false). |
| `emit_text_content` | `false` | `true` when the records should feed Step-5 generation (e.g. LinkedIn-company) | Also writes `text_content` (mirror of `raw_text`) + `word_count` so items survive Step-4 content-filter and content-analyzer reads them. Off = byte-identical legacy output. |
| `domain_source` | `entity_field` | `pool_url_host` for a domain-keyed provider when the seed website column does not survive to Step 3 | Where the `{identifier}` comes from. `entity_field` (default) uses each provider's `identifier_source`. `pool_url_host` derives the entity's registrable domain from the most frequent host across its own pool item urls (ignoring obvious third-party hosts like youtube/linkedin). **Fallback-only**: a provider that resolves its own identifier keeps it; only a provider that resolves nothing uses the derived domain, so the mode composes with a multi-provider config. No host derivable → the entity is skipped with a **loud warn**, never a silent empty fetch. |

## What good output looks like

Each emitted item: `source_api` (provider id), `url` (key), `title`, `raw_text` (flattened text), `data_json` (the mapped fields, JSON-stringified), `fetch_date` (ISO date), `status` (`success` \| `not_found` \| `error`), `reason` (on `error` items — e.g. `empty_result`), and `entity_name`. When `emit_text_content: true`, each item also carries `text_content` (a copy of `raw_text`) and `word_count` — a dead/empty identifier gets `text_content: ""` / `word_count: 0` so content-filter drops it (nothing to write). `raw_text`, `data_json`, and `text_content` are downloadable from the results pane.

**Warning signs:** all-`not_found` for a provider → the identifiers are wrong/dead (check the seed column). Provider missing from active list → its auth env var is unset (see the startup warning). Zero items with providers configured → no entity carried a matching identifier (each has a per-provider note in meta).

## Limitations

- **v1 fetches one page per endpoint** (no `pageToken` pagination) — `max_items` bounds it; add a generic paging config later if a template needs >50 records.
- **POST is a single synchronous request per endpoint** — good for synchronous "run and return results" dataset/actor APIs. **Async trigger→poll→download** APIs (POST a trigger, poll a `snapshot_id`/progress until ready, then download) are **not** supported: endpoint chaining has no poll-until-ready or retry-with-backoff between hops, so a download hop fires before the data exists. That needs a separate async-poll primitive (a distinct module) — see BACKLOG.
- **Signed-header auth** (e.g. Podcast Index's SHA-1 triplet) is not supported — it needs a named auth handler in code. Deferred; feed URLs usually arrive as seed data anyway.
- **Dead providers** (do NOT config): Google Custom Search JSON API (sunset 2027-01), OpenCorporates free keys and Crunchbase free Basic API (both eliminated) — see the brief.
- **Identifiers in a URL *path* are substituted raw (not url-encoded)** — because an identifier is often a whole URL (a feed URL in `"url": "{identifier}"`) that encoding would corrupt. All documented providers use URL-safe identifiers (alphanumeric channel/company/Q-ids, or full URLs). If a template ever needs a path identifier containing `#`, `?`, or `%`, pre-encode it in the seed data. Query-param values are always encoded.
- `data_json` is stringified for renderer safety; downstream modules `JSON.parse` it.
- **`domain_source: pool_url_host`** derives the *most frequent* host and reduces to the full www-stripped host, not a Public Suffix List eTLD+1 — a subdomain-heavy pool can fragment the count, and an entity whose own site *is* a denylisted third-party host (rare) derives nothing and is skipped with a loud warn. It uses the derived domain only for providers that resolve no identifier of their own.

## What happens next

Items land in the Step-3 pool alongside scraped pages. Step-4 cleanup and Step-5 generation read `raw_text` (like `text_content`) and `data_json` (verifiable numbers — subscriber counts, filing dates, episode counts). Because `data_operation` is `add`, output upserts by `(url, source_submodule)` — it augments the pool, never overwrites other scrapers' items.

## Testing

- `node modules/step-3-scraping/api-fetcher/test-api-fetcher.js` — 112 assertions, all HTTP mocked, no credentials, no network. Includes the `emit_text_content` bridge: off-mode byte-identity (additive-only proof), on-mode `text_content`/`word_count`, and a free in-repo integration (LinkedIn-company fixture → real content-filter `execute` → item KEPT with text for content-analyzer).
- `node modules/step-3-scraping/api-fetcher/test-domain-source.js` — 19 assertions, HTTP mocked. `domain_source: pool_url_host` — default byte-identity vs git HEAD, R0-shape derivation (`pushgaming.com` from a no-website pool), dominant-host / third-party-exclusion tie-breaks, and the empty/urlless loud-degrade (no silent empty fetch).
- `node modules/step-3-scraping/api-fetcher/test-live-api-fetcher.js` — **credential-free** live test (iTunes Lookup JSON + Podcast RSS XML against real free APIs, chained). Passed 2026-07-06.

## Technical Reference

- **Step:** 3 (Scraping) · **Category:** enrichment · **Cost:** medium (15-min timeout)
- **Data operation:** `add` (+) — net-new structured items, upsert by `(url, source_submodule)`
- **Pool precondition:** `empty_ok` — runs on identifiers from entity seed columns, no Step-1 URLs required
- **Required input columns:** `["name"]` (identifier fields are per-provider config, not hardcoded)
- **Error handling:** per-provider and per-identifier isolation — one provider's 500/parse-failure/quota-403 doesn't kill the others; missing identifier → note, not error; empty result → a `not_found` item **by default, or a counted `error` (`reason: empty_result`) when the provider sets `empty_is_error`**; `_partialItems` pushed after every provider fetch per entity (Rule 10). Any **2xx** status counts as success (some sync APIs return `201` — e.g. Apify `run-sync-get-dataset-items`), not only `200`. `meta.status` is `"error"` when the entity accrued any errors, else `"ok"`.
- **External dependencies:** none beyond `tools.http`; provider auth via per-provider `env_var` (all optional, provider-scoped).

## Changelog

- **1.3.0** (2026-08-29) — `domain_source` option (default `entity_field`, byte-identical when off; verified via A/B vs git HEAD). `pool_url_host` derives the entity's registrable domain from the most frequent host across its own pool item urls (obvious third-party hosts — youtube/linkedin/etc. — excluded) and uses it as the `{identifier}` for every active provider. Fixes the **B034 / R0 finding**: the Bright Data LinkedIn-*Company* block keys on the entity website, but seed fields don't survive past Step 1 — the per-step entity is rebuilt from the pool with only `{entity_name}`, so `identifier_source: {entity_field: "website"}` resolved to nothing and the leg returned 0 records. Deriving the domain from the pool is the M2b pool-item-read fix, no seed carry needed; the derived domain is logged at info (R1-provable), and an underivable pool degrades with a loud warn (no silent empty fetch). +19 test assertions (`test-domain-source.js`).
- **1.2.0** (2026-08-25) — `emit_text_content` option (default `false`, byte-identical when off). When on, each emitted item also carries `text_content` (a mirror of the flattened `raw_text`) and `word_count`, plus `text_content` is added to `output_schema.downloadable_fields`. This is the LinkedIn-company bridge (M2): Step-4 content-filter keeps items by `word_count` and Step-5 content-analyzer/writer read `text_content`, so structured API records were previously dropped at Step 4 and invisible to Step 5. The `downloadable_fields` entry is load-bearing — the skeleton persists only downloadable fields to `submodule_run_item_data` and re-hydrates a downstream module's `requires_columns` from those rows (`stageWorker.js:642-704` + `poolHydration.js:42-229`), so without it content-analyzer's `requires_columns: ["text_content"]` could never re-hydrate. Ships with the paste-ready **Bright Data LinkedIn-*Company* Datasets Search** block (`gd_l1vikfnt1wgvvqz95w`, `BRIGHTDATA_API_KEY`, field_map live-verified against pushgaming.com) whose `updates[]` posts flow inline into `text_content`. +28 test assertions (112 total). Also corrects the header comment that falsely claimed Step 5 consumes `raw_text` like `text_content`.
- **1.1.2** (2026-08-09) — `empty_is_error` provider flag (default off): a 2xx with zero records on the first endpoint becomes a counted error (`meta.errors`, `meta.status: "error"`, item `status: "error"` + `reason: "empty_result"`) instead of a silent `not_found`. Closes the observability gap the 1.1.1 2xx fix opened — Apify's `201 []` moved from the error branch to the success branch, so an empty employees-actor result looked like a legitimate not_found. Set on the harvestapi `linkedin-company-employees` config (returns `201 []` for every company). +7 test assertions (84 total).
- **1.1.1** (2026-08-07) — accept any 2xx status as success, not only 200. Apify's synchronous `run-sync-get-dataset-items` returns `201 Created` with the dataset rows in the body; the previous `!== 200` check logged that as an error and dropped the data. Enables the cookie-free LinkedIn company/profile/posts actors (harvestapi via Apify) as provider configs. +2 test assertions (77 total).
- **1.1.0** (2026-07-17) — POST support: optional `method` (`GET` default | `POST`) and `body` (JSON object or string, placeholders interpolated) per endpoint, plus a `bearer` auth type (`Authorization: Bearer <token>`). Response side unchanged — a POST returning a bare top-level array maps through `field_map` with `results_path` omitted. Backward-compatible: no `method` = GET, so all v1.0.0 configs behave identically. Unlocks synchronous run-and-return dataset/actor providers; async trigger→poll→download still needs a separate primitive (see Limitations + BACKLOG).
- **1.0.0** (2026-07-06) — initial version per the canonical revised brief. iTunes Lookup (JSON) + Podcast RSS (XML) provider blocks live-verified, zero credentials. YouTube (2-hop chaining) and Companies House (basic auth) blocks documented but not yet live-verified (need new free keys). Pre-commit code review: `url_template` now always synthesizes/normalizes the item URL when present (so `field_map` mapping a bare id — `videoId`, registry number — becomes a canonical URL), per the brief's "synthesized via url_template if the API returns bare ids".
