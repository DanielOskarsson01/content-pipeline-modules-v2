# Search Discovery

**Step 1 — Discovery** · `add` · `empty_ok` · cost: `medium` · v1.0.0

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

Serper.dev (Google SERP; needs new `SEARCH_PROVIDER_SERPER_KEY`; **not yet live-verified**):

```json
{
  "id": "serper", "name": "Serper.dev", "kind": "serp", "method": "POST",
  "endpoints": { "web": "https://google.serper.dev/search", "news": "https://google.serper.dev/news", "images": "https://google.serper.dev/images" },
  "query_param": "q", "num_param": "num",
  "results_path": { "web": "organic", "news": "news", "images": "images" },
  "field_map": { "url": "link", "title": "title", "snippet": "snippet", "pub_date": "date", "image_url": "imageUrl" },
  "date_param": { "name": "tbs", "map": { "day": "qdr:d", "week": "qdr:w", "month": "qdr:m", "year": "qdr:y" } },
  "auth": { "type": "header", "header": "X-API-KEY", "env_var": "SEARCH_PROVIDER_SERPER_KEY" }
}
```

The Serper block is **live-verified (2026-07-03)** with a real `SEARCH_PROVIDER_SERPER_KEY`: open-mode whole-web search and `site_restricted` curated-site search both returned real Google results (curated run stayed entirely within the configured domain list). Free tier 2,500 credits, 1 credit/query.

Schema notes: `endpoints` per vertical (missing vertical → provider skipped for that `result_type`, warned); `results_path` string or per-vertical object, dot-notation; `field_map` values are dot-paths or fallback arrays; `method` GET (params → query string) or POST (params → JSON body); `auth.type` = `header` | `bearer` | `query_param` (missing env var → provider skipped, warned); optional `date_param`, `site_filter`, `extra_params`.

### Curated-site search over Google (replacing Google PSE)

Google's own Programmable Search Engine (Custom Search JSON API) — where a `cx` engine held a curated site list — is closed to new customers (sunset 2027-01). Searching Google restricted to a curated list of domains is still fully possible via Serper, two ways:

- **`site_restricted` mode + `site_list`** — fans out one `"{entity}" site:{domain}` query per domain. Clean and explicit; cost = one Serper credit per domain per template per entity (a 15-domain list = 15 credits/entity). Bounded by `max_queries_per_entity`.
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
| `max_results_per_query` | 10 | via provider `num_param` |
| `max_queries_per_entity` | 20 | hard cost cap, per provider |
| `requests_per_minute` | 30 | global token-bucket |
| `verify_liveness` | false | HEAD-check results; drops only 404/410 (403 bot walls kept); lookup providers always verified |

Output items: `url` (key), `title`, `snippet`, `domain`, `source`, `result_type`, `pub_date`, `image_url`, `query_used`, `found_via`, `entity_name`. Deduped within the run by normalized URL (host lowercased, trailing slash stripped, hash dropped); cross-module dedupe stays in Step-2 url-dedup.

## Example template configurations

**Company profiles — trusted-directory search** (vertical flavor lives HERE, not in defaults): `search_mode: site_restricted`, `site_list` = the template's curated directory domains, `query_templates: ["\"{entity_name}\""]`, provider = Serper or Perplexity with `site_filter`.

**Job search — employer background check**: `search_mode: open`, `query_templates: ["\"{entity_name}\" employer reviews", "\"{entity_name}\" layoffs OR funding news"]`, `date_range: year`.

## Testing

- `node modules/step-1-discovery/search-discovery/test-search-discovery.js` — 51 assertions, all HTTP mocked, no credentials.
- `PERPLEXITY_API_KEY=... node modules/step-1-discovery/search-discovery/test-live-perplexity.js` — live test, ~$0.01 (2 requests); exits 0 harmlessly when the key is absent. Passed 2026-07-03.
- `SEARCH_PROVIDER_SERPER_KEY=... node modules/step-1-discovery/search-discovery/test-live-serper.js` — live test, ~4 credits; exercises open mode + curated-site `site:` mode; exits 0 harmlessly when the key is absent. Passed 2026-07-03.

## Edge cases

- Common entity names → noisy results: qualifier terms belong in `query_templates` (template concern); Step-2 url-relevance is the real filter.
- Zero results is normal (empty items + meta), never an error. Per-query errors are logged and counted; the run continues.
- Provider HTTP non-200 → counted as error, run continues. **401/403 is treated as a provider-wide auth failure: the rest of that provider's queries are skipped (loud in meta)** rather than repeating a doomed call for every remaining query — other providers are unaffected. Missing env var → provider skipped loudly up-front.
- `_partialItems` pushed after every query — a big site_restricted fan-out survives a timeout mid-entity (Rule 10).

## Changelog

- **1.0.0** (2026-07-03) — initial version per the canonical revised brief. Perplexity AND Serper provider blocks live-verified with real keys (Serper: open + curated-site `site:` modes, real Google results within the configured list). Brave/SerpAPI blocks documented but not yet live-verified (need new keys). Pre-commit code review: added provider-wide skip on 401/403 auth failures (was per-query error → wasted the whole fan-out on a dead-auth provider), per the brief's "provider 401/403 → skip provider" line.
