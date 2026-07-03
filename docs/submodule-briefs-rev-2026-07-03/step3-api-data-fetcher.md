# Submodule Brief: api-fetcher (Generic Structured-API Fetcher) (revised)

**Step:** 3 — Scraping (structured-source enrichment)
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Fetch structured data from APIs (YouTube, podcast RSS, company registries) for entities that have API-accessible sources.
**Build status:** not built
**Design verdict:** new generic module `api-fetcher` — provider-config pattern copied from the built `api-search` module (filename kept; canonical module id renamed from "api-data-fetcher" to `api-fetcher`)

## Goal

Given an entity that carries API identifiers (a YouTube channel id, a podcast feed URL, a company registry number), fetch structured records from the corresponding APIs and add them to the pool as items with `source_api`, `data_json`, `raw_text` (flattened for LLM consumption), `fetch_date`. Downstream Step 5 modules consume `raw_text`/`data_json` exactly like scraped `text_content`.

**Why not config of an existing module** (Rule-13 hierarchy): `api-search` (Step 1) is keyword-search discovery into an empty pool — one identifier-less call per keyword, flat single-endpoint responses. This module is identifier-driven enrichment: per-entity lookups, multi-endpoint chaining (fetch A, use a field of A in request B), XML/RSS support, and structured `data_json` output. Same *pattern* (JSON provider configs — new provider = config, not code), different behavior class. `rss-feeds` (Step 1) discovers URLs from feeds for scraping; this module extracts feed *metadata as content*. New module justified; it deliberately reuses api-search's config conventions (`field_map` dot-notation with fallback arrays, `results_path`, per-provider `auth`, silent-skip on missing env var).

## Design (agnostic)

Code contains ONLY the generic engine: HTTP via `tools.http`, auth injection, response parsing (JSON + XML/RSS normalization), endpoint chaining, field mapping, raw-text flattening, rate limiting. **All provider knowledge is JSON config** in the `providers` option (presets_enabled — templates upload/star provider sets via the UI).

Provider config shape (extends the api-search precedent):

```json
{
  "id": "youtube",
  "name": "YouTube Data API v3",
  "auth": { "type": "query_param", "key": "key", "env_var": "YOUTUBE_API_KEY" },
  "identifier_source": { "entity_field": "youtube_channel_id", "item_field": "youtube_channel_id" },
  "response_format": "json",
  "endpoints": [
    { "id": "channel", "url": "https://www.googleapis.com/youtube/v3/channels",
      "params": { "part": "snippet,statistics,contentDetails", "id": "{identifier}" },
      "results_path": "items",
      "field_map": { "url": null, "title": "snippet.title", "subscribers": "statistics.subscriberCount",
                     "video_count": "statistics.videoCount", "uploads_playlist": "contentDetails.relatedPlaylists.uploads" } },
    { "id": "videos", "url": "https://www.googleapis.com/youtube/v3/playlistItems",
      "params": { "part": "snippet", "playlistId": "{channel.uploads_playlist}", "maxResults": "{max_items}" },
      "results_path": "items",
      "field_map": { "url": "snippet.resourceId.videoId", "title": "snippet.title", "description": "snippet.description", "publishedAt": "snippet.publishedAt" } }
  ]
}
```

