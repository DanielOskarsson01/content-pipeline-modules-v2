# API Fetcher

**Step 3 — Scraping (structured-source enrichment)** · `add` · `empty_ok` · cost: `medium` · v1.1.0

Generic identifier-driven structured-API fetcher. Given an entity carrying an API identifier (a channel id, a podcast feed URL, a company registry number), it fetches structured records from the matching API and adds them to the pool as items with `source_api`, `data_json`, `raw_text`, `fetch_date`, `status`. Downstream Step 5 modules consume `raw_text` / `data_json` exactly like scraped `text_content`. Adding a new API source = a JSON provider config, **not** code (canonical brief: `docs/submodule-briefs-rev-2026-07-03/step3-api-data-fetcher.md`).

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

## Options

| Option | Default | When to Change | What It Does |
|---|---|---|---|
| `providers` | `[]` | Always (empty = no-op) | Provider config array (presets: save/name/star in UI). No providers = loud no-op. |
| `provider_params` | `{}` | Extra static query params (e.g. registry page size) | Merged into every endpoint request, keyed by provider id: `{"companies-house": {"items_per_page": "20"}}`. |
| `max_items` | `25` | Lower to conserve quota; raise for deeper history | Caps records kept per endpoint AND substitutes into `{max_items}` params. |
| `requests_per_minute` | `30` | Lower for strict registries (Companies House 600/5min) | Global token-bucket across all providers/entities/endpoints. |
| `raw_text_max_chars` | `20000` | Lower to shrink Step-5 input | Truncates each item's flattened `raw_text`. |
| `skip_providers_without_auth` | `true` | `false` to try an unauthenticated call | Missing auth env var → skip provider with a warning (true) vs call without the key (false). |

## What good output looks like

Each emitted item: `source_api` (provider id), `url` (key), `title`, `raw_text` (flattened text for Step-5), `data_json` (the mapped fields, JSON-stringified), `fetch_date` (ISO date), `status` (`success` \| `not_found` \| `error`), and `entity_name`. `data_json` and `raw_text` are downloadable from the results pane.

**Warning signs:** all-`not_found` for a provider → the identifiers are wrong/dead (check the seed column). Provider missing from active list → its auth env var is unset (see the startup warning). Zero items with providers configured → no entity carried a matching identifier (each has a per-provider note in meta).

## Limitations

- **v1 fetches one page per endpoint** (no `pageToken` pagination) — `max_items` bounds it; add a generic paging config later if a template needs >50 records.
- **POST is a single synchronous request per endpoint** — good for synchronous "run and return results" dataset/actor APIs. **Async trigger→poll→download** APIs (POST a trigger, poll a `snapshot_id`/progress until ready, then download) are **not** supported: endpoint chaining has no poll-until-ready or retry-with-backoff between hops, so a download hop fires before the data exists. That needs a separate async-poll primitive (a distinct module) — see BACKLOG.
- **Signed-header auth** (e.g. Podcast Index's SHA-1 triplet) is not supported — it needs a named auth handler in code. Deferred; feed URLs usually arrive as seed data anyway.
- **Dead providers** (do NOT config): Google Custom Search JSON API (sunset 2027-01), OpenCorporates free keys and Crunchbase free Basic API (both eliminated) — see the brief.
- **Identifiers in a URL *path* are substituted raw (not url-encoded)** — because an identifier is often a whole URL (a feed URL in `"url": "{identifier}"`) that encoding would corrupt. All documented providers use URL-safe identifiers (alphanumeric channel/company/Q-ids, or full URLs). If a template ever needs a path identifier containing `#`, `?`, or `%`, pre-encode it in the seed data. Query-param values are always encoded.
- `data_json` is stringified for renderer safety; downstream modules `JSON.parse` it.

## What happens next

Items land in the Step-3 pool alongside scraped pages. Step-4 cleanup and Step-5 generation read `raw_text` (like `text_content`) and `data_json` (verifiable numbers — subscriber counts, filing dates, episode counts). Because `data_operation` is `add`, output upserts by `(url, source_submodule)` — it augments the pool, never overwrites other scrapers' items.

## Testing

- `node modules/step-3-scraping/api-fetcher/test-api-fetcher.js` — 75 assertions, all HTTP mocked, no credentials, no network.
- `node modules/step-3-scraping/api-fetcher/test-live-api-fetcher.js` — **credential-free** live test (iTunes Lookup JSON + Podcast RSS XML against real free APIs, chained). Passed 2026-07-06.

## Technical Reference

- **Step:** 3 (Scraping) · **Category:** enrichment · **Cost:** medium (15-min timeout)
- **Data operation:** `add` (+) — net-new structured items, upsert by `(url, source_submodule)`
- **Pool precondition:** `empty_ok` — runs on identifiers from entity seed columns, no Step-1 URLs required
- **Required input columns:** `["name"]` (identifier fields are per-provider config, not hardcoded)
- **Error handling:** per-provider and per-identifier isolation — one provider's 500/parse-failure/quota-403 doesn't kill the others; missing identifier → note, not error; empty result → a `not_found` item; `_partialItems` pushed after every provider fetch per entity (Rule 10).
- **External dependencies:** none beyond `tools.http`; provider auth via per-provider `env_var` (all optional, provider-scoped).

## Changelog

- **1.1.0** (2026-07-17) — POST support: optional `method` (`GET` default | `POST`) and `body` (JSON object or string, placeholders interpolated) per endpoint, plus a `bearer` auth type (`Authorization: Bearer <token>`). Response side unchanged — a POST returning a bare top-level array maps through `field_map` with `results_path` omitted. Backward-compatible: no `method` = GET, so all v1.0.0 configs behave identically. Unlocks synchronous run-and-return dataset/actor providers; async trigger→poll→download still needs a separate primitive (see Limitations + BACKLOG).
- **1.0.0** (2026-07-06) — initial version per the canonical revised brief. iTunes Lookup (JSON) + Podcast RSS (XML) provider blocks live-verified, zero credentials. YouTube (2-hop chaining) and Companies House (basic auth) blocks documented but not yet live-verified (need new free keys). Pre-commit code review: `url_template` now always synthesizes/normalizes the item URL when present (so `field_map` mapping a bare id — `videoId`, registry number — becomes a canonical URL), per the brief's "synthesized via url_template if the API returns bare ids".
