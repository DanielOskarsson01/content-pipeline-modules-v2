# Submodule Brief: search-discovery (revised) — CANONICAL BRIEF

**Step:** 1 — Discovery
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Search trusted directories via a web-search API to find entity listings and review pages (generalized: find pages about an entity on the open web or on a configured list of known sites).
**Build status:** not built
**Design verdict:** new generic module `search-discovery` (this file is the canonical spec; `step1-google-pse-news.md`, `step1-curated-list-import.md`, `step1-social-media-discovery.md`, `step1-linkedin-discovery.md`, and `step1-image-logo-search.md` are template/provider configurations of THIS module)

## Goal

One generic web-search discovery module. Given entities, it composes search queries from templates, executes them against a pluggable search provider, and adds result URLs (with title/snippet/date metadata) to the pool. Replaces five separately-briefed "search X for entity" modules (directories, news, curated lists, social, LinkedIn) with one module + template configs.

## Design (agnostic)

**Why a new module and not api-search:** api-search (repo precedent) handles keyword→JSON REST APIs with static keywords or entity names. search-discovery adds behavior api-search cannot express: per-entity **query templating** (`"{entity_name}" site:{site}` fan-out across a domain list), SERP **verticals** (web/news/images), provider **date-range mapping**, header-based auth (Serper/Brave require headers; api-search only supports query-param auth), and **lookup-kind** providers (deterministic URL templates, HEAD-verified). This is hierarchy step 3 — genuinely different behavior. Plain keyword-search JSON APIs (YouTube, iTunes) stay in api-search (see `step1-youtube-podcast-discovery.md`).

