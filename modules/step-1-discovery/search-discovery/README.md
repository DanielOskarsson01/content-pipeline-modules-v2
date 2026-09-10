# Search Discovery

**Step 1 — Discovery** · `add` · `empty_ok` · cost: `expensive` (30-minute worker budget) · v1.1.0

Generic web-search discovery. Renders query templates per entity, runs them against pluggable search providers, and adds result URLs (title/snippet/date metadata) to the pool. One module replaces five formerly-planned "search X for entity" modules — directory search, news whitelists, curated lists, social discovery, LinkedIn discovery are all **template configurations** of this module (canonical brief: `docs/submodule-briefs-rev-2026-07-03/step1-google-pse-directories.md`).

**Rule 13:** code knows only render-templates → call-provider-per-config → map-fields → dedupe → emit. Site lists, query flavor, and providers arrive via options/presets. The defaults carry zero vertical assumptions (`providers: []` is a loud no-op).

## Modes

- **open** — each query template runs as-is per entity.
- **site_restricted** — each template fans out per domain in the site list: `site:{domain}` appended, or the provider's domain-filter param when its config declares `site_filter`, or the template's own `{site}` placeholder. Cost = templates × sites × entities, capped by `max_queries_per_entity` (per provider, loud when it truncates). Empty site list in this mode is a **thrown misconfiguration**, not an empty result.

## Provider config (`providers` option, presets enabled)

### kind `serp` — query-based engines

```json
{
  "id": "perplexity", "name": "Perplexity Search API", "kind": "serp", "method": "POST",
  "endpoints": { "web": "https://api.perplexity.ai/search" },
  "query_param": "query", "num_param": "max_results",
  "results_path": "results",
  "field_map": { "url": "url", "title": "title", "snippet": "snippet", "pub_date": ["date", "last_updated"] },
  "auth": { "type": "bearer", "env_var": "PERPLEXITY_API_KEY" }
}
```

**This exact block is live-verified (2026-07-03)** — 10 real URLs, 2 API calls, existing `PERPLEXITY_API_KEY`. Note: Perplexity has no `site:` operator support; for site_restricted add `"site_filter": { "type": "param", "name": "search_domain_filter", "format": "array" }`.

Serper.dev (Google SERP; set `auth.env_var` to the credential name available on your deployment):

```json
{
  "id": "serper", "name": "Serper.dev", "kind": "serp", "method": "POST",
  "endpoints": { "web": "https://google.serper.dev/search", "news": "https://google.serper.dev/news", "images": "https://google.serper.dev/images" },
  "query_param": "q", "num_param": "num",
  "pagination": { "param": "page", "start": 1, "step": 1, "result_types": ["web"] },
  "account_limit_errors": [{ "status": 400, "message_path": "message", "contains": "Not enough credits" }],
  "results_path": { "web": "organic", "news": "news", "images": "images" },
  "field_map": { "url": "link", "title": "title", "snippet": "snippet", "pub_date": "date", "image_url": "imageUrl" },
  "date_param": { "name": "tbs", "map": { "day": "qdr:d", "week": "qdr:w", "month": "qdr:m", "year": "qdr:y" } },
  "auth": { "type": "header", "header": "X-API-KEY", "env_var": "SEARCH_PROVIDER_SERPER_KEY" }
}
```

The Serper block is **live-verified (2026-07-03)** with a real `SEARCH_PROVIDER_SERPER_KEY`: open-mode whole-web search and `site_restricted` curated-site search both returned real Google results (curated run stayed entirely within the configured domain list). Free tier 2,500 credits, 1 credit/query.

Schema notes: `endpoints` per vertical (missing vertical → provider skipped for that `result_type`, warned); `results_path` string or per-vertical object, dot-notation; `field_map` values are dot-paths or fallback arrays; `method` GET (params → query string) or POST (params → JSON body); `auth.type` = `header` | `bearer` | `query_param` (missing env var → provider skipped, warned); optional `date_param`, `site_filter`, `extra_params`, `pagination` (see below).