- `identifier_source` — where the identifier comes from: an entity seed field (Step 0 CSV column) and/or a pool-item field (set by Step 1 discovery). Entity field checked first. No identifier → entity skipped with a note (never an error).
- `endpoints[]` — executed in order; `{identifier}` and `{<endpoint_id>.<field>}` placeholders chain responses (the YouTube "channel → uploads playlist → videos" two-hop is the motivating case).
- `response_format: "json" | "xml"` — XML responses (podcast RSS) are converted to a JSON object generically (elements → keys, repeated elements → arrays); `results_path`/`field_map` then apply identically. RSS knowledge (channel/item tag names) lives in provider config, not code.
- **Output item per mapped record:** `source_api` (provider id), `url` (canonical resource URL from field_map — pool `item_key`; providers must map one, synthesized via `url_template` if the API returns bare ids), `externalId`, `data_json` (the mapped fields, JSON-stringified for renderer safety), `raw_text` (flattened `Key: value` lines by default, or a per-endpoint `raw_text_template` with `{field}` placeholders), `fetch_date` (ISO date), `status`.
- Auth types in code (agnostic infra, mirrors api-search plus what registries need): `none`, `query_param`, `header` (e.g. `X-cb-user-key`), `basic` (Companies House: key as username). Signed-header schemes (Podcast Index's SHA-1 triplet) would need a named auth handler in code — deferred, see Open questions.

**Rule 13 test:** every provider — endpoints, params, mapping, flattening, identifiers — is uploadable template configuration. Code never mentions YouTube, podcasts, companies, or any vertical.

## Module contract

- **item_key:** `url`
- **data_operation_default:** `add` (net-new structured items; upsert by `(itemKey, source_submodule)` preserves other scrapers' items)
- **pool_precondition:** `empty_ok` — deliberate deviation from the usual Step-3 `requires_items`: identifiers typically come from entity seed columns (Step 0), so the module must run even when no Step-1 URLs exist for an entity. When `identifier_source.item_field` is the only source configured and the pool is empty, the entity yields a "no identifiers" note.
- **cost:** `medium` (network I/O, 1–3 requests per provider per entity; no LLM)
- **requires_columns:** `["name"]` (identifier fields are declared per provider config, not hardcoded)
- **_partialItems:** push after EVERY successful provider fetch per entity (Rule 10 — network I/O module; a timeout must not destroy fetched records).

## Options (manifest sketch)

| Option | Type | Default | Notes |
|---|---|---|---|
| `providers` | json | `[]` | provider configs; `presets_enabled: true`. Empty default = runnable no-op (Rule 13: no vertical baked in) |
| `provider_params` | json | `{}` | extra params per provider id (api-search precedent) |
| `max_items` | number | `25` | cap per list endpoint (videos, episodes) — quota guard |
| `requests_per_minute` | number | `30` | global token-bucket (api-search/api-scraper precedent) |
| `raw_text_max_chars` | number | `20000` | truncate flattened text |
| `skip_providers_without_auth` | boolean | `true` | missing env var → skip provider with warning (api-search rule 10 precedent) |

`output_schema`: table; `source_api`, `url`, `title`, `raw_text` preview, `fetch_date`, `status`; `flagged_when: { status: ["error"] }`; `downloadable_fields`: `raw_text` (.txt), `data_json` (.json).

## Providers (researched 2026-07-03)

| Provider | Env var | Free tier | Pricing | Verdict / notes |
|---|---|---|---|---|
| YouTube Data API v3 | `YOUTUBE_API_KEY` — new free key (existing `GOOGLE_AI_API_KEY` is Gemini-only; see Credentials) | 10,000 units/day; `channels.list`/`playlistItems.list` = 1 unit each | Free (no paid tier; >10K/day requires compliance audit) | **Primary.** Use uploads-playlist hop, NOT `search.list` (100 units/call). ~3,000+ channels/day on default quota. [developers.google.com/youtube/v3/determine_quota_cost](https://developers.google.com/youtube/v3/determine_quota_cost) |
| Podcast RSS | none | Unlimited (public XML; send a real User-Agent) | Free | **Primary.** `response_format: xml` provider. |
| Podcast Index (directory/search) | `PODCASTINDEX_API_KEY` + `PODCASTINDEX_API_SECRET` | Free developer keys | Free ("always available for free, for any use"); rate limits unpublished | Needs SHA-1 signed-header auth — deferred to a named auth handler (Open Q2). [api.podcastindex.org](https://api.podcastindex.org/) |
| Companies House (UK) | `COMPANIES_HOUSE_API_KEY` | Free key; 600 req/5 min | Free | **Primary for UK-registered entities.** `auth.type: basic` (key as username). [developer-specs.company-information.service.gov.uk/guides/rateLimiting](https://developer-specs.company-information.service.gov.uk/guides/rateLimiting) |
| Wikidata / Wikipedia | none | No-auth reads (descriptive User-Agent required) | Free | Free structured-entity fallback (founding date, HQ, industry). [wikidata.org/wiki/Wikidata:Data_access](https://www.wikidata.org/wiki/Wikidata:Data_access) |
| OpenCorporates | — | **None — free API keys discontinued** | Essentials £2,250/yr for 500 calls/mo (≈£4.50/call); free access only by application (journalists/NGOs) | **NOT recommended** — dropped from the original brief's plan. [opencorporates.com/pricing](https://opencorporates.com/pricing/) |
| Crunchbase | `CRUNCHBASE_API_KEY` (if ever bought) | **None — free Basic API eliminated (~2025)** | Reported ~$49–99/mo for stub endpoints; full API = Enterprise data licensing (custom); details partly unverified (docs 403 to automated fetch) | **Deferred** — config-only addition later if licensed. [data.crunchbase.com/docs/using-the-api](https://data.crunchbase.com/docs/using-the-api) |

## Example template configurations

**Company profiles (iGaming, OnlyiGaming):** providers = YouTube (channel + last 25 videos; identifier from `youtube_channel_id` CSV column or Step-1 discovery), podcast RSS (feeds where the company hosts a show), Companies House (UK-registered operators/suppliers via `company_number` column), Wikidata (fallback facts). `raw_text` feeds content-analyzer alongside scraped pages; `data_json` fields (subscriber counts, filing dates) give content-writer verifiable numbers.

**Job search (second content type, proving agnosticism):** providers = Companies House (employer registration/officers for due diligence via `company_number`), Wikidata (employer facts), YouTube (employer channel — culture/product videos as interview-prep context). Identical module, different provider JSON + identifier columns.

## Credentials & testing

- **Env vars:** the approved-reuse inventory (skeleton .env) holds no key for any provider in this brief, so `YOUTUBE_API_KEY` and `COMPANIES_HOUSE_API_KEY` are new provisioning — both free to obtain. The existing `GOOGLE_AI_API_KEY` is a Generative Language (Gemini) key; whether its GCP project can also enable the YouTube Data API is unverified — a dedicated free key is the cleaner path. Podcast RSS and Wikidata need no keys. (Existing `SCRAPFLY_KEY` is page-scraping transport — irrelevant to structured JSON APIs.)
- **Unit tests (mocked `tools.http`):** endpoint chaining (`{channel.uploads_playlist}` substitution), field_map fallback arrays, XML→JSON normalization on a canned RSS fixture, missing-identifier skip, missing-env-var provider skip, per-provider error isolation (one provider's 500 doesn't kill others), raw_text flattening + truncation, `_partialItems` pushed after each provider.
- **Credential-free live test:** podcast RSS provider against any public feed + Wikidata — real HTTP, zero keys, zero cost.
- **Cheapest keyed live test:** one YouTube channel fetch = 2 quota units (free) on a fresh key; Companies House one lookup (free).
- **E2E note:** run on 2–3 reference entities with the company-profile provider set; verify Step 5 content-analyzer consumes `raw_text` items without special-casing.

## Edge cases & failure modes

- **Entity has no identifier for any provider** → all providers skipped with per-provider notes; entity yields 0 items (NOT an error; summary must say so loudly).
- **Quota exhaustion mid-run (YouTube 403 quotaExceeded)** → mark remaining entities' items `status: "error", error: "quota_exceeded"`, keep partials (already pushed), continue other providers.
- **Identifier resolves to nothing (dead channel id, dissolved company)** → item `status: "not_found"`; don't fail the entity.
- **Chained placeholder missing** (endpoint A returned no `uploads_playlist`) → skip dependent endpoint with reason.
- **Huge feeds** (10k-episode podcasts) → `max_items` cap applied during parse, not after download where avoidable.
- **Non-JSON error bodies / HTML error pages** → parse failure recorded as item error with first 200 chars for diagnosis.
- **Rate limits** — global token bucket; Companies House 600/5min respected via `requests_per_minute` default.
- **Renderer contract** — `data_json` stringified; no raw arrays in display fields.

## Open questions

1. Should frequently-useful provider configs (YouTube, podcast RSS, Companies House) ship as README copy-paste examples only, or as skeleton-side preset rows? Leaning README-only — presets are template-space, and Rule 13 keeps the manifest default at `[]`.
2. Podcast Index signed auth: worth a named `auth.type: "podcastindex"` handler in code (agnostic infra, ~20 lines), or skip the directory layer since feed URLs usually arrive as seed data? Defer until a template actually needs feed *search*.
3. Pagination beyond page 1 (`pageToken` chaining) — v1 fetches one page per endpoint (api-search precedent). Add a generic `next_page_path` config later if a real template needs >50 videos.
4. Does `data_json` warrant its own detail_schema section in the renderer (pretty-printed JSON), or is the `raw_text` prose section enough for operators? UI decision at build time.