**Two search modes (option, not provider-specific):**
- `open` — each query template is rendered per entity and sent as-is.
- `site_restricted` — each query template is rendered per entity **per domain** in a configured site list, appending `site:{domain}` (or the provider's site-filter param). Cost = templates × sites × entities; capped by `max_queries_per_entity`.

**Two provider kinds** (JSON config, api-search precedent — new provider = JSON, not code):
- `serp` — query-based engines (Serper, Brave, SerpAPI, Tavily, Exa, DataForSEO, legacy Google CSE). Config: endpoints per vertical, method, query/num params, results_path per vertical, field_map, date_param map, auth (header or query_param).
- `lookup` — deterministic per-entity URL templates rendered from entity fields (e.g. domain→logo CDNs), verified via `tools.http` HEAD. No query. See `step1-image-logo-search.md`.

**Rule 13 test:** code knows only: render templates, call provider per config, map fields, dedupe, emit. Manifest defaults: `providers: []`, `site_list: ""`, `query_templates: ["\"{entity_name}\""]`, `result_type: "web"` — zero vertical flavor. Directory lists, news whitelists, `site:linkedin.com/company`, "igaming" qualifier terms → ALL in template preset_map (examples below).

## Module contract

- `item_key`: `url` · `data_operation_default`: `add` · `pool_precondition`: `empty_ok`
- `cost`: `medium` (network I/O; site_restricted fan-out can be hundreds of requests)
- `requires_columns`: `["name"]` (`website` used when present for `{website_domain}` placeholder and lookup providers; entities without it skip lookup providers with a logged warning)
- `_partialItems`: push after **every completed query** (each provider call), not per entity — a fan-out of 20 sites × 100 entities must survive timeout mid-entity
- Output item: `url`, `title`, `snippet`, `domain`, `source` (provider id), `result_type`, `pub_date`, `image_url` (images vertical only), `query_used`, `found_via`. All arrays pre-joined to strings (ContentRenderer); any flag fields emitted as strings.
- Per-query errors → logged, continue; provider with missing env var → skipped with warning (api-search precedent); global token-bucket rate limiter.

## Options (manifest sketch)

| Option | Type | Default (agnostic) | Notes |
|---|---|---|---|
| `providers` | json, presets_enabled | `[]` | Provider config objects (schema above). No providers = loud no-op with explanatory meta |
| `search_mode` | select | `open` | `open` \| `site_restricted` |
| `site_list` | textarea, presets_enabled | `""` | One domain per line; `#` comments. Used only in site_restricted |
| `site_list_doc` | doc_selector | none | Reference-doc alternative to `site_list` (doc wins if both set) |
| `query_templates` | json, presets_enabled | `["\"{entity_name}\""]` | Placeholders: `{entity_name}`, `{alt_names}`, `{website_domain}`, `{site}` |
| `result_type` | select | `web` | `web` \| `news` \| `images` — provider must declare an endpoint for it |
| `date_range` | select | `any` | `any`\|`day`\|`week`\|`month`\|`year`, mapped per provider `date_param.map` |
| `max_results_per_query` | number | `10` | |
| `max_queries_per_entity` | number | `20` | Hard cost cap across templates × sites |
| `requests_per_minute` | number | `30` | Global |
| `verify_liveness` | boolean | `false` | HEAD-check result URLs; always on internally for lookup providers |

## Providers (researched 2026-07-03)

| Provider | Env var(s) | Free tier | Pricing | Notes |
|---|---|---|---|---|
| **Perplexity Search API** | `PERPLEXITY_API_KEY` — **key EXISTS today (skeleton .env) — live-testable now** | — | Search API ~$5/1k requests (request-only pricing; Sonar chat models price separately per token) | Approved-reuse key; seo-planner v2 already uses this account. Domain filtering via request param (not `site:` operator) — provider config declares `site_filter: "param"`. Preferred where result quality is comparable. https://docs.perplexity.ai/docs/getting-started/pricing |
| Serper.dev | `SEARCH_PROVIDER_SERPER_KEY` (header `X-API-KEY`) — new provisioning | 2,500 credits one-time | $0.30–$1.00/1k (packs from $50/50k, 6-mo validity) | Google SERP; web/news/images/autocomplete endpoints; full `site:` operator support; recommended for Google-shaped SERP needs. https://serper.dev/ · https://costbench.com/software/web-scraping/serper/ |
| Brave Search API | `SEARCH_PROVIDER_BRAVE_KEY` (header `X-Subscription-Token`) | $5 credits/month, renewing (~1k queries) | ~$5/1k web (per-endpoint $0.003–$0.005/query — verify at signup) | Independent index; web/news/images endpoints. Free tier removed Feb 2026 → monthly credits. https://api-dashboard.search.brave.com/documentation/pricing · https://www.implicator.ai/brave-drops-free-search-api-tier-puts-all-developers-on-metered-billing/ |
| SerpAPI | `SEARCH_PROVIDER_SERPAPI_KEY` | 250 searches/month recurring | $25/mo per 1k; $75/5k; $150/15k | Best free live-test path (recurring free tier). https://serpapi.com/pricing |
| Tavily | `SEARCH_PROVIDER_TAVILY_KEY` | 1,000 credits/month | PAYG $0.008/credit; basic search = 1 credit | AI-shaped results (answer+sources); good for scout-style queries. https://docs.tavily.com/documentation/api-credits |
| Exa | `SEARCH_PROVIDER_EXA_KEY` | "up to 20,000 requests/month free" (per pricing page 2026-07-03) | $7/1k requests (≤10 results); contents $1/1k pages | Neural/semantic search; different result character than Google SERP. https://exa.ai/pricing |
| DataForSEO | `SEARCH_PROVIDER_DATAFORSEO_LOGIN`/`_PASSWORD` (basic auth) | $1 signup credit | $0.60/1k (standard queue, ~5 min) to $2.00/1k (live); $50 min deposit | Cheapest at volume; queue latency unusual for a pipeline — live mode only. https://dataforseo.com/apis/serp-api/pricing |
| Google Custom Search JSON API | `SEARCH_PROVIDER_GOOGLE_CSE_KEY` + `_CX` | 100/day (existing customers) | $5/1k, ≤10k/day | **CLOSED to new customers; sunset 2027-01-01.** The existing `GOOGLE_AI_API_KEY` (skeleton .env) is NOT automatically a CSE key — would need Custom Search API enablement + a cx engine, and the new-customer closure likely blocks that (unverified). Treat as legacy-only; do NOT build on. https://developers.google.com/custom-search/v1/overview |
| Bing Search API | — | — | — | **Retired 2025-08-11.** Do not build on. https://serpapi.com/blog/bing-search-api-replacement-web-search/ |

The original briefs assumed Google PSE. That assumption is dead for new provisioning — provider pluggability is now load-bearing, not nice-to-have.

## Example template configurations

**Company-profiles template — "trusted directory search" (original brief's iGaming flavor lives HERE):**
```json
{
  "search_mode": "site_restricted",
  "site_list": "askgamblers.com\nthepogg.com\ncasinomeister.com\ncasino.org\nlcb.org",
  "query_templates": ["\"{entity_name}\""],
  "result_type": "web",
  "max_results_per_query": 5,
  "providers": [{
    "id": "serper", "name": "Serper.dev (Google)", "kind": "serp", "method": "POST",
    "endpoints": {"web": "https://google.serper.dev/search", "news": "https://google.serper.dev/news", "images": "https://google.serper.dev/images"},
    "query_param": "q", "num_param": "num",
    "results_path": {"web": "organic", "news": "news", "images": "images"},
    "field_map": {"url": "link", "title": "title", "snippet": "snippet", "pub_date": "date", "image_url": "imageUrl"},
    "date_param": {"name": "tbs", "map": {"day": "qdr:d", "week": "qdr:w", "month": "qdr:m", "year": "qdr:y"}},
    "auth": {"type": "header", "header": "X-API-KEY", "env_var": "SEARCH_PROVIDER_SERPER_KEY"}
  }]
}
```

**Job-search template — open-web employer background check:**
```json
{
  "search_mode": "open",
  "query_templates": ["\"{entity_name}\" employer reviews", "\"{entity_name}\" layoffs OR funding news"],
  "result_type": "web",
  "date_range": "year",
  "max_results_per_query": 10
}
```

## Credentials & testing

- **Existing keys, approved for reuse (skeleton .env, live today):** `PERPLEXITY_API_KEY` (Search API provider — the day-one live-testable provider). `GOOGLE_AI_API_KEY` exists but is a Gemini key, not a CSE key (see provider table caveat). `SCRAPFLY_KEY` / `BRIGHT_DATA_API_KEY` exist as scraping transport — irrelevant here except for optional `verify_liveness` against blocked hosts (transport is a skeleton concern regardless).
- **New provisioning needed for:** Serper, Brave, SerpAPI, Tavily, Exa, DataForSEO (env var names in the table).
- **Unit tests (credential-free, always):** mocked `tools.http` returning canned Perplexity/Serper/Brave JSON; assert template rendering (quoting, `site:` fan-out vs `site_filter: "param"` path, placeholder substitution), field_map extraction, dedupe by URL, missing-env-var provider skip, `_partialItems` pushed per query, cap enforcement.
- **Live test (cheapest):** Perplexity Search API with the EXISTING key — 1 entity × 2 templates ≈ 2 requests (~$0.01). For Google-shaped SERP validation without new spend: SerpAPI free tier (250/mo recurring).
- **E2E:** requires template wiring in Supabase (preset_map) + attended session per project discipline.

## Edge cases & failure modes

- Common entity name ("Evolution") → noisy results. Mitigation is config: qualifier terms in `query_templates` (template concern, not code); step-2 url-relevance is the real filter.
- Zero results → normal; return empty items + meta note, never an error.
- Provider 429 → rate limiter + retry-after respect; provider 401/403 → skip provider, loud in meta.
- site_restricted with empty site list → loud fail ("site_restricted requires site_list") — a misconfiguration, not an empty result.
- Duplicate URLs across templates/sites/providers → dedupe within run by normalized URL; cross-module dedupe stays in step-2 url-dedup.
- Google deprioritizes some sites (e.g. LinkedIn) in organic results → success rate is provider-dependent; document per-config, don't compensate in code.

## Open questions

1. Autocomplete/suggest endpoints (Serper autocomplete, Brave suggest) as a third provider kind for query expansion — v2, or scope of ai-discovery-scout?
2. Should `site_list_doc` support the skeleton's `{doc:...}` token instead of a doc_selector option? Follow whatever seo-planner v2.2 does — consistency over invention.
3. Pagination beyond page 1 (api-search punted on this too) — defer until a real run shows page 1 is insufficient.