### Curated-site search over Google (replacing Google PSE)

Google's own Programmable Search Engine (Custom Search JSON API) — where a `cx` engine held a curated site list — is closed to new customers (sunset 2027-01). Searching Google restricted to a curated list of domains is still fully possible via Serper, two ways:

- **`site_restricted` mode + `site_list`** — fans out one `"{entity}" site:{domain}` query per domain. Clean and explicit; cost = one Serper request per page per domain per template per entity (a 15-domain list = 15 credits/entity). Bounded by `max_queries_per_entity`.
- **`open` mode + an OR'd `site:` template** — one query covers the whole list, the closest equivalent to the old PSE `cx`. Put the list in the template: `"{entity_name}" (site:askgamblers.com OR site:thepogg.com OR site:casino.org)`. One credit per entity. Practical up to ~10–20 domains before the query gets unwieldy.

### kind `lookup` — deterministic URL templates

```json
{ "id": "logo-cdn", "kind": "lookup", "url_template": "https://img.logo.dev/{website_domain}" }
```

Rendered per entity from placeholders, HEAD-verified (kept only when status < 400). No query, no search. Entities missing a referenced field are skipped with a warning.

## Query templates

Placeholders: `{entity_name}`, `{alt_names}` (entity.alt_names, quoted + OR-joined), `{website_domain}` (entity.website → bare domain), `{site}` (site_restricted only). A template whose placeholder has no value for an entity is skipped for that entity with a warning.

## Options

| Option | Default | Notes |
|---|---|---|
| `providers` | `[]` | loud no-op when empty |
| `search_mode` | `open` | `open` \| `site_restricted` |
| `site_list` / `site_list_doc` | empty | one domain per line, `#` comments; doc wins over textarea |
| `query_templates` | `["\"{entity_name}\""]` | |
| `result_type` | `web` | `web` \| `news` \| `images` |
| `date_range` | `any` | mapped per provider `date_param.map`; ignored without one |
| `max_results_per_query` | 10 | legacy name: requested results **per page**, via provider `num_param`; provider/account limits still apply |
| `max_queries_per_entity` | 20 | hard cost cap, per provider |
| `max_pages_per_query` | 1 | 1–100, per query and provider; requires `provider.pagination` for multiple pages |
| `max_search_requests_per_entity` | 0 | 0–10,000; 0 adds no request cap; shared across SERP providers/queries/pages/retries; excludes lookup/liveness HEAD calls |
| `empty_pages_to_stop` | 2 | consecutive empty arrays stop this query |
| `duplicate_pages_to_stop` | 3 | consecutive nonempty pages without a new URL **for that query** stop it |
| `max_rate_limit_retries` | 2 | retries after HTTP 429, in addition to the initial attempt |
| `requests_per_minute` | 30 | global minimum spacing across requests in this invocation, including pages/retries/HEAD; separate concurrent workers do not share it |
| `verify_liveness` | false | HEAD-check results; drops only 404/410 (403 bot walls kept); lookup providers always verified |

Output items: `url` (key), `title`, `snippet`, `domain`, `source`, `result_type`, `pub_date`, `image_url`, `query_used`, `found_via`, `entity_name`, `search_provenance` (array of `{provider, query, site, page, page_value}`). Duplicates retain all query/page origins and the longest title/snippet. When a search result matches a lookup URL, it enriches that lookup placeholder with full search metadata and attribution (including date, image and query), regardless of provider order. Deduped within the run by normalized URL (host lowercased, trailing slash stripped, hash dropped); cross-module dedupe stays in Step-2 url-dedup.

## Example template configurations

**Company profiles — trusted-directory search** (vertical flavor lives HERE, not in defaults): `search_mode: site_restricted`, `site_list` = the template's curated directory domains, `query_templates: ["\"{entity_name}\""]`, provider = Serper or Perplexity with `site_filter`.

**Job search — employer background check**: `search_mode: open`, `query_templates: ["\"{entity_name}\" employer reviews", "\"{entity_name}\" layoffs OR funding news"]`, `date_range: year`.

## Testing

- `node modules/step-1-discovery/search-discovery/test-search-discovery.js` — original compatibility suite, all HTTP mocked, no credentials.
- `node modules/step-1-discovery/search-discovery/test-pagination.js` — pagination, limits, retries, provenance, partial recovery, provider isolation and invalid-response regressions; mocked HTTP and clock.
- `PERPLEXITY_API_KEY=... node modules/step-1-discovery/search-discovery/test-live-perplexity.js` — live test, ~$0.01 (2 requests); exits 0 harmlessly when the key is absent. Passed 2026-07-03.
- `SEARCH_PROVIDER_SERPER_KEY=... node modules/step-1-discovery/search-discovery/test-live-serper.js` — live test, ~4 credits; exercises open mode + curated-site `site:` mode; exits 0 harmlessly when the key is absent. Passed 2026-07-03.

## Edge cases

- Common entity names → noisy results: qualifier terms belong in `query_templates` (template concern); Step-2 url-relevance is the real filter.
- Zero results is normal (empty items + meta), never an error. Per-query errors are logged and counted; the run continues.
- Provider HTTP non-200 → counted as error and stops that query. **401/403 (authentication/access), 402 (account/billing), and exhausted 429 retries stop that provider for the remaining invocation, including later entities**; other providers are unaffected. Missing env var → provider skipped loudly up-front.
- `_partialItems` pushed during every successful page, with entity identity and page provenance — a big site_restricted fan-out survives a timeout mid-entity (Rule 10).

## Pagination and rescue runs

Pagination is opt-in. Default `max_pages_per_query: 1` preserves one request per query. A provider without `pagination` is called once per query even when more pages are requested; its route reports `pagination_not_configured`. Do not add pagination to an API that does not support it. In particular, the [Perplexity Search API request schema](https://docs.perplexity.ai/api-reference/search-post) has no page/offset parameter; more query variants are separate queries, not later pages.

A generic `pagination` object describes the actual request parameter:

```json
{ "param": "page", "start": 1, "step": 1, "result_types": ["web"] }
```

For an offset API use `{"param":"offset","start":0,"step":"page_size"}`. Numeric steps are also supported. `start` defaults to 1, `step` to 1. The request value is `start + (page - 1) * step`, where `page_size` means the effective `num_param` value, including an `extra_params` override (otherwise `max_results_per_query`). It requires `num_param` and a positive integer count. GET puts it in the query string (preserving existing endpoint parameters); POST puts it in the JSON body. It overrides a stale pagination value in `extra_params`. A collision with query/count/auth/date/site parameters is a configuration error. Optional `result_types` scopes pagination to supported verticals; omitted means all configured endpoints.

Requests run breadth first across queries and providers **within each entity**: all page-1 requests precede page 2. A short page continues. Two consecutive empty arrays or three consecutive duplicate-only nonempty pages stop by default; these observations do not establish that all relevant articles have been found. Duplicate checks are per query, so overlap with another query cannot prematurely stop a search. No additional URL-per-entity cap is introduced.

Every HTTP attempt counts against `max_search_requests_per_entity`, including failed requests and 429 retries. 429 retries use exponential backoff (1s, 2s, …), respect `Retry-After` seconds or HTTP dates, and pass through the shared rate limiter. A server cooldown above 60 seconds stops that provider instead of retrying too early. Other errors are not automatically retried. Providers may declare `account_limit_errors: [{"status":400,"message_path":"message","contains":"Not enough credits"}]` to distinguish exhausted credit from query-specific HTTP 400 errors. Matching is case-insensitive literal substring matching on the configured JSON field; it stops that provider across the invocation as `provider_account_limit`. Raw provider messages are not copied into logs or result metadata. Response bodies and raw transport error text are not logged because they can expose request credentials. Invalid JSON, a missing/non-array results path, or nonempty results without any mapped URLs are errors, not exhaustion.

Deep budgets belong in rescue **template options**, applied only to entities selected upstream as having thin evidence. For example:

```json
{
  "max_pages_per_query": 50,
  "max_queries_per_entity": 500,
  "max_search_requests_per_entity": 1200,
  "max_results_per_query": 10,
  "empty_pages_to_stop": 2,
  "duplicate_pages_to_stop": 3,
  "max_rate_limit_retries": 2,
  "requests_per_minute": 90
}
```

This is a bounded deep-search profile, not an exhaustive guarantee: at 90 requests/minute the pacing alone takes about 13.3 minutes for 1,200 requests, before slow responses, retry cooldowns, liveness checks, or additional entities. The manifest uses the expensive (30-minute) worker class. Prefer one rescue entity per run; a timeout preserves items accumulated in `_partialItems`, but final route metadata is returned only when `execute` completes. A complete resumable search checkpoint is not implemented. `0` disables only the additional SERP request cap; page, query, worker and provider limits still exist.

This is **search-engine result pagination**. It does not operate publishers' native search forms, paginate their archives, render JavaScript, dismiss popups, bypass access controls or guarantee discovery of unindexed pages. Those require separate site/API/browser discovery and retrieval work.

## Search diagnostics

Per-entity `meta` includes:

- `queries_planned_per_provider`, `queries_selected_per_provider`, `queries_truncated_per_provider`, `templates_skipped` (missing placeholder values).
- `queries_run`: actual distinct provider/query routes attempted; `search_requests`: SERP attempts including retries; `api_calls`: SERP attempts plus lookup attempts (optional liveness HEADs excluded).
- `search_limits`: active page/request/query/page-size settings.
- `search_routes`: provider/query/site, pagination capability, page records (`page`, `page_value`, `attempts`, `statuses`, `raw_results`, `new_urls`, `new_query_urls`) and `stop_reason`. `new_urls` counts additions to the entity pool; `new_query_urls` drives query-local stall detection. A page with zero attempts means the request budget prevented it.
- `providers_skipped`: missing-vertical endpoints; missing credentials are warned during provider setup.

Stop reasons are `page_limit`, `request_limit`, `empty_pages`, `duplicate_pages`, `pagination_not_configured`, `provider_http_error` (inspect status, e.g. HTTP 400 account/query restrictions), `provider_auth_error`, `provider_account_limit`, `provider_rate_limit`, `provider_cooldown`, `invalid_response`, or `request_error`. Skipped routes after a provider-wide failure carry the same reason and no attempted pages. Inspect query truncation separately: a finished route does not imply all planned queries ran.

## Changelog

- **1.1.0** (2026-09-10) — opt-in generic page/offset pagination; breadth-first query scheduling; visible page/query/request limits and stop reasons; bounded rate-limit retries; per-page provenance and partial results; 30-minute worker class.

- **Serper `images` vertical live-confirmed (2026-07-07)** — via the `config-image-search/providers-image-serp.json` preset (no module change). A real `POST /images` with the `X-API-KEY` header (`SEARCH_PROVIDER_SERPER_KEY`) for `"Evolution Gaming" logo` returned HTTP 200 and 4 items, each `result_type: images` with `image_url` mapped from `imageUrl`. Complements the 2026-07-03 web/news-vertical verification below.
- **1.0.0** (2026-07-03) — initial version per the canonical revised brief. Perplexity AND Serper provider blocks live-verified with real keys (Serper: open + curated-site `site:` modes, real Google results within the configured list). Brave/SerpAPI blocks documented but not yet live-verified (need new keys). Pre-commit code review: added provider-wide skip on 401/403 auth failures (was per-query error → wasted the whole fan-out on a dead-auth provider), per the brief's "provider 401/403 → skip provider" line.
