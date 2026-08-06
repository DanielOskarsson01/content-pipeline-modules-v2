# All Module READMEs

> GENERATED FILE -- do not edit by hand. Rebuild with `node scripts/build-all-readmes.mjs`.
> Generated 2026-08-05 from 42 submodule READMEs.
> Source of truth for options is each module's manifest.json; the loader serves manifests to the UI.

## Contents

- Step 1 -- [ai-discovery-scout](#) (v1.0.0)
- Step 1 -- [api-search](#) (v1.1.0)
- Step 1 -- [browser-crawler](#) (v1.0.0)
- Step 1 -- [csv-discovery](#) (v1.0.0)
- Step 1 -- [deep-links](#) (v1.0.0)
- Step 1 -- [page-links](#) (v1.0.0)
- Step 1 -- [rss-feeds](#) (v1.0.0)
- Step 1 -- [search-discovery](#) (v1.0.0)
- Step 1 -- [seed-url-builder](#) (v1.0.0)
- Step 1 -- [sitemap-parser](#) (v1.0.0)
- Step 1 -- [test-dummy](#) (v1.0.0)
- Step 2 -- [url-canonicalizer](#) (v1.0.0)
- Step 2 -- [url-dedup](#) (v1.1.0)
- Step 2 -- [url-filter](#) (v1.0.0)
- Step 2 -- [url-heuristics](#) (v1.0.0)
- Step 2 -- [url-relevance](#) (v1.0.1)
- Step 3 -- [api-fetcher](#) (v1.1.0)
- Step 3 -- [api-scraper](#) (v1.0.0)
- Step 3 -- [browser-scraper](#) (v1.1.0)
- Step 3 -- [linkedin-post-scraper](#) (v1.2.0)
- Step 3 -- [linkedin-profile-scraper](#) (v1.2.0)
- Step 3 -- [page-scraper](#) (v1.0.0)
- Step 4 -- [boilerplate-stripper](#) (v1.0.0)
- Step 4 -- [content-filter](#) (v1.0.0)
- Step 4 -- [intent-tagger](#) (v2.0.0)
- Step 5 -- [content-analyzer](#) (v1.5.0)
- Step 5 -- [content-writer](#) (v1.8.0)
- Step 5 -- [seo-planner](#) (v2.4.0)
- Step 5 -- [tone-seo-editor](#) (v1.3.0)
- Step 6 -- [citation-coverage-checker](#) (v1.0.0)
- Step 6 -- [hallucination-detector](#) (v1.0.3)
- Step 6 -- [keyword-sufficiency-checker](#) (v1.0.1)
- Step 6 -- [meta-compliance-checker](#) (v1.0.3)
- Step 6 -- [qa-structural](#) (v1.1.0)
- Step 7 -- [loop-router](#) (v1.0.1)
- Step 8 -- [company-media](#) (v2.0.0)
- Step 8 -- [html-output](#) (v1.0.1)
- Step 8 -- [json-output](#) (v1.1.0)
- Step 8 -- [markdown-output](#) (v1.1.0)
- Step 8 -- [meta-output](#) (v1.0.2)
- Step 8 -- [schema-org-injector](#) (v1.0.0)
- Step 9 -- [content-delivery](#) (v1.0.0)

---

<!-- ===== ai-discovery-scout (step 1, v1.0.0) ===== -->

# AI Discovery Scout

> An LLM proposes likely-authoritative URLs for each entity from its own model knowledge, then every proposed URL is verified live before it enters the pool.

**Module ID:** `ai-discovery-scout` | **Step:** 1 (Discovery) | **Category:** search | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## What This Module Does

For each entity, an LLM (via `tools.ai`) proposes likely-authoritative URLs from model knowledge -- the entity's key pages and its profile pages on major public platforms. **Every proposed URL is then verified live** (`HEAD`, `GET` fallback via `tools.http`) before it enters the pool. Verification is the anti-hallucination gate and is ON by default -- an LLM will confidently invent plausible-looking URLs (canonical brief: `docs/submodule-briefs-rev-2026-07-03/step1-ai-discovery-scout.md`).

**Division of labor (why this is separate from search-discovery):** the scout *proposes from model knowledge* -- zero search cost, works where search is noisy. `search-discovery` *finds via a search index* -- grounded, but costs per query. Complementary, not overlapping: **the scout runs NO search-API calls.** (The original brief had the scout running Google queries itself; that was deleted to keep the module boundary clean.)

**Rule 13:** code knows only assemble-prompt -> parse-JSON -> verify-live -> emit. Which platforms/directories/registers to prioritize, the model, and the confidence bar all arrive via options/presets. The default prompt carries zero vertical vocabulary.

```
entity (name / website / extra columns)
  -> LLM proposes [{url, lead_type, rationale, confidence}]   (tools.ai)
  -> confidence filter + max cap                              (before HTTP, saves calls)
  -> live verification HEAD/GET                               (tools.http -- the gate)
  -> emit verified leads (+ optional suggested_queries to meta)
```

## When to Use

**Always run when:**
- You want extra lead coverage at zero search-API cost, alongside (or instead of) `search-discovery`
- Entities are established enough that the model plausibly knows their key pages
- Search results for the vertical are noisy and model knowledge is a cleaner first pass

**Skip when:**
- Entities are obscure or newer than the model's knowledge -- the LLM proposes little or generic junk (empty output is normal, not an error, but the LLM call still costs money)
- You need grounded, index-backed results -- that is `search-discovery`'s job
- No `prompt` is configured -- the module is a loud no-op (warns and emits nothing)

**Tune the settings when:**
- Proposals are low quality -- switch `ai_model` to a sonnet/opus-class model
- Too many dead-URL verification drops -- raise `min_confidence` (e.g. `0.6`) to prune before HTTP
- You want to seed `search-discovery` runs -- flip `emit_suggested_queries` on
- Hosts are slow -- raise `verification_timeout`

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `prompt` (textarea) | generic (below) | Always, per template preset | The LLM instruction. Placeholders `{entity_name}`, `{entity_website}`, `{entity_context}`, `{max}`. Must ask for strict JSON. ALL vertical flavor lives here. Blank prompt = loud no-op. |
| `ai_model` (select) | `haiku` | sonnet/opus-class for higher-quality proposals in production | Model passed to `tools.ai`. Registry-driven (`values_from: registry.models`) -- see below. |
| `ai_provider` (select) | `anthropic` | Route to another provider from the registry | Provider `tools.ai` routes to. Registry-driven (`values_from: registry.providers`) -- see below. |
| `max_urls_per_entity` (number, 1-50) | `10` | Lower to cut cost; raise for breadth | Caps leads proposed + verified per entity. Also interpolated into the prompt as `{max}`. |
| `min_confidence` (number, 0-1) | `0` | Raise (e.g. `0.6`) to trust only high-confidence leads | Drops low-confidence leads **before** verification (saves HTTP). `0` = keep all. Leads without a numeric confidence are never dropped by this filter. |
| `keep_unverified` (boolean) | `false` | `true` **only** with a Step-2 filter behind it | false = drop dead URLs (the anti-hallucination gate). true = keep them flagged `verified:"false"`. |
| `emit_suggested_queries` (boolean) | `false` | `true` to harvest queries for search-discovery | Adds a prompt section asking for up to 5 search-query strings; they land in `meta.suggested_queries` only, never the pool. |
| `verification_timeout` (number, 1000-30000) | `5000` ms | Raise for slow hosts | Per-URL HEAD/GET timeout during liveness verification. |
| `max_concurrent_verifications` (number, 1-20) | `5` | Lower for politeness; raise for speed | Parallel liveness checks per entity. |

**Registry-driven dropdowns:** `ai_provider` and `ai_model` declare `values_from` (`registry.providers` / `registry.models`) instead of a hardcoded list -- the skeleton populates their values from the shared LLM registry (providers: anthropic, openai, perplexity, gemini, openrouter; models scoped to the default provider). The defaults (`anthropic` / `haiku`) are unchanged.

The most impactful options are `prompt` (the entire vertical strategy lives there) and `keep_unverified` (never flip it true in a template default without a Step-2 filter). Note that the structured entity block (name, website, extra columns) is **always appended** to the prompt, even when a preset doesn't reference the placeholders inline -- the model always sees the raw entity data. Interpolation is `$`-safe: entity values containing `$&`/`$$` sequences are inserted verbatim.

**Default prompt (agnostic):** *"List up to {max} URLs likely to contain authoritative information about the entity below ... Return strict JSON: an array of [{url, lead_type, rationale, confidence}] ... Only include URLs you are confident actually exist."*

## Recommended Configurations

### Standard
For most pipeline runs -- cheap proposals, full verification gate:
```
prompt: (default -- generic; vertical flavor via template preset)
ai_model: haiku
ai_provider: anthropic
max_urls_per_entity: 10
min_confidence: 0
keep_unverified: false
emit_suggested_queries: false
verification_timeout: 5000
max_concurrent_verifications: 5
```

### Production quality
When lead quality matters more than LLM cost:
```
prompt: (template preset with vertical priorities)
ai_model: sonnet
ai_provider: anthropic
max_urls_per_entity: 15
min_confidence: 0.6
keep_unverified: false
emit_suggested_queries: false
verification_timeout: 5000
max_concurrent_verifications: 5
```

### Cost-lean
When running large entity batches and every HTTP call counts:
```
prompt: (default or preset)
ai_model: haiku
ai_provider: anthropic
max_urls_per_entity: 5
min_confidence: 0.7
keep_unverified: false
emit_suggested_queries: false
verification_timeout: 5000
max_concurrent_verifications: 3
```

### Query harvest
When the goal is seeding a `search-discovery` run, not just leads:
```
prompt: (default or preset)
ai_model: haiku
ai_provider: anthropic
max_urls_per_entity: 10
min_confidence: 0
keep_unverified: false
emit_suggested_queries: true
verification_timeout: 5000
max_concurrent_verifications: 5
```

**Preset examples (vertical flavor lives in the `prompt` preset, zero code difference):**

- **Company profiles:** *"List up to {max} URLs likely to contain authoritative information about {entity_name} ({entity_website}), a B2B iGaming supplier. Prioritize their About/Press/Compliance pages, their profiles on major industry directories, regulator license registers, and their LinkedIn company page. Return strict JSON ..."*
- **Job search:** *"List up to {max} URLs useful for researching {entity_name} as a prospective employer: careers page, engineering blog, Glassdoor profile, LinkedIn page, recent press. Return strict JSON ..."*

## What Good Output Looks Like

On the 2026-07-07 live run (haiku-class model, 3 well-known entities), 15 proposed leads yielded 10 verified + 5 dropped by the gate -- a ~30% drop rate is healthy and means the gate is working. For obscure entities, few or zero leads is normal, not an error. Per-entity meta reports `proposed` vs `total_found` vs `dropped` so you can see the gate's effect.

**Output fields** (per item, `url` is the item key):
- `url` -- the verified lead (required)
- `title` -- page `<title>` when the GET verification path ran, else empty (HEAD success yields no title)
- `lead_type` -- free-text label from the LLM (`official`/`profile`/`reference`/...) -- an emergent label for Step-2 filtering, NOT a code enum
- `rationale` -- why the LLM proposed it
- `confidence` -- the LLM's 0-1 confidence (string)
- `verified` -- `"true"`/`"false"`; unverified items are flagged in the UI (`flagged_when: verified:"false"`)
- `status_code` -- HTTP status from verification (`0` = request failed entirely)
- `found_via` -- always `"ai_scout"`
- `source` -- always `"ai-discovery-scout"`
- `entity_name` -- which entity the lead belongs to

`meta.suggested_queries` (newline-joined string) appears when `emit_suggested_queries` is on.

**Warning signs:**
- **Nearly all leads dropped** -- the model is hallucinating URLs for this vertical; raise `min_confidence`, improve the prompt, or switch to a stronger model. Also check `verification_timeout` if the dropped URLs are actually live but slow.
- **`errors` in the summary** ("LLM did not return valid JSON after retry") -- the model ignored the JSON instruction twice; that entity fails loudly (0 items + `error` on its result, `meta.errors: 1`) while other entities proceed. Check the model choice and that the prompt still demands strict JSON.
- **0 proposed across all entities** -- prompt too restrictive, or entities outside model knowledge -- consider `search-discovery` instead.

## Edge Cases

- **Hallucinated URLs** -- the defining risk; the default-on verification gate is the mitigation. Never ship `keep_unverified: true` as a template default without a Step-2 filter behind it.
- **Obscure entities** -- the LLM proposes little or generic junk; low `confidence` + verification prunes it; **empty output is normal**, not an error.
- **Prose instead of JSON** -- one corrective JSON-only retry (seo-planner v2.2.1 precedent) re-asks with the invalid response attached at temperature 0; on a second failure that entity fails loudly, other entities proceed. The parser tolerates code fences, a bare JSON array, an object shape (`{leads, suggested_queries}`), and markdown-laced responses (heading-strip pass).
- **Soft-404s** (200 with "page not found") -- pass verification wrongly; accepted by design -- Step-3 scraping + Step-4 content-filter catch these. The scout does NOT sniff content.
- **Verification statuses** -- 2xx/3xx = verified; everything else (incl. 403/404/5xx) = not verified. `HEAD` first; a definitive 4xx/5xx from HEAD is trusted (no GET); `GET` fallback only on HEAD 405/501 or a HEAD error -- and only the GET path yields a title.
- **Non-http(s) proposals** (`ftp:`, bare domains, empty strings) are silently discarded before verification.
- `_partialItems` pushed after every entity -- a long multi-entity run survives a mid-run timeout (Rule 10).

## Limitations

- Needs the skeleton's `tools.ai` with a configured API key for the selected provider (`ANTHROPIC_API_KEY` for the default `anthropic`) -- and it is inert (proposes nothing) until wired into a template and given a prompt.
- Verification is liveness only (HTTP status), not relevance -- that's Step-2's job (`url-relevance`, `url-filter`).
- Proposals are bounded by model knowledge; it is a *lead generator*, complementary to `search-discovery`'s grounded results.

## What Happens Next

Verified leads land in the Step-1 pool as `url`-keyed items (`add`, so they augment other discovery output). Step-2 (`url-dedup`/`url-filter`/`url-relevance`) filters them; Step-3 scrapes them. `meta.suggested_queries` is operator-facing metadata for manually seeding a `search-discovery` run.

## Testing

- `node modules/step-1-discovery/ai-discovery-scout/test-ai-discovery-scout.js` -- 55 assertions, `tools.ai` + `tools.http` fully mocked, no credentials, no network. Covers the JSON-retry path, the hallucination-drop (dead-URL) gate, confidence pruning, HEAD->GET fallback, suggested-queries, and `$`-replacement-safe prompt interpolation.
- `zsh -c 'source ~/.zprofile; node modules/step-1-discovery/ai-discovery-scout/test-live-ai-discovery-scout.js'` -- **live test, PASSED 2026-07-07** (~a couple cents on a haiku-class model; exits 0 harmlessly when `ANTHROPIC_API_KEY` is absent). Part A: real Haiku proposed 15 leads across 3 real entities (OpenAI/Anthropic/GitHub), all parsed as strict JSON on the first attempt, **10 verified live + 5 dropped by the gate**. Part B: deterministic real-HTTP `verifyUrl` -- live URL kept (200), 404 dropped, DNS-failure dropped.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** search
- **Cost tier:** expensive -- LLM call per entity + up to N verification requests per entity; 30-min timeout
- **Data operation:** add (+) -- net-new leads join the pool, upserted by `(url, source_submodule)`
- **Pool precondition:** `empty_ok` -- a discovery/seed module; runs against an empty or populated pool
- **Required input columns:** `["name"]` (`website`/extra columns enrich the prompt when present)
- **Depends on:** nothing (`depends_on: []`)
- **Input format:** `input.entities` -- entity rows with `name` plus any extra columns
- **Output format:** per-entity `{ entity_name, items[], meta: { total_found, proposed, dropped, errors } }` + run summary with per-entity error strings
- **Error handling:** one corrective JSON retry per entity; unrecoverable -> that entity fails loudly (`error` on the result, `meta.errors: 1`), others proceed (no total throw); verification failures drop or flag per `keep_unverified`; `_partialItems` pushed per entity
- **External dependencies:** `tools.ai` (skeleton-managed provider keys, registry-routed), `tools.http`. No SDKs imported (Rule 3).

## Changelog

- **1.0.0** (2026-08-04, manifest-only) -- `ai_model`/`ai_provider` dropdowns became registry-driven (`values_from: registry.models` / `registry.providers`); the skeleton now populates their values from the shared LLM registry instead of a hardcoded list. Defaults unchanged.
- **1.0.0** (2026-07-06) -- initial version per the canonical revised brief. LLM lead proposal + default-on live-verification gate; corrective JSON retry; suggested-queries to meta; fully agnostic default prompt. 55/55 mocked unit tests. **Live-verified 2026-07-07** against real Haiku + real HTTP (haiku-class run: 15 proposed -> 10 verified / 5 dropped across OpenAI/Anthropic/GitHub; deterministic liveness gate keeps 200s, drops 404/DNS-fail).

---

<!-- ===== api-search (step 1, v1.1.0) ===== -->

# API Search

> Discovers items from multiple REST APIs using a single config-driven module. Supports keyword-search APIs and feed APIs -- adding a new API source means adding a JSON config, not writing code.

**Module ID:** `api-search` | **Step:** 1 (Discovery) | **Category:** search | **Cost:** cheap
**Version:** 1.1.0 | **Data Operation:** transform (=)

---

## What This Module Does

API Search queries REST APIs to discover items matching your search criteria. Instead of having a separate submodule for every API, this single module handles any REST API that returns JSON -- you just configure a provider object describing how to talk to that API.

The module supports two types of APIs:

- **Search mode** -- APIs that accept a keyword parameter and return filtered results. One API call per keyword.
- **Feed mode** -- APIs that return all recent items with no server-side filtering. One API call total, then keywords are matched client-side against configured fields.

Providers are configured via the `providers` option. Each provider is a JSON object describing the API endpoint, field mapping, and mode. Results are deduplicated by `externalId` across all providers and keywords within a single run.

```
api-search (Step 1) -> url-relevance (Step 2) -> scrapers (Step 3) -> ...
```

### Entity Production

When `entity_production` is enabled, each approved item becomes its own entity for downstream steps. This is how the Job Search pipeline works: api-search discovers 200 job listings, each becomes a separate entity that gets scraped, analyzed, and generates its own CV.

The `entity_name_template` option controls how produced entities are named using `{field}` placeholders. Names appear in the UI and logs, so pick something meaningful -- `{title} - {company}` for job search, `{title}` for news.

Entity production is handled by the skeleton at approval time -- the submodule itself doesn't need to know about it.

### Search Input Modes

The `search_input` option controls where keywords come from:

- **`keywords`** (default) -- uses the static `keywords` list from options. Best for fixed search queries shared across all entities.
- **`entity`** -- reads `entity.keywords` or `entity.search_terms` from the entity data (comma-separated string or JSON array). Best when each entity has its own search terms, e.g. from a CSV column.
- **`entity_names`** -- uses `entity.name` as the search term. Best when the entity name IS the search query -- e.g. searching for company names.

## When to Use

**Always run when:**
- You need to discover items from REST APIs that return JSON
- You want to search multiple API sources in a single step

**Skip when:**
- You already have a list of specific URLs (use seed data directly instead)
- The target sources don't have a public JSON API (use browser-crawler for HTML scraping)

**Tune the settings when:**
- Too many irrelevant results -- add `exclude_keywords` and `score_rules` to filter and prioritize
- API rate limits -- lower `requests_per_minute`
- Each discovered item needs its own downstream processing -- enable `entity_production`

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `search_input` | `keywords` | Set to `entity` when each entity has its own search terms; `entity_names` when entity names are the search query | Controls where keywords come from: static list, entity fields, or entity names |
| `keywords` | `["CMO", "CPO", "CEO"]` | Replace with your actual search terms. Only used when `search_input` = `keywords` | Search mode: one API call per keyword. Feed mode: client-side filter on configured fields |
| `exclude_keywords` | `["intern", "junior", "student"]` | Add terms to filter out unwanted results. Case-insensitive title match | Items whose title contains any of these terms are silently dropped |
| `max_results` | `50` | Raise to 100-500 for broader searches; lower for targeted queries | Search mode: passed as limit parameter to API. Feed mode: not enforced |
| `providers` | `[]` | **Must configure** -- no providers = no results. See Provider Config below | Array of provider config objects describing each API endpoint |
| `provider_params` | `{}` | Set per-provider extra params, e.g. `{"jobtech": {"municipality": "0180"}}` | Extra query parameters added to API requests, keyed by provider ID |
| `requests_per_minute` | `30` | Lower to 10-15 if hitting rate limits; raise to 60+ for generous APIs | Global rate limit across all providers. Prevents 429 errors |
| `entity_production` | `false` | Enable when each discovered item should become its own entity downstream | Each approved item becomes a separate entity for Step 2+ (scraping, analysis, writing) |
| `entity_name_template` | `"{title}"` | Set to `"{title} - {company}"` for job search, or any `{field}` combination | How to name produced entities. Only used when entity_production is enabled |
| `score_rules` | `[]` | Add rules to prioritize high-signal items. See Scoring below | Scoring rules that flag important items so they appear first in results |

The most impactful options are `providers` (determines what APIs are searched), `keywords` (determines what to search for), and `score_rules` (determines what surfaces first). Get providers and keywords right first, then add scoring to reduce noise.

## Provider Config

Each provider in the `providers` array is a JSON object:

### Search-mode provider (API accepts keywords)
```json
{
  "id": "adzuna",
  "name": "Adzuna (UK)",
  "mode": "search",
  "url": "https://api.adzuna.com/v1/api/jobs/gb/search/1",
  "keyword_param": "what",
  "limit_param": "results_per_page",
  "results_path": "results",
  "filter_fields": [],
  "field_map": {
    "url": "redirect_url",
    "title": "title",
    "company": "company.display_name",
    "location": "location.display_name",
    "snippet": "description",
    "postedAt": "created",
    "externalId": "id"
  },
  "auth": { "type": "query_param", "key": "app_key", "env_var": "ADZUNA_API_KEY" }
}
```

### Feed-mode provider (API returns all items)
```json
{
  "id": "myfeed",
  "name": "My Feed API",
  "mode": "feed",
  "url": "https://api.example.com/items",
  "results_path": "data.items",
  "filter_fields": ["title", "description"],
  "field_map": {
    "url": "apply_url",
    "title": "item_title",
    "company": "company.name",
    "location": "location",
    "snippet": "summary",
    "postedAt": "published_at",
    "externalId": "id"
  },
  "auth": null
}
```

### Provider config fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier, used as `source` in output and for `provider_params` keys |
| `name` | Yes | Display name for progress messages |
| `mode` | Yes | `"search"` or `"feed"` |
| `url` | Yes | Base API URL |
| `keyword_param` | Search only | Query parameter name for keyword (e.g., `"q"`, `"what"`) |
| `limit_param` | Optional | Query parameter name for result limit |
| `results_path` | Yes | Dot-notation path to the results array in the JSON response (e.g., `"hits"`, `"data.items"`) or `$slice_first` to skip element 0 |
| `filter_fields` | Feed only | Which raw fields to search for keyword matches (e.g., `["title", "description"]`) |
| `field_map` | Yes | Maps canonical output fields to API response fields using dot notation |
| `auth` | Optional | Auth config: `{ "type": "query_param", "key": "param_name", "env_var": "ENV_VAR_NAME" }` or `{ "type": "bearer", "env_var": "ENV_VAR_NAME" }` |
| `headers` | Optional | Static custom-header map, values support `{env:VAR_NAME}` interpolation. For APIs whose auth is neither a query param nor a `Bearer` token — e.g. Pexels: `{ "Authorization": "{env:PEXELS_API_KEY}" }` (raw key, no "Bearer" prefix). Multiple headers allowed; static (non-`{env:}`) values pass through verbatim. If any referenced env var is unset, the provider is skipped with a warning (same policy as `auth`). Applied after `auth.bearer`, so a `headers` entry can intentionally override it. (v1.1.0) |

> **v1.1.0 custom-header auth — live-verified 2026-07-07.** A real Pexels call routed through this module (the `config-image-search/providers-stock.json` preset) went out with the raw-key `Authorization` header (no `Bearer` prefix), returned HTTP 200, and produced 5 items — proving the `{env:VAR}` header path end-to-end against the live API. (Skip-on-missing-env-var stays covered by the mocked `test-header-auth.js` / `test-image-search-config.js`.) See `config-image-search` for the full four-provider sweep.

### field_map supports

- **Simple path:** `"employer.name"` -- dot-notation into the API response object
- **Fallback array:** `["url", "$remoteok_slug"]` -- tries each path in order, uses first non-empty value
- **null:** Field is always null for this provider

## Scoring

Score rules flag high-signal items so they appear first in results. Each rule matches a field against patterns and adds points. Items get `_score` (total points), `_signal` (`high` >= 3, `medium` >= 1, `low` = 0), and `_matched_rules` (which rules matched).

```json
{
  "score_rules": [
    {
      "field": "title",
      "patterns": ["cmo", "chief marketing officer", "fractional cmo"],
      "score": 3,
      "label": "C-level"
    },
    {
      "field": "location",
      "patterns": ["stockholm", "barcelona", "remote"],
      "score": 1,
      "label": "Good-location"
    }
  ]
}
```

| Rule field | Description |
|------------|-------------|
| `field` | Item field to match: `title`, `location`, `company`, etc. |
| `patterns` | Substring matches (case-insensitive). First match wins per rule. |
| `score` | Points to add when matched |
| `label` | Human label for the matched rule |

Results are sorted by `_score` descending (highest signal first). When `score_rules` is empty (default), scoring is completely skipped -- no fields added, no sorting.

## Recommended Configurations

### Standard (company research)
Default keywords, no scoring, no entity production:
```
search_input: keywords
keywords: ["company name", "industry term"]
exclude_keywords: []
max_results: 50
requests_per_minute: 30
entity_production: false
score_rules: []
```

### Job Search
Searching job boards with scoring and entity production:
```
search_input: keywords
keywords: ["CMO", "Head of Marketing", "VP Marketing", "iGaming"]
exclude_keywords: ["intern", "junior", "student", "assistant", "coordinator"]
max_results: 50
requests_per_minute: 30
entity_production: true
entity_name_template: "{title} - {company}"
score_rules: [
  {"field": "title", "patterns": ["cmo", "chief marketing", "vp marketing"], "score": 3, "label": "C-level"},
  {"field": "title", "patterns": ["head of", "director"], "score": 2, "label": "Senior"},
  {"field": "location", "patterns": ["stockholm", "remote"], "score": 1, "label": "Good-location"}
]
```

### Entity-Driven Search
Each entity brings its own keywords (from CSV):
```
search_input: entity
keywords: []
max_results: 50
requests_per_minute: 30
entity_production: false
```

### Company Name Search
Use entity names as search terms:
```
search_input: entity_names
keywords: []
max_results: 50
requests_per_minute: 30
entity_production: false
```

### Conservative (rate-limited APIs)
Minimize API calls:
```
search_input: keywords
keywords: ["primary term"]
max_results: 20
requests_per_minute: 10
entity_production: false
score_rules: []
```

## What Good Output Looks Like

**Healthy result:**
- 10-200 unique items per entity, depending on keyword count and provider breadth
- Clear `source` field showing which provider found each item
- When scoring is active: high-signal items sorted to top, `_score` and `_signal` fields present

**Output fields:**

| Field | Description |
|-------|-------------|
| `title` | Item title from the API |
| `company` | Company/source name |
| `location` | Location string |
| `url` | Direct link -- used by downstream scrapers |
| `source` | Provider ID that found this item |
| `externalId` | Provider-prefixed unique ID for deduplication |
| `snippet` | First 200 characters of description (HTML stripped) |
| `text_content` | Full description text if > 200 chars |
| `postedAt` | Publication date from the API |
| `status` | Always `success` for discovered items |
| `_score` | Scoring total (only when score_rules configured) |
| `_signal` | `high`, `medium`, or `low` (only when score_rules configured) |
| `_matched_rules` | Array of matched rule labels (only when score_rules configured) |

**Warning signs:**
- 0 results from a provider -- check if the API is down, credentials are missing, or keywords don't match the API's content
- All items from one provider only -- other providers may have auth issues or be misconfigured
- Many items with identical titles -- API may be returning duplicates with different IDs. Consider adding `exclude_keywords`
- `_score: 0` on most items when scoring is active -- patterns may be too narrow, or the field names don't match

## Limitations

- **No HTML scraping** -- only works with APIs that return JSON
- **Feed-mode keyword filtering is basic** -- case-insensitive substring match on raw fields
- **No pagination** -- fetches one page of results per keyword
- **Auth: query param, bearer, or custom static headers** -- via `auth` (query_param/bearer) or the `headers` map (v1.1.0). Signed/HMAC auth (e.g. PodcastIndex's key+hash+timestamp) is NOT supported -- that needs a computed-signature handler, tracked separately
- **15-second timeout per request** -- hardcoded
- **String option parsing** -- the UI may store JSON options as strings. The module auto-parses these, but malformed JSON silently falls back to defaults

## What Happens Next

Discovered items flow into **Step 2 (Validation)** where they can be filtered by URL patterns (url-filter) or classified by an LLM (url-relevance). When `entity_production` is enabled, each approved item becomes its own entity -- the validation step then processes each entity independently.

When scoring is active, the `_score` and `_signal` fields carry through to Step 2. The url-relevance module can include these in its LLM prompt via `metadata_fields: ["_score", "_signal"]` to help the classifier make better decisions.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** search
- **Cost:** cheap -- no external paid services, just API calls to configured providers
- **Data operation:** transform (=) -- items discovered and returned
- **Required input columns:** `name` (entity name)
- **Depends on:** nothing (first in pipeline)
- **Input:** `input.entities[]` with entity name and optional keywords/search_terms fields
- **Output:** `{ results[], summary }` where results are grouped by entity_name
- **Error handling:** Per-keyword errors are caught and logged; other keywords continue. Per-provider errors skip the provider. Global rate limiter prevents 429s. Partial results saved after each keyword for timeout resilience
- **External dependencies:** None (uses `tools.http` for API calls)
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== browser-crawler (step 1, v1.0.0) ===== -->

# Browser Link Crawler

> Extract URLs from websites using a headless browser (Playwright) with Wayback Machine fallback for blocked or unreachable sites.

**Module ID:** `browser-crawler` | **Step:** 1 (Discovery) | **Category:** crawling | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## Background

### The Content Problem This Solves

Many modern websites use Cloudflare protection, JavaScript rendering, or aggressive bot detection that prevents simple HTTP-based crawlers from extracting links. When the cheaper crawlers (page-links, deep-links) return 403 errors or empty results, the pipeline has a blind spot — it cannot discover any content URLs for that company. Without URLs, everything downstream (scraping, analysis, content generation) is impossible for that entity.

The original Content Creation Master anticipated this split: some sites need simple HTTP requests, others need a headless browser. This module is the browser-powered fallback that ensures even well-protected sites yield discoverable URLs.

### How It Fits the Pipeline Architecture

This is a Step 1 Discovery module — the very beginning of the pipeline. It sits alongside cheaper HTTP-based crawlers (sitemap-parser, page-links, deep-links) and is intended as a fallback when those fail. The Strategic Architecture describes this:

> *"Not all pages can be fetched the same way. Some need simple HTTP requests. Some need a headless browser for JavaScript rendering. Some are behind authentication or rate limiting. Different submodules handle different scraping challenges."*

This is the first **native per-entity module** in the pipeline. Unlike other modules that receive `input.entities` (an array), this module receives `input.entity` (a single entity) and returns results for just that entity. The skeleton handles the per-entity dispatch.

The module also includes a **Wayback Machine fallback** — if even the headless browser cannot reach the site (complete outage, geo-blocking, etc.), it fetches the most recent archived snapshot from web.archive.org via plain HTTP and extracts links from that cached version.

## Strategy & Role

**Why this module exists:** Ensure every entity gets a chance at URL discovery, even when the site is Cloudflare-protected, JavaScript-heavy, or temporarily unreachable. This is the last-resort crawler before giving up on an entity.

**Role in the pipeline:** Expensive fallback in Step 1. Run after cheaper crawlers have been tried. Only use on entities that returned zero URLs from sitemap-parser, page-links, or deep-links.

**Relationship to other steps:**
- **Runs alongside:** sitemap-parser, page-links, deep-links (other Step 1 modules)
- **Feeds into Step 2:** Discovered URLs for validation, deduplication, and relevance filtering
- **Unique capability:** Renders JavaScript, handles Cloudflare, falls back to Wayback Machine archive

## When to Use

**Always use when:**
- An entity returned zero URLs from cheaper crawlers (403 errors, empty results)
- The target site is known to be Cloudflare-protected or JavaScript-rendered (SPA)

**Do not use when:**
- Cheaper crawlers already found sufficient URLs — this module is expensive (Playwright per page)
- You are testing pipeline flow — use test-dummy instead

**Consider settings carefully when:**
- Crawling very large sites — adjust `max_urls` and `max_depth_pages` to control scope
- Sites are slow to load — increase `request_timeout` beyond the 20s default
- Memory is constrained on the server — reduce `concurrency` to 1

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `max_urls` | 300 | Lower to 50-100 for focused discovery; raise to 500-1000 for comprehensive crawls | Maximum URLs returned per entity. Higher = more data but longer runtime |
| `max_depth_pages` | 5 | Set to 0 for homepage-only; raise to 10-20 for deep discovery | Number of key internal pages (/blog, /news, /about, etc.) to follow from the homepage for second-level link extraction |
| `request_timeout` | 20,000ms | Raise to 30-60s for very slow sites; lower to 10s for known-fast sites | Per-page browser timeout. Too low = missed pages on slow-loading SPAs |
| `same_domain_only` | true | Set to false if you need cross-domain links (partner sites, subdomains) | Filters out links to external domains. Usually keep true to focus on the entity's own content |
| `concurrency` | 2 | Lower to 1 on memory-constrained servers; raise to 3-4 on powerful machines | How many internal pages to fetch in parallel. Browser tabs are memory-heavy |
| `auto_click_load_more` | false | Enable when target sites hide content behind "Load More" / "Show More" buttons | Auto-detects and clicks pagination buttons before extracting links. Uses 35 selectors covering text, CSS class, aria, and data-attribute patterns |
| `load_more_selector` | "" | Only when auto-detection misses a specific site's button | Advanced override: manual Playwright selector (supports `:has-text()` syntax). Takes priority over auto-detection -- and enables clicking even when `auto_click_load_more` is false |
| `max_load_more_clicks` | 10 | Raise to 20-50 for sites with large paginated lists (50+ items) | How many times to click the button. Stops early if button disappears or content stops growing |
| `max_load_more_seconds` | 120 | Raise to 300+ for very slow-loading paginated content | Wall-time budget for clicking. Prevents runaway click loops |

## Load More Auto-Detection

When `auto_click_load_more` is enabled, the crawler passes 35 candidate Playwright selectors in priority order to find the pagination button:

1. **Buttons by text** (highest confidence) -- `button:has-text("Load More")`, `Show More`, `See More`, `View More`, `More Articles`, `More Posts`, `More Stories`, `More Results`
2. **Role-based buttons** -- `[role="button"]:has-text(...)` for div/span styled as buttons
3. **Class-based patterns** -- `[class*="load-more"]`, `loadMore`, `show-more`, `btn-more`, etc. (language-agnostic -- devs use English class names)
4. **Links by text** (lower confidence) -- `a:has-text("Load More")`, etc.
5. **Links by class** -- `a[class*="load-more"]`, etc.
6. **Data attributes** -- `[data-action*="load-more"]`, `[data-testid*="loadMore"]`
7. **Aria labels** -- `[aria-label*="load more" i]`, `[aria-label*="show more" i]`

Playwright's `:has-text()` does case-insensitive substring matching, so `button:has-text("Load More")` catches "Load More", "LOAD MORE", "Load more posts", etc. Clicking applies to the homepage and to every depth-2 internal page.

**Safety features:** The click loop stops early if the button disappears, becomes disabled, or produces no new content -- and always stops when `max_load_more_clicks` or the `max_load_more_seconds` time budget is reached.

## Recipes

### Standard Fallback Crawl
Balanced settings for most blocked sites:
```
max_urls: 300
max_depth_pages: 5
request_timeout: 20000
same_domain_only: true
concurrency: 2
auto_click_load_more: false
```

### Quick Homepage Scan
Just grab links from the homepage, no depth crawling:
```
max_urls: 100
max_depth_pages: 0
request_timeout: 15000
same_domain_only: true
concurrency: 1
```

### Deep Comprehensive Crawl
Maximum coverage for important entities:
```
max_urls: 500
max_depth_pages: 15
request_timeout: 30000
same_domain_only: true
concurrency: 3
auto_click_load_more: true
max_load_more_clicks: 20
```

### Paginated Blog/News Discovery
For sites that hide blog posts behind Load More buttons:
```
max_urls: 500
max_depth_pages: 10
request_timeout: 25000
same_domain_only: true
concurrency: 2
auto_click_load_more: true
max_load_more_clicks: 30
max_load_more_seconds: 180
```

### Cross-Domain Discovery
When entity operates across multiple subdomains:
```
max_urls: 300
max_depth_pages: 5
request_timeout: 20000
same_domain_only: false
concurrency: 2
```

## Expected Output

**Healthy result:**
- 50-300 URLs per entity depending on site size
- Links categorized by source location (nav, header, footer, body)
- Metadata showing which pages were crawled and whether Wayback Machine was used

**Output fields per URL:**
- `url` -- the discovered link URL
- `link_text` -- anchor text of the link (first 200 characters)
- `source_location` -- where on the page the link was found: `nav`, `header`, `footer`, or `body`
- `found_on` -- the URL of the page where this link was discovered

**Meta fields:**
- `total_found` -- raw link count before filtering
- `after_filter` -- count after same-domain filtering
- `unique` -- count after deduplication
- `returned` -- final count after max_urls limit
- `pages_crawled` -- total pages fetched (1 + depth pages)
- `depth_pages` -- number of internal pages crawled beyond the homepage
- `wayback_fallback` -- boolean indicating whether Wayback Machine was used
- `errors` -- 1 when the entity failed entirely (no website field, or both browser and Wayback failed), 0 otherwise

**Red flags to watch for:**
- `wayback_fallback: true` -- site was unreachable even by browser; links may be outdated
- Very low URL count (< 10) -- site may be a single-page application with no internal links
- All links from `body` section only -- site may not use standard nav/header/footer HTML elements

## Limitations & Edge Cases

- **Requires Playwright on the server** -- the module throws immediately if `tools.browser.fetch` is not available (Playwright must be installed) or if `tools.http.get` is missing (required for the Wayback Machine fallback)
- **Memory-heavy** -- each browser tab consumes significant memory. Running multiple entities concurrently with high `concurrency` can exhaust server RAM
- **Wayback Machine links may be stale** -- archived snapshots can be months or years old. Links discovered via Wayback may point to pages that no longer exist. When the homepage needed Wayback, depth-2 pages are fetched via Wayback too, and archive.org URL wrappers are stripped from all extracted links (archive.org internal links are dropped)
- **Fragments and tracking params stripped** -- `#fragment` and analytics/ad params (utm_*, fbclid, gclid, mc_cid, ref, etc.) are removed for cleaner deduplication. Pagination and content params are preserved (`?page=2`, `/products?id=123` survive intact)
- **waitForSelector on depth pages** -- depth-2 page fetches use `waitForSelector: 'a'` to ensure the page hydrates before link extraction. This improves reliability on SPAs and React Server Component sites that render links client-side
- **No cookie consent handling** -- the browser does not click cookie consent banners. Some sites may show an overlay that hides content/links
- **Sectioned link detection uses regex** -- nav/header/footer detection relies on HTML tag matching, which may misclassify links on non-standard layouts
- **Load More auto-detection is heuristic** -- relies on common English text, class names, and attributes. Non-English button text or custom web components may not be detected. Use `load_more_selector` override for those cases

## What Happens Next

Discovered URLs enter the working pool and flow into **Step 2 (Validation)** where they are deduplicated, filtered for relevance (include/exclude patterns), and validated as reachable. The `source_location` and `link_text` fields help Step 2 modules prioritize — navigation links often point to key structural pages, while body links point to specific content.

Since this module is a fallback for blocked sites, its output often represents the only URLs available for an entity. The Wayback Machine fallback ensures that even temporarily unreachable sites contribute to the pipeline rather than being silently dropped.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** crawling
- **Cost:** expensive -- 30-minute timeout tier; headless browser per page
- **Data operation:** add (+) -- discovered URLs are added to the pool as new items, upserted by `(url, source_submodule)` so a re-run replaces this module's own prior output without touching other modules' items
- **Pool precondition:** `empty_ok` -- runs against an empty or populated pool; discovery module producing items from an external source
- **Item key:** `url`
- **Requires:** `website` field on input entity (`requires_columns: ["website"]`)
- **Input:** `input.entity` (single entity -- native per-entity module) with `website` field
- **Output:** `{ entity_name, items[], meta }` where items contain `url`, `link_text`, `source_location`, `found_on` (display type: table)
- **Error handling:** browser failure triggers Wayback Machine fallback; both failing returns empty items with an error message combining both failure reasons (meta `errors: 1`); depth-2 page failures are logged and skipped, never fatal
- **Timeout resilience:** homepage links are pushed to `tools._partialItems` right after homepage extraction, then refreshed with the combined homepage + depth-2 links after internal-page crawling -- if the skeleton kills the run on timeout, the partial results are saved instead of losing all progress
- **Dependencies:** `tools.browser` (Playwright), `tools.http` (Wayback Machine fallback), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== csv-discovery (step 1, v1.0.0) ===== -->

# CSV Discovery

> Imports items from CSV or XLSX files -- uploaded directly or read from a local directory. Maps columns to standard pipeline format and feeds items into the pipeline without re-running discovery.

**Module ID:** `csv-discovery` | **Step:** 1 (Discovery) | **Category:** search | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## What This Module Does

CSV Discovery reads structured data files (CSV, XLSX, XLS) and converts them into pipeline items. It's the primary way to bring external data into the pipeline -- LinkedIn job exports, company lists, spreadsheets from colleagues, or output from external scripts.

The module supports two input methods:

- **File upload** -- drag and drop CSV/XLSX files directly in the UI. XLSX files are auto-converted to CSV on upload.
- **Source directory** -- point to a folder on the server where external tools drop CSV files on a schedule.

Both methods can be used simultaneously. Files from both sources are combined and deduplicated by `externalId`.

```
CSV/XLSX files -> csv-discovery (Step 1) -> url-relevance (Step 2) -> scrapers (Step 3) -> ...
```

### Entity Production

When `entity_production` is enabled, each approved item becomes its own entity for downstream steps. This is how imported job listings become individual entities -- each with its own URL to scrape, its own analysis, and its own CV.

The `entity_name_template` option controls naming using `{field}` placeholders. Entity production is handled by the skeleton at approval time.

### Column Mapping

The `column_map` option maps your CSV column headers to standard pipeline fields. The module lowercases all column headers before matching, so `"Company Name"` and `"company name"` both work. Matching is otherwise EXACT -- the module reads files directly from disk and looks headers up against `column_map` only. The skeleton's column-alias system (which resolves `"domain"`, `"company url"` etc.) applies to Step-0 entity imports, NOT to files this module reads -- if your CSV uses a variant header, add it to `column_map` explicitly, or rows will silently produce empty fields.

### Delimiter Detection

The CSV parser auto-detects whether a file uses commas or semicolons as delimiters by counting occurrences in the header line. European CSV exports that use semicolons work automatically.

## When to Use

**Always run when:**
- You have a spreadsheet or CSV with items to process (job listings, company lists, URL lists)
- External tools export discovery results as CSV files
- You want to combine uploaded data with API search results in a single pipeline run

**Skip when:**
- You're discovering items from APIs (use api-search instead)
- You're entering URLs manually (use URL seed input instead)

**Tune the settings when:**
- Your CSV has non-standard column headers -- configure `column_map`
- Running the same files repeatedly -- enable `skip_processed` to avoid re-importing
- Each row should become its own entity downstream -- enable `entity_production`

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `upload_dir` | (set by UI) | Used automatically when files are uploaded via the UI | Directory where uploaded files are stored. XLSX files are auto-converted to CSV |
| `source_dir` | (empty) | Set to a server path when external tools drop CSV files on a schedule | Absolute path to folder containing CSV files. Leave empty if using upload only |
| `file_pattern` | `*.csv` | Change to `jobs-*.csv` to match specific filenames. Do NOT point it at raw `.xlsx` files -- the module parses matched files as CSV text; Excel files are only supported via UI upload, which converts them to CSV first (matched by the default `*.csv`) | Glob pattern for filenames to process |
| `column_map` | see below | Change when your CSV columns don't match the defaults (e.g. `"job_url"` instead of `"url"`) | Maps pipeline field names to CSV column headers |
| `source_label` | `linkedin` | Set to describe the data source -- `"adzuna"`, `"manual"`, `"company-list"` | Value for the `source` field on output items. Used in externalId prefix |
| `skip_processed` | `true` | Set to `false` to re-import all files every run (useful during development) | Tracks which files have been read via a `.processed` file in the source directory |
| `exclude_keywords` | `[]` | Add terms like `["intern", "junior"]` to filter unwanted items by title | Items whose title contains any of these terms (case-insensitive) are silently dropped |
| `entity_production` | `false` | Enable when each imported row should become its own entity for downstream steps | Each approved item becomes a separate entity for Step 2+ (scraping, analysis, writing) |
| `entity_name_template` | `"{title} - {company}"` | Adjust to `"{title}"` or `"{company} - {title}"` depending on what makes sense in the UI | How to name produced entities. Only used when entity_production is enabled |

### Default column_map

```json
{
  "url": "url",
  "title": "title",
  "company": "company",
  "location": "location",
  "snippet": "snippet",
  "postedAt": "posted_date",
  "externalId": "url"
}
```

Left side = pipeline field name. Right side = CSV column header (case-insensitive). Change the right side to match your CSV.

## Recommended Configurations

### LinkedIn Job Export
Standard configuration for LinkedIn job CSV exports:
```
source_label: linkedin
column_map: {"url": "url", "title": "title", "company": "company", "location": "location", "snippet": "snippet", "postedAt": "posted_date", "externalId": "url"}
skip_processed: true
exclude_keywords: ["intern", "junior", "student"]
entity_production: true
entity_name_template: "{title} - {company}"
```

### Company List Import
Importing a spreadsheet of companies for research:
```
source_label: manual
column_map: {"url": "website", "title": "company_name", "company": "company_name", "location": "hq_location", "externalId": "company_name"}
skip_processed: true
exclude_keywords: []
entity_production: false
```

### Recurring External Automation
External script drops CSV files into a server directory daily:
```
source_dir: /opt/discovery/daily-jobs
file_pattern: jobs-*.csv
source_label: automation
skip_processed: true
exclude_keywords: []
entity_production: true
entity_name_template: "{title} - {company}"
```

### Development / Re-Import
Re-process all files during testing:
```
skip_processed: false
source_label: test
exclude_keywords: []
entity_production: false
```

## What Good Output Looks Like

**Healthy result:**
- Items match the number of rows in your CSV (minus duplicates and excluded keywords)
- Every item has a `url`, `title`, and `externalId`
- Summary shows files read and items imported

**Output fields:**

| Field | Description |
|-------|-------------|
| `title` | Item title from the mapped CSV column |
| `company` | Company name from the mapped column |
| `location` | Location from the mapped column |
| `url` | URL for downstream scraping |
| `source` | The `source_label` value (e.g. `linkedin`) |
| `externalId` | Source-prefixed unique ID for deduplication (LinkedIn numeric IDs are extracted from URLs) |
| `snippet` | First 200 characters of the description column |
| `text_content` | Full description text if > 200 chars |
| `postedAt` | Date from the mapped column |
| `status` | Always `success` for imported items |

**Warning signs:**
- 0 items from a file with many rows -- check `column_map`. If the `url` column can't be found, rows are silently skipped
- All items missing titles or companies -- column headers don't match the map. Check case and exact spelling
- "No new files" when you expect results -- files were already processed. Set `skip_processed: false` or delete the `.processed` file in the source directory
- Duplicate `externalId` warnings -- same items appearing in multiple files. This is expected and handled by dedup

## Limitations

- **No network I/O** -- reads files from local disk only. Cannot fetch CSVs from URLs
- **BOM handling** -- automatically strips UTF-8 BOM markers, but other encodings (UTF-16, Latin-1) may cause issues
- **Flat structure only** -- CSV rows are treated as flat key-value pairs. Nested JSON columns are read as strings
- **Entity-agnostic** -- all entities receive the same items. CSV data isn't split by entity (unlike api-search which searches per-entity)
- **XLSX conversion** -- happens at upload time in the skeleton, not in this module. The module reads the resulting CSV
- **LinkedIn externalId extraction** -- specifically parses LinkedIn job URL format (`/jobs/view/1234567890`). Other URL formats use the full URL as ID

## What Happens Next

Imported items flow into **Step 2 (Validation)** where they can be filtered by URL patterns or classified by an LLM. When `entity_production` is enabled, each approved item becomes its own entity -- subsequent steps process each independently (scraping the job page, analyzing the listing, generating a CV).

The `source` field tracks data origin throughout the pipeline, so downstream modules and reports can distinguish items imported from CSV versus discovered via API.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** search
- **Cost:** cheap -- 2-minute timeout; no network I/O, pure file reading
- **Data operation:** add (+) -- imported rows are added to the pool as new items, keyed by `url`. Re-running replaces this module's own prior output but preserves items from other discovery modules
- **Pool precondition:** `empty_ok` -- runs against an empty pool (it's a seed/discovery module; the pool check never skips it)
- **Required input columns:** `name` (entity name, enforced by skeleton)
- **Depends on:** nothing (first in pipeline)
- **Input:** `input.entities[]` with entity names. CSV data comes from files, not entities
- **Output:** `{ results[], summary }` where results are grouped by entity_name. All entities receive the same items
- **Selectable:** items are selectable in the UI for review before approval
- **Error handling:** Per-file errors are caught and logged; other files continue. Missing directories produce an error result. Partial results saved after each file for timeout resilience
- **External dependencies:** Node.js `fs` and `path` (built-in). No npm packages
- **Column matching:** exact lowercased lookup against `column_map` only -- the skeleton's column-alias system does NOT apply to files this module reads (it covers Step-0 entity imports). Unmapped headers yield empty fields; rows without a `url` value are silently skipped
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== deep-links (step 1, v1.0.0) ===== -->

# Deep Link Crawler

> Follows pages found by earlier discovery modules and extracts the links on them -- discovering sub-pages one level deeper than sitemaps and homepage navigation reveal.

**Module ID:** `deep-links` | **Step:** 1 (Discovery) | **Category:** crawling | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## What This Module Does

Company websites often hide their most valuable content one click deeper than the homepage. An "About" page links to "Leadership" and "History". A "Products" page links to individual solution pages. A "News" listing links to individual articles. Sitemaps and homepage navigation find the parent pages -- Deep Link Crawler follows those parent pages and extracts the links on them.

This is the only Step 1 module that reads the working pool from sibling modules. While Sitemap Parser, Page Links, and RSS Feeds all work independently from entity data alone, Deep Link Crawler operates on their *results*. It takes URLs already discovered by those modules, fetches the actual HTML of those pages, and extracts every `<a href>` link found on them.

```
Sitemap Parser → finds hundreds of URLs from sitemap.xml
Page Links     → finds key navigation URLs from the homepage
Deep Links     → visits those URLs and discovers the sub-pages linked from them
```

The module filters out junk URLs automatically -- images, CSS, JavaScript files, CDN paths, WordPress admin pages, and other non-content URLs are excluded before output. Discovered URLs are also normalized: fragments (`#section`) and tracking parameters (utm_*, fbclid, gclid, and similar) are stripped, while content-bearing query parameters like pagination (`?page=2`, `?p=3`) are preserved -- so paginated listing pages survive as distinct URLs instead of collapsing into one.

## When to Use

**Always run when:**
- You want thorough URL coverage beyond what sitemaps provide
- Companies have deep site structures (enterprise sites with many sub-sections)
- You're looking for partnership, integration, case study, or team sub-pages
- At least one other Step 1 module has already been run and approved

**Skip when:**
- Speed is critical and first-pass discovery was sufficient
- The company has a small, flat website (< 50 pages total)
- You're in a news-only pipeline (RSS Feeds is more appropriate)
- No sibling modules have been approved yet (the working pool will be empty)

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `max_pages_per_entity` | 30 | Lower to 5-10 for quick runs; raise to 100-200 for maximum coverage on large sites | How many pool URLs to visit and extract links from. Each page = 1 HTTP request |
| `max_urls_per_page` | 50 | Raise to 100-200 if pages have many valuable links; lower to 20 to keep output focused | Caps how many links to extract from a single crawled page |
| `crawl_patterns` | *(empty)* | Add patterns like `/news\n/blog\n/press` to only crawl specific page types | When empty, crawls all pool URLs up to `max_pages_per_entity`. When set, only crawls URLs whose path contains one of these strings. Leave empty for best coverage -- Step 2 handles filtering |
| `same_domain_only` | false | Enable to restrict output to the company's own domain only | When disabled, captures links to partner sites, subsidiary domains, and external resources |
| `exclude_already_discovered` | false | Enable if you want to pre-filter duplicates (saves some output noise) | When disabled, lets Step 2's url-dedup handle deduplication -- which is more thorough |

**Most impactful options:** `max_pages_per_entity` directly controls how many HTTP requests are made. With 96 entities at 30 pages each, that's up to 2,880 requests -- which is why the module is classified as `expensive` (30 min timeout). The `crawl_patterns` option used to default to a narrow list (`/about`, `/company`, `/blog`, etc.) which caused most pool URLs to be skipped. It now defaults to empty, meaning all pool URLs are eligible for crawling.

## Recommended Configurations

### Standard (default)
Broad coverage for most pipeline runs:
```
max_pages_per_entity: 30
max_urls_per_page: 50
crawl_patterns:
same_domain_only: false
exclude_already_discovered: false
```

### Quick Pass
Fast second-pass when time is limited:
```
max_pages_per_entity: 5
max_urls_per_page: 30
crawl_patterns:
same_domain_only: true
exclude_already_discovered: true
```

### Maximum Coverage
For thorough enterprise-level discovery:
```
max_pages_per_entity: 100
max_urls_per_page: 100
crawl_patterns:
same_domain_only: false
exclude_already_discovered: false
```

### News & Press Focus
Only follow news/blog listing pages to find individual articles:
```
max_pages_per_entity: 20
max_urls_per_page: 100
crawl_patterns: /news
/blog
/press
/media
/articles
same_domain_only: true
exclude_already_discovered: false
```

## What Good Output Looks Like

**Healthy results:**
- Enterprise company: 50-300 new URLs discovered
- Mid-size company: 10-100 new URLs
- Small company: 0-20 new URLs
- Company with no pool items: 0 URLs (skipped -- not an error)

**Output fields:**
- `url` -- the newly discovered URL
- `found_on` -- which page this link was found on (provenance for downstream modules)
- `link_text` -- the anchor text of the link

**Warning signs:**
- 0 URLs with `skipped_reason: "no pool items"` → no sibling modules have been approved yet. Run Sitemap Parser or Page Links first
- `pages_crawled: 0` with pool items present → `crawl_patterns` is filtering out all URLs. Clear the patterns or add broader ones
- Many entities with 0-3 URLs despite pool items → `exclude_already_discovered` and/or `same_domain_only` are too restrictive
- Very high counts (500+) on a single entity → a listing/directory page is being crawled. The `max_urls_per_page` cap prevents this

## Limitations

- **Pool dependency** -- returns nothing if no sibling modules have been approved. Must run after at least one other discovery module
- **One level only** -- does not recursively follow links. By design -- deeper crawling is exponentially expensive
- **HTML-only link extraction** -- parses raw HTML `<a href>` tags. Links built by JavaScript frameworks won't be found (use browser-crawler for those)
- **No built-in delay** -- crawls sequentially using `tools.http`. Sites that rate-limit aggressively may block some requests
- **Junk filtering is path-based** -- filters images, CDN, and WordPress admin URLs by file extension and path pattern. Unusual junk URL formats may slip through

## What Happens Next

URLs flow into Step 2 where URL Deduplicator removes duplicates across all discovery sources, and URL Relevance scores each URL's value. The `found_on` field provides provenance -- downstream modules know these were second-level links, which can inform relevance scoring. A URL found on `/about` is likely corporate content; a URL found on `/blog` is likely editorial.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** crawling
- **Cost tier:** expensive -- up to 30 min timeout, suitable for large-scale crawling across many entities
- **Data operation:** add (+) -- discovered URLs are added to the pool as new items on approval; sibling modules' items are preserved
- **Pool precondition:** `requires_items` -- the skeleton skips entities whose pool is empty (`skipped_no_input`, not a failure); the module also self-skips with `skipped_reason: "no pool items"`
- **Required input columns:** `website`
- **Depends on:** `sitemap-parser`, `page-links`, `browser-crawler` (needs pool items from at least one)
- **Input format:** `input.entities[]` with `website` field and `items[]` from working pool
- **Output format:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `found_on`, `link_text` (anchor text, capped at 200 chars); per-entity output is deduplicated by URL (first occurrence wins)
- **URL normalization:** Relative URLs resolved against the crawled page; fragments always stripped; tracking parameters (utm_*, fbclid, gclid, msclkid, mc_cid/mc_eid, ref/referrer, _ga/_gl/_hsenc/_hsmi, trk, sc_campaign, etc.) removed; other query parameters (pagination, content ids) preserved. Non-web schemes (mailto:, javascript:, tel:, ftp:, data:) skipped
- **Fetch behavior:** `tools.http.get` with a 15s per-page timeout; non-2xx responses are logged and skipped
- **Progressive save:** Pushes to `tools._partialItems` after each page crawl -- timeout preserves partial results
- **Junk filtering:** Excludes images (.png/.jpg/.gif/.svg/.webp/.ico), media (.mp4/.mp3), documents (.pdf/.zip), fonts (.woff/.ttf/.eot), code (.css/.js), and WordPress/CDN infrastructure paths
- **Error handling:** Missing pool items = skip (not error). Failed page fetches = warn and continue. Missing `website` = skip with error

---

<!-- ===== page-links (step 1, v1.0.0) ===== -->

# Page Link Extractor

> Extract URLs from homepage navigation, header, footer, and main content areas.

**Module ID:** `page-links` | **Step:** 1 (Discovery) | **Category:** website | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## Background

### The Content Problem This Solves

When OnlyiGaming researches a company for its directory, the most important pages are often the ones the company puts front and center: the navigation menu, the header links, the footer. These are the pages a company considers *most important for visitors* -- their primary user journeys. For a B2B iGaming directory building 1,400+ profiles, these high-signal pages (About Us, Partners, Products, Leadership, Careers) are exactly what's needed.

The original Content Creation Master document defined "Track B: Exploratory" discovery with specific seed paths: `/about`, `/company`, `/products`, `/solutions`, `/platform`, `/press`, `/news`, `/blog`, `/partners`, `/careers`, `/contact`, `/investors`, `/resources`, `/case-studies`. Rather than hardcoding these paths and hoping they exist, this module takes a smarter approach: it reads the actual homepage HTML and extracts what the company has chosen to link to. The navigation *is* the company's own curation of their most important pages.

### How It Fits the Pipeline Architecture

Step 1 (Discovery) uses multiple modules to cast a wide net. Sitemap Parser provides breadth (thousands of URLs from the sitemap index). Page Link Extractor provides *depth of signal* -- fewer URLs but each one hand-picked by the company for their navigation. Together they cover both structured discovery (sitemap) and navigational discovery (what humans see on the homepage).

The Strategic Architecture notes that different companies have different web footprints:

> *"A large publicly-traded company has rich sitemaps, LinkedIn presence, news coverage. A small startup might only have a basic website."*

For startups and small companies without sitemaps, Page Link Extractor may be the *only* discovery module that finds useful URLs. It's the universal fallback -- every website has a homepage with links, even if it doesn't have a sitemap.

### Section-Aware Link Extraction

This module doesn't just extract links -- it categorizes them by *where* on the page they appear. Links in `<nav>` elements are navigation links (highest signal). Links in `<header>` are header links. Links in `<footer>` are footer links (often legal/corporate pages). Links elsewhere are body links (promotional content, lower signal).

This section awareness serves two purposes:
1. **For operators:** You can choose to include/exclude footer and body links based on what you need
2. **For downstream modules:** The `source_location` field carries through the pipeline, helping Step 2's URL Relevance Filter make better classification decisions

### URL Cleanup

Every extracted URL is normalized before it enters the pool. Fragments (`#section`) are always stripped. Known tracking parameters are removed -- the five standard `utm_*` params (source/medium/campaign/term/content), `fbclid`, `gclid`/`gclsrc`/`dclid`/`msclkid`, Mailchimp (`mc_cid`/`mc_eid`), HubSpot (`_hsenc`/`_hsmi`), Google Analytics (`_ga`/`_gl`), `trk`, `sc_campaign`/`sc_channel`, and `ref`/`referrer`. (Known gap: `trkCampaign` is listed in the code's strip set in camelCase but the comparison lowercases keys first, so `?trkCampaign=` params currently survive.) Content-bearing query parameters are *preserved* -- `?page=2` or `?p=3` pagination URLs survive as distinct pages. This keeps analytics noise out of the pool without merging genuinely different pages.

## Strategy & Role

**Why this module exists:** Navigation menus, header links, and footer links represent the pages a company considers most important. These are high-signal, curated entry points into the site's content structure -- more selective than a sitemap's comprehensive listing.

**Role in the pipeline:** Complements Sitemap Parser by finding pages the sitemap might miss. Particularly valuable for single-page apps (SPAs), small sites without sitemaps, and catching key corporate pages.

**Relationship to siblings:**
- **Sitemap Parser** provides breadth (thousands of URLs); Page Links provides *depth of signal* (fewer but higher relevance)
- **Deep Links** can follow pages found here one level deeper -- e.g., `/about` found by Page Links leads Deep Links to discover `/about/leadership` and `/about/history`
- **RSS Feeds** is a parallel, independent discovery channel for news content

## When to Use

**Always use when:**
- Running any company profile pipeline (core module)
- The company might not have a sitemap
- You want high-signal pages (nav/header = company's most important pages)

**Skip when:**
- You already have comprehensive URLs from sitemap and only need news/blog content
- The site is known to be a single-page application with no useful nav links in raw HTML

**Use alongside:**
- Sitemap Parser (combined, they cover structured + navigational discovery)
- Deep Links (to follow promising pages one level deeper)

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `max_urls` | 200 | Lower to 50 for quick scans; keep at 200 for thorough discovery | Controls total URLs per site (1-1000). Nav/header/footer rarely exceed 200 unique links |
| `include_footer` | true | Disable if footer links are mostly legal/privacy pages you don't want | Footer often has "About", "Careers", "Investors" -- valuable for profiles. But also "Terms", "Privacy" -- noise. Keep enabled and let Step 2 filter the junk |
| `include_body` | false | Enable if you want links from the page body content (product cards, feature sections) | Body links are lower-signal -- promotional content, product listings. Increases URLs significantly but adds noise |
| `same_domain_only` | true | Disable if you want to discover partner/subsidiary sites linked from the homepage | When disabled, catches links to LinkedIn, Twitter, parent company sites. Useful for discovering social media presence |

The option that changes results most is `include_body` -- on link-heavy homepages it can multiply the URL count while adding mostly promotional noise; the manifest's own guidance is to enable it only when nav links are sparse. `same_domain_only` compares registrable hostnames with `www.` stripped, so `www.example.com` and `example.com` count as the same domain, but a company's `blog.example.com` subdomain counts as a *different* domain and gets dropped unless you disable it.

## Recipes

### Standard Company Profile
Best for most company profile research:
```
max_urls: 200
include_footer: true
include_body: false
same_domain_only: true
```

### Quick Nav Scan
Just the primary navigation:
```
max_urls: 50
include_footer: false
include_body: false
same_domain_only: true
```

### Comprehensive (with external links)
Find everything including social media and partner links:
```
max_urls: 500
include_footer: true
include_body: true
same_domain_only: false
```

### Social Media & Partner Discovery
Specifically looking for external references:
```
max_urls: 200
include_footer: true
include_body: false
same_domain_only: false
```

## Expected Output

**Healthy result:**
- Enterprise company: 30-150 unique links
- Mid-size company: 15-80 unique links
- Small startup: 5-30 unique links

**Output fields per URL:**
- `url` -- the discovered URL (fragment and tracking params stripped)
- `link_text` -- the anchor text of the link (e.g., "About Us", "Our Team"), capped at 200 characters
- `source_location` -- where on the page: `nav`, `header`, `footer`, or `body`

**Source location priority:** When the same URL appears in multiple sections, the highest-signal location wins: nav > header > footer > body.

**Red flags to watch for:**
- 0 URLs -- site may be entirely JavaScript-rendered (SPA). This module parses raw HTML, not rendered DOM
- Very few URLs (< 5) -- minimal site or heavy JavaScript rendering
- Many `body` URLs with no `nav`/`header` -- the site uses non-standard HTML structure (no `<nav>`, `<header>`, `<footer>` tags)
- All links go to external domains -- might be a redirect page or link aggregator, not a real company site

## Limitations & Edge Cases

- **JavaScript-rendered navigation** -- SPAs that build their nav with React/Vue won't have links in the raw HTML. Returns 0 or very few URLs. The original Content Creation Master accounted for this with the Cheerio/Playwright split (old Step 5c/5d) -- a future browser-rendered variant of this module could solve this
- **Non-semantic HTML** -- Sites without proper `<nav>`, `<header>`, `<footer>` tags will have everything classified as `body`
- **Tracking parameters stripped, content params kept** -- only the known tracking params listed under URL Cleanup are removed; fragments are always removed. Caveats: `ref` and `referrer` are on the strip list, so a site that genuinely routes content through a `?ref=` parameter will have those pages merged; and `trkCampaign` survives despite appearing in the code's strip set (case-mismatch bug -- the set stores camelCase, the check lowercases)
- **Non-HTTP links skipped** -- `mailto:`, `javascript:`, `tel:`, `ftp:`, and `data:` hrefs are ignored, as are fragment-only anchors (`href="#..."`)
- **Relative URL resolution** -- uses the standard WHATWG URL parser, so `/path`, `path`, and protocol-relative `//other-domain.com` links all resolve correctly; hrefs that can't be parsed as URLs are dropped
- **Link text extraction** -- Strips inner HTML tags from anchors. Image-only links will have empty `link_text`
- **Deduplication** -- Built-in per-entity dedup by URL, but cross-entity dedup happens in Step 2's url-dedup module

## What Happens Next

URLs discovered by this module enter the Step 1 working pool alongside results from Sitemap Parser and other discovery modules. The `source_location` field (nav/header/footer/body) carries through to Step 2, where the URL Relevance Filter can use it as a signal -- a link found in `<nav>` with text "About Us" is more likely to be classified as KEEP than a `body` link with text "Learn More".

The original Content Creation Master emphasized that the goal of discovery is completeness, not precision: *"Don't drop teasers yet in Full v1; label them for policy learning."* This module follows that philosophy -- it extracts everything and lets downstream validation decide what's worth keeping.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** website
- **Cost tier:** cheap -- 2-minute timeout class; one HTTP fetch per entity, no LLM or paid API calls
- **Data operation:** add (+) -- adds net-new URL items to the pool; upsert by `(url, source_submodule)` replaces this module's own prior output while preserving other modules' items
- **Pool precondition:** `empty_ok` -- runs against an empty or populated pool; it is a seed/discovery module with no upstream requirement
- **Required input columns:** `website`
- **Depends on:** none
- **Input:** `input.entities[]` -- each entity must have a `website` field; bare domains get `https://` prepended, trailing slashes are trimmed
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `link_text`, `source_location`; per-entity `meta` reports `total_found` / `after_filter` / `unique` / `returned`
- **Error handling:** Entities without a `website` field are skipped with a warning. The homepage fetch uses a 15-second timeout; any non-2xx response fails that entity only -- other entities continue (partial success pattern). After each successful entity, all accumulated items are pushed to `tools._partialItems`, so a timeout on a later entity doesn't destroy earlier results
- **Dependencies:** None (uses only `tools.http`, `tools.logger`, and `tools.progress`)
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== rss-feeds (step 1, v1.0.0) ===== -->

# RSS Feed Discovery

> Find RSS/Atom feeds by probing common feed paths and parsing HTML link tags.

**Module ID:** `rss-feeds` | **Step:** 1 (Discovery) | **Category:** news | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## Background

### The Content Problem This Solves

OnlyiGaming's platform connects company directory listings with news articles, event coverage, and community discussions -- all linked by a 335+ tag taxonomy. To build and maintain this, the platform needs to know which companies actively publish content. RSS/Atom feeds are the primary machine-readable channel for company news, blog posts, and press releases. Unlike scraping individual pages, feeds provide structured metadata (titles, dates, descriptions) and are designed to be consumed programmatically.

The original Content Creation Master prioritized the news site as a HIGH PRIORITY business need -- "New content + continuous updates." RSS discovery is the foundation for that: once you know a company has a feed at `/feed` with 47 items, you can build continuous monitoring pipelines that automatically detect new content.

### How It Fits the Pipeline Architecture

This module is the only Step 1 module in the `news` category (its siblings are `crawling`, `search`, and `website` modules). It serves a strategically different purpose: while Sitemap Parser and Page Links discover *pages*, RSS Feed Discovery discovers *content streams*. A feed URL is not just another page to scrape -- it's a subscription endpoint for ongoing content.

The Raw Appendix's Step 2 included "RSS discovery: If a company site has `/news`|`/press`|`/blog`, capture RSS feed URL + latest items." This module implements that concept. It also tracks discovery provenance -- the `found_via = rss` tag from the original vision -- by nature: every URL it returns is a feed URL, immediately identifiable as RSS-sourced.

### Two-Strategy Discovery

The module uses two complementary strategies:

1. **HTML parsing** -- reads the homepage for `<link rel="alternate">` tags that declare feeds. This finds feeds the company has explicitly registered in their HTML head -- the "official" feeds
2. **Common path probing** -- tries 9 well-known feed paths (`/feed`, `/rss`, `/feed.xml`, `/rss.xml`, `/atom.xml`, `/blog/feed`, `/news/feed`, `/feed/rss`, `/feed/atom`). This catches feeds that exist but aren't declared in HTML -- common for WordPress sites and custom CMS setups

Together, these strategies find feeds that either method alone would miss. HTML parsing runs first, so declared feeds fill the `max_feeds` budget before path probing starts.

## Strategy & Role

**Why this module exists:** RSS feeds are the primary machine-readable content channel for company news, blog posts, and press releases. They provide structured metadata and serve as subscription endpoints for ongoing content monitoring.

**Role in the pipeline:** Discovers *feed URLs* -- not the articles within them. Its output tells you "this company has a blog feed at /feed with 47 items." The actual article content extraction happens in Step 3 (Scraping). Its primary value is for news-oriented pipelines and for company profiles that need press/blog coverage.

**Relationship to siblings:**
- **Sitemap Parser** and **Page Links** discover individual page URLs; RSS Feeds discovers *content streams*
- **Deep Links** could follow blog listing pages found by other modules, but RSS is more efficient for the same content
- This module is the only one in the `news` category -- it serves a different strategic purpose than the crawling/search/website discovery modules

## When to Use

**Always use when:**
- Building a news-oriented pipeline
- You need to monitor company press releases or blog posts over time
- Assessing which companies have active content channels

**Skip when:**
- You only need static pages (about, team, products) for a company profile
- The company is known not to have a blog/news section
- Speed is critical and you've already found all the URLs you need

**Use alongside:**
- Sitemap Parser + Page Links (for comprehensive discovery that includes feeds)
- URL Relevance Filter in Step 2 (to classify feed URLs vs regular page URLs)

## Options Guide

| Option | Type | Default | When to Change | What It Does |
|--------|------|---------|----------------|--------------|
| `max_feeds` | number (1-100) | 10 | Rarely needs changing. Most sites have 1-3 feeds. Lower to 1-2 if you only want the main feed | Limits feeds returned per site. HTML-declared feeds are found first and count toward the limit; path probing stops once the limit is reached |
| `check_common_paths` | boolean | true | Disable if you only want feeds declared in HTML `<link>` tags (stricter, misses undeclared feeds) | When enabled, probes 9 common feed paths. Increases HTTP requests but finds hidden feeds |

## Recipes

### Standard Discovery
Find all available feeds:
```
max_feeds: 10
check_common_paths: true
```

### Quick Check (HTML-declared only)
Only find feeds the site explicitly declares:
```
max_feeds: 5
check_common_paths: false
```

### News Pipeline
Maximum feed discovery for news monitoring:
```
max_feeds: 50
check_common_paths: true
```

## Expected Output

**Healthy result:**
- Company with active blog: 1-3 feeds found
- News-heavy company: 3-10 feeds (main feed + category feeds)
- Company without blog: 0 feeds (not an error)

**Output fields per feed:**
- `url` -- the feed URL
- `feed_type` -- `rss`, `atom`, or `rdf`
- `title` -- the feed's declared title (e.g., "Evolution Gaming Blog")
- `item_count` -- number of items currently in the feed

**Red flags to watch for:**
- 0 feeds → company has no RSS/Atom presence. Not unusual for B2B companies
- Feed with 0 `item_count` → feed exists but is empty or couldn't be parsed
- Many feeds with similar titles → site may be serving the same content in multiple formats

## Limitations & Edge Cases

- **No JavaScript rendering** -- Feeds referenced only in JavaScript-built `<link>` tags won't be found via HTML parsing (common path probing may still find them)
- **Non-standard feed locations** -- Only probes 9 common paths. Sites using custom paths like `/api/v1/feed` won't be found unless declared in HTML
- **Feed authentication** -- Password-protected feeds fail the probe and are silently skipped
- **Large feeds** -- The module fetches full feed content to count items. Very large feeds (10,000+ items) may be slow
- **Redirected feeds** -- The module reports the URL it probed; if the HTTP layer follows a redirect, the redirect target is not recorded
- **WordPress prevalence** -- WordPress sites almost always have `/feed` and are well-served. Non-WordPress CMSes may use non-standard paths

## What Happens Next

Feed URLs discovered by this module enter the Step 1 working pool. In the current pipeline, they flow through Step 2 (Validation) and Step 3 (Scraping) like any other URL. However, feed URLs have a special future role: the original vision included continuous monitoring pipelines where discovered feeds are periodically checked for new items, enabling OnlyiGaming's news section to stay current with company announcements automatically.

The Raw Appendix described this as capturing "RSS feed URL + latest items" -- the `item_count` field in this module's output provides a baseline for detecting new content in future runs.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** news
- **Cost tier:** cheap -- short timeout, suitable for quick HTTP probing
- **Data operation:** add (+) -- adds net-new feed-URL items to the pool (item key: `url`); re-runs replace this module's own prior output without touching other modules' items
- **Pool precondition:** `empty_ok` -- works against an empty pool; always executes (discovery/seed module)
- **Required input columns:** `website`
- **Depends on:** none
- **Input:** `input.entities[]` -- each entity must have a `website` field
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `feed_type`, `title`, `item_count`, plus per-entity `meta` (`total_found`, `returned`, `errors`)
- **Probed paths:** `/feed`, `/rss`, `/feed.xml`, `/rss.xml`, `/atom.xml`, `/blog/feed`, `/news/feed`, `/feed/rss`, `/feed/atom`
- **Error handling:** Entities without a `website` field are recorded as errors (empty items list, error message) and counted in the summary; processing continues with the next entity. Failed path probes are silently skipped (expected for most paths). Homepage fetch failures are logged as warnings but don't stop path probing. After each entity completes, all items discovered so far are saved to the partial-results buffer (`tools._partialItems`), so a timeout mid-run preserves feeds from already-completed entities
- **External dependencies:** None (uses only `tools.http`, `tools.logger`, `tools.progress`)
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== search-discovery (step 1, v1.0.0) ===== -->

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

- **Serper `images` vertical live-confirmed (2026-07-07)** — via the `config-image-search/providers-image-serp.json` preset (no module change). A real `POST /images` with the `X-API-KEY` header (`SEARCH_PROVIDER_SERPER_KEY`) for `"Evolution Gaming" logo` returned HTTP 200 and 4 items, each `result_type: images` with `image_url` mapped from `imageUrl`. Complements the 2026-07-03 web/news-vertical verification below.
- **1.0.0** (2026-07-03) — initial version per the canonical revised brief. Perplexity AND Serper provider blocks live-verified with real keys (Serper: open + curated-site `site:` modes, real Google results within the configured list). Brave/SerpAPI blocks documented but not yet live-verified (need new keys). Pre-commit code review: added provider-wide skip on 401/403 auth failures (was per-query error → wasted the whole fan-out on a dead-auth provider), per the brief's "provider 401/403 → skip provider" line.

---

<!-- ===== seed-url-builder (step 1, v1.0.0) ===== -->

# Seed URL Builder

> Generate and validate candidate URLs from known high-value paths on a company's website.

**Module ID:** `seed-url-builder` | **Step:** 1 (Discovery) | **Category:** website | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## What This Module Does

Most company websites follow predictable URL conventions. An /about page, a /careers page, a /press or /newsroom section -- these are the pages that carry the highest-value content for building company profiles. Rather than waiting for a sitemap or crawling links, this module probes these paths directly: it appends 28 common high-value paths to the company's base URL, sends HEAD requests (falling back to GET if HEAD is blocked), and returns only the paths that actually exist.

This is a brute-force complement to the smarter discovery modules. Sitemap Parser relies on the site having a valid sitemap. Page Link Extractor relies on the homepage having parseable navigation HTML. Seed URL Builder skips both dependencies and goes straight to "does /about exist?" The trade-off is obvious -- it can only find paths you already know to look for -- but for the standard corporate pages that matter most for iGaming company profiles, this is fast, cheap, and reliable.

Each validated URL is tagged with a `path_type` (about, press, careers, compliance, etc.) that carries through the pipeline. Downstream modules like URL Relevance Filter can use this tag as a high-confidence classification signal -- a URL found at /responsible-gaming is almost certainly about responsible gaming.

## When to Use

**Always use when:**
- Running any company profile pipeline -- it catches pages that sitemaps and navigation extraction miss
- The company might not have a sitemap (small companies, startups)
- You want guaranteed coverage of standard corporate pages

**Skip when:**
- You already have comprehensive URL coverage from sitemap-parser and page-links combined
- The company uses non-English path conventions exclusively (use custom_paths instead)

**Tune when:**
- Working with non-English or unconventional sites -- add paths via custom_paths
- Sites are slow or behind CDNs that rate-limit -- lower max_concurrent, raise request_timeout

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `max_concurrent` | 5 | Raise to 10-20 for fast sites with no rate limiting. Lower to 1-2 for fragile or rate-limited servers | How many paths are checked in parallel per entity. Higher = faster but more aggressive |
| `request_timeout` | 5000 ms | Raise to 10000-15000 for slow servers or sites behind CDNs. Lower to 2000-3000 for known-fast sites | Maximum time to wait for each HEAD/GET response before giving up on that path |
| `custom_paths` | (empty) | Add paths for non-English sites (/uber-uns, /entreprise), industry-specific pages (/responsible-gaming/policy), or company-specific sections you know exist | Additional paths to check, one per line. Added to the 28 default paths. A leading slash is added if missing. Lines starting with # are ignored |

The most impactful option is `custom_paths` -- the default list is English-only, so non-English sites will return near-zero results without it. Note that redirects are followed automatically by the HTTP layer: a path that redirects to an existing page still counts as found (with the probed URL recorded, not the redirect target). There is no option to disable this.

## Recommended Configurations

### Standard (default)
Best for most company profile research. Checks all 28 default paths with moderate concurrency.
```
max_concurrent: 5
request_timeout: 5000
custom_paths: (empty)
```

### Conservative
For fragile servers, rate-limited APIs, or sites that block aggressive requests.
```
max_concurrent: 2
request_timeout: 10000
custom_paths: (empty)
```

### Aggressive
For large batches of well-known, fast-responding sites. Faster but risks rate limiting.
```
max_concurrent: 15
request_timeout: 3000
custom_paths: (empty)
```

### iGaming-Specific
Extended path list for iGaming operators and B2B suppliers.
```
max_concurrent: 5
request_timeout: 5000
custom_paths:
  /responsible-gaming/policy
  /responsible-gambling/tools
  /games
  /game-portfolio
  /live-casino
  /sportsbook
  /regulation
  /compliance
  /certifications
  /b2b
  /white-label
  /api
  /integration
  /demo
```

## What Good Output Looks Like

**Output fields per URL:**
- `url` -- the candidate URL that was probed and returned 2xx (e.g. `https://kindredgroup.com/about`). If the server redirected, this is still the probed URL, not the redirect target
- `path_type` -- category of the path: `about`, `products`, `press`, `news`, `partners`, `careers`, `contact`, `investors`, `resources`, `compliance`, or `custom`
- `status_code` -- HTTP status code (always 200-299)
- `found_via` -- whether the URL was validated via `head` or `get_fallback`

**Healthy result ranges:**
- Enterprise company: 8-15 valid paths (most standard pages exist)
- Mid-size company: 4-10 valid paths
- Small startup: 2-5 valid paths
- Minimal site: 0-2 valid paths (homepage only -- common for SPA sites)

**Warning signs:**
- 0 URLs for every entity -- the sites might be blocking all automated requests, or they are entirely JavaScript-rendered single-page apps
- All URLs have `found_via: get_fallback` -- the server blocks HEAD requests. Not a problem (GET fallback works), but indicates a more restrictive server configuration
- Very high hit rate (25+ of 28 paths) -- unusual; verify these are not all redirecting to the same page. A site that returns 200 for every path may have a catch-all route

## Limitations

- **No redirect-to-homepage detection** -- If a site redirects /careers to / (the homepage), this module cannot reliably detect that and will include it as a valid URL. The tools.http API follows redirects automatically but does not expose the final URL. Downstream deduplication in Step 2 mitigates this partially
- **English-biased default paths** -- The 28 default paths are English. Non-English sites need custom_paths for their equivalents (/uber-uns, /a-propos, /empresa, etc.)
- **No content validation** -- A 200 response does not guarantee the page has useful content. Some sites return 200 for custom 404 pages (soft 404s). Step 2 validation and Step 4 filtering handle this downstream
- **HEAD request blocking** -- Some servers (especially behind Cloudflare) return 403 or 405 for HEAD requests. The GET fallback handles this, but doubles the request time for those paths
- **Rate limiting** -- Aggressive concurrency (max_concurrent > 10) may trigger rate limiting on protected sites. The module does not implement retry-after handling

## What Happens Next

Validated URLs enter the Step 1 working pool alongside results from Sitemap Parser, Page Link Extractor, and other discovery modules. The `path_type` field carries through the pipeline -- Step 2's URL Relevance Filter can use it as a strong classification signal. A URL tagged `compliance` from the /responsible-gaming path is almost certainly relevant to a company profile's regulatory section.

Step 2 deduplication will merge any URLs found by both this module and sitemap-parser or page-links. The `found_via` field records how each URL was validated (`head` for a clean HEAD response, `get_fallback` when the server required a GET) -- useful for spotting servers with restrictive HEAD handling, not for attributing which discovery module found a URL.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** website
- **Cost:** cheap
- **Data operation:** add (+) -- URLs are added to the working pool on approval
- **Pool precondition:** `empty_ok` -- works against an empty pool; this is a seed module that produces from external sources, so it always executes
- **Requires:** `website` column in entity data
- **Input:** `input.entities[]` -- each entity must have a `website` field
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `path_type`, `status_code`, `found_via`
- **Error handling:** Entities without a `website` field are skipped with a warning. Failed requests per path are silently skipped (partial success pattern). Entity-level errors are caught and reported without stopping other entities. After all entities are processed, the final item list is mirrored to `tools._partialItems` (the skeleton's partial-save channel) for consistency -- note this happens once at the end, not incrementally per entity
- **Dependencies:** None (uses only `tools.http`, `tools.logger`, `tools.progress`)
- **Files:** `manifest.json`, `execute.js`, `README.md`, `CLAUDE.md`

### Default Path List

| Path | Type |
|------|------|
| /about, /about-us, /company, /who-we-are | about |
| /products, /solutions, /platform, /services | products |
| /press, /press-releases, /media, /newsroom | press |
| /news, /blog | news |
| /partners, /affiliates | partners |
| /careers, /jobs | careers |
| /contact, /contact-us | contact |
| /investors, /investor-relations | investors |
| /resources, /case-studies | resources |
| /responsible-gaming, /responsible-gambling, /licenses, /regulatory | compliance |

---

<!-- ===== sitemap-parser (step 1, v1.0.0) ===== -->

# Sitemap Parser

> Parse XML sitemaps to discover all indexed URLs for a company website, with regex include/exclude filtering at source and an automatic headless-browser retry for bot-protected sites.

**Module ID:** `sitemap-parser` | **Step:** 1 (Discovery) | **Category:** website | **Cost:** medium
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## Background

### The Content Problem This Solves

OnlyiGaming needs content at scale -- 1,400+ company profiles initially, with continuous expansion as new companies join the platform. Each profile requires research across multiple sources: company websites, news, directories, social media. The first challenge is always the same: *find the right pages to read.*

The original Content Creation Master document (2025) defined "Track B: Exploratory" discovery -- starting from a company's homepage URL and systematically finding every relevant page. The recommended seed paths were: `/about`, `/company`, `/products`, `/solutions`, `/platform`, `/press`, `/news`, `/blog`, `/partners`, `/careers`, `/contact`, `/investors`, `/resources`, `/case-studies`. But before crawling individual paths, there's a faster approach: ask the site what pages it has.

That's what sitemaps are. They're a site's own declaration of its indexed content -- an XML file listing every URL the company wants search engines to know about. For a content pipeline that needs to discover pages cheaply and at scale, sitemaps are the obvious starting point.

### How It Fits the Pipeline Architecture

The Content Creation Tool follows an 11-step sequence (Steps 0-10). Step 1 (Discovery) is about casting a wide net -- finding every possible source of information about each entity. The Strategic Architecture states:

> *"Different entities have different footprints on the web. A large company might have a rich sitemap, LinkedIn presence, news coverage, Crunchbase profile, and YouTube channel. A small startup might only have a basic website."*

Discovery submodules each know how to find information through a different channel. Sitemap Parser is the broadest and cheapest channel -- a single HTTP request to `/sitemap.xml` can yield thousands of URLs. It provides a structured baseline that other discovery modules supplement.

All Step 1 discovery modules use the **add (+)** data operation with `pool_precondition: empty_ok` -- each runs against an empty (or populated) pool and adds its own discovered items, upserted by `(url, source_submodule)`. Re-running Sitemap Parser replaces its own prior output but preserves items from other discovery modules. This means Sitemap Parser doesn't depend on other modules and other modules don't depend on it, but together they build a comprehensive URL pool.

### Bot-Protected Sites: Automatic Browser Fallback

Some sites front their sitemap with Cloudflare or similar bot protection, answering plain HTTP requests with 403, 429, or 503. When that happens, the module automatically retries the same URL with the headless browser (20s timeout, waits for network idle). The browser response is then verified to actually be sitemap XML -- if it contains neither `<urlset` nor `<sitemapindex`, the module treats it as a challenge page and fails that entity loudly ("Browser returned HTML instead of sitemap XML") rather than parsing junk. Any other HTTP error status fails directly without the browser retry.

### Original Vision and Discovery Provenance

The Raw Appendix envisioned tracking `found_via` provenance for every discovered URL -- tagging whether it came from `seed`, `rss`, `pse_news`, `pse_dir`, `linkedin`, or `social`. This sitemap module corresponds to the `seed` discovery track. The provenance concept ensures that downstream steps (validation, filtering, scraping) can make source-aware decisions -- for example, trusting sitemap URLs more than search engine results, or prioritizing URLs found via multiple discovery methods.

## Strategy & Role

**Why this module exists:** Sitemaps are the most structured and reliable source of URL discovery. They represent what a company *wants* search engines to find -- their curated, indexed content. This makes sitemap URLs inherently higher-signal than random crawling.

**Role in the pipeline:** This is the *first* discovery module to run (`sort_order: 1`) -- cheapest and fastest discovery method, returning the most URLs with the least cost. It provides a broad, structured baseline of URLs that other discovery modules (Page Links, Deep Links) can then supplement with pages the sitemap might miss.

**Relationship to siblings:**
- **Page Links** catches navigation pages not in the sitemap (common for SPAs, small sites)
- **RSS Feeds** finds news/blog content that may be sitemap-listed but also provides feed metadata
- **Deep Links** builds on Sitemap Parser's output -- crawling pages *found by this module* one level deeper

## When to Use

**Always use when:**
- Processing company websites (the default starting point)
- You need comprehensive URL coverage quickly
- The company has a well-maintained website (enterprise companies, public companies)

**Skip or deprioritize when:**
- The company has no sitemap (small startups, single-page sites) -- Page Links is better here
- You only need news/blog content -- RSS Feeds is more targeted
- The site's bot protection defeats even the browser fallback (entity fails with a challenge-page error) -- Page Links or a scraping-tier module is the alternative

**Use alongside:**
- Page Links (catches what sitemaps miss -- nav menus, footer links)
- Deep Links (follows interesting pages found here one level deeper)

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `max_urls` | 10000 | Lower to 100-500 for quick scans; raise to 50000 for exhaustive crawls of large enterprise sites | Caps how many URLs are collected per site (min 1, max 50000). Applied during sitemap fetch AND again after filtering. Large numbers increase Step 2 filtering load |
| `include_nested_sitemaps` | true | Disable if the site has many sub-sitemaps for product/game pages you don't need | If a sitemap index is found, follows child sitemaps (one level deep only). Turning off returns 0 URLs for sites whose `/sitemap.xml` is an index file |
| `url_pattern` | "" (all) | Set to filter URLs early -- e.g., `/about\|/company\|/partners` to only keep corporate pages | Regex include filter applied after exclude patterns. An invalid regex is logged as an error and the filter is ignored (all URLs pass) |
| `exclude_patterns` | "" (none) | Add one regex per line to drop B2C template URLs at the source. Use presets for common entity types (Operator, Affiliate, B2B) | Case-insensitive regex exclude filters applied before the include filter and the final max_urls slice. Invalid lines are skipped with a warning |

One gotcha worth knowing: `max_urls` caps *collection*, not just output. The module stops reading sitemap entries once it has `max_urls` raw URLs, and only then applies exclude/include filters. On a huge sitemap with a restrictive `url_pattern`, the pages you want may sit beyond the collection cap -- raise `max_urls` when combining a large site with tight filters.

## Recipes

### Quick Scan (fast, focused)
For a first pass or when you just need key pages:
```
max_urls: 500
include_nested_sitemaps: false
url_pattern: ""
exclude_patterns: ""
```

### Deep Crawl (thorough, comprehensive)
For enterprise companies with rich sitemaps:
```
max_urls: 50000
include_nested_sitemaps: true
url_pattern: ""
exclude_patterns: ""
```

### Corporate Pages Only (targeted for company profiles)
When you're building company profiles and only want about/team/partner pages:
```
max_urls: 10000
include_nested_sitemaps: true
url_pattern: /about|/company|/team|/partner|/career|/press|/investor|/leadership
exclude_patterns: ""
```

### Affiliate Entity (drop B2C product pages)
When profiling an affiliate site like AskGamblers -- exclude their product catalog:
```
max_urls: 10000
include_nested_sitemaps: true
url_pattern: ""
exclude_patterns:
  /casino-bonuses/latest/[^/]+
  /casino-affiliate-programs/[^/]+
  /sports-betting/bonuses/latest/[^/]+
  /sports-betting/sportsbook-reviews/[^/]+
  /free-spins/[^/]+
```

### News/Blog Only (targeted for news content)
When you're building news articles:
```
max_urls: 2000
include_nested_sitemaps: true
url_pattern: /news|/blog|/press|/article|/post
exclude_patterns: ""
```

## Expected Output

**Healthy result:**
- Enterprise company (e.g., Evolution Gaming): 500-5,000 URLs
- Mid-size company: 50-500 URLs
- Small startup: 10-50 URLs (if sitemap exists)

**Output fields per URL:**
- `url` -- the discovered URL
- `last_modified` -- when the page was last changed (from sitemap `<lastmod>`, often null)
- `change_frequency` -- how often it changes (daily, weekly, monthly -- often null)
- `priority` -- sitemap priority value 0.0-1.0 (often null)

**Per-entity meta counters:** `total_found` (raw URLs collected), `excluded` (dropped by exclude_patterns), `filtered` (dropped by url_pattern), `limited` (dropped by the final max_urls slice), `returned`, `errors`. The run summary reads "N URLs found across X of Y entities (Z failed)" when any entity errored.

**Red flags to watch for:**
- Entity error `HTTP 404 fetching .../sitemap.xml` → site has no sitemap at the standard path. Try Page Links instead
- Entity error `Browser returned HTML instead of sitemap XML (likely Cloudflare challenge page)` → bot protection beat the browser fallback. This site needs the scraping tier, not sitemap discovery
- 0 URLs with no error → sitemap index found while `include_nested_sitemaps` is off, or the sitemap is empty
- 50,000+ URLs → site has massive product catalogs. Use `exclude_patterns`/`url_pattern` to filter, or rely heavily on Step 2 validation
- All `last_modified` fields null → sitemap exists but isn't well-maintained. Content freshness unknown
- Many URLs with `/tag/`, `/page/`, `/category/` patterns → pagination/taxonomy bloat. Step 2's url-filter will clean this

## Limitations & Edge Cases

- **No sitemap.xml** -- the fetch returns HTTP 404 and the entity is recorded as an error (0 items). Other entities continue processing. Use Page Links as fallback
- **Bot-protected sitemaps** -- 403/429/503 triggers one browser retry; if the browser gets a challenge page (no `<urlset`/`<sitemapindex` in the body) or a non-2xx/3xx status, the entity fails with a combined error naming both attempts. Other HTTP error statuses fail without a retry
- **Compressed sitemaps** (.gz) -- not supported. If a site serves gzipped sitemaps, URLs won't be found
- **Non-standard sitemap locations** -- only checks `/sitemap.xml` at the site root (a missing `https://` on the entity's website field is added automatically). Sites using `/sitemap_index.xml` or other paths won't be found unless nested from the main sitemap
- **Rate limiting** -- large sitemap indexes with many child sitemaps make many HTTP requests (15s timeout each). There is NO throttling: `tools.http` is a plain fetch wrapper, and child sitemaps are fetched sequentially without delay -- a very large index can both be slow and trip bot protection on sensitive hosts
- **Sitemap index depth** -- recursion limited to one level (index → children, but not children of children) to prevent infinite loops. A failed child sitemap is logged as a warning and skipped, not fatal
- **Entities without a `website` field** -- skipped with a per-entity error ("No website field"), counted in the failure summary

## What Happens Next

URLs discovered by this module enter the Step 1 working pool. When the user approves the step, all approved URLs flow into **Step 2 (Validation)** where they pass through:

1. **URL Deduplicator** -- removes duplicates across all discovery sources (sitemap + page links + deep links may find the same URLs)
2. **URL Pattern Filter** -- removes junk URLs by regex patterns (e.g., `/tag/`, `/page/`, `/category/`) and optionally checks HTTP status codes
3. **URL Relevance Filter** -- LLM-based classification that determines which URLs are worth scraping for the target content type

The original Content Creation Master envisioned this as a two-gate system: cheap pre-scrape validation (Step 2/old Step 4) to reduce scrape cost, followed by post-scrape quality filtering (Step 4/old Step 7) with adaptive page caps. Sitemap Parser's broad output is intentionally lightly filtered -- the philosophy is "discover everything, filter later" so that no potentially valuable page is lost at the discovery stage; `exclude_patterns` exists only to keep known-bulk junk (product catalogs) from ever entering the pool.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** website
- **Cost tier:** medium -- network I/O module, 5-minute timeout class
- **Data operation:** add (+) -- adds net-new items to the pool, upserted by `(url, source_submodule)`; re-runs replace this module's own prior output only
- **Pool precondition:** `empty_ok` -- runs against an empty or populated pool; always executes (discovery/seed module)
- **Required input columns:** `website`
- **Depends on:** none
- **Item key:** `url`
- **Input:** `input.entities[]` -- each entity must have a `website` field (scheme optional; `https://` is prefixed if missing)
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `last_modified`, `change_frequency`, `priority`, plus per-entity `meta` counters and a run `summary`
- **Error handling:** partial-success pattern -- entities without a `website` field or with fetch failures are recorded as per-entity errors without stopping other entities. HTTP fetch (15s timeout) with browser fallback (20s, network idle) on 403/429/503, guarded by an XML sanity check against challenge pages. Invalid regex options are ignored (include) or skipped per line (exclude) with a logged warning. After each successful entity, accumulated items are pushed to `tools._partialItems` so a timeout on a later entity doesn't destroy earlier results
- **External dependencies:** none (uses `tools.http`, `tools.browser`, `tools.logger`, `tools.progress`; no npm packages, APIs, or env vars)
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== test-dummy (step 1, v1.0.0) ===== -->

# Test Dummy

> Return fake data after a configurable delay -- for testing the execution pipeline without real HTTP requests.

**Module ID:** `test-dummy` | **Step:** 1 (Discovery) | **Category:** testing | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## Background

### The Content Problem This Solves

When developing or testing the pipeline infrastructure (BullMQ job execution, progress reporting, error handling, entity routing, working pool management), you need a module that behaves like a real Step 1 module but does not make any external HTTP requests or require API keys. The test-dummy fills this role: it accepts entities, simulates work with a configurable delay, generates fake URL data, and optionally simulates failures for specific entities.

### How It Fits the Pipeline Architecture

This is a Step 1 Discovery module that sits alongside real crawlers (sitemap-parser, page-links, browser-crawler) but produces synthetic data. It exercises the full module execution contract: receives `input.entities`, uses `tools.logger` and `tools.progress`, returns the standard `{ results[], summary }` response format with per-entity grouping and error handling.

The module is useful for testing:
- BullMQ job creation and processing
- Progress bar updates during execution
- Error handling when an entity fails
- Working pool population with fake items
- Multi-entity pipeline flow without network dependencies

## Strategy & Role

**Why this module exists:** Enable pipeline development and testing without external dependencies. Verify that the execution infrastructure works correctly before testing with real crawlers.

**Role in the pipeline:** Development/testing only. Never used in production pipeline runs.

**Relationship to other steps:**
- **No dependencies** -- completely self-contained
- **Produces fake data** -- output looks like Step 1 URL data but URLs point to .example.com domains
- **Supports error simulation** -- configure `fail_entity` to test error handling paths

## When to Use

**Always use when:**
- Testing pipeline execution infrastructure (BullMQ, workers, progress reporting)
- Verifying error handling with simulated failures
- Demonstrating pipeline flow to new team members without needing real websites

**Never use when:**
- Running production pipeline flows -- output is entirely fake
- Testing scraping or content extraction -- use real modules for that

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `delay_ms` | 1,000ms | Raise to 5-30s to simulate slow modules; lower to 100ms for fast testing | Pause per entity to simulate work. Useful for testing progress bar updates and timeout handling |
| `items_per_entity` | 3 | Raise to 10-50 to test large working pools; lower to 1 for minimal output | Number of fake URL items generated per entity. Each item gets a unique .example.com URL |
| `fail_entity` | `""` (empty) | Set to a company name substring to test error handling | If an entity name contains this string (case-insensitive), the module simulates a failure for that entity. Leave empty to succeed all |

## Recipes

### Quick Pipeline Test
Fast execution with minimal output:
```
delay_ms: 100
items_per_entity: 3
fail_entity: ""
```

### Slow Module Simulation
Simulate a module that takes a long time per entity:
```
delay_ms: 5000
items_per_entity: 3
fail_entity: ""
```

### Error Handling Test
Simulate a failure for a specific entity:
```
delay_ms: 1000
items_per_entity: 3
fail_entity: "CompanyX"
```

### Large Pool Test
Generate many items to stress-test working pool UI:
```
delay_ms: 500
items_per_entity: 50
fail_entity: ""
```

## Expected Output

**Healthy result:**
- N entities processed (one per input entity)
- `items_per_entity` fake URLs per successful entity
- Empty items array for failed entities

**Output fields per item:**
- `url` -- fake URL in format `https://{entity-name-slugified}.example.com/page-{n}`
- `title` -- `"{Entity Name} -- Page {n}"`
- `score` -- random integer between 0 and 100

**Meta fields per entity:**
- `simulated: true` -- always set to indicate this is test data
- `delay_ms` -- the delay that was applied (on successful entities)

**Summary fields:**
- `total_entities` -- number of entities processed
- `total_items` -- total fake items generated across all entities
- `errors` -- array of error messages for failed entities

## Limitations & Edge Cases

- **Output is entirely synthetic** -- URLs point to .example.com and will not resolve. Do not use output for any real processing
- **No requires_columns** -- accepts any entity shape, even empty objects (entity name defaults to "Entity N")
- **Error simulation is substring-based** -- `fail_entity: "test"` will fail any entity whose name contains "test" (case-insensitive), including "Testing Corp" or "Latest Results"
- **No HTTP requests** -- does not use `tools.http` or `tools.browser`. Cannot test network-related error paths
- **Score is random** -- the `score` field uses `Math.random()` and will produce different values on each run

## What Happens Next

Fake items enter the working pool just like real Step 1 output. They can flow through subsequent pipeline steps (Step 2 validation, Step 3 scraping, etc.) but will fail at any step that tries to fetch the .example.com URLs. The test-dummy is primarily useful for testing Step 1 execution and the skeleton infrastructure, not for end-to-end pipeline testing.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** testing
- **Cost:** cheap
- **Data operation:** add (+) -- fake items are added to the working pool as net-new entries, keyed by `url`
- **Pool precondition:** `empty_ok` -- runs against an empty or populated pool; no prior items required (standard for Step 1 discovery/seed modules)
- **Requires columns:** none (accepts any entity)
- **Input:** `input.entities[]` with any fields (uses `entity.name` for output)
- **Output:** `{ results[], summary }` where each result has `entity_name`, `items[]` with `url`, `title`, `score`, and `meta` with `simulated: true`
- **Selectable:** false (standard table output)
- **Error handling:** configurable entity failure via `fail_entity` option. Failed entities return empty items array with error message
- **Dependencies:** none (no external packages, no tools.http)
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== url-canonicalizer (step 2, v1.0.0) ===== -->

# URL Canonicalizer

> Resolves redirect chains so every URL in the pool points to its real destination before scraping begins, and drops duplicates that only become visible after redirects resolve.

**Module ID:** `url-canonicalizer` | **Step:** 2 (Validation) | **Category:** filtering | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

Many websites use redirects -- vanity URLs, path rewrites, www/non-www normalization, HTTP-to-HTTPS upgrades. Discovery modules extract the `href` from HTML, which is often the pre-redirect URL. If the pipeline scrapes that URL, it either follows the redirect silently (wasting a round-trip) or gets a 301 response with no content.

URL Canonicalizer sends a HEAD request to each URL and checks whether the final destination differs from the original. If it does, the URL is replaced with the canonical version. This ensures downstream modules (url-filter, url-relevance, and all scrapers) work with the correct URLs.

It also deduplicates its own OUTPUT -- when two different discovery URLs both resolve to the same canonical page, the module keeps the first and drops the rest from what it emits (case-insensitive, ignoring trailing slashes). Caveat: under the skeleton's `transform` semantics this does NOT guarantee one pool row per canonical destination. Transform only replaces pool rows whose key or `original_url` appears in the module's output -- a dropped duplicate's pool row is left untouched, so its stale pre-redirect URL can survive in the pool alongside the canonical one. Redirect-alias collapse in the pool is therefore best-effort; genuinely critical dedup still belongs to url-dedup's key-based pass.

```
url-dedup -> URL CANONICALIZER -> url-filter -> url-relevance -> scraping
```

## When to Use

**Always run when:**
- You're processing any batch of discovered URLs -- redirects are common on virtually every site
- Companies have recently restructured their websites (old paths redirect to new ones)
- Discovery found URLs from sitemap entries, which often contain legacy paths

**Skip when:**
- You've already verified that the target sites don't use redirects (rare)
- Speed is critical and you're willing to let scrapers follow redirects themselves

**Tune the settings when:**
- Target sites are slow to respond -- raise `request_timeout`
- You have hundreds of URLs per entity -- raise `concurrency` for throughput
- You're hitting rate limits on target servers -- lower `concurrency`

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `request_timeout` | 5000 | Raise to 10000-15000 for slow or Cloudflare-protected sites; lower to 3000 for known-fast sites (range 1000-15000) | Timeout per HEAD request in milliseconds |
| `concurrency` | 20 | Lower to 5-10 if target sites rate-limit HEAD requests; raise to 30-50 for large batches against tolerant servers (range 1-50) | How many HEAD requests run in parallel per batch |

Both options are straightforward. The defaults work well for most iGaming company sites. The main risk is setting `concurrency` too high against a single domain -- some servers interpret rapid HEAD requests as a scan and start returning 429s. If you see many errors in the output, lower concurrency first.

## Recommended Configurations

### Standard
For most pipeline runs:
```
request_timeout: 5000
concurrency: 20
```

### Conservative
When target sites are slow or rate-limit aggressively:
```
request_timeout: 10000
concurrency: 5
```

### High-Volume
For large batches (500+ URLs) against diverse domains:
```
request_timeout: 5000
concurrency: 40
```

## What Good Output Looks Like

**Healthy result:**
- 5-20% of URLs redirected -- this is normal for most sites
- 0% errors -- HEAD requests rarely fail on live URLs (a failed request shows up as `unchanged` with `redirect_detail` starting with `Error:`)
- All redirected URLs show clear `original_url` → `url` mappings
- A small number of deduped items when discovery produced aliases of the same page -- the summary reads like `3 redirected, 2 deduped, 45 unchanged of 50 total → 48 output`

**Output fields:**
- `url` -- the canonical URL (after redirect resolution). This is what downstream modules will use
- `original_url` -- the URL as discovered. Preserved for transparency
- `status` -- `redirected` (URL was changed) or `unchanged` (URL was already canonical)
- `redirect_detail` -- human-readable description of the redirect (e.g., `https://example.com/old → https://example.com/new`), or `Error: <message>` when the HEAD request failed
- `entity_name` -- which entity this URL belongs to

The run summary also reports `output_items` (items after dedup) and `deduplicated` (how many rows were dropped because they resolved to a canonical URL already seen).

**Warning signs:**
- 50%+ URLs redirected -- the discovery module may be extracting non-canonical URLs systematically. Check if the sitemap contains outdated entries
- Many errors -- target servers may be blocking HEAD requests. Consider raising `request_timeout` or lowering `concurrency`
- High `deduplicated` count -- discovery is emitting many aliases of the same page (tracking parameters, mirrored paths). Worth checking the discovery module's output before scaling up
- 0% redirected -- not necessarily a problem, but verify with a manual spot-check that redirects are actually being detected (the skeleton's `http.head()` must return `res.url` for this to work)

## Limitations

- **HEAD requests only** -- does not download page content. Some servers handle HEAD differently from GET (rare, but possible)
- **Does not check liveness** -- a URL that times out or returns 500 is kept unchanged. Liveness checking is url-filter's job
- **Redirect detection ignores trailing slashes only** -- when comparing original vs. final URL, only trailing slash differences are ignored (the comparison is case-sensitive). The dedup pass at the end is broader: case-insensitive plus trailing-slash-insensitive on the canonical URL. Pre-redirect normalization (www variants as strings, tracking params) is still url-dedup's job
- **Cannot detect JavaScript redirects** -- only follows HTTP-level redirects (301, 302, 307, 308). Sites that redirect via `window.location` in JavaScript won't be caught
- **Cross-domain redirects are followed** -- if a URL redirects to a completely different domain, the new domain URL is used. This is usually correct (domain migrations) but could be surprising

## What Happens Next

After canonicalization, the corrected URLs flow to **url-filter** for pattern matching and optional status checking, then to **url-relevance** for LLM-based classification. When URLs reach Step 3 (Scraping), they point directly to the real pages -- no redirect overhead, no mismatched paths.

Duplicates that only appear after redirect resolution are removed from this module's OUTPUT, but the dropped alias's own pool row is not replaced by the transform operation and can survive as a stale pre-redirect URL. If redirect-heavy sites matter to your run, keep url-dedup positioned before this module (as in the standard chain) and treat any surviving aliases as candidates for url-filter exclusion patterns.

## Technical Reference

- **Step:** 2 (Validation)
- **Category:** filtering (sort_order 2 -- runs after url-dedup within Step 2)
- **Cost tier:** cheap -- HEAD requests are lightweight, no body downloaded
- **Data operation:** transform (=) -- same items with URLs potentially updated; the canonical dedup pass means the output can contain fewer items than the input
- **Pool precondition:** `requires_items` -- needs URLs in the pool; entities with an empty pool are skipped (`skipped_no_input`), not failed
- **Required input columns:** `url`
- **Depends on:** url-dedup (should run first to reduce total HEAD requests)
- **Input:** `input.entities[]` with `items[]` from working pool
- **Output:** `{ results[], summary }` grouped by `entity_name`; summary includes `output_items` and `deduplicated` counts
- **Selectable:** true -- redirected items are flagged for review
- **Error handling:** per-URL try/catch. Failed HEAD requests keep the original URL unchanged -- url-filter handles dead link detection downstream. Each checked item is pushed to `tools._partialItems`, so a timeout mid-run preserves the batches already completed
- **External dependencies:** `tools.http` (HEAD requests), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== url-dedup (step 2, v1.1.0) ===== -->

# URL Deduplicator

> Remove duplicate items across all entities in a single pass -- by normalized URL (default) or by fuzzy title + company matching for cross-source dedup.

**Module ID:** `url-dedup` | **Step:** 2 (Validation) | **Category:** filtering | **Cost:** cheap
**Version:** 1.1.0 | **Data Operation:** remove (➖)

---

## Background

### The Content Problem This Solves

Step 1 (Discovery) intentionally casts a wide net -- multiple modules independently find URLs from sitemaps, navigation, deep crawling, and feeds. The same URL can easily appear across multiple discovery sources: the sitemap lists `/about`, the navigation links to `/about`, and deep crawling finds it again from the homepage. Before spending money on scraping and LLM processing, these duplicates need to be eliminated.

But deduplication isn't just about exact matches. The same page can appear as `https://www.example.com/about/`, `https://example.com/about`, `http://example.com/About`, and `https://example.com/about?utm_source=google#section1`. These are all the same page. The URL Deduplicator normalizes URLs before comparing them, catching duplicates that string comparison would miss.

There is a second duplicate problem URL normalization can never catch: **the same item published on different sites under different URLs**. A job posting syndicated to three job boards has three genuinely distinct URLs -- but it's one job. For this, the module offers a second match strategy, `title_company`: fuzzy title matching (Dice coefficient on character bigrams, with seniority prefixes like "Senior"/"Lead" stripped first) combined with exact company matching. Same company + near-identical title = duplicate, regardless of URL.

### How It Fits the Pipeline Architecture

Step 2 (Validation) is about saving money and time by filtering worthless URLs before they reach the expensive scraping step. The Strategic Architecture describes this as:

> *"Discovery typically produces far more URLs than are worth scraping. Validation filters these cheaply -- so the expensive scraping step only processes URLs likely to produce useful content."*

URL Deduplicator is the first module in the Step 2 chain (`sort_order: 1`). Step 2 uses the **remove (➖)** data operation with **chaining** -- each module reads the previous sibling's approved output and filters it further:

1. **URL Deduplicator** (this module) -- removes exact/normalized duplicates or cross-source title+company duplicates
2. **URL Pattern Filter** -- removes URLs matching exclusion patterns
3. **URL Relevance Filter** -- LLM-based classification of remaining URLs

This chaining order is intentional: dedup first (cheapest, removes the most), then pattern filter (cheap, rule-based), then AI relevance (cheapest last, as fewer URLs remain).

### The Original Two-Gate System

The Raw Appendix described a two-gate validation approach:
- **Pre-scrape validation** (old Step 4, now Step 2) -- cheap checks to reduce scrape cost
- **Post-scrape filtering** (old Step 7, now Step 4) -- quality checks on scraped content with adaptive page caps

Deduplication was identified as a critical pre-scrape check. The original document noted that duplicate detection should happen at multiple levels: exact URL match, near-duplicate detection via text hashing (Jaccard similarity), and content-level deduplication after scraping. This module handles the first level -- item-level deduplication before any content is fetched.

## Strategy & Role

**Why this module exists:** Multiple discovery modules independently find URLs, creating inevitable duplicates. Cross-source discovery (e.g., the same job on multiple boards) creates duplicates that share no URL at all. Eliminating both kinds before scraping prevents wasted HTTP requests, wasted LLM tokens, and duplicate entries in the content library.

**Role in the pipeline:** First filter in the Step 2 validation chain. Handles the cheapest, highest-impact filtering -- pure in-memory comparison with zero HTTP requests or API calls.

**Relationship to siblings:**
- **Runs before:** URL Pattern Filter and URL Relevance Filter (dedup first reduces their workload)
- **Operates across entities:** Unlike Step 1 modules that process one entity at a time, this module compares items *across* all entities to catch cross-entity duplicates

## When to Use

**Always use when:**
- Multiple Step 1 discovery modules were run (high duplicate probability)
- Processing many entities that might share URLs (e.g., companies linking to each other)

**Use `title_company` strategy when:**
- The same item appears on multiple sources under different URLs -- e.g., a job posted on several job boards. URL comparison cannot catch these; only title+company matching can

**Skip when:**
- Only one discovery module was run with very few results
- The discovery module already dedupes by an external ID (e.g., api-search dedupes by externalId)

**Typically the first module run in Step 2** -- always run before URL Pattern Filter and URL Relevance Filter to reduce their workload.

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `match_strategy` | `url` | Switch to `title_company` for cross-source dedup where the same item appears on multiple sites with different URLs (job boards, syndicated content) | `url`: normalize and compare URLs (fast, same-source). `title_company`: fuzzy title match + exact company match |
| `fuzzy_threshold` | 0.85 | Raise toward 1.0 if distinct-but-similar titles are being merged (e.g., "Frontend Developer" vs "Backend Developer" at the same company); lower toward 0.5 if obvious rewordings of the same posting survive. Range 0.5-1.0. Only used with `title_company` | Dice coefficient threshold for title similarity (0.0-1.0). Higher = stricter matching |
| `normalize_www` | true | Disable only if www and non-www versions of a site serve genuinely different content (very rare) | Treats `www.example.com` and `example.com` as the same host |
| `normalize_trailing_slash` | true | Disable only if the site uses trailing slashes to distinguish different pages (very rare) | Treats `/about` and `/about/` as the same URL |
| `strip_query_params` | true | Disable if the site uses query parameters for meaningful page content (e.g., `?product=123`) rather than tracking | Removes `?utm_source=...`, `?ref=...`, etc. Most query params are tracking noise |
| `strip_fragments` | true | Disable if the site uses fragment identifiers for separate page content (single-page apps with hash routing) | Removes `#section` anchors. Usually just page-internal navigation |
| `case_insensitive` | true | Disable if the site uses case-sensitive URL paths (rare but exists in some CMSes) | Treats `/About` and `/about` as the same URL |

The five `normalize_*`/`strip_*`/`case_insensitive` options only apply to the `url` strategy -- `title_company` ignores them entirely. In `title_company` mode, an item missing either `title` or `company` is never matched against anything and always passes through as `unique`.

## Recipes

### Standard (recommended for most cases)
Maximum URL normalization -- catches the most duplicates:
```
match_strategy: url
fuzzy_threshold: 0.85
normalize_www: true
normalize_trailing_slash: true
strip_query_params: true
strip_fragments: true
case_insensitive: true
```

### Cross-Source
Same item on multiple sites with different URLs (job boards, syndication):
```
match_strategy: title_company
fuzzy_threshold: 0.85
normalize_www: true
normalize_trailing_slash: true
strip_query_params: true
strip_fragments: true
case_insensitive: true
```

### Conservative
Preserve more URL variations -- use when unsure:
```
match_strategy: url
fuzzy_threshold: 0.85
normalize_www: true
normalize_trailing_slash: true
strip_query_params: false
strip_fragments: true
case_insensitive: false
```

### Minimal
Only basic normalization:
```
match_strategy: url
fuzzy_threshold: 0.85
normalize_www: true
normalize_trailing_slash: false
strip_query_params: false
strip_fragments: false
case_insensitive: false
```

## Expected Output

**Healthy result:**
- 10-30% duplicates across combined discovery results is normal
- If multiple discovery modules were run, expect higher duplicate rates for well-known pages (/about, /contact)
- The run summary names the strategy used, e.g. "Found 12 duplicates. 88 unique of 100 total (url)"

**Output fields per item:**
- `url` -- the original URL
- `original_url` -- preserved original URL before normalization
- `title` -- item title, carried through from the source item (null if absent)
- `company` -- company name, carried through (null if absent)
- `location` -- location, carried through (null if absent)
- `source` -- source identifier, carried through (null if absent)
- `duplicate_of` -- if duplicate, the URL of the first occurrence it duplicates
- `status` -- `unique` or `duplicate`
- `entity_name` -- which entity this item belongs to

**Display behavior:** Results are sorted with duplicates first, and `duplicate` status is flagged in the UI (`flagged_when`), so operators can quickly review what's being removed. Results are selectable -- operators can override dedup decisions. The remove (➖) data operation means items marked `duplicate` are excluded from the pool when approved.

**Red flags to watch for:**
- 0 duplicates → either only one discovery module ran, or the modules found completely different URLs (expected for RSS vs Sitemap)
- 80%+ duplicates → discovery modules are finding mostly the same URLs. Consider whether all are needed
- Cross-entity duplicates → two companies linking to the same page (e.g., a shared partner page). Worth reviewing -- might indicate a relationship
- `title_company` finds 0 duplicates on job data → check that items actually carry `title` and `company` fields; items missing either are silently kept as unique

## Limitations & Edge Cases

- **URL-level / metadata-level only** -- Does not detect content-level duplicates (different URLs serving the same content, with different titles). That requires post-scrape comparison (future Step 4 module). The original Content Creation Master planned content-level dedup via "Jaccard similarity of intro/teaser across URLs"
- **Normalization is lossy** -- Stripping query params might merge distinct pages on sites that use params for routing (e.g., `?page=about` vs `?page=contact`). The Conservative recipe preserves these
- **First-seen wins** -- When two items are duplicates, the first one encountered is marked `unique` and the second is `duplicate`. The "first" is determined by entity order in the input
- **Cross-entity comparison** -- A URL found for Company A and Company B will be marked as duplicate for whichever entity appears second. This is correct (same URL = same content) but may surprise operators
- **`title_company` requires both fields** -- Items missing `title` or `company` never participate in fuzzy matching; they always pass through as `unique`, even if they are real duplicates
- **Company match is exact** -- Only lowercased/trimmed exact company names match. "Evolution" vs "Evolution Gaming" are different companies to this module; only the *title* side is fuzzy
- **Seniority prefixes are stripped before title comparison** -- senior/junior/lead/principal/staff/chief/head of/director of/vp of/vice president of. "Senior Frontend Developer" and "Frontend Developer" at the same company count as the same title. Raise `fuzzy_threshold` if this merges roles you want kept apart
- **Items without a `url` field are dropped** -- skipped with a logged warning, never included in results (`url` is the item key)

## What Happens Next

After deduplication, the remaining unique items flow to the next Step 2 module -- **URL Pattern Filter** -- which applies pattern-based include/exclude rules. The filtered set then reaches **URL Relevance Filter** for LLM-based classification.

The original Content Creation Master envisioned deduplication feeding back into the learning system: *"Weekly: aggregate removal counts by domain + content_type → feed into Step 4 rule/model updates."* High duplicate rates from specific domains could inform future discovery optimizations.

## Technical Reference

- **Step:** 2 (Validation)
- **Category:** filtering
- **Cost tier:** cheap -- pure in-memory computation, shortest timeout class
- **Data operation:** remove (➖) -- items marked `duplicate` are removed from the working pool; `unique` items remain
- **Pool precondition:** `requires_items` -- needs items in the pool for the entity; an empty pool marks the entity `skipped_no_input` instead of failing
- **Sort order:** 1 -- runs first in the Step 2 chain
- **Depends on:** none
- **Required input columns:** `url`
- **Input:** `input.entities[]` with `items[]` from Step 1 working pool (grouped format) or flat item list (entity IS the item, e.g. from CSV upload)
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `original_url`, `title`, `company`, `location`, `source`, `duplicate_of`, `status`, `entity_name`, plus per-entity `meta` (total_found, duplicates, unique, errors)
- **Selectable:** true -- operators can override dedup decisions in the UI
- **Matching internals:** `url` strategy normalizes via the WHATWG URL parser then applies the five toggle options; `title_company` strategy uses Dice coefficient over character bigrams on seniority-stripped lowercased titles, gated by exact lowercased company match, against `fuzzy_threshold`
- **Error handling:** Items without a `url` field are skipped with a warning; entities with neither an `items` array nor a `url` field are skipped with a warning. Malformed URLs fall back to basic string normalization (lowercase + trailing-slash strip only)
- **Timeout resilience:** Pushes all results to `tools._partialItems` so results survive a timeout/abort
- **External dependencies:** None (no HTTP requests, no API calls, no npm packages)
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== url-filter (step 2, v1.0.0) ===== -->

# URL Pattern Filter

> Filter URLs by include/exclude regex patterns and optional HTTP status validation with a headless-browser retry for bot-protected sites.

**Module ID:** `url-filter` | **Step:** 2 (Validation) | **Category:** filtering | **Cost:** medium
**Version:** 1.0.0 | **Data Operation:** remove (➖)

---

## Background

### The Content Problem This Solves

Discovery modules find everything -- that's their job. But "everything" includes pagination pages (`/page/2`, `/page/3`), tag archives (`/tag/slots`), category listings (`/category/news`), privacy policies, login pages, and other non-content URLs that would waste scraping budget. Before the original Content Creation Master vision of ML-powered validators, the simplest and most reliable way to remove junk URLs is pattern matching.

The Raw Appendix defined this as part of Step 4 (Pre-scrape Link Validation): *"Light rules (regex/path): e.g., `/page\d+`, `/category/`, `/tag/`, `?s=`, `/search`, `/privacy`, `/terms`, `/login`, `/signup`."* These rules were described as "proposed by the labeled set, not hard-coded in advance" -- meaning they should be configurable and evolve based on what operators learn about which URL patterns produce useful content.

### How It Fits the Pipeline Architecture

URL Pattern Filter runs in the Step 2 validation chain after URL Deduplicator and URL Canonicalizer (`sort_order: 3`), and before URL Relevance Filter. It handles rule-based filtering -- deterministic, fast, no API calls required. The chaining order is deliberate:

1. **URL Deduplicator** → removes duplicates (cheapest)
2. **URL Canonicalizer** → normalizes URL forms
3. **URL Pattern Filter** (this module) → removes junk by regex patterns (cheap, deterministic)
4. **URL Relevance Filter** → LLM classification of remaining URLs (most expensive per-URL)

By removing obvious junk patterns before the LLM-based filter, this module saves both token costs and classification time. If 30% of URLs match junk patterns, the URL Relevance Filter processes 30% fewer URLs.

### The Validation Learning Vision

The original Content Creation Master envisioned a sophisticated validation pipeline:
- **Shadow mode** -- log decisions but don't actually filter, to build a labeled dataset
- **Enforce mode** -- only activate per-domain when precision is proven (≥95% precision, ≤2% false reject rate on article pages, across ≥200 samples)
- **Domain-level policies** -- different rules for different site types

This module is the v1 implementation: manual regex patterns configured by the operator. The patterns themselves are the operator's knowledge encoded as rules -- what the Content Creation Master called "rules proposed by the labeled set." As the pipeline processes more companies, operators learn which patterns are reliable and encode them here. Presets for common entity types (Operator, Affiliate, B2B) can be loaded into `exclude_patterns` from the UI.

### Optional HTTP Status Checking

Beyond pattern matching, this module can optionally validate URLs by checking that they respond with a healthy HTTP status. It uses a tiered approach: fast HEAD requests first, then a headless-browser retry for URLs that return 403/429/503 -- statuses that bot-protection systems (Cloudflare and similar) commonly return to plain HTTP clients even when the page is fine in a real browser. This catches dead links (404s, DNS failures, timeouts) without falsely killing bot-protected sites. It's disabled by default because it adds network I/O; enable it for large or stale URL pools where dead-link rates are high.

## Strategy & Role

**Why this module exists:** Remove obviously irrelevant URLs using deterministic regex patterns before the more expensive LLM-based relevance filter. Fast, predictable, and operator-controlled.

**Role in the pipeline:** Rule-based filter in the Step 2 validation chain. Handles exclusions that don't require AI judgment -- pagination, tag pages, legal pages, search results -- plus optional dead-link detection.

**Relationship to siblings:**
- **Runs after:** URL Deduplicator and URL Canonicalizer (declared in `depends_on`; works on the deduplicated, normalized set)
- **Runs before:** URL Relevance Filter (reduces its workload and token cost)
- **Complementary to URL Relevance:** Pattern Filter handles obvious junk (structural URL patterns); Relevance Filter handles judgment calls (is this /blog/post-about-awards relevant to a company profile?)

## When to Use

**Always use when:**
- Discovery produced a large URL pool (500+ URLs) with likely junk patterns
- You know specific URL patterns to exclude for your content type
- You want to reduce the URL count before the LLM-based relevance filter

**Skip when:**
- The URL pool is small and already curated
- You prefer to let the URL Relevance Filter handle everything (it can, but costs more tokens)

**Run before URL Relevance Filter** to reduce its input size and cost.

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `exclude_patterns` | "" (none) | Add patterns for known junk URL types. One regex per line. Presets available in the UI for common entity types (Operator, Affiliate, B2B) | URLs matching *any* exclude pattern are removed. Common patterns: `/page/\d+`, `/tag/`, `/category/`, `/search`, `/privacy`, `/terms`, `/login`. Matching is case-insensitive |
| `include_patterns` | "" (none) | Set when you only want URLs matching specific patterns -- everything else is excluded | If set, only matching URLs survive. Use for focused extraction (e.g., only `/about`, `/company`, `/partners`). Case-insensitive |
| `check_status_codes` | false | Enable when you suspect many dead links (old discovery data, sites with frequent URL changes) | Sends HEAD requests (batched 20 concurrent, 3s timeout each). 2xx/3xx = kept; 403/429/503 = retried with a headless browser to rule out bot protection; anything else (404, 5xx, network error) = removed as a dead link |

Exclude patterns are checked first; if a URL matches both an exclude and an include pattern, it's excluded. Invalid regex lines are skipped with a logged warning -- they never abort the run, so check the logs if a pattern seems to have no effect.

## Recipes

### Standard iGaming Profile Cleanup
Remove common junk patterns for iGaming company sites:
```
exclude_patterns:
/page/\d+
/tag/
/category/
/author/
/search
/privacy
/terms
/login
/signup
/cart
/checkout
/my-account
\?s=
/feed/
/wp-json/
/wp-content/
include_patterns: ""
check_status_codes: false
```

### News Content Only
Keep only news/blog/press URLs:
```
exclude_patterns: ""
include_patterns:
/news
/blog
/press
/article
/post
/media
check_status_codes: false
```

### Corporate Pages Only
Keep only corporate information pages:
```
exclude_patterns: ""
include_patterns:
/about
/company
/team
/leadership
/partner
/investor
/career
/contact
/press
check_status_codes: false
```

### Full Validation (with dead link check)
Maximum filtering including HTTP status validation:
```
exclude_patterns:
/page/\d+
/tag/
/category/
/author/
/search
/privacy
/terms
include_patterns: ""
check_status_codes: true
```

## How the Status Check Works

When `check_status_codes` is enabled, filtering runs in two tiers after pattern matching:

1. **HEAD sweep** -- all pattern-passed URLs are HEAD-requested in batches of 20 with a 3-second timeout each. Status 200-399 keeps the URL. Status 403, 429, or 503 queues it for the browser retry. Any other status or a network error removes it as a dead link.
2. **Browser retry** -- queued URLs are fetched with a headless browser (batches of 2, 15s timeout, waits for network idle) under a **120-second total time budget**. A URL survives the retry if the page has no known bot-challenge markers (Cloudflare "Checking your browser" / "Just a moment..." style pages) AND either returns 2xx/3xx or delivers a substantial body (>1,000 characters) -- the latter catches sites that pass the challenge but still report an odd status. Challenge markers, small error bodies, and browser crashes all confirm the URL as dead.

If the 120s budget runs out before all retries finish, the remaining unchecked URLs are **kept optimistically** (they were only suspected, never confirmed dead) and a warning is logged. This means bot-protected sites are never mass-removed just because the retry queue was long.

## Expected Output

**Healthy result:**
- With standard exclude patterns: 10-40% of URLs removed (junk patterns)
- With include patterns: may remove 50-80% (keeping only matching URLs)
- With status check: additional 5-15% removed as dead links

**Output fields per URL:**
- `url` -- the URL that survived filtering
- `status` -- always `kept` (excluded and dead URLs are removed from the output entirely, not listed)
- `matched_pattern` -- always null for kept items (reserved field in the schema)
- `entity_name` -- which entity this URL belongs to

**Where the removals show up:** the run summary carries the counts -- `kept`, `excluded`, `dead_links`, and a description like "214 kept, 96 removed (80 excluded by pattern, 16 dead links) of 310 total". Individual removed URLs are visible in the run logs (each exclusion and dead link is logged with its reason), not in the result table.

**Display behavior:** Results are a selectable table of kept items. The remove (➖) data operation means only approved items stay in the working pool; operators can deselect kept URLs in the UI before approving.

**Red flags to watch for:**
- 0 excluded → patterns may not match the URL formats in the pool. Check regex syntax and the logs for "Invalid regex pattern" warnings
- 90%+ excluded → patterns are too aggressive. Review the exclusion log lines to see what's being removed
- Many dead links in the summary → site may have undergone restructuring since discovery. Consider re-running Step 1
- "Browser retry budget exceeded" warning → many URLs hit bot protection; the unchecked remainder was kept optimistically, so expect some dead URLs to reach Step 3

## Limitations & Edge Cases

- **Regex only** -- No semantic understanding. A URL like `/partners-in-crime` would match the pattern `/partners` even though it's not a partnerships page. The URL Relevance Filter handles semantic judgment
- **No DOM/content signals** -- Unlike the full validator vision from the Content Creation Master (which included `<article>` presence, text length, paragraph/link counts), this module only looks at the URL string (plus, optionally, HTTP status). Content-aware filtering happens post-scrape in Step 4
- **Removed URLs aren't reviewable in the result table** -- excluded and dead URLs are dropped from the output, so an operator can't un-remove a single URL from the UI; loosen the patterns and re-run instead
- **HEAD can lie** -- some servers reject HEAD but serve GET fine. Only 403/429/503 get the browser second opinion; a site that answers HEAD with 404 or 405 is removed as dead
- **Challenge markers are Cloudflare-centric** -- the browser retry recognizes Cloudflare-style challenge pages; other CDN challenge systems may slip through via the >1,000-character body heuristic or be misjudged
- **No domain-level policies** -- The original vision included per-domain rule sets with promotion thresholds. Current implementation uses the same patterns for all URLs
- **Pattern order doesn't matter** -- Exclude patterns are checked first. If a URL matches both an exclude and include pattern, it's excluded
- **Items without a `url` field are skipped** with a logged warning, not failed

## What Happens Next

After pattern filtering, the remaining URLs flow to **URL Relevance Filter** -- the LLM-based classifier that determines KEEP/MAYBE/DROP for each URL based on its path, link text, and source location. This is the final Step 2 gate before URLs proceed to Step 3 (Scraping).

The original Content Creation Master envisioned the pre-scrape validation step producing scored decisions with fields: `decision` (allow/reject), `score` (0-1), `reason` array, `validator_version`, and `domain_policy`. The current URL Pattern Filter produces a simplified version: kept items plus removal counts in the summary. The richer scoring model is part of the calibration roadmap.

## Technical Reference

- **Step:** 2 (Validation) -- `sort_order: 3` within the step
- **Category:** filtering
- **Cost tier:** medium -- 5-minute timeout tier; the status check does real network I/O (HEAD batches + browser retries)
- **Data operation:** remove (➖) -- only kept items survive approval; excluded and dead URLs leave the working pool
- **Pool precondition:** `requires_items` -- needs URLs in the pool for the entity; an empty pool marks the entity `skipped_no_input`, not failed
- **Required input columns:** `url`
- **Depends on:** `url-dedup`, `url-canonicalizer`
- **Input format:** `input.entities[]` -- grouped (`{ name, items: [{ url, ... }] }`) or flat (`{ url, ... }` per entity); both are flattened with entity association preserved
- **Output format:** `results[]` grouped by `entity_name`, each with `items[]` (kept URLs) and per-entity `meta`; top-level `summary` with `total_entities`, `total_items`, `kept`, `excluded`, `dead_links`, `description`
- **Selectable:** true -- operators pick which kept items to approve in the UI
- **Error handling:** invalid regex patterns skipped with a warning (not fatal); HEAD failures/timeouts treated as dead links; 403/429/503 escalate to browser retry; browser crashes count the URL as dead without re-retrying; browser-retry time budget (120s) exceeded → remaining URLs kept optimistically
- **Timeout resilience:** LIMITED -- the only `tools._partialItems` push happens at the very end of execution (just before the final return), so a timeout/abort during the HEAD sweep or browser-retry loop saves nothing. (Known gap vs repo Rule 10, which calls for a push after each successful batch)
- **Dependencies:** `tools.http` and `tools.browser` (both only when `check_status_codes` enabled), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== url-heuristics (step 2, v1.0.0) ===== -->

# URL Heuristics

**Step 2 — Validation** · `remove` · `requires_items` · cost: `cheap` · v1.0.0

Zero-cost rule-based URL scoring. Rejects obvious non-content URLs (pagination, category/tag archives, auth pages, legal pages, feeds) BEFORE the pool reaches expensive scraping and LLM steps. Its whole purpose is to shrink the item set that url-relevance has to pay tokens for.

```
url-canonicalizer → url-dedup → url-filter → [url-heuristics] → url-relevance (LLM) → scrapers
```

## How it differs from its neighbors

| Module | Mechanism | Cost | Decision |
|---|---|---|---|
| url-filter | operator-authored regex, binary keep/drop | free | binary |
| **url-heuristics** | **weighted scoring engine, three-way decision + reasons + shadow mode** | **free** | **allow / allow_hint / reject** |
| url-relevance | LLM classification | tokens per item | KEEP / MAYBE / DROP |

## Decision logic

1. Any `reject_url_patterns` match → `reject` (score 0.1).
2. Otherwise score starts at **1.0** and penalties subtract:
   - title/snippet matches a `title_reject_patterns` line → **-0.5** (applied once, first matching pattern)
   - path depth > `max_depth` → **-0.25**
   - query params > `max_query_params` → **-0.25**
   - URL has a `#fragment` → **-0.25**
3. Final: score < `reject_threshold` (0.3) → `reject`; hint-pattern match OR score < `hint_threshold` (0.6) → `allow_hint`; else `allow`.

Every scored item gets `decision`, `score`, `reasons` (joined string), `needs_render`, `validator_version`. Original item fields are preserved.

## Shadow vs enforce (`mode` option)

- **shadow (default):** ALL items returned, annotated. Nothing is dropped. Rejects are flagged in the UI (`flagged_when: decision=reject`) so the operator can audit false rejects. Safe, runnable default.
- **enforce:** `reject` items are dropped. `allow_hint` items are ALWAYS kept in both modes. Promote a template to enforce only after a shadow audit looks trustworthy.

If enforce rejects every item for an entity, the summary says so loudly (`all N items rejected`) — downstream `requires_items` modules will then mark that entity `skipped_no_input`.

## Options

| Option | Default | Notes |
|---|---|---|
| `mode` | `shadow` | `shadow` \| `enforce` |
| `reject_url_patterns` | generic web-cruft list | one case-insensitive regex per line, matched against the full URL; `#` lines are comments; presets enabled |
| `hint_url_patterns` | `/news/?$`, `/blog/?$` | section roots — list-like but possibly useful overviews; presets enabled |
| `title_reject_patterns` | "Page \d+ of", "Browse all", "Archive", "Access denied", "404", "Search results" | applied only when the item has `title`/`snippet` |
| `max_depth` | 6 | 0 disables |
| `max_query_params` | 3 | 0 disables |
| `reject_threshold` | 0.3 | |
| `hint_threshold` | 0.6 | |
| `needs_render_domains` | empty | matching items get `needs_render: true` (Step-3 browser-scraper ordering hint); subdomains match |

**Rule 13:** all rule lists are template-configurable; the defaults are generic web cruft only. Anything domain-flavored (e.g. `/casinos/page/`, `/jobs/page/`) belongs in template presets, never in this module's defaults.

## Edge cases

- **Item with no `url`** → warned, passed through unchanged (both modes), never annotated, never dropped.
- **Invalid regex line in config** → warned with the offending line, skipped; the run continues.
- **Unparseable URL** → regex/title signals still apply; structural signals skipped; reason `unparseable_url` recorded.
- **Absence of signals never rejects** — unknown domains default to `allow` (score only moves on positive signals).
- Runs after url-canonicalizer; does not re-canonicalize.

## Testing

`node modules/step-2-validation/url-heuristics/test-url-heuristics.js` — 47 assertions, no network, no credentials. This module is fully testable and deployable with zero external dependencies; that is the point of it.

## Changelog

- **1.0.0** (2026-07-03) — initial version per the revised brief (`docs/submodule-briefs-rev-2026-07-03/step2-learned-validator.md`). V1 is rules-only; a future learned mode (V2) would add `mode: "learned"` without changing this contract. Pre-commit code review tightened the default reject patterns with `([/?]|$)` anchors so article slugs that merely start with a cruft token (`/privacy-regulations-…`, `/sitemap-best-practices-…`) are not falsely rejected.

---

<!-- ===== url-relevance (step 2, v1.0.1) ===== -->

# URL Relevance Filter

> LLM-based URL relevance classification -- KEEP, MAYBE, or DROP for content type relevance.

**Module ID:** `url-relevance` | **Step:** 2 (Validation) | **Category:** filtering | **Cost:** medium
**Version:** 1.0.1 | **Data Operation:** remove (➖)

---

## Background

### The Content Problem This Solves

After deduplication and pattern filtering, the URL pool still contains many pages that *look* valid but aren't useful for the target content type. A company profile doesn't need individual product pages, seasonal campaigns, or how-to-play guides. A news pipeline doesn't need career listings or privacy policies. These are judgment calls that regex patterns can't make -- you need to understand what the URL *is about* based on its path, anchor text, and context.

The original Content Creation Master envisioned a sophisticated validation system (old Step 4) that would eventually include ML classifiers trained on labeled data: *"Shallow ML classifier (optional): logistic regression or gradient boosting on features including path tokens, DOM hints, text length."* The vision included shadow mode, domain-level policies, and measured rollout with precision/recall thresholds.

This module is the v1 implementation of that vision -- using an LLM instead of a trained classifier. The trade-off: LLMs are more flexible and require no training data, but cost more per URL. By running last in Step 2, the URL count is already reduced, keeping LLM token costs manageable.

### How It Fits the Pipeline Architecture

URL Relevance Filter runs last in the Step 2 validation chain (sort_order 5). It represents the most sophisticated -- and most expensive -- pre-scrape validation available, which is exactly why it goes last:

1. **URL Deduplicator** → removes duplicates (no intelligence needed)
2. **URL Canonicalizer** → normalizes URL forms (rule-based transform)
3. **URL Pattern Filter** → removes structural junk (regex rules)
4. **URL Heuristics** → zero-cost rule-based URL scoring
5. **URL Relevance Filter** (this module) → classifies remaining URLs by content relevance (LLM intelligence)

The Strategic Architecture describes Step 2's intent: *"Save money and time by filtering out worthless URLs before fetching them."* And notes this is *"one of the steps where calibration has the highest financial impact."* Every URL removed here saves an HTTP request in Step 3 (Scraping) and potentially LLM tokens in Step 5 (Analysis & Generation).

### The Classification Approach

Rather than fetching page content (expensive), this module makes classification decisions from URL metadata alone:
- **URL slug** -- the path component plus query string (e.g., `/about/leadership`)
- **Link text** -- the anchor text from discovery (e.g., "Our Leadership Team"), included whenever present
- **Source location** -- where the link was found (nav, header, footer, body), included whenever present
- **Item metadata** (optional) -- extra fields like `title`, `company`, `location` from upstream modules, configured via `metadata_fields`

These signals are sent to an LLM in batches (up to 200 URLs per prompt by default) for classification as KEEP, MAYBE, or DROP. The prompt includes configurable criteria for what constitutes each category, tailored to the content type being produced. The `prompt_context` option controls the framing -- by default it's tuned for company profiles, but can be overridden for job search, news, or any other pipeline type.

### The Calibration Roadmap

The Raw Appendix described a learning progression:
1. **v1 (current):** Human reviews everything. Decisions logged. LLM-based classification with human override
2. **Next:** System analyzes logged decisions and proposes rules ("You've rejected 94% of URLs matching `/tag/*` -- auto-reject these?")
3. **Later:** Approved rules run in shadow mode. Rules matching human decisions 95%+ get promoted to automatic
4. **End-game:** Mature rules run automatically. New edge cases surface for human review

This module implements step 1 -- the LLM classifies, the operator reviews and overrides via the selectable UI, and every decision is part of the working pool's history.

## Strategy & Role

**Why this module exists:** Regex patterns catch structural junk, but content relevance requires understanding what a page is about. An LLM can classify URLs by their path and context -- without fetching the actual page content.

**Role in the pipeline:** Final pre-scrape gate. Uses AI to make judgment calls that rules can't: "Is `/blog/evolution-wins-ega-award` relevant to a company profile?" (Yes -- it's an award.) "Is `/blog/top-10-slot-games-2024` relevant?" (No -- it's editorial content about products, not the company.)

**Relationship to siblings:**
- **Runs after:** the rest of the Step 2 chain -- formally depends on URL Deduplicator and URL Pattern Filter, and sorts after URL Heuristics (works on the already-filtered set)
- **Final gate before Step 3:** URLs that pass this module go directly to scraping
- **All URLs returned:** Unlike dedup and pattern filter which only return flagged items, this module returns ALL URLs with a relevance classification -- the operator sees the full picture

## When to Use

**Always use when:**
- The URL pool still contains hundreds of URLs after dedup and pattern filtering
- You want AI-assisted curation before expensive scraping
- The content type has specific relevance criteria (company profiles need corporate pages, not product pages)

**Skip when:**
- The URL pool is small (< 50 URLs) and you can review manually
- You're scraping everything regardless of relevance (broad content collection)
- Cost is critical and you prefer manual review over LLM tokens

**Consider model selection:** Haiku (default) is cheapest and fast -- classification from URL slugs is a simple task. Switch to a stronger model (e.g. sonnet) only if too many relevant pages are being dropped. The model dropdown is populated from the shared LLM registry, so the available choices depend on the configured provider.

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `ai_model` (select, registry-driven) | `haiku` | Pick a stronger model (e.g. sonnet) when too many relevant pages are being dropped; stay on haiku otherwise -- slug classification is simple | Model quality vs cost trade-off. Values are populated by the skeleton from the shared LLM registry (`registry.models`), scoped to the default provider -- not a hardcoded list |
| `ai_provider` (select, registry-driven) | `anthropic` | Switch provider if you prefer another vendor or have budget constraints | Values come from the shared LLM registry (`registry.providers`): anthropic, openai, perplexity, gemini, openrouter |
| `keep_criteria` (textarea, presets) | `about pages, team, leadership, partnerships, integrations, products overview, services overview, awards, milestones, company news, investors, careers, pricing, contact, press releases, compliance, regulatory, case studies, interviews, expansion, acquisitions, funding, annual reports` | Customize for your content type. News pipelines should keep news/press pages. Profile pipelines should keep corporate pages | Defines what the LLM classifies as KEEP. Comma-separated page types. The more specific, the better the classification |
| `drop_criteria` (textarea, presets) | `seasonal campaigns, single game pages, how-to-play guides, promotional offers, holiday-themed content, affiliate landing pages` | Customize to exclude irrelevant content types. Add patterns specific to your vertical (game pages, bonus offers, tournament pages) | Defines what the LLM classifies as DROP. Helps the LLM make clear decisions on borderline cases |
| `confidence_threshold` (select) | `balanced` | Use `keep_most` when you'd rather scrape unnecessary pages than miss useful ones. Use `aggressive` when scraping budget is tight | Controls how the LLM handles uncertain URLs: keep_most → KEEP, balanced → MAYBE, aggressive → DROP. Unknown values fall back to balanced |
| `max_urls_per_prompt` (number, 10-500) | `200` | Lower to 50-100 for better per-URL accuracy; raise to 300-500 for faster/cheaper processing of large pools | Batch size per LLM call. Larger batches = fewer API calls but potentially less attention per URL |
| `metadata_fields` (json) | `[]` | Set to `["title", "company", "location"]` when items have useful metadata beyond the URL (e.g. from api-search) | Extra item fields included in the LLM prompt. The URL slug plus `link_text` and `source_location` (when present) are always sent; this adds more fields on top. Non-array values are treated as empty |
| `prompt_context` (textarea, presets) | `You are a URL relevance classifier for a company research content pipeline.` `Classify each URL based on its relevance for creating a comprehensive company profile.` (two lines) | Override when classifying for non-company-profile pipelines (job search, news, etc.) | Framing text at the top of the LLM prompt. Tells the model what kind of content is being filtered and what the entity represents. Empty values fall back to the same default |

The provider/model dropdowns are registry-driven: the manifest declares `values_from: registry.providers` / `registry.models`, and the skeleton fills in the actual choices from the shared LLM registry at load time. Adding a provider or model to the registry makes it available here without touching this module.

## Recipes

### Standard Company Profile
Balanced filtering for company profile research (matches the manifest defaults):
```
ai_model: haiku
ai_provider: anthropic
keep_criteria: about pages, team, leadership, partnerships, integrations, products overview, services overview, awards, milestones, company news, investors, careers, pricing, contact, press releases, compliance, regulatory, case studies, interviews, expansion, acquisitions, funding, annual reports
drop_criteria: seasonal campaigns, single game pages, how-to-play guides, promotional offers, holiday-themed content, affiliate landing pages
confidence_threshold: balanced
max_urls_per_prompt: 200
metadata_fields: []
prompt_context: [default]
```

### News Pipeline
Keep news and press content:
```
ai_model: haiku
ai_provider: anthropic
keep_criteria: news articles, press releases, company announcements, industry analysis, interviews, executive quotes, partnership announcements, regulatory updates, financial results, expansion news, acquisition news
drop_criteria: product pages, career listings, privacy policies, terms of service, login pages, contact forms, FAQ pages, documentation, how-to guides
confidence_threshold: keep_most
max_urls_per_prompt: 200
metadata_fields: []
prompt_context: "You are a URL relevance classifier for a news content pipeline.\nClassify each URL based on its relevance for industry news coverage."
```

### High-Accuracy (smaller batches, better model)
When accuracy matters more than speed:
```
ai_model: sonnet
ai_provider: anthropic
keep_criteria: [same as your content type]
drop_criteria: [same as your content type]
confidence_threshold: balanced
max_urls_per_prompt: 100
metadata_fields: []
prompt_context: [same as your content type]
```

### Job Search Pipeline
Classify job postings using item metadata (title, company, location) from api-search:
```
ai_model: haiku
ai_provider: anthropic
metadata_fields: ["title", "company", "location", "_score", "_signal"]
prompt_context: "You are a job relevance classifier for a recruitment pipeline.\nClassify each job posting based on its relevance for a senior marketing/leadership professional seeking iGaming industry roles."
keep_criteria: senior marketing roles, C-level (CMO, CCO, CPO, CGO), VP-level, Director-level, Head of department, iGaming/betting/casino industry, remote positions
drop_criteria: junior roles, intern positions, developer, engineer, sales, account manager, coordinator, designer, analyst, CRM specialist
confidence_threshold: aggressive
max_urls_per_prompt: 200
```

### Budget-Conscious (aggressive filtering)
Minimize scraping costs:
```
ai_model: haiku
ai_provider: anthropic
keep_criteria: [narrow -- only the most essential page types]
drop_criteria: [broad -- include anything borderline]
confidence_threshold: aggressive
max_urls_per_prompt: 300
metadata_fields: []
prompt_context: [same as your content type]
```

## Expected Output

**Healthy result:**
- Company profile pipeline: 40-60% KEEP, 10-20% MAYBE, 20-40% DROP
- News pipeline: 20-40% KEEP (news articles), 60-80% DROP (non-news pages)

**Output fields per URL:**
- `url` -- the URL being classified
- `link_text` -- anchor text from discovery (carried through from Step 1)
- `source_location` -- where the link was found (carried through from Step 1)
- `relevance` -- `KEEP`, `MAYBE`, or `DROP`
- `entity_name` -- which entity this URL belongs to

**Display behavior:** All URLs returned -- KEEP, MAYBE, and DROP. DROP items are flagged (shown in red) and auto-deselected. The operator reviews and can override any classification. The remove (➖) data operation means DROP items are excluded from the pool when approved.

**Red flags to watch for:**
- All MAYBE -- LLM couldn't parse the response, the AI call failed for that entity (check the entity's `error` field and `meta.errors`), or the prompt was ambiguous. Check the model and criteria
- All DROP -- criteria too aggressive, or the company only has pages that don't match your keep criteria. Broaden `keep_criteria` or switch to `keep_most` threshold
- Inconsistent results across batches -- batch size too large. Lower `max_urls_per_prompt`
- KEEP on obviously irrelevant URLs -- model too weak or `drop_criteria` not specific enough

## Limitations & Edge Cases

- **URL-only classification** -- Classifies based on URL path and metadata, not page content. A URL like `/solutions/platform` could be either a product page (DROP) or an overview page (KEEP). The LLM makes its best guess from the slug and link text
- **Batch processing** -- URLs are sent in batches. The LLM sees them as a numbered list, not individually. Very large batches (400+) may reduce per-URL attention
- **Fallback to MAYBE** -- If the LLM response can't be parsed for a URL (missing from response, malformed output), that URL defaults to MAYBE. If the AI call fails entirely for an entity, ALL its URLs default to MAYBE and the error is recorded. This ensures no URLs are lost -- the operator decides
- **Cost varies by model** -- Haiku is orders of magnitude cheaper than the top-tier models per batch. For 1,000 URLs at 200/batch = 5 LLM calls. At Haiku rates this is pennies; at premium-model rates it's dollars
- **No learning yet** -- Current implementation doesn't learn from operator overrides. The calibration roadmap (shadow mode → enforce mode) is future work. Currently, operator decisions are implicit in the working pool state
- **Prompt quality matters** -- The keep/drop criteria directly control classification quality. Generic criteria produce generic results. Industry-specific, content-type-specific criteria produce much better classifications
- **Unparseable URLs still classified** -- Items whose `url` doesn't parse as a URL are sent to the LLM as the raw string instead of a slug, not skipped

## What Happens Next

URLs classified as KEEP (and MAYBE, if the operator keeps them) proceed to **Step 3 (Scraping)** where actual page content is fetched and extracted. The relevance classification is not carried through to Step 3 -- it served its purpose as a pre-scrape gate.

The original Content Creation Master described this validation step as having "the highest financial impact" for calibration: *"If the system learns that URLs matching `/tag/*` from casino news sites are always junk, it can filter them automatically instead of wasting scraping budget."* Every run of this module generates implicit training data -- what the operator approves vs rejects -- that could feed future rule-based optimizations.

## Technical Reference

- **Step:** 2 (Validation), sort_order 5 -- runs last in Step 2
- **Category:** filtering
- **Cost:** medium -- 5-minute timeout tier (LLM calls per batch; run after the cheap filters have shrunk the pool)
- **Data operation:** remove (➖) -- items classified as DROP are removed from the working pool when approved; KEEP and MAYBE items remain
- **Pool precondition:** `requires_items` -- entities with an empty pool are marked `skipped_no_input` (not failed) and the module doesn't execute for them
- **Requires:** `url` field in input items (`requires_columns: ["url"]`)
- **Depends on:** `url-dedup`, `url-filter`
- **Input:** `input.entities[]` with `items[]` from the previous sibling's approved output
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `link_text`, `source_location`, `relevance`, `entity_name`, plus per-entity `meta` (total_found, kept, maybe, dropped, errors)
- **Selectable:** true -- operators can override any classification in the UI; `flagged_when: relevance = DROP`
- **Error handling:** If the LLM call fails for an entity, all its URLs default to MAYBE (nothing lost), the entity result carries an `error` field, and the run summary lists the error. Unparsed response lines default to MAYBE. Unknown `confidence_threshold` values fall back to balanced; empty `prompt_context` falls back to the default; non-array `metadata_fields` is treated as empty
- **Timeout resilience:** classified items are pushed to `tools._partialItems` per entity (both success and fallback paths), so a timeout doesn't destroy completed entities' results
- **Dependencies:** `tools.ai` (LLM completion), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== api-fetcher (step 3, v1.1.0) ===== -->

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

---

<!-- ===== api-scraper (step 3, v1.0.0) ===== -->

# API Scraper (ScrapFly)

> Paid API fallback for pages that failed both page-scraper and browser-scraper. Uses ScrapFly's Anti-Scraping Protection to bypass Cloudflare, Turnstile, and aggressive bot detection.

**Module ID:** `api-scraper` | **Step:** 3 (Scraping) | **Category:** scraping | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## Background

### The Content Problem This Solves

Some websites are so heavily protected that neither HTTP fetch (page-scraper) nor a headless browser (browser-scraper) can extract content. These sites use advanced anti-bot systems -- Cloudflare Turnstile, Akamai Bot Manager, DataDome, PerimeterX -- that detect and block automated requests regardless of the method used.

The first live flow test revealed 56% of pages failed extraction. Browser-scraper recovers many of these, but a subset remains stubbornly blocked. These are typically high-value gambling industry sites with enterprise-grade protection -- exactly the sites whose content matters most for company profiles.

ScrapFly solves this by routing requests through residential proxies with anti-fingerprinting and challenge-solving built in. It's a paid service (~30 credits per request with ASP + JS rendering), making it the most expensive scraping method -- but also the most reliable for protected sites.

### How It Fits the Pipeline Architecture

This is the third and final scraper in Step 3's chain:

```
page-scraper (HTTP + Readability) -- handles ~70% of sites (free)
    ↓ pages with status "error" or low word_count
browser-scraper (Playwright + Wayback) -- recovers ~15-20% (free, needs Playwright)
    ↓ pages still failing
api-scraper (ScrapFly API) -- recovers remaining hard cases (paid)
    ↓
Step 4 (content filtering)
```

The module uses the **transform (=)** data operation -- the same items go in and come out. Pages already scraped successfully are passed through unchanged. A page is re-scraped only if its status is `error`, `dead_link`, or `low_content`, its status is missing, its word_count is below `min_word_threshold`, or its existing text looks like a block page. Everything else passes through without consuming credits.

### Wayback Machine Fallback

Some ScrapFly failures fall back to the Wayback Machine -- fetching the most recent archived snapshot from web.archive.org via plain HTTP, a third tier of recovery at zero additional cost. The cascade fires on: empty/tiny responses, detected block pages, extractions below the word threshold, and thrown network/timeout errors. It does NOT fire on ScrapFly HTTP status errors (429 after retries, 402 out-of-credits, any >= 400), ScrapFly-reported target errors, or JSON parse failures -- those record an error for the URL immediately with no Wayback attempt.

### Safety Features

**Per-request 429 retry:** Each URL retries up to 3 times on HTTP 429, waiting 10s, 20s, then 30s between attempts, before being marked rate-limited.

**Circuit breaker:** If 3 consecutive URLs still end rate-limited after their retries, the module immediately stops scraping remaining URLs instead of burning through the entity timeout. Remaining URLs are marked as "Skipped -- ScrapFly rate limit circuit breaker."

**Global rate limiter:** A token-bucket limiter (default 10 requests/minute) ensures all concurrent workers stay within ScrapFly's account-level rate limits. This prevents 429 errors when processing multiple entities.

**Duplicate text detection:** If 3+ scraped pages return identical text content, they're demoted from "success" to "error" -- a sign that ScrapFly returned a block page that passed initial checks.

## Strategy & Role

**Why this module exists:** Last-resort content recovery for pages that all free methods failed on. Ensures the pipeline can extract content from even the most heavily protected sites, at the cost of API credits.

**Role in the pipeline:** Third scraper in Step 3. Complements page-scraper and browser-scraper by handling their remaining failures. Only processes items that still need scraping -- never wastes credits on already-successful pages.

**Relationship to other steps:**
- **Depends on:** browser-scraper (must run first to identify remaining failures)
- **Receives from working pool:** Same items as browser-scraper, but only re-scrapes failures
- **Feeds into Step 4:** Enriched content for filtering, language detection, and assembly

## Setup

Set the `SCRAPFLY_KEY` environment variable on the server:

```bash
# In your .env file on Hetzner
SCRAPFLY_KEY=scp-live-your-key-here
```

Then restart PM2: `pm2 restart all`

## When to Use

**Always use when:**
- page-scraper and browser-scraper have both run
- The pool still contains pages with errors, low word counts, or block page content
- Target sites include heavily protected gambling/fintech/enterprise sites

**Do not use when:**
- page-scraper and browser-scraper haven't run yet -- api-scraper processes their failures
- All pages already have sufficient content (the module detects this and passes everything through)
- You're out of ScrapFly credits (check dashboard at scrapfly.io)

**Consider settings carefully when:**
- Running many entities at once -- the rate limiter prevents 429s but slows throughput
- ScrapFly credits are limited -- lower concurrency and consider running fewer entities per batch
- Sites are in specific regions -- set `country` to match the site's target audience

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `min_word_threshold` | 50 | Raise to 100-200 to re-scrape marginal pages; lower to 20 for truly empty pages only | Only pages with word_count below this are re-scraped. Pages above are passed through unchanged |
| `max_content_length` | 50,000 chars | Raise to 100-200k for very long pages; lower to 20k for quick extraction | Truncates extracted text after this many characters |
| `concurrency` | 2 | Lower to 1 to minimize credit burn; raise to 3-4 if rate limits allow | Simultaneous ScrapFly API requests. Keep low -- each request costs credits |
| `request_timeout` | 45,000ms | Raise to 60-90s for very slow sites; lower to 30s for faster failures | Per-request API timeout. ScrapFly's challenge-solving can take 15-30s |
| `country` | (empty) | Set to `GB`, `US`, `MT` etc. if site geo-restricts content | Forces proxy to exit from a specific country. Leave empty for auto-selection |
| `requests_per_minute` | 10 | Raise to 20-30 on paid plans with higher limits; set to 0 to disable | Global rate limit across all workers. Prevents account-level 429 errors |

## Recipes

### Standard Recovery
Balanced for most use cases after browser-scraper:
```
min_word_threshold: 50
max_content_length: 50000
concurrency: 2
request_timeout: 45000
country: (empty)
requests_per_minute: 10
```

### Conservative (Limited Credits)
Minimize credit usage:
```
min_word_threshold: 30
max_content_length: 50000
concurrency: 1
request_timeout: 30000
country: (empty)
requests_per_minute: 10
```

### Aggressive Recovery
Re-scrape more pages including marginal ones:
```
min_word_threshold: 200
max_content_length: 50000
concurrency: 2
request_timeout: 60000
country: (empty)
requests_per_minute: 15
```

### UK Gambling Sites
Geo-targeted for UK-specific content:
```
min_word_threshold: 50
max_content_length: 50000
concurrency: 2
request_timeout: 45000
country: GB
requests_per_minute: 10
```

### High-Volume Batch (Paid Plan)
For paid plans with generous rate limits:
```
min_word_threshold: 50
max_content_length: 50000
concurrency: 3
request_timeout: 45000
country: (empty)
requests_per_minute: 30
```

## Cost

Each request uses ~30 ScrapFly credits (ASP + JS rendering). Plan costs:

| Plan | Credits/Month | ~Pages | Rate Limit |
|------|--------------|--------|------------|
| Free | 1,000 | ~33 | ~10 req/min |
| Discovery ($11) | 100,000 | ~3,300 | Higher |
| Startup ($59) | 1,000,000 | ~33,000 | Higher |

The `scrapfly_credits` field in output tracks actual consumption per URL. Note that a request returning a block page or a ScrapFly-reported target error can still consume credits -- the module logs and records these too, so trust the tracked totals over assumptions.

## Expected Output

**Healthy result:**
- 50-80% of previously-failed pages recovered with sufficient content
- Pass-through items unchanged from browser-scraper output
- Clear `scrape_method` markers showing which approach was used

**Output fields per URL:**
- `url` -- the original URL
- `final_url` -- the URL after any redirects
- `title` -- page title extracted from ScrapFly-rendered HTML
- `word_count` -- words in extracted text
- `content_type` -- HTTP content-type
- `status` -- `success`, `error`, or original status for pass-through items
- `error` -- error message if scraping failed (null for success)
- `text_preview` -- first 150 characters of extracted text
- `meta_description` -- from `<meta name="description">` tag
- `text_content` -- full extracted text (visible in detail view)
- `entity_name` -- which entity this URL belongs to
- `scrape_method` -- `scrapfly` (API-scraped), `wayback_after_api` (Wayback Machine fallback), or `passed_through` (kept from previous scraper). Failed items carry `scrapfly` regardless of which tier failed last
- `extraction_method` -- `readability`, `cms_dom`, `body_text`, `regex_fallback`, or `none`; pass-through items keep their previous value or show `original`
- `scrapfly_credits` -- credits consumed for this URL
- `possibly_truncated` -- boolean flag set when extracted text is shorter than og:description (potential incomplete rendering)

**Red flags to watch for:**
- All URLs returning 429 errors -- ScrapFly account is rate-limited or out of credits. Check dashboard
- Many "Skipped -- circuit breaker" errors -- rate limit was hit early. Wait and retry, or increase `requests_per_minute` if plan allows
- Recovery rate below 30% -- sites may have protection that even ScrapFly cannot bypass
- `scrape_method: "wayback_after_api"` on many results -- ScrapFly failed but Wayback recovered. Content may be outdated
- High credit consumption -- check `scrapfly_credits` totals. Each ASP request costs ~30 credits

## Limitations & Edge Cases

- **Requires SCRAPFLY_KEY env var** -- throws an error if not set. Must be configured on the server
- **Paid service** -- every API request costs credits. Monitor usage at scrapfly.io dashboard
- **Rate limits are account-wide** -- running multiple pipeline batches simultaneously will share the same rate limit. The `requests_per_minute` option helps but cannot coordinate across separate server processes
- **Circuit breaker is per-entity** -- the consecutive-429 counter resets between entities. A rate-limited batch should wait before retrying
- **Wayback Machine content may be stale** -- archived snapshots can be months or years old
- **Truncation detection is flag-only** -- after extraction, content length is compared against the `og:description` meta tag (only when that tag is 100+ chars). If the extracted text is shorter, the item is still returned as `success` -- best available content -- with `possibly_truncated: true` and an explanatory `error` note. It does NOT cascade to the Wayback Machine tier
- **Partial results on timeout** -- uses `_partialItems` to save each scraped result incrementally. If the module times out mid-batch, already-scraped pages are preserved in the pool rather than lost
- **Same extraction algorithm as other scrapers** -- uses Readability with CMS DOM and regex fallbacks. If content is genuinely minimal (redirect page, 404), no scraper will help
- **Block page detection** -- Cloudflare block pages and generic block text are detected and treated as failures. However, novel block page formats may not be caught
- **Duplicate text detection requires 3+ matches** -- if only 2 pages return the same block text, they won't be automatically demoted
- **Entity timeout** -- the expensive cost tier gets the longest per-entity timeout (30 min per the module contract). The rate limiter and circuit breaker are designed to stay within this, but very large URL sets may approach the limit

## What Happens Next

After api-scraper runs, the working pool contains the best available text content for every URL -- from page-scraper (HTTP), browser-scraper (Playwright/Wayback), or api-scraper (ScrapFly/Wayback). This enriched pool flows into **Step 4 (Filtering & Assembly)** where content is cleaned, deduplicated, language-detected, and assembled into source packages for generation.

The `scrape_method` field provides full transparency into which approach worked for each page, helping identify patterns (e.g., "all pages from domain X needed ScrapFly" or "ScrapFly couldn't bypass DataDome on domain Y").

## Technical Reference

- **Step:** 3 (Scraping)
- **Category:** scraping
- **Cost:** expensive
- **Data operation:** transform (=) -- same items enriched with scraped content
- **Pool precondition:** `requires_items` -- needs items in the pool for each entity; an entity with an empty pool is marked `skipped_no_input` rather than failed
- **Requires:** `url` field in input items, `SCRAPFLY_KEY` environment variable
- **Depends on:** browser-scraper (must run first)
- **Input:** `input.entities[]` with `items[]` from working pool
- **Output:** `{ results[], summary }` where results are grouped by entity_name
- **Selectable:** true -- operators can deselect failed/empty pages
- **Detail view:** `detail_schema` with header fields (url as link, title, status badge, word_count, scrape_method, extraction_method, scrapfly_credits) and expandable section (text_content as prose)
- **Error handling:** per-URL conditional fallback (ScrapFly API -> Wayback Machine for empty/tiny/block-page/below-threshold/thrown-network cases; HTTP status errors, ScrapFly target errors, and parse failures error immediately without Wayback). 429s retry 3x with 10/20/30s backoff; circuit breaker stops all workers after 3 consecutive rate-limited URLs. Rate limiter prevents 429s proactively. Missing `SCRAPFLY_KEY` or `tools.http` throws loudly at start
- **Dependencies:** `@mozilla/readability` (content extraction), `linkedom` (DOM parsing), `tools.http` (API calls + Wayback), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== browser-scraper (step 3, v1.1.0) ===== -->

# Browser Scraper

> Re-scrape pages that failed text extraction using a real browser (Playwright Chromium) to render JavaScript-heavy content.

**Module ID:** `browser-scraper` | **Step:** 3 (Scraping) | **Category:** scraping | **Cost:** expensive
**Version:** 1.1.0 | **Data Operation:** transform (=)

---

## Background

### The Content Problem This Solves

The page-scraper module (Step 3's primary scraper) uses HTTP fetch + Mozilla Readability to extract text content. This works for the majority of websites, but fails in two scenarios:

1. **JavaScript-heavy pages:** SPAs, React/Vue/Angular sites, and pages with dynamic content loading. These return valid HTTP 200 responses but contain minimal or no readable text because the actual content is rendered client-side.
2. **Cloudflare-protected sites:** Sites behind Cloudflare return HTTP 403 with a "Just a moment..." challenge page. Simple HTTP fetch cannot solve the JS challenge, resulting in zero extracted content.

The first live flow test revealed this as a critical problem: 151 of 270 pages (56%) were excluded as "too short" (word_count < 50). These are not junk pages -- they are the valuable, hard-to-get pages that make the tool worth using.

Beyond JavaScript rendering, some sites use Cloudflare protection or aggressive bot detection that returns HTTP 403 even to headless browsers. For these sites, the module includes a **Wayback Machine fallback** -- fetching the most recent archived snapshot from web.archive.org via plain HTTP, which bypasses all anti-bot measures entirely.

The original Content Creation Master planned for this split: *"Step 5c (Cheerio/static) -- default; static DOM render is enough"* and *"Step 5d (Playwright/JS) -- consent walls, JS-rendered content, stubborn DOM."* This module implements Step 5d -- the Playwright-based scraper that handles the pages the static scraper cannot, plus the Wayback Machine fallback for sites that block even headless browsers.

### How It Fits the Pipeline Architecture

This module runs **after** page-scraper in Step 3. It reads the working pool and partitions items with a **whitelist**: only items in a known-good state are passed through; everything else is re-scraped. Passed through unchanged:

- Items with `status: "success"`, at least `min_word_threshold` words, no boilerplate match, and no block-page text
- Items with `status: "skipped"` (non-HTML content like PDFs and images -- a browser render cannot help)

Everything else is re-scraped, including:

- Items with **no status** (from Step 1/2 submodules that only discovered URLs)
- Items with `status: "error"`, `"dead_link"`, or `"low_content"` (failures and thin pages from page-scraper)
- Items with `status: "success"` but fewer than `min_word_threshold` words (JS-rendered pages)
- Items with `status: "success"` but boilerplate-only content (3+ pages with identical text)
- Items with `status: "success"` but detected as Cloudflare/bot-blocker pages (2+ known block-page text markers)
- Items with any **unknown status** (e.g. `"unique"` from url-dedup) -- unknown defaults to re-scrape, not pass-through

Scraping uses a **3-tier fallback** approach:
1. **Browser fetch** (Playwright) -- renders JavaScript, waits for common content selectors, optionally auto-scrolls to trigger lazy-loaded content. Extracted text is checked for block-page markers and og:description truncation before being accepted as success
2. **Wayback Machine** -- if browser fails or returns a block page, fetches the archived snapshot from web.archive.org via plain HTTP
3. **Error** -- if both tiers fail, marks the item with the browser error

After the browser renders a page, **text extraction** runs its own 3-tier chain: (1) Mozilla Readability, (2) CMS-aware DOM extraction that strips noise elements (nav, footer, cookie banners, sidebars) and collects ALL matching content containers for WordPress, Elementor, Divi, WPBakery, semantic HTML, and generic CMS selectors, (3) regex fallback for HTML too malformed for DOM parsing, with plain body text as the last resort. A tier's output is accepted at 30+ words.

After all pages are scraped, a **post-scrape duplicate detection** pass runs: if 3+ browser-scraped pages return identical text content, they are demoted from success to error (catches any bot blocker regardless of wording -- Akamai, Imperva, DataDome, etc.).

This is the transform (=) data operation -- the same items go in and come out, but the previously-empty ones are now enriched with scraped content. The module adds a `scrape_method` field to every item: `browser`, `wayback`, or `passed_through`.

## Strategy & Role

**Why this module exists:** Recover content from pages that the static HTTP scraper could not extract -- whether due to JavaScript rendering, Cloudflare protection, or HTTP errors. Without this module, the pipeline loses the pages that matter most.

**Role in the pipeline:** Second-pass scraper in Step 3. Complements page-scraper by handling its failures. Re-scrapes items that have errors, no status, low word count, or boilerplate content. Passes everything else through untouched. Falls back to Wayback Machine when even the browser cannot reach a page.

**Relationship to other steps:**
- **Depends on:** page-scraper (must run first to identify failures)
- **Receives from Step 2:** Same working pool as page-scraper, but only re-scrapes low-content items
- **Feeds into Step 4:** Enriched content for filtering, language detection, and assembly

## When to Use

**Always use when:**
- page-scraper has already run and produced results
- The pool contains pages with errors, no status, low word counts, or boilerplate content
- Target sites include SPAs, React/Angular/Vue sites, Cloudflare-protected sites, or JavaScript-heavy platforms

**Do not use when:**
- page-scraper has not run yet -- browser-scraper reads the working pool from page-scraper
- All pages already have sufficient content (the module will detect this and pass everything through)

**Consider settings carefully when:**
- Server has limited memory -- reduce `concurrency` to 1-2 (each browser tab uses significant RAM)
- Pages are very slow SPAs -- increase `request_timeout` to 30-60 seconds
- You want to re-scrape more aggressively -- raise `min_word_threshold` to 100-200 to catch more marginal pages
- Target sites have no lazy-loaded content -- disable `auto_scroll` to save ~3-6 seconds per page

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `request_timeout` | 20,000ms | Raise to 30-60s for slow SPAs; lower to 10s for known-fast sites | Per-page browser rendering timeout. SPAs may need 15-30 seconds to finish loading |
| `wait_for_network_idle` | true | Set to false for faster but less reliable scraping of pages that continuously make requests | Waits until no network requests for 500ms. Slower but ensures SPA content is fully loaded |
| `min_word_threshold` | 50 | Raise to 100-200 to catch more marginal pages; lower to 20 if you only want truly empty pages | Only pages with word_count below this are re-scraped. Pages above are passed through unchanged. Also the success bar for re-scraped pages |
| `max_content_length` | 50,000 chars | Raise to 100-200k for very long pages; lower to 20k for quick extraction | Truncates extracted text after this many characters |
| `concurrency` | 4 | Lower to 1-2 on memory-constrained servers; raise toward the max of 8 only on powerful machines | Number of browser tabs running simultaneously. Each tab uses significant memory |
| `auto_scroll` | true | Set to false when target sites have no lazy-loaded content and you want speed | Scrolls through the page before extraction to trigger lazy-loaded content. Adds ~3-6 seconds per page |

The most impactful option is `min_word_threshold`: it controls both which pages get re-scraped AND what counts as a successful re-scrape. The most common mistake is running high `concurrency` on a small server -- each Playwright tab is a real Chromium page, and OOM kills lose the whole batch (partial results are saved, but the run still fails).

## Recipes

### Standard Recovery
Balanced for most use cases after page-scraper:
```
request_timeout: 20000
wait_for_network_idle: true
min_word_threshold: 50
max_content_length: 50000
concurrency: 4
auto_scroll: true
```

### Aggressive Recovery
Re-scrape more pages including marginal ones:
```
request_timeout: 30000
wait_for_network_idle: true
min_word_threshold: 200
max_content_length: 50000
concurrency: 2
auto_scroll: true
```

### Memory-Constrained Server
Minimize resource usage:
```
request_timeout: 20000
wait_for_network_idle: true
min_word_threshold: 50
max_content_length: 50000
concurrency: 1
auto_scroll: true
```

### Fast Pass
Quick re-scrape without network-idle waits or scrolling:
```
request_timeout: 15000
wait_for_network_idle: false
min_word_threshold: 50
max_content_length: 50000
concurrency: 4
auto_scroll: false
```

## Expected Output

**Healthy result:**
- 40-70% of previously-failed pages recovered with sufficient content
- Pass-through items unchanged from page-scraper output
- Clear `scrape_method` markers showing which approach was used

**Output fields per URL:**
- `url` -- the original URL
- `final_url` -- the URL after any redirects (from browser navigation)
- `title` -- page title extracted from browser-rendered HTML
- `word_count` -- words in extracted text
- `content_type` -- `text/html` for scraped pages, null on total failure
- `status` -- `success`, `error`, or original status for pass-through items
- `error` -- error message if browser scraping failed (null for success)
- `text_preview` -- first 150 characters of extracted text
- `meta_description` -- from `<meta name="description">` tag
- `og_description` -- from `<meta property="og:description">` tag (used for truncation detection)
- `text_content` -- full extracted text (visible in detail view, downloadable as .txt)
- `entity_name` -- which entity this URL belongs to
- `scrape_method` -- `browser` (re-scraped by Playwright), `wayback` (fetched from Wayback Machine archive), or `passed_through` (kept from page-scraper)
- `extraction_method` -- `readability`, `cms_dom`, `regex_fallback`, or `none` (which text extraction tier produced the content); `original` for pass-through items that carry no extraction marker of their own

**Results are grouped by entity** with per-entity meta: `total`, `browser_scraped`, `browser_success`, `passed_through`, `errors`, `total_words`, `extraction_methods` (count per extraction tier -- useful for spotting how much content came from fallback tiers).

**Red flags to watch for:**
- Recovery rate below 30% -- sites may need longer timeouts or have non-standard rendering
- High error count among browser-scraped pages -- check if sites are blocking headless browsers (Wayback Machine fallback should catch most of these)
- Many `scrape_method: "wayback"` results -- site is heavily protected; content is recovered but may be outdated
- Many `extraction_method: "regex_fallback"` results -- pages are serving malformed HTML; spot-check the extracted text quality
- Pages still showing 0 words after all tiers -- content may be behind authentication or loaded via WebSocket
- "Duplicate text across N pages" errors -- post-scrape duplicate detection caught a bot blocker page. These items flow to the api-scraper for retry with ScrapFly ASP

## Limitations & Edge Cases

- **Requires Playwright on the server** -- throws an error immediately if `tools.browser.fetch` is not available
- **Memory-intensive** -- each concurrent browser tab uses significant RAM. Several concurrent tabs on a 2GB server can cause OOM
- **Does not handle cookie consent banners** -- banner elements are stripped from the extracted DOM, but content hidden behind an "Accept cookies" overlay will not be extracted
- **Does not handle login walls** -- pages requiring authentication are out of scope
- **Truncation detection** -- after browser extraction, content length is compared against the `og:description` meta tag (when that tag is 100+ chars). If the extracted text is no longer than the og:description, the page is treated as a browser failure (likely truncated/incomplete rendering) and falls through to the Wayback Machine tier
- **Partial results on timeout** -- pass-through items are saved to `_partialItems` immediately, and each scraped result is saved as it completes. If the module times out mid-batch, already-scraped pages are preserved in the pool rather than lost
- **3-tier extraction chain** -- Readability first, then CMS-aware DOM selectors (WordPress, Elementor, Divi, WPBakery, semantic/generic containers), then a regex fallback with body text as last resort. If the content is genuinely minimal (e.g., a redirect page, a 404), browser rendering will not help
- **Sort order:** results are sorted by status -- errors first, then skipped, then success. Pass-through items keep their original status and sort within it
- **Block page detection (two layers)** -- (1) Extracted text is checked against known Cloudflare markers (2+ marker matches required, to avoid false positives) before returning success; if detected, falls through to Wayback Machine. The same check runs on input items so block pages that slipped through page-scraper as "success" get re-scraped. (2) After all scrapes finish, if 3+ pages returned identical text, they are demoted to error regardless of wording (catches any bot blocker). Both layers prevent block pages from passing through as false successes to the api-scraper
- **Re-scrapes all failed items** -- items with no status, `error`, `dead_link`, `low_content`, unknown status, low word count, boilerplate content, or detected block-page text are all attempted. The Wayback Machine fallback means even HTTP 403 pages have a chance of content recovery
- **Wayback tier requires `tools.http`** -- if the HTTP tool is unavailable, a browser failure is final
- **Wayback Machine content may be stale** -- archived snapshots can be months or years old. Content from Wayback is still valuable for analysis but may not reflect the current state of the page

## What Happens Next

After browser-scraper runs, the working pool contains the best available text content for every URL -- from page-scraper (passed through), Playwright browser rendering, or Wayback Machine archive. This enriched pool flows into **Step 4 (Filtering & Assembly)** where content is cleaned, deduplicated, language-detected, and assembled into source packages for generation.

The `scrape_method` field allows operators to see exactly which approach worked for each page, providing transparency into the extraction pipeline and helping identify patterns (e.g., "all pages from domain X needed browser scraping" or "Cloudflare-protected site recovered via Wayback Machine").

## Technical Reference

- **Step:** 3 (Scraping)
- **Category:** scraping
- **Cost:** expensive -- long execution timeout class; one full Playwright render per re-scraped page
- **Data operation:** transform (=) -- same items enriched with scraped content
- **Pool precondition:** `requires_items` -- entities with an empty pool are marked `skipped_no_input` (not failed) before enqueue; run page-scraper first
- **Requires:** `url` field in input items
- **Depends on:** page-scraper (must run first)
- **Input:** `input.entities[]` with `items[]` from page-scraper's working pool
- **Output:** `{ results[], summary }` where results are grouped by entity_name, each with `items[]` containing all output fields plus `scrape_method`; summary includes `browser_attempted`, `browser_success`, `errors`, `passed_through`, `extraction_methods`, and a human-readable `description`
- **Browser fetch settings:** waits for common content selectors (`article, main, [role="main"], .entry-content, .post-content`), honors `wait_for_network_idle` and `auto_scroll` options
- **Selectable:** true -- operators can deselect failed/empty pages
- **Flagged rows:** items with `status` of `error` or `timed_out` are flagged in the UI
- **Detail view:** `detail_schema` with header fields (url as link, title, status badge, word_count, scrape_method, extraction_method) and expandable section (text_content as prose); `text_content` downloadable as .txt
- **Error handling:** per-URL fallback chain (browser -> Wayback Machine -> error). Each tier is independent; failure in one tier triggers the next. All errors are caught per page; other pages continue processing
- **Dependencies:** `@mozilla/readability` (content extraction), `linkedom` (DOM parsing), `tools.browser` (Playwright), `tools.http` (Wayback Machine fallback), `tools.logger`, `tools.progress`, `tools._partialItems` (timeout resilience)
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== linkedin-post-scraper (step 3, v1.2.0) ===== -->

# LinkedIn Post Scraper

> Fetch recent LinkedIn posts via the Profile API. Three modes: `posts` (Voyager, personal profiles), `post_engagers` (Voyager + commenter data), `feed_posts` (DOM scraping for company pages, groups, and personal feeds).

**Module ID:** `linkedin-post-scraper` | **Step:** 3 (Scraping) | **Category:** linkedin | **Cost:** medium
**Version:** 1.2.0 | **Data Operation:** add (+)

---

## What This Module Does

This module takes LinkedIn profile slugs (from entity fields or prior linkedin-profile-scraper output) and fetches their recent posts. Each post includes the full text, engagement metrics (reactions, comments, reshares), hashtags, mentions, post type, and reshare detection.

The module delegates all LinkedIn interaction to the **LinkedIn Profile API** (`localhost:3847`), the same service used by linkedin-profile-scraper. It calls the `/api/posts/:slug` endpoint which uses LinkedIn's internal Voyager GraphQL API (`voyagerFeedDashProfileUpdates`).

```
Seed CSV with linkedin column / linkedin-profile-scraper output
    |  entity linkedin_url or pool items with linkedin_url
linkedin-post-scraper (this module)
    |  calls Profile API GET /api/posts/:slug?count=N
    |  structured post data with engagement metrics
content-filter (Step 4) / content-analyzer, content-writer (Step 5)
```

### Architecture

1. Health check via `GET /api/health` -- verifies Profile API is running and LinkedIn session is active
2. Collect profile slugs from entity fields or prior scraper output (deduplicated)
3. For each profile: `GET /api/posts/:slug?count=N` -- returns recent posts with engagement data
4. Filter posts by minimum word count (skip image-only or link-only posts)
5. Rate limit with jitter between API calls to avoid LinkedIn detection
6. Circuit breaker: 3 consecutive failures aborts remaining profiles

### Server Setup Requirements

Same as linkedin-profile-scraper:
1. **Profile API** running as PM2 process (`pm2 show profile-api`) on port 3847
2. **Chrome** running with `--remote-debugging-port=9222`
3. **Active LinkedIn session** -- manual login via noVNC required

### Safety Features

**Health check:** Before scraping, verifies the Profile API is reachable and the LinkedIn session is active. If unhealthy, returns error items for all profiles immediately.

**Circuit breaker:** If 3 consecutive profiles fail, all remaining profiles get error items without making further API calls. Prevents burning rate-limit budget on a dead session.

**Rate limiting:** Enforces minimum interval between requests (default: 3 min at 20/hr) plus random jitter (0-3s) to avoid detection patterns.

**Deduplication:** If multiple entities share the same LinkedIn slug, the profile is only fetched once.

---

## When to Use

**Run when:**
- You have entities with `linkedin` or `linkedin_url` fields pointing to personal profiles
- You need post content for content analysis, topic discovery, or engagement benchmarking
- You want to understand what topics/hashtags a person posts about

**Skip when:**
- Entities don't have LinkedIn profile URLs
- You only need profile data (bio, experience) -- use linkedin-profile-scraper instead
- Profile API is not running on the server

**Tune the settings when:**
- Scraping 50+ profiles -- lower rate to 10-15/hr for safety
- Posts are mostly image-heavy (short captions) -- lower `min_word_count` to 0-5
- You need deep topic analysis -- raise `posts_per_profile` to 20-25

**Note:** `posts` and `post_engagers` modes work with **personal profiles only** (`/in/` URLs). Company pages return 403 from Voyager. Use `feed_posts` mode for company pages and groups -- it uses DOM scraping instead.

### post_engagers Mode (v1.1.0)

Extends `posts` mode by fanning out to fetch commenter data for each post. For every post fetched, makes 1 additional API call to get commenters via `GET /api/post-comments/:activityId`.

- Posts are sorted by `engagement_total` descending before fan-out -- the most-engaged posts get processed first
- Each post gets an `engagers` object with `commenters[]`, `reactors[]` (empty), `resharers[]` (empty), and `completeness` metadata
- **Reactors unavailable:** LinkedIn removed the reactions list modal (SDUI migration, May 2026). Reaction counts are still available from the feed response, but individual reactor identities are permanently unavailable.
- **Resharers unavailable:** LinkedIn Voyager has no list-resharers endpoint
- API cost: 1 call per profile (posts) + 1 call per post (comments) = `1 + posts_per_profile` calls per profile

### feed_posts Mode (v1.2.0)

Scrapes posts from company pages, group feeds, or personal activity feeds using DOM scraping via CDP. Does **not** use Voyager, so it works where Voyager returns 403.

- Entity `linkedin`/`linkedin_url` accepts `/company/`, `/groups/`, and `/in/` URLs
- Auto-detects feed type from the URL. Bare slugs (no URL) need an explicit `feed_type` field on the entity (`company`, `group`, or `profile`) -- invalid values skip the entity with a warning
- Always reads from entity fields -- the `source` option is ignored in this mode (`profile_scraper` is posts/post_engagers only)
- Each feed costs 1 API call but takes 30-120s (Chrome scrolls to load posts)
- Supports up to 200 posts per feed
- Output includes: post text, engagement counts, reaction type icons, post format, shared article info, hashtags, author info

---

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `mode` | `posts` | Use `post_engagers` when you need commenter data; use `feed_posts` for company pages or groups | Scraping mode: `posts` (Voyager), `post_engagers` (Voyager + commenters), `feed_posts` (DOM scraping) |
| `posts_per_profile` | 10 | Raise to 15-25 for deeper analysis; lower to 3-5 for quick sampling. feed_posts supports up to 200 | Number of recent posts to fetch per profile/feed. Voyager modes cap at 25, feed_posts at 200 |
| `engagers_per_post` | 50 | Lower for faster runs; raise to 100 for thorough commenter capture | Max commenters to fetch per post (post_engagers mode only). Each post costs 1 extra API call |
| `requests_per_hour` | 20 | Lower to 10-15 for safety; raise to 30-40 for faster throughput (riskier) | Minimum time between API calls. 20/hr = ~3 min between profiles |
| `min_word_count` | 10 | Set to 0 to include image-only posts; raise to 25+ for text-heavy posts only | Skip posts with fewer words (filters link shares, image posts with short captions) |
| `source` | `entity_field` | Switch to `profile_scraper` if entities don't have linkedin fields but linkedin-profile-scraper has already run | Where to find LinkedIn slugs. `entity_field` reads entity.linkedin/linkedin_url. `profile_scraper` reads from pool items (posts/post_engagers only) |

**Most impactful option:** `posts_per_profile` -- at 10 posts x 20 profiles = 200 items. At 25 posts x 20 profiles = 500 items. More posts = richer data but longer runtime.

---

## Recommended Configurations

### Standard
For a curated list of iGaming executives with linkedin fields:
```
posts_per_profile: 10
requests_per_hour: 20
min_word_count: 10
source: entity_field
```

### Deep Analysis
When you need comprehensive post history for content analysis:
```
posts_per_profile: 25
requests_per_hour: 20
min_word_count: 5
source: entity_field
```

### Quick Sample
When you just need a few recent posts per profile:
```
posts_per_profile: 3
requests_per_hour: 30
min_word_count: 0
source: entity_field
```

### Post Engagers (Influencer Analysis)
For mapping who engages with key influencers' posts:
```
mode: post_engagers
posts_per_profile: 5
engagers_per_post: 50
requests_per_hour: 20
min_word_count: 0
source: entity_field
```
**Note:** Each profile costs `1 + posts_per_profile` API calls. With 5 posts × 20 profiles = 120 calls (~6 hours at 20/hr).

### Company Page / Group Feed (News Index)
For scraping B2B iGaming publication feeds (the News-Section engagement analysis):
```
mode: feed_posts
posts_per_profile: 100
requests_per_hour: 20
min_word_count: 5
source: entity_field
```
Entity linkedin fields should be company page or group URLs like:
- `https://www.linkedin.com/company/nextdotio/`
- `https://www.linkedin.com/groups/12345678/`

### From Profile Scraper Output
When using linkedin-profile-scraper output as the slug source:
```
posts_per_profile: 10
requests_per_hour: 20
min_word_count: 10
source: profile_scraper
```

---

## What Good Output Looks Like

**Healthy result:**
- `status`: `success`
- `word_count`: 20-500 (typical LinkedIn post)
- `engagement_total`: > 0 (reactions + comments + reshares)
- `post_type`: `text`, `article`, `image`, `carousel`, `video`, `poll`
- `hashtags`: populated array for posts that use hashtags

**Output fields:**
- `post_id` -- LinkedIn's internal post ID (unique key)
- `linkedin_slug` -- the profile slug this post belongs to
- `author_name` -- display name from the profile
- `posted_at` -- ISO timestamp as returned by the Profile API (extracted from LinkedIn's Snowflake ID)
- `post_type` -- `text`, `article`, `image`, `carousel`, `video`, `poll`, `reshare`, `unknown`
- `text` -- full post text content
- `text_preview` -- first 200 characters (for table display)
- `word_count` -- number of words in the post
- `reactions_count` -- likes/celebrates/supports/etc
- `comments_count` -- number of comments
- `reshares_count` -- number of reposts
- `engagement_total` -- reactions + comments + reshares
- `hashtags` -- array of hashtag strings (without #)
- `mentions` -- array of mentioned profile slugs
- `is_reshare` -- whether this is a repost of someone else's content
- `original_author_slug` -- if reshare, the original author's slug
- `source_type` -- `linkedin_post` (posts/post_engagers modes) or the feed type `company`/`group`/`profile` (feed_posts mode)
- `found_via` -- which scraper path produced this item: `linkedin_post_scraper` (posts), `linkedin_post_engager_scraper` (post_engagers), `linkedin_feed_scraper` (feed_posts)
- `engagers` -- (post_engagers mode only) object with `commenters[]`, `reactors[]`, `resharers[]`, and `completeness` metadata. Each commenter has `slug`, `name`, `headline`, `comment_text`, `commented_at`, `likes`
- `status` -- `success` or `error`
- `error` -- error message if status is error, null otherwise

**feed_posts-only fields:** `post_url`, `author_slug`, `source_slug`, `posted_at_activity`, `has_image`/`has_video`/`has_document`/`has_poll`, `reaction_types_visible` (which reaction icons appear, not per-type counts), `mentioned_companies` (people mentions stay in `mentions`), `shared_article_url`, `shared_article_title`

**Warning signs:**
- `voyager_status: "session_expired"` in summary (posts mode; other modes say "API unavailable" in the description) -- re-login via VNC
- All profiles returning errors -- Profile API down or Chrome not running
- Many posts filtered (0 posts with >= N words) -- lower `min_word_count` or profiles post mostly images
- Circuit breaker triggered -- 3+ consecutive failures, likely session issue

---

## Cost

**Free.** Uses the authenticated Chrome session via the Profile API -- no paid API calls. Only cost is compute time (~2-5 seconds per profile for the API call).

**Throughput by mode:**

*posts mode* (1 API call per profile):
| Rate | Profiles/Hour | 20 Profiles | 50 Profiles |
|------|---------------|-------------|-------------|
| 10/hr (conservative) | 10 | ~2 hours | ~5 hours |
| 20/hr (default) | 20 | ~1 hour | ~2.5 hours |
| 30/hr (fast) | 30 | ~40 min | ~1.7 hours |

*post_engagers mode* (1 + posts_per_profile calls per profile):
| Posts/Profile | 20 Profiles @ 20/hr | 50 Profiles @ 20/hr |
|---------------|---------------------|---------------------|
| 5 posts | ~6 hours (120 calls) | ~15 hours (300 calls) |
| 10 posts | ~11 hours (220 calls) | ~27.5 hours (550 calls) |

*feed_posts mode* (1 call per feed, but 30-120s per call):
| Feeds | Time @ 20/hr |
|-------|-------------|
| 10 feeds | ~30 min - 1 hour (dominated by DOM scraping time) |
| 20 feeds | ~1-2 hours |

---

## Limitations

- **posts/post_engagers: personal profiles only** -- company page posts return 403 from Voyager. Use `feed_posts` mode for company/group feeds.
- **feed_posts: slower** -- DOM scraping takes 30-120s per feed (vs ~2-5s for Voyager). Budget accordingly.
- **feed_posts: reaction breakdown limited** -- DOM shows which reaction types are present but not per-type counts. Total reaction count is accurate.
- **No fallback API** -- unlike linkedin-profile-scraper, there is no paid fallback when scraping fails
- **Rate limited by design** -- sequential, one profile at a time with enforced delays
- **Post count varies** -- LinkedIn may return fewer posts than requested for some profiles
- **Voyager queryId rotation** -- LinkedIn periodically rotates the GraphQL queryId. When posts return 404/400, use the discovery script on Hetzner to find the new queryId (see Profile API README)
- **Reshare text** -- for reshared posts, the `text` field contains the resharer's commentary, not the original post content
- **feed_posts: no reshare detection** -- `is_reshare` is always `false` and `original_author_slug` always null in feed_posts mode; reshare detection is Voyager-only

---

## What Happens Next

Post data flows into **Step 4 (content-filter / intent-tagger)** which can use post topics and engagement signals to assess entity relevance. In **Step 5 (content-analyzer / content-writer)**, post data provides:

- **Topic discovery** -- hashtags and post text reveal what topics a person is active in
- **Engagement benchmarking** -- reaction/comment counts show which topics resonate with their audience
- **Voice & tone reference** -- actual post text shows how a person communicates, useful for content-writer tone matching
- **Recency signals** -- `posted_at` timestamps show how active someone is on LinkedIn

The `text` field is stored via `downloadable_fields` in `submodule_run_item_data`, so downstream modules that declare `requires_columns: ["text"]` will receive the full post content on demand without it bloating the pool.

---

## Technical Reference

- **Step:** 3 (Scraping)
- **Category:** linkedin
- **Cost tier:** medium -- 5-minute execution timeout; budget feed_posts runs accordingly (30-120s per feed)
- **Data operation:** add (+) -- produces new post items
- **Pool precondition:** `requires_items` -- entities whose pool is empty are marked `skipped_no_input` (not failed) and this module does not run for them; entities with pool items proceed normally
- **Item key:** `post_id`
- **Required input columns:** none (`requires_columns: []`)
- **Depends on:** none (reads from entity fields by default)
- **Input:** `input.entities[]` with `linkedin` or `linkedin_url` field
- **Output:** `{ results[], summary }` grouped by entity_name
- **Selectable:** true -- operators can pick which posts to carry forward
- **Detail view:** header (post_id, status badge, author_name, post_type, posted_at, word_count, engagement_total, reactions, comments) + section (Post Content as prose)
- **External dependencies:** `tools.http` (Profile API calls), `tools.logger`, `tools.progress`, `tools._partialItems`
- **Environment variables:** `LINKEDIN_API_URL` (default `http://localhost:3847`), `LINKEDIN_API_KEY` (default `oig-pipeline-2026`)

---

<!-- ===== linkedin-profile-scraper (step 3, v1.2.0) ===== -->

# LinkedIn Scraper

> Scrape LinkedIn profiles (bio/company_people modes) or enrich pool items with full LinkedIn job descriptions (job_description mode) via the LinkedIn Profile API.

**Module ID:** `linkedin-profile-scraper` | **Step:** 3 (Scraping) | **Category:** linkedin | **Cost:** expensive
**Version:** 1.2.0 | **Data Operation:** add (+) for profiles, transform (=) behavior in job_description mode

---

## What This Module Does

This module takes LinkedIn profile URLs and extracts complete professional data -- full job descriptions with tasks and results, education history, skills, languages, and the About summary. The output feeds into downstream content generation (Step 4/5) to produce biographical articles, "People to Know" features, leadership spotlights, and "Key People" sections in company profiles.

The module delegates all LinkedIn interaction to the **LinkedIn Profile API** (`localhost:3847`), a dedicated service that manages the CDP connection to an authenticated Chrome instance and calls LinkedIn's internal Voyager REST API. This submodule is a thin HTTP client -- it calls the API, maps the response, and formats the output.

The Profile API uses a real GUI Chrome instance that was manually authenticated (solving CAPTCHAs interactively via VNC), so LinkedIn trusts the session. The API handles CDP connection pooling, Chrome auto-recovery, and structured logging.

When the primary method fails (expired session, API unavailable), the module falls back to the **ScrapeLinkedIn API** ($0.01/profile) -- a paid service that uses its own AI agent to scrape profiles.

```
Seed CSV / linkedin-discovery (Step 1)
    ↓ entities with linkedin column
linkedin-profile-scraper (this module)
    ↓ calls Profile API (localhost:3847)
    ↓ structured profile data
content-analyzer (Step 4) → content-writer (Step 5) → biographical articles
```

### Architecture

1. Health check via `GET /api/health` -- verifies Profile API is running and LinkedIn session is active
2. For each profile: `GET /api/profile/{slug}` -- returns structured profile JSON (name, positions, education, skills, etc.)
3. For each job: `GET /api/job/{jobId}` -- returns raw Voyager job posting data
4. Rate limit to ~3 min between API calls (20/hour default) with random jitter
5. Map API response to submodule output format (completeness scoring, text formatting)

### Server Setup Requirements

1. **Profile API** running as PM2 process (`pm2 show profile-api`) on port 3847
2. **Chrome** running with `--remote-debugging-port=9222` (managed by profile-api's auto-recovery)
3. **Manual LinkedIn login** -- connect via noVNC (`http://server:6080/vnc.html`), open LinkedIn, complete CAPTCHA, reach the feed
4. Chrome stays running between module runs -- sessions last weeks/months

### Safety Features

**Health check:** Before scraping, calls `/api/health` to verify the Profile API is running and has an active LinkedIn session. If unhealthy, skips Voyager entirely and routes all profiles to the ScrapeLinkedIn fallback.

**Circuit breaker:** If 3 consecutive profiles fail, the module stops API calls and queues all remaining profiles for the ScrapeLinkedIn fallback. Prevents burning time on a dead session. In `job_description` mode the circuit breaker also fires after 3 consecutive failures, but there is no fallback -- remaining jobs are marked `status: "error"` with "Aborted (circuit breaker)".

**No fallback in job_description mode:** ScrapeLinkedIn only covers profiles. If the Profile API health check fails in `job_description` mode, the module returns immediately with every item marked `status: "error"` ("LinkedIn Profile API unavailable") -- a loud fail, not a silent pass-through.

**Completeness scoring:** Every scraped profile gets a 0-100 score based on which sections were captured. Profiles scoring below 50 are flagged as "incomplete" in the results.

## When to Use

**Always run when:**
- You have entities with `linkedin_url` fields (from seed CSV or linkedin-discovery)
- You need biographical data for content generation -- executive profiles, people directory, leadership spotlights
- You're building company profiles that need "Key People" sections

**Skip when:**
- Entities don't have LinkedIn profile URLs (this module requires `linkedin` column)
- You only need company-level data -- use the LinkedIn Company Scraper (B015) instead
- Profile API is not running on the server (`pm2 show profile-api`)

**Tune the settings when:**
- Scraping more than 50 profiles -- consider lowering rate to 15/hr for safety
- Running during business hours on a shared LinkedIn account -- lower rate to 10/hr
- Budget is a concern -- disable `fallback_to_scrapelinkedin` to avoid paid API costs

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `requests_per_hour` | 20 | Lower to 10-15 if LinkedIn shows warnings; raise to 30-40 for faster throughput (riskier) | Minimum time between page loads. 20/hr = ~3 min between profiles. LinkedIn may flag accounts above 50/hr |
| `mode` | `bio` | Switch to `company_people` for employee profiles from B015, or `job_description` to enrich LinkedIn job URLs with full descriptions | `bio` = scrape personal profile. `company_people` = scrape employee profiles. `job_description` = enrich pool items with full LinkedIn job text |
| `max_profiles_per_entity` | 5 | Raise to 10-15 for comprehensive company coverage; lower to 2-3 for quick executive-only scraping | Only used in `company_people` mode. Limits how many employee profiles to scrape per company entity |
| `fallback_to_scrapelinkedin` | true | Disable if you don't have API credits or prefer to retry later with a fresh session | When Voyager fails for a profile, tries ScrapeLinkedIn API ($0.01/profile). Requires `SCRAPELINKEDIN_API_KEY` env var |

**Most impactful option:** `requests_per_hour` directly controls throughput vs. detection risk. At 20/hr, a batch of 100 profiles takes ~5 hours. At 40/hr it takes ~2.5 hours but increases the chance of LinkedIn flagging the account.

## Recommended Configurations

### Standard (Bio Mode)
For scraping a curated list of iGaming executives:
```
requests_per_hour: 20
mode: bio
max_profiles_per_entity: 5
fallback_to_scrapelinkedin: true
```

### Conservative
When using a personal LinkedIn account or scraping during business hours:
```
requests_per_hour: 10
mode: bio
max_profiles_per_entity: 5
fallback_to_scrapelinkedin: true
```

### Fast Batch
When using a dedicated scraping account and need results quickly:
```
requests_per_hour: 40
mode: bio
max_profiles_per_entity: 5
fallback_to_scrapelinkedin: true
```

### Company People
When enriching company profiles with executive bios (entities are companies with B015 employee links):
```
requests_per_hour: 20
mode: company_people
max_profiles_per_entity: 5
fallback_to_scrapelinkedin: true
```

### No-Cost Only
When ScrapeLinkedIn credits are unavailable or you want zero spend:
```
requests_per_hour: 20
mode: bio
max_profiles_per_entity: 5
fallback_to_scrapelinkedin: false
```

### Job Description Scraping
When enriching LinkedIn job URLs from csv-discovery with full job descriptions:
```
requests_per_hour: 20
mode: job_description
```
Input: pool items with `url` containing `linkedin.com/jobs/view/{jobId}`. The module extracts the job ID, calls the Voyager job API, and enriches each item with `text_content` (full description), `workplace_type`, `employment_type`, `seniority_level`, etc. Non-LinkedIn items pass through unchanged.

## What Good Output Looks Like

**Healthy result for a well-populated profile:**
- `completeness_score`: 80-100
- `experience_count`: 5-15 positions with full descriptions
- `education_count`: 2-4 entries
- `skills_count`: 10-50
- `scrape_method`: `voyager` (primary method succeeded)
- `status`: `success`

**Output fields:**
- `linkedin_url` -- the profile URL (unique key)
- `full_name` -- first and last name from profile
- `headline` -- LinkedIn headline text
- `location` -- resolved geographic location (e.g., "Stockholm, Stockholm County, Sweden")
- `summary` -- full About section text
- `experience_count` -- number of positions captured
- `experience_text` -- formatted text of all positions with dates and descriptions
- `education_count` -- number of education entries
- `education_text` -- formatted education entries
- `skills_count` -- number of skills captured
- `skills_text` -- comma-separated skills list
- `languages_text` -- comma-separated languages (if available in profile)
- `certifications_text` -- comma-separated certifications
- `volunteer` -- structured array of volunteer experience objects
- `volunteer_text` -- formatted volunteer experience text
- `completeness_score` -- 0-100 quality score
- `scrape_method` -- `voyager` (primary) or `scrapelinkedin` (fallback)
- `status` -- `success`, `incomplete` (score < 50), or `error`
- `positions` -- structured array of position objects (for downstream content generation)
- `education` -- structured array of education objects
- `skills`, `languages`, `certifications` -- arrays for downstream use

**Warning signs:**
- `voyager_status: "session_expired"` in summary -- the Chrome browser session has expired. Re-login via VNC: connect to noVNC, navigate to LinkedIn, complete CAPTCHA, reach the feed
- All profiles showing `scrape_method: "scrapelinkedin"` -- Voyager failed completely, likely expired session or Chrome not running
- `completeness_score` below 50 on multiple profiles -- either profiles are genuinely thin, or the scraper is being blocked
- `status: "error"` with "Profile API unavailable" -- the profile-api PM2 process is down or Chrome is not running. Check `pm2 show profile-api`

## Cost

**Primary method (CDP + Voyager API):** Free. Uses an authenticated Chrome session -- no API charges. Only cost is compute time (~2-3 seconds per profile for API call).

**Fallback (ScrapeLinkedIn API):** $0.01 per profile ($10 per 1,000). Only used when Voyager fails. Expected fallback rate is <5% under normal conditions (healthy session, reasonable rate).

**Throughput:**
| Rate | Profiles/Hour | Profiles/Day | 100 Profiles |
|------|---------------|--------------|--------------|
| 10/hr (conservative) | 10 | 240 | ~10 hours |
| 20/hr (default) | 20 | 480 | ~5 hours |
| 40/hr (fast) | 40 | 960 | ~2.5 hours |

## Limitations

- **Requires Profile API running** -- the `profile-api` PM2 process must be running on port 3847, with Chrome authenticated to LinkedIn
- **Requires VNC setup** -- TigerVNC + noVNC must be installed on the server for manual LinkedIn login (CAPTCHA solving)
- **One profile at a time** -- no concurrency. LinkedIn tracks API calls and concurrent sessions look suspicious
- **Rate limited by design** -- 20 profiles/hour is intentionally slow. Faster rates risk account restrictions
- **Skills may not appear** -- the `FullProfileWithEntities-109` decoration doesn't always include skills. Depends on LinkedIn's current API behavior
- **Private profiles** -- returns empty positions/education. Marked as `status: "incomplete"` with low completeness score
- **ScrapeLinkedIn fallback is non-deterministic** -- uses an AI agent that sometimes misses sections. Known to return incomplete data
- **Company_people mode depends on upstream** -- requires employee profile URLs from B015 company scraper or seed CSV with employee links
- **GDPR consideration** -- profiles of public figures (CEOs, founders) fall under Legitimate Interest. Published content should include an attribution link back to the LinkedIn profile (stored in `linkedin_url`)

## What Happens Next

The structured profile data flows into **Step 4 (content-analyzer)** which assesses the data quality and prepares it for generation. Then **Step 5 (content-writer)** transforms the raw profile data into polished biographical content -- articles, leadership spotlights, "People to Know" features, or "Key People" sections in company profiles.

The `positions` and `education` arrays provide structured data that content-writer can selectively emphasize -- e.g., highlighting iGaming-relevant roles, recent positions, or notable companies. The `experience_text` and `education_text` fields provide pre-formatted text that can be used directly or as source material.

For company profiles, executive data from this module populates the "Key People" section, giving readers context about leadership background and career trajectory.

## Technical Reference

- **Step:** 3 (Scraping)
- **Category:** linkedin
- **Cost:** expensive -- 30 min timeout, 1 retry, low BullMQ priority
- **Data operation:** add (+) -- produces new profile items from entity URLs. `job_description` mode behaves as a transform (returns the entity's existing pool items with LinkedIn job items enriched in place)
- **Pool precondition:** `requires_items` -- the skeleton checks the pool per entity before enqueueing; an entity with an empty pool gets `skipped_no_input` (not `failed`) and other entities proceed normally
- **Required input columns:** none declared (`requires_columns: []`). Per mode, the code reads: `bio` -- `entity.linkedin` or `entity.linkedin_url` (entities without one are skipped with a warning); `company_people` -- `entity.employees` or `entity.employee_profiles` (array of URLs or objects); `job_description` -- pool item `url` fields containing `linkedin.com/jobs/view/`
- **Depends on:** none (runs independently in Step 3, alongside other scrapers)
- **Input:** `input.entities[]` -- entity fields for profile modes, `entity.items[]` for job_description mode (see required input columns above)
- **Output:** `{ results[], summary }` grouped by entity_name
- **Selectable:** false -- all profiles are generally wanted
- **Detail view:** header (linkedin_url as link, full_name, headline, location, status badge, completeness_score, scrape_method) + sections (About, Experience, Education, Skills as prose)
- **Error handling:** health check → per-profile API call with circuit breaker (3 consecutive failures) → ScrapeLinkedIn fallback → error. Partial success supported. `job_description` mode: health-check failure or circuit breaker marks items `error` directly -- no fallback exists for jobs
- **External dependencies:** `tools.http` (Profile API + ScrapeLinkedIn API calls), `tools.logger`, `tools.progress`, `tools._partialItems`
- **Environment variables:** `LINKEDIN_API_URL` (optional, defaults to `http://localhost:3847`), `LINKEDIN_API_KEY` (optional, defaults to `oig-pipeline-2026`), `SCRAPELINKEDIN_API_KEY` (optional, for fallback)
- **Server infrastructure:** Profile API on port 3847 (PM2), TigerVNC on `:1`, noVNC on port 6080, Chrome with `--remote-debugging-port=9222`

---

<!-- ===== page-scraper (step 3, v1.0.0) ===== -->

# Page Scraper

> Fetch HTML pages and extract readable text content from validated URLs.

**Module ID:** `page-scraper` | **Step:** 3 (Scraping) | **Category:** scraping | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## Background

### The Content Problem This Solves

After Steps 1 and 2, the pipeline has a curated pool of URLs -- discovered, deduplicated, filtered, and classified as relevant. But URLs are just addresses. To build company profiles, generate news articles, or create any content, the system needs the actual *text* on those pages. Step 3 is where the pipeline goes from knowing *where* to look to knowing *what's there*.

The original Content Creation Master described two scraping approaches:
- **Step 5c (Cheerio/static)** -- "default; static DOM render is enough." Fast, cheap, handles most websites
- **Step 5d (Playwright/JS)** -- "consent walls, JS-rendered content, stubborn DOM." Slower, heavier, for JavaScript-heavy sites

And recommended a split strategy: *"You now have two distinct scraper nodes (5c Cheerio, 5d Playwright) you can develop/tune separately and route to via logic from Step 4 and a domain policy."*

This module implements the static-fetch approach using Mozilla Readability (the same algorithm behind Firefox Reader Mode) with a CMS-aware regex fallback. It handles the majority of websites via plain HTTP. The JavaScript-heavy and bot-protected cases it cannot handle cascade to the other Step 3 scrapers.

### How It Fits the Pipeline Architecture

This is the first scraper in Step 3's three-scraper chain (`sort_order: 1`):

```
page-scraper (HTTP + Readability) -- handles most sites (free)
    ↓ pages with status error / low_content
browser-scraper (Playwright + Wayback) -- JS rendering, Cloudflare challenges
    ↓ pages still failing
api-scraper (ScrapFly API) -- paid last resort for hard-blocked sites
    ↓
Step 4 (content filtering)
```

It uses the **transform (=)** data operation -- the same URLs go in, but come out enriched with text content, titles, word counts, and metadata. No URLs are removed; instead, failed/skipped URLs are marked with status fields so operators can review them and downstream scrapers can retry them.

### Mozilla Readability: Why This Extraction Method

The module uses `@mozilla/readability` -- the algorithm that powers Firefox's Reader Mode. When you click the "Reader View" button in Firefox, this is the code that strips navigation, ads, sidebars, and boilerplate to extract just the article content.

Why Readability over simple regex:
- **Content identification** -- Readability uses scoring heuristics to identify the main content area, not just `<main>` or `<article>` tags
- **Boilerplate removal** -- Automatically strips navigation, ads, cookie banners, sidebars, and repeated elements
- **Battle-tested** -- Used by millions of Firefox users daily. Handles edge cases that simple extraction misses

When Readability can't parse the page (or extracts under 50 characters), the module falls back to regex-based extraction with CMS/page-builder awareness. Fallback priority: `<main>` → `<article>` → CMS content selectors → `<body>`. The CMS selectors cover WordPress (`entry-content`, `post-content`, `page-content`), Elementor (text-editor and theme-post-content widgets), ARIA `role="main"`, and other common patterns (`content-area`, `site-content`, `#content`) -- page builders like Elementor, Divi, and WPBakery often don't use semantic HTML, and without these selectors the fallback would grab the whole `<body>` including nav and footer.

### The Cost-Awareness Design

The module is classified as **expensive** -- every URL requires an HTTP request and content extraction. The options are designed with cost and rate-limit control in mind:
- `concurrency` -- how many URLs are fetched simultaneously; the main speed lever
- `delay_between_requests` -- a delay budget spread across workers to avoid hammering target servers
- `request_timeout` -- prevents hanging on unresponsive servers
- `max_content_length` -- prevents memory issues from extremely large pages
- `skip_non_html` -- gracefully handles PDFs, images, and other non-HTML content types

The original Content Creation Master recommended include/exclude globs for the scraper: *"Include globs: `*about*|*company*|*products*|*solutions*`... Exclude globs: `*privacy*|*terms*|*login*`"*. In the current architecture, this filtering happens in Step 2 (before scraping), not during scraping -- which is more cost-efficient since it prevents requests entirely rather than fetching and discarding.

## Strategy & Role

**Why this module exists:** Transform URLs into readable text content. This is the bridge between knowing where to look (Step 1-2) and having material to work with (Steps 4-5). Every downstream content generation step depends on the quality of extraction here.

**Role in the pipeline:** First scraper in Step 3. Enriches the URL pool with actual page content -- title, text, word count, metadata. Does not filter or remove URLs; marks failures for operator review and for re-scraping by browser-scraper/api-scraper.

**Relationship to other steps:**
- **Receives from Step 2:** Validated, deduplicated, relevance-filtered URLs
- **Feeds into browser-scraper:** Pages marked `error` or `low_content` are re-scraped with a real browser
- **Feeds into Step 4:** Scraped content for filtering, language detection, and assembly
- **Quality here determines quality everywhere downstream:** Poor extraction → poor LLM generation → poor profiles

## When to Use

**Always use when:**
- You need actual page content for downstream processing
- The URL pool has been validated in Step 2

**Consider settings carefully when:**
- Processing many URLs (500+) -- raise `concurrency` for speed, or raise `delay_between_requests` if targets rate-limit
- Scraping sites known to be JavaScript-heavy -- this module won't render JS; its `low_content`/`error` markings hand those pages to browser-scraper, so run it anyway as the cheap first pass
- Working with non-English content -- extraction works on any language but `max_content_length` may need adjusting for character-dense languages

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `request_timeout` | 10000 | Raise to 20-30s for slow servers; lower to 5s for fast, reliable sites | Per-URL HTTP timeout in ms. Too low = missed pages. Too high = long waits on dead servers |
| `max_content_length` | 50000 | Raise to 100-200k for very long pages (academic papers, legal docs); lower to 20k for quick extraction | Truncates extracted text (chars) after HTML stripping. 50k chars ≈ 8,000-10,000 words, enough for most pages |
| `delay_between_requests` | 500 | Raise to 1-2s for rate-sensitive sites; lower to 0-100ms for your own domains or sites you're confident about | Total delay budget (ms) spread across workers -- with 8 workers and 500ms, each worker waits ~62ms between its requests (50ms minimum stagger). With `concurrency: 1` the full delay applies between requests |
| `concurrency` | 8 | Raise toward 20 for large URL sets (100+); lower to 1-2 for rate-limited or fragile sites | Number of URLs fetched simultaneously by a worker pool. Higher = faster but may trigger rate limiting |
| `skip_non_html` | true | Set to false if you want non-HTML responses to be marked as errors instead of "skipped" | PDFs, images, downloads marked as "skipped" (neutral) vs "error" (red). Skipped items are visible but not alarming |
| `extract_meta` | true | Disable to save minor processing time if you don't need meta descriptions | Extracts `<meta name="description">` tag. Useful for quick content preview without reading full text |

The two options that interact are `concurrency` and `delay_between_requests`: the delay is divided by the worker count, so raising concurrency both adds parallel requests AND shortens each worker's pause. For rate-sensitive targets, lower `concurrency` first -- it is the stronger lever.

## Recipes

### Standard Scraping
Balanced for most use cases:
```
request_timeout: 10000
max_content_length: 50000
delay_between_requests: 500
concurrency: 8
skip_non_html: true
extract_meta: true
```

### Fast Scraping (trusted sites)
When you control the target or trust it won't rate-limit:
```
request_timeout: 5000
max_content_length: 50000
delay_between_requests: 100
concurrency: 12
skip_non_html: true
extract_meta: true
```

### Gentle Scraping (rate-sensitive sites)
For sites that are known to rate-limit or block scrapers:
```
request_timeout: 20000
max_content_length: 50000
delay_between_requests: 2000
concurrency: 2
skip_non_html: true
extract_meta: true
```

### Deep Content Extraction
For very long pages where you need maximum text:
```
request_timeout: 15000
max_content_length: 200000
delay_between_requests: 500
concurrency: 8
skip_non_html: true
extract_meta: true
```

## Expected Output

**Healthy result:**
- 80-95% success rate (most validated URLs return content)
- Average 500-3,000 words per successfully scraped page
- 5-15% errors (timeouts, non-HTML, server errors)

**Output fields per URL:**
- `url` -- the original URL
- `title` -- page title (from `<title>` → og:title → first `<h1>`)
- `word_count` -- words in extracted text
- `content_type` -- HTTP content-type header (e.g., `text/html`)
- `status` -- `success`, `error`, `skipped`, or `low_content`
- `error` -- error message if status is error/skipped/low_content (null for success)
- `text_preview` -- first 150 characters of extracted text (for quick table review)
- `meta_description` -- from `<meta name="description">` tag
- `og_description` -- from `<meta property="og:description">` (on parsed HTML pages; used as the truncation signal)
- `text_content` -- full extracted text (visible in detail view, downloadable as .txt)
- `final_url` -- the final URL after any redirects (currently same as input due to tools.http limitation)

Results are sorted problems-first (errors → skipped → low_content → success) so issues surface at the top of the table.

**Detail view:** Each item has an expandable detail view showing the full `text_content` as prose and the `meta_description` -- allowing operators to quickly assess extraction quality.

**Red flags to watch for:**
- Low word counts (< 50 words) on pages that should have content → extraction may have failed to identify the main content area
- High error rate (> 30%) → site may be blocking requests, requiring authentication, or serving JavaScript-only content
- Many "skipped" items → URLs pointing to non-HTML resources (PDFs, images). Check if Step 2 filtering should have caught these
- All titles null → site doesn't use `<title>` tags or uses JavaScript to set them (SPA)
- "Cloudflare block page detected" errors → site is behind Cloudflare bot protection. These pages are correctly marked as errors so the browser-scraper can retry them with Playwright

## Limitations & Edge Cases

- **Boilerplate detection** -- After all pages are scraped, a post-scrape pass checks for duplicate content within each domain. If 3+ pages from the same domain share identical `text_content`, they are demoted from `success` to `low_content` -- the scraper likely extracted footer/nav/legal boilerplate instead of the real article. These pages are picked up by browser-scraper for re-extraction
- **`low_content` status** -- Pages get `low_content` status (instead of `error`) in three cases: (1) JavaScript-truncated content detected (body text shorter than a 100+ char og:description on a page with 50+ words -- the static HTML only carried partial SSR content), (2) word count below 50, or (3) boilerplate duplicate detected. `low_content` signals browser-scraper to re-try the page while keeping the partial content available for review
- **Partial results on timeout** -- Uses `_partialItems` to save each scraped result incrementally. If the module times out mid-batch, already-scraped pages are preserved in the pool rather than lost
- **Cloudflare/bot-blocker detection** -- Extracted text is checked against known Cloudflare block page markers (e.g., "Why have I been blocked", "Cloudflare Ray ID"). Pages matching 2+ markers are marked as `status: 'error'` with `error: 'Cloudflare block page detected'` so the browser-scraper can retry them. This prevents block pages (which can carry 80-100 words) from passing through as false successes
- **No JavaScript rendering** -- This is the static-fetch scraper from the original vision. JavaScript-rendered pages return empty or minimal content and get marked `low_content`/`error` -- browser-scraper (Playwright), next in the Step 3 chain, handles *"consent walls, JS-rendered content, stubborn DOM"*
- **No authentication** -- Cannot scrape pages behind login walls. The Raw Appendix identified this as a separate concern: *"Consent/JS detection: If typical consent elements or missing DOM content after a light fetch → set `needs_playwright=true`"*
- **Redirect tracking limited** -- `tools.http.get` follows redirects automatically but doesn't expose the final URL. Content is correct but `final_url` always shows the original URL
- **Rate limiting is per-pipeline** -- `delay_between_requests` is a budget shared across this run's workers; it doesn't coordinate across multiple pipeline runs. Running two pipelines simultaneously doubles the request rate
- **Content truncation is hard** -- `max_content_length` truncates at a character boundary, which may cut mid-sentence or mid-word. Downstream modules should handle partial text gracefully
- **Title extraction priority** -- Uses `<title>` first, then og:title, then first `<h1>`. Some sites have misleading `<title>` tags (e.g., "Home | Company Name" instead of the actual page title)

## What Happens Next

Scraped content enters the working pool enriched with `text_content`, `title`, `word_count`, and `meta_description`. Pages marked `error` or `low_content` are re-scraped by **browser-scraper** (and, if still failing, **api-scraper**) before the pool moves on. Successful content flows into **Step 4 (Filtering & Assembly)** where it is cleaned, deduplicated at the content level, language-detected, and assembled into source packages for generation.

The original Content Creation Master described Step 7 (now Step 4) as: *"Drop <100 words. Deduplicate exact + near duplicate. Strip boilerplate. Tag critical intents: About; Products/Solutions; Press; Partners; Careers; Contact. Adaptive Page Cap: base cap = 12 pages, expand up to 25 if signals justify."*

The `word_count` field from this module directly feeds the minimum word count filter. The `text_content` enables content-level deduplication (Jaccard similarity) and intent tagging. The quality of extraction here determines the quality of everything downstream through the pipeline.

## Technical Reference

- **Step:** 3 (Scraping)
- **Category:** scraping
- **Cost:** expensive -- longest timeout tier; every URL is a network request
- **Data operation:** transform (=) -- same items enriched with scraped content
- **Pool precondition:** `requires_items` -- needs URLs in the pool; entities with an empty pool are marked `skipped_no_input` rather than failed
- **Requires:** `url` field in input items (`requires_columns: ["url"]`)
- **Depends on:** nothing -- runs first in Step 3 (`sort_order: 1`)
- **Input:** `input.entities[]` with `items[]` from Step 2 working pool (grouped format) or flat URL list
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `title`, `word_count`, `content_type`, `status`, `error`, `text_preview`, `meta_description`, `og_description`, `text_content`, `final_url`, plus per-entity `meta` counts (total, success, low_content, errors, skipped, total_words)
- **Concurrency:** worker pool of `min(concurrency, URL count)` workers sharing one queue; each worker staggers by `delay_between_requests / concurrency` (50ms minimum)
- **Selectable:** true -- operators can deselect failed/empty pages
- **Flagged statuses:** `dead_link`, `error`, `skipped`, `low_content` (per `flagged_when`; `dead_link` is set by later scrapers on the shared pool, not by this module)
- **Detail view:** `detail_schema` with header fields (url as link, title, status, word_count) and expandable sections (text_content as prose, meta_description as text); `text_content` downloadable as .txt
- **Error handling:** HTTP errors, timeouts, and non-HTML content are handled per-URL (partial success pattern). No URL is lost -- all are returned with a status. Each result is pushed to `tools._partialItems` for timeout resilience
- **Dependencies:** `@mozilla/readability` (content extraction), `linkedom` (DOM parsing), `tools.http`, `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== boilerplate-stripper (step 4, v1.0.0) ===== -->

# Boilerplate Stripper

> Removes navigation menus, cookie banners, footer disclaimers, and repeated boilerplate from scraped text so downstream LLM steps work from clean source material.

**Module ID:** `boilerplate-stripper` | **Step:** 4 (Filtering) | **Category:** filtering | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

Scraped web pages carry significant amounts of boilerplate -- navigation menus, cookie banners, footer disclaimers, newsletter signup CTAs, social sharing widgets, and copyright notices. This text is identical (or near-identical) across every page on a site and adds no informational value. If passed to downstream LLM steps, it wastes tokens, confuses classifiers, and degrades content quality.

The Boilerplate Stripper removes this noise using two complementary strategies. First, **cross-page fingerprinting**: it groups all scraped pages belonging to the same entity, splits each page into text blocks (paragraphs), hashes them, and identifies blocks that appear on a configurable fraction of pages. Blocks that show up on 50%+ of pages are almost certainly navigation, headers, or footers -- not article content. Second, **known-pattern matching**: a curated list of common boilerplate phrases (cookie consent, GDPR notices, newsletter CTAs, social sharing prompts, navigation artifacts) catches boilerplate even on single-page entities where cross-page analysis is impossible. Pattern matching only applies to blocks between `min_block_length` and 300 characters -- a long paragraph *discussing* a privacy policy or terms of service is substantive content, not boilerplate, and is never pattern-stripped.

The module outputs the same items it receives with all input fields preserved, `text_content` cleaned, `word_count` recalculated, and new fields (`stripped_chars`, `boilerplate_ratio`, `flagged`) added. **Over-stripping is self-correcting:** if cleaning would leave an item below `min_content_ratio` of its original length, the item is flagged AND its original text is restored -- downstream steps always receive usable content, never a gutted page. Flagged items report `stripped_chars: 0` and `boilerplate_ratio: 0` because nothing was actually removed.

```
page-scraper (Step 3) -> BOILERPLATE STRIPPER -> Step 5 generation modules
```

## When to Use

**Always run when:**
- Scraped content comes from real websites (Step 3 scrapers). Boilerplate in scraped text is the norm, not the exception.
- Downstream steps feed `text_content` into LLMs -- every stripped block is tokens saved on every later call.

**Skip when:**
- Your source already produces clean text (e.g., API responses that were never HTML, structured feeds).
- Text was extracted by a reader-mode algorithm you trust to have removed chrome already.

**Tune the settings when:**
- Entities have many pages (5+): lower `frequency_threshold` toward 0.3 for more aggressive cross-page stripping.
- Entities are single-page: only known-pattern stripping applies -- tune `strip_known_patterns` and `min_block_length`, the frequency options are inert.
- Many items come back flagged: raise `frequency_threshold` or `min_block_length` so less is stripped in the first place.

## Options Guide

| Option | Default | Type | When to Change | What It Does |
|--------|---------|------|----------------|--------------|
| `frequency_threshold` | 0.5 | number (0.3--1.0) | Lower toward 0.3 for aggressive stripping on heavy-boilerplate sites; raise toward 1.0 to be conservative | Fraction of an entity's pages a block must appear on to be considered boilerplate. At 0.5, a block appearing on half or more pages is stripped. Two-page entities always require 100% (both pages) regardless of this setting. |
| `min_block_length` | 20 | number (5--100) | Raise if short legitimate content is being stripped | Minimum characters (after normalization) for a block to be fingerprinted or pattern-matched. Shorter blocks are ignored by both strategies -- too small to identify reliably. |
| `min_content_ratio` | 0.3 | number (0.1--0.9) | Lower if you expect genuinely heavy boilerplate (0.4+ ratios); raise if you want the safety net to trip earlier | The over-strip guard. If cleaned content would fall below this fraction of original length, the item is flagged and its **original text is kept** -- the stripping is reverted for that item, not just marked. |
| `strip_known_patterns` | true | boolean | Disable if known patterns are removing legitimate content | When enabled, removes blocks matching common boilerplate phrases (cookie banners, GDPR, newsletter CTAs, social sharing, navigation artifacts, copyright lines) regardless of cross-page frequency. Only applies to blocks of `min_block_length`--300 characters. |

The most impactful option is `frequency_threshold` -- it drives nearly all stripping on multi-page entities. The most misunderstood is `min_content_ratio`: it is a revert-and-flag guard, not a marker. Setting it high (0.7+) means moderately boilerplate-heavy pages get NO cleaning at all, because the guard trips and restores the original text.

## Recommended Configurations

### Standard
For most pipeline runs with default entities:
```json
{
  "frequency_threshold": 0.5,
  "min_block_length": 20,
  "min_content_ratio": 0.3,
  "strip_known_patterns": true
}
```

### Conservative
When you are worried about removing real content:
```json
{
  "frequency_threshold": 0.8,
  "min_block_length": 40,
  "min_content_ratio": 0.5,
  "strip_known_patterns": false
}
```

### Aggressive
Heavy boilerplate sites, many pages per entity:
```json
{
  "frequency_threshold": 0.3,
  "min_block_length": 10,
  "min_content_ratio": 0.15,
  "strip_known_patterns": true
}
```

## What Good Output Looks Like

**Typical boilerplate_ratio ranges:**
- 0.00--0.05: Very little boilerplate found (already clean, single-page entity with no pattern matches, or a flagged item -- flagged items always report 0)
- 0.05--0.20: Normal range for well-structured sites
- 0.20--0.40: Heavy boilerplate -- common for sites with large navs, mega-menus, extensive footers
- 0.40+: Unusually high -- verify real content survived; anything higher would normally trip the `min_content_ratio` guard

The run summary reports pages cleaned, total characters stripped, average boilerplate percentage, and the flagged count.

**Output fields per item** (all input fields are preserved; these are updated or added):

| Field | Type | Description |
|-------|------|-------------|
| `url` | string | The page URL (unchanged from input) |
| `text_content` | string | Cleaned text with boilerplate removed -- or the untouched original text if the item was flagged |
| `word_count` | number | Recalculated word count for the final text |
| `stripped_chars` | number | Characters removed; 0 for flagged items (stripping was reverted) |
| `boilerplate_ratio` | number | Fraction of original content removed (0.0--1.0); 0 for flagged items |
| `flagged` | boolean | True if cleaning would have cut content below `min_content_ratio` -- original text was kept, shown as a badge in the item detail view |

Cleaned `text_content` is downloadable per item as a `.txt` file ("Cleaned Text").

**Warning signs:**
- **Many flagged items** -- stripping is too aggressive for this entity set; those items received NO cleaning. Raise `frequency_threshold` or `min_block_length`, or lower `min_content_ratio` if the heavy stripping is actually correct.
- **boilerplate_ratio near 0 across a multi-page entity** -- the scraper may be emitting text without double-newline paragraph breaks, so no blocks can be isolated. Inspect a raw `text_content` and check the upstream scraper.
- **Log line "single page -- cross-page analysis skipped"** on entities you expected to have many pages -- upstream discovery/scraping delivered fewer pages than expected; only pattern matching ran.
- **Log warning "Skipping entity with no items and no url"** -- an upstream module produced a malformed entity; it passes through unprocessed.

## Limitations

- **Single-page entities** get pattern matching only -- no cross-page fingerprinting is possible. If the entity has unusual boilerplate that does not match known patterns, it will not be caught.
- **Two-page entities** use a 100% frequency threshold (both pages must have the block). This is deliberately conservative to avoid stripping content that happens to appear on both pages legitimately.
- **Block boundary sensitivity**: the module splits on double newlines. If the scraper outputs boilerplate glued to real content in a single paragraph (no newline separation), the boilerplate will not be isolated and will survive stripping.
- **Pattern matching caps at 300 characters**: boilerplate blocks longer than 300 characters (e.g., a full-length legal footer paragraph) are never pattern-stripped -- only cross-page fingerprinting can catch them.
- **Pattern list is English-only**: the known boilerplate patterns are English phrases. Non-English boilerplate will only be caught by cross-page fingerprinting.
- **No semantic analysis**: the module uses text frequency and substring matching, not LLM classification. It cannot distinguish a legitimately repeated paragraph (e.g., a company tagline on every page) from boilerplate.
- **Empty pages pass through empty**: items with no `text_content` are emitted with empty text, `word_count: 0`, and `flagged: false` -- they are not dropped and not flagged.

## What Happens Next

After boilerplate stripping, the cleaned `text_content` flows to Step 5 (Generation) where LLMs classify, summarize, and generate content from the source material. Cleaner input text means fewer wasted tokens, more accurate classification, and higher-quality generated content. Flagged items still carry their full original text, so downstream steps are never starved -- but their content is uncleaned, which is worth remembering when reviewing generation quality for those entities.

## Technical Reference

- **Step:** 4 (Filtering)
- **Category:** filtering
- **Cost tier:** cheap -- 2-minute timeout; pure in-memory transform, no network I/O or LLM calls
- **Data operation:** transform (=) -- same items in, same items out with cleaner text; keyed by `url`
- **Pool precondition:** `requires_items` -- entities with an empty pool are skipped (`skipped_no_input`), not failed
- **Required input columns:** `text_content`
- **Depends on:** `page-scraper`
- **Input format:** `entity.items[]` with `url` + `text_content`; a flat entity carrying its own `url` acts as a single item; entities with neither are skipped with a logged warning
- **Output format:** input items spread through with cleaned `text_content`, recalculated `word_count`, plus `stripped_chars`, `boilerplate_ratio`, `flagged`; per-entity meta reports `total`, `boilerplate_blocks_found`, `total_stripped_chars`, `flagged`
- **Error handling:** no network I/O, so no retries or circuit breakers; the `min_content_ratio` guard reverts over-stripped items to their original text; every processed item is pushed to `tools._partialItems`, so a timeout or abort preserves partial results; the summary `errors` array is always empty
- **External dependencies:** none -- djb2 string hash implemented inline, no npm packages, no env vars
- **Algorithm details:** blocks split on double newlines; normalization = lowercase + collapse whitespace + trim; per-page dedupe before counting so a block repeated within one page counts once; cross-page threshold `ceil(pageCount * frequency_threshold)` with special handling for 1-page (skip fingerprinting) and 2-page (require 100% match) entities; known-pattern window is `min_block_length`--300 normalized characters

---

<!-- ===== content-filter (step 4, v1.0.0) ===== -->

# Content Filter (optional)

> Optional safety-net pass that removes low-quality scraped pages -- failed scrapes, stubs, non-English content, leftover junk URLs -- before generation. Most checks overlap with Step 2 validation and Step 3 scraping, so skip it unless you need an extra pass.

**Module ID:** `content-filter` | **Step:** 4 (Filtering) | **Category:** filtering | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** remove (-)

---

## Background

### The Content Problem This Solves

After Step 3 (Scraping), the pipeline has actual page content -- text, titles, word counts. But not all scraped content is usable. Some pages failed to scrape (timeouts, server errors). Some returned near-empty content (stub pages, JavaScript-only renders). Some are in the wrong language. Some are pages that slipped through Step 2 validation -- cookie policies, login pages, WordPress admin paths.

Feeding low-quality or irrelevant content into the LLM generation step (Step 5) wastes tokens and produces worse output. The original Content Creation Master described this as the "second quality gate" -- the first being pre-scrape validation in Step 2 (now Step 4 in the old numbering):

> *"Purpose: Clean up raw scraped content before handing it to the LLM. This is the second quality gate."*

The rules were explicit: *"Drop <100 words. Deduplicate exact + near duplicate. Strip boilerplate (menus, cookie banners, disclaimers). Tag critical intents: About; Products/Solutions; Press; Partners; Careers; Contact."*

This module implements the first part of that vision -- the deterministic, rule-based filters that catch obvious quality problems. Content-level deduplication (Jaccard similarity), intent tagging, and adaptive page caps are planned as additional Step 4 modules.

### How It Fits the Pipeline Architecture

Step 4 is the bridge between raw scraped content and generation-ready material. The Strategic Architecture describes its intent:

> *"Transform raw scraped content into clean, organized source packages ready for generation. Raw HTML needs cleaning -- remove navigation, ads, boilerplate. Duplicate content needs deduplication. Multiple sources for the same entity need assembly into a coherent source package."*

This Content Filter module handles the cleanup portion -- removing pages that shouldn't reach the LLM. Note that since this vision was written, much of it has been absorbed elsewhere: Step 2 modules filter junk URLs before scraping, and the Step 3 scrapers themselves flag failed and low-content pages. That's why this module is now marked **optional** -- it's a safety net for whatever slipped through, not a required gate.

### The Five-Filter Pipeline

Rather than a single quality check, this module applies five filters in sequence, ordered cheapest-first:

1. **Scrape status** -- Drop pages that failed scraping (error/skipped status from Step 3)
2. **Word count** -- Drop pages below a minimum word threshold (catches stubs, empty pages)
3. **English detection** -- Drop pages that lack common English stop words (heuristic, no external dependencies)
4. **URL patterns** -- Safety net catching URL patterns that bypassed Step 2 (e.g., `/tag/`, `/wp-admin/`)
5. **Title keywords** -- Drop pages with certain keywords in the title (e.g., "cookie", "privacy", "login")

This ordering ensures that the cheapest checks (status field lookup, integer comparison) run first, and every filter that excludes a page saves the remaining filters from processing it.

### The Adaptive Page Cap Vision

The original Content Creation Master described an ambitious filtering system with adaptive page caps:

> *"Base cap = 12 pages. Expand up to 25 if signals justify."*

And a feedback loop: *"Weekly: aggregate removal counts by domain + content_type -- feed into Step 4 rule/model updates."*

This module doesn't implement adaptive caps yet -- it filters by quality, not by quantity. The cap logic requires understanding entity-level page budgets and signal-based expansion, which is a separate concern from quality filtering. A future Step 4 module could implement the cap system, running after this filter has already removed the worst pages.

## Strategy & Role

**Why this module exists:** Prevent low-quality content from reaching the expensive LLM generation step. Every bad page filtered here saves token costs in Step 5 and avoids quality problems in the final output.

**Role in the pipeline:** Optional post-scrape quality gate. Applies deterministic, rule-based filters to scraped content. No API calls, no LLM costs -- just fast local checks on data already in the working pool. Because most of its checks duplicate work Step 2 and Step 3 already do, treat it as an extra pass rather than a standard step.

**Relationship to other steps:**
- **Receives from Step 3:** Scraped pages with `text_content`, `word_count`, `title`, and `status` fields (depends on `page-scraper`)
- **Feeds into Step 5 (or future Step 4 siblings):** Clean, quality-filtered pages ready for content deduplication, intent tagging, or direct generation
- **Complements Step 2:** Step 2 filtered URLs *before* scraping (cheap). This module filters content *after* scraping (catches problems only visible with actual page content)

## When to Use

**Run when:**
- Step 2 validation was skipped or configured leniently, so junk URLs may have reached the scrapers
- The scraped pool contains many failed or stub pages you want removed before generation
- You need a consistent, rule-based quality baseline across all entities

**Skip when (the common case):**
- The pipeline already ran a thorough Step 2 plus the Step 3 scraper chain -- most of this module's checks overlap with those steps, and it will have little left to catch
- You want to manually review all scraped content regardless of quality
- Content is already pre-filtered by an external system

**Tune the settings when:**
- Processing multilingual content -- the English detection heuristic will exclude non-English pages by default; set `require_english` to false
- Working with very short but legitimate pages (product listings, contact pages) -- lower `min_word_count`, or set it to 0 to keep all pages regardless of length
- Filtering domain-specific noise -- add title keywords relevant to your niche (e.g. "casino" for non-casino companies)

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `min_word_count` | 50 | Raise to 100-200 for article/profile content where short pages are useless; lower to 20-30 if contact/team pages with minimal text are valuable; set to 0 to keep all pages regardless of length | Number (0-1000). Pages below this word count are excluded. 50 words catches empty stubs while keeping most legitimate pages |
| `drop_errors` | true | Set to false only if you want to manually review failed scrapes in the UI before excluding them | Boolean. Automatically excludes pages with `error` or `skipped` status from Step 3. These pages have no usable content |
| `require_english` | true | Set to false for multilingual pipelines or non-English content. The heuristic checks for English stop words in the first 200 characters | Boolean. Excludes pages where fewer than 3 common English stop words appear in the opening text. Simple heuristic -- no external API needed |
| `exclude_title_keywords` | cookie,privacy,terms,login,404,cart,checkout | Add industry-specific keywords (e.g., "demo,signup,webinar" for SaaS). Remove keywords if those page types are relevant to your content | Comma-separated string. Pages whose title contains any keyword are excluded. Case-insensitive matching. Preset dropdown available in the UI |
| `exclude_url_patterns` | /tag/,/author/,/page/,/category/,/wp-admin/ | Add patterns specific to your target sites. This is a safety net -- most of these should have been caught by Step 2's URL Filter | Comma-separated string. Pages whose URL contains any pattern are excluded. Overlaps with Step 2 intentionally as a fallback. Preset dropdown available in the UI |

The two options with the biggest impact are `min_word_count` and `require_english`. A too-high word count silently drops legitimate short pages (contact, team, pricing); `require_english: true` on a multilingual pipeline excludes every non-English page. Both exclude options support saved presets in the UI, so a template can carry its own keyword/pattern lists instead of editing the comma-separated string each run.

## Recipes

### Standard Company Profile
Balanced filtering for company profile generation:
```
min_word_count: 50
drop_errors: true
require_english: true
exclude_title_keywords: cookie,privacy,terms,login,404,cart,checkout
exclude_url_patterns: /tag/,/author/,/page/,/category/,/wp-admin/
```

### Strict Quality (article-length content only)
When you only want substantial pages with real content:
```
min_word_count: 200
drop_errors: true
require_english: true
exclude_title_keywords: cookie,privacy,terms,login,404,cart,checkout,demo,signup,webinar,faq
exclude_url_patterns: /tag/,/author/,/page/,/category/,/wp-admin/,/feed/,/archive/
```

### Permissive (keep short pages)
When contact pages, team listings, and other short pages are valuable:
```
min_word_count: 20
drop_errors: true
require_english: true
exclude_title_keywords: cookie,privacy,terms,login,404
exclude_url_patterns: /wp-admin/
```

### Multilingual Pipeline
When target companies have non-English content:
```
min_word_count: 50
drop_errors: true
require_english: false
exclude_title_keywords: cookie,privacy,terms,login,404,cart,checkout
exclude_url_patterns: /tag/,/author/,/page/,/category/,/wp-admin/
```

## Expected Output

**Healthy result:**
- 70-90% kept (most scraped pages are legitimate content)
- 10-30% excluded (errors, short pages, non-English, stragglers from Step 2)
- In a well-configured pipeline where Steps 2-3 did their jobs, near-zero exclusions are normal -- that's the safety net finding nothing, not a malfunction

**Output fields per page:**
- `url` -- the page URL
- `title` -- page title (from Step 3)
- `word_count` -- word count (from Step 3)
- `filter_status` -- `kept` or `excluded`
- `filter_reason` -- why it was excluded (null for kept pages). Examples: "Too short: 12 words (min: 50)", "Scrape failed: error", "Non-English content detected", "URL pattern: /tag/", "Title keyword: privacy"
- `text_preview` -- first 300 characters of content (for quick review in the detail modal)
- `text_content` -- full page text (carried through for downstream steps; downloadable as a .txt file labelled "Filtered Text")
- `entity_name` -- which company this page belongs to

**Display behavior:** Excluded items are sorted first and flagged (via `flagged_when` on `filter_status: excluded`). Each item has a detail modal showing the filter reason and full text content. The module is selectable, so operators can override any filter decision before approval.

**Summary line:** Shows kept/excluded counts with reason breakdown, e.g.: "245 kept, 38 excluded (12 too short, 8 errors, 6 non-English, 7 title keywords, 5 URL patterns) of 283 total". When nothing is excluded: "283 pages -- all kept".

**Red flags to watch for:**
- Very high exclusion rate (>50%) -- either scraping had many failures (check Step 3) or filter settings are too aggressive
- Many "too short" exclusions -- may indicate JavaScript-rendered sites that the Page Scraper couldn't extract (Readability returns minimal text)
- Many "non-English" exclusions on expected-English sites -- the heuristic may be too aggressive on very technical/jargon-heavy content. Consider disabling `require_english`

## Limitations & Edge Cases

- **English detection is heuristic** -- Checks for common English stop words ("the", "is", "and", etc.) in the first 200 characters. Technical content with heavy jargon, code snippets, or data tables may have few stop words and get falsely excluded. The threshold is 3 stop words -- intentionally low to minimize false positives
- **Word count comes from Step 3, not recomputed** -- The filter reads the item's `word_count` field; a missing field is treated as 0 words and excluded unless `min_word_count` is 0
- **No content-level deduplication** -- This module filters by quality signals, not content similarity. Two pages with nearly identical text will both pass if they meet quality thresholds. Content deduplication (Jaccard similarity) is planned as a separate Step 4 module, matching the original vision: *"Deduplicate exact + near duplicate"*
- **No intent tagging** -- The original vision included tagging pages by intent (About, Products, Press, etc.) and applying different thresholds per intent. This module treats all pages equally. Intent-aware filtering is future work
- **No adaptive page caps** -- The original vision's "base cap = 12 pages, expand to 25 if signals justify" is not implemented. This module decides per-page, not per-entity-budget
- **URL and title filters overlap with Step 2** -- By design. The `exclude_url_patterns` and `exclude_title_keywords` are safety nets for items that bypassed Step 2 (e.g., if Step 2 modules were skipped or configured leniently). In a well-configured pipeline, these filters catch very few additional items -- which is why the module as a whole is marked optional
- **Filter order is fixed** -- The five filters always run in the same order (errors -> word count -> English -> URL patterns -> title keywords). A page excluded by an earlier filter doesn't get checked by later filters, so the `filter_reason` reflects the first failing check, not all failing checks

## What Happens Next

Filtered content enters the working pool with `filter_status` and `filter_reason` fields. Pages marked `kept` proceed to the next stage -- either additional Step 4 modules (content deduplication, intent tagging, adaptive page caps) or directly to **Step 5 (Analysis & Generation)** where LLM costs concentrate.

The original Content Creation Master described the full post-scrape filtering as including: *"Tag critical intents: About; Products/Solutions; Press (top 3 recent); Partners; Careers; Contact. Adaptive Page Cap: base cap = 12 pages, expand up to 25 if signals justify."* And a data hygiene mechanism: *"Store in content_removed table. Weekly: aggregate removal counts by domain + content_type -- feed into Step 4 rule/model updates."*

This module handles the first layer -- deterministic quality filtering. The intent tagging, adaptive caps, and feedback loops are separate concerns that would be implemented as additional Step 4 modules, each with their own manifest and README.

## Technical Reference

- **Step:** 4 (Filtering)
- **Category:** filtering
- **Cost tier:** cheap -- no HTTP requests, no LLM calls, pure local data processing; runs in the short-timeout queue class
- **Data operation:** remove (-) -- items with `filter_status: excluded` are removed from the working pool; `kept` items remain
- **Pool precondition:** `requires_items` -- needs scraped items in the pool. An entity whose pool is empty is marked `skipped_no_input` (not failed); other entities proceed normally
- **Required input columns:** `url`, `text_content`
- **Depends on:** `page-scraper`
- **Input:** `input.entities[]` with `items[]` from Step 3 working pool (grouped format) or flat item list (entities carrying `url` directly)
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `title`, `word_count`, `filter_status`, `filter_reason`, `text_preview`, `text_content`, `entity_name`, plus per-entity `meta` (total/kept/excluded)
- **Selectable:** true -- operators can override filter decisions in the UI
- **Detail view:** `detail_schema` with header fields (url as link, title, filter_status as badge, word_count) and sections (filter_reason as text, text_content as prose); `text_content` is downloadable as .txt ("Filtered Text")
- **Error handling:** Items missing the `url` field are skipped with a warning, as are entities with neither an `items` array nor a `url`. A missing `word_count` field is treated as 0. No fatal errors -- every processed item is returned with a status. Each result (kept and excluded) is also pushed to `tools._partialItems` as it is processed, so a timeout or abort preserves the already-filtered items
- **Dependencies:** `tools.logger`, `tools.progress` (no HTTP or AI tools needed)
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== intent-tagger (step 4, v2.0.0) ===== -->

# Intent Tagger

> Classify each scraped page by content type using LLM classification against user-defined intents. Helps downstream steps prioritize and route content for creation.

**Module ID:** `intent-tagger` | **Step:** 4 (Filtering) | **Category:** filtering | **Cost:** medium
**Version:** 2.0.0 | **Data Operation:** transform (=)

---

## Background

After scraping, a pipeline has dozens of pages per entity -- but not all pages carry equal weight for content creation. A news article is more valuable than a cookie policy when writing industry updates. A product page matters more than a careers listing when writing reviews.

The Intent Tagger classifies every page so downstream steps (content-analyzer, content-writer) can prioritize the right sources for whatever content type you're creating.

### How It Fits the Pipeline

This module sits in Step 4 (Filtering) alongside the Content Filter and Boilerplate Stripper. While those modules remove bad content, the Intent Tagger enriches good content with classification metadata. It runs after filtering and before generation (Step 5 uses the intent labels).

### LLM-First Classification

V2 uses LLM classification for all pages. Intent categories are fully user-configurable, so hardcoded heuristic patterns aren't possible -- the LLM classifies each page against whatever categories you define.

Pages are processed in batches of 10 to minimize API calls. Uses Haiku-class models by default for fast, cheap classification.

### Upstream Relevance Awareness

The intent tagger respects the `relevance` field set by Step 2's url-relevance module. Only pages marked KEEP (or with no relevance field) are sent to the LLM for classification. Pages marked MAYBE are passed through as `page_intent: 'unclassified'` -- their content is preserved for downstream use but no LLM call is spent on them. This significantly reduces API costs for large entities where many URLs were borderline relevant.

## Default Intent Categories

These defaults are a starting point for iGaming content creation. Edit them freely in the options:

| Intent | Description |
|--------|-------------|
| `news` | Breaking news, announcements, industry updates, regulatory changes |
| `product_info` | Product pages, feature descriptions, specifications, platform details |
| `press_release` | Official company press releases and media statements |
| `review` | Reviews, comparisons, ratings, player feedback, operator assessments |
| `faq` | Frequently asked questions, help pages, knowledge base articles |
| `guide` | How-to guides, tutorials, educational content, strategy articles |
| `opinion` | Opinion pieces, editorials, analysis, commentary, thought leadership |
| `media` | Image galleries, videos, infographics, podcasts, visual content |
| `statistics` | Data, research, reports, market analysis, rankings, surveys |
| `event` | Conference coverage, trade show news, event recaps, webinar summaries |
| `regulation` | Legal updates, licensing, compliance, responsible gambling policies |
| `interview` | Interviews, Q&A sessions, executive profiles, panel discussions |
| `other` | Does not fit any of the above categories (always auto-appended) |

## When to Use

**Always use when:**
- You have scraped content from Step 3 and want to classify pages before generation
- You need to prioritize certain content types for your output goals
- You're creating multiple types of content (news + reviews + guides) from the same source pool

**Skip when:**
- You only have 1-2 pages per entity (classification adds little value)
- All pages are known to be the same type (e.g., a news-only crawl)

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `intents` | 12 default categories (see above) | Edit to match your content creation goals. Remove irrelevant categories, add domain-specific ones. Never leave it blank -- an empty list fails the run loudly | Defines the classification taxonomy. Format: `name \| description` per line. Supports presets, so a tuned taxonomy can be saved and reused across runs |
| `priority_intents` | news, product_info, review | Change based on what content you're creating. For regulatory content: "regulation, news, opinion" | Controls output sort order -- priority intents appear first per entity |
| `ai_model` | `haiku` | Switch to a stronger model if classifications look wrong on nuanced pages | Model used for classification. Registry-driven select: the skeleton populates the dropdown from the shared LLM registry, with models scoped to the default provider |
| `ai_provider` | `anthropic` | Change to route classification through another provider | Provider for classification calls. Registry-driven select populated from the shared LLM registry (anthropic, openai, perplexity, gemini, openrouter) |

The `ai_model` and `ai_provider` dropdowns are not hardcoded lists -- their values come from the skeleton's shared LLM registry, so `haiku` is a registry alias, not a pinned model id. The most impactful option is `intents`: a taxonomy that doesn't match your sources produces a high `other` rate no matter which model you pick.

## Recipes

### News & Reviews Focus
```
intents:
  news | Breaking news, announcements, industry updates
  product_info | Product pages, feature descriptions, platform details
  review | Reviews, comparisons, ratings, assessments
  press_release | Official press releases and media statements
  opinion | Editorials, analysis, commentary
  other | Does not fit above categories
priority_intents: news, review, product_info
ai_model: haiku
ai_provider: anthropic
```

### Regulatory & Compliance Focus
```
intents:
  regulation | Legal updates, licensing, compliance, responsible gambling
  news | Industry news, regulatory announcements
  statistics | Market data, research, reports
  opinion | Legal analysis, expert commentary
  other | Does not fit above categories
priority_intents: regulation, news, statistics
ai_model: haiku
ai_provider: anthropic
```

### Company Profile Focus
```
intents:
  company_info | About pages, company overview, history, mission, team
  product_info | Products, solutions, platform features, pricing
  press_release | Press releases, media statements
  interview | Executive interviews, Q&A, profiles
  event | Conference appearances, trade show presence
  other | Does not fit above categories
priority_intents: company_info, product_info, press_release
ai_model: haiku
ai_provider: anthropic
```

## Expected Output

**Output fields per page:**
- `url` -- the page URL (carried from input)
- `title` -- page title (carried from input)
- `text_content` -- full page text (carried through for downstream steps)
- `page_intent` -- classified intent (one of the user-defined categories, or `unclassified` for MAYBE pages)
- `intent_confidence` -- confidence score 0-1 (higher = more certain; 0 for unclassified)
- `intent_reasoning` -- brief LLM explanation of why this classification was chosen
- `entity_name` -- which entity this page belongs to

**Sort order:** Pages are sorted per entity with priority intents first (in the order specified), then remaining pages by confidence descending, then unclassified pages last.

**Summary line:** Shows classification breakdown, e.g.: "42 pages classified across 5 entities: 8 news, 12 product_info, 6 review, 4 guide, 3 faq, 2 opinion, 7 other | 5 LLM calls". If any batches failed, the line ends with "(N failed)".

**Red flags to watch for:**
- Very high "other" rate (>50%) -- your intent categories may not match the content being scraped. Edit the intents to better fit your sources. Note that failed batches also land in `other` (with confidence 0), so check the failure count first
- High "unclassified" count -- these are MAYBE pages from Step 2. If too many important pages are unclassified, tighten your url-relevance thresholds in Step 2 so more pages get KEEP status
- LLM failure rate above 10% -- check API key configuration or model availability

## Limitations & Edge Cases

- **Non-English content** -- Classification quality depends on the LLM's language capabilities. Haiku handles major languages well but may struggle with niche languages.
- **Multi-intent pages** -- Some pages serve multiple intents (e.g., an About page with job listings). The tagger assigns a single best-fit intent.
- **Content snippet is 400 characters** -- Only the first 400 characters of page content are sent to the LLM per page (in batches of 10). Pages where the intent signal is buried deep may be misclassified.
- **Empty intents option fails loudly** -- If the `intents` textarea is blank, the module throws "No intent categories defined" instead of silently classifying nothing.
- **Failed batches default to `other`** -- If an LLM call errors or its response can't be parsed as JSON, every page in that batch gets `page_intent: 'other'` with confidence 0 and reasoning "Classification failed". The failure is counted in the summary's `llm_failures`.
- **Model output is sanitized** -- Intent names not in your taxonomy are coerced to `other`, confidence is clamped to 0-1 (0.5 if missing), and reasoning is truncated to 200 characters.
- **Partial results on timeout** -- Classified pages are pushed to the skeleton's partial-results buffer after each successful batch, so a timeout mid-entity preserves the batches already classified.
- **No learning** -- The module does not learn from operator corrections. Presets on the `intents` option are the way to persist a taxonomy that works.

## What Happens Next

The pool flows into Step 5 (Generation) with every page carrying `page_intent`, `intent_confidence`, and `intent_reasoning`. Generation modules (content-analyzer, content-writer) can weight sources by intent -- e.g., lean on `news` and `press_release` pages for industry updates, or `product_info` and `review` pages for assessments. The per-entity sort order means priority-intent pages surface first wherever items are consumed in order.

## Technical Reference

- **Step:** 4 (Filtering)
- **Category:** filtering
- **Cost tier:** medium -- 5-minute per-entity timeout; bumped from cheap so large entities with many LLM batches don't time out
- **Data operation:** transform (=) -- same items in, same items out, with `page_intent`, `intent_confidence`, and `intent_reasoning` added
- **Pool precondition:** `requires_items` -- an entity with an empty pool is marked `skipped_no_input` rather than failed
- **Required input columns:** `text_content` (manifest `requires_columns`). At runtime, items with neither `text_content` nor `url` are skipped with a warning
- **Depends on:** page-scraper
- **Input:** `input.entities[]` with `items[]` from the working pool
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` (all original fields plus intent fields) and `meta` (`total`, `intent_breakdown`, `skipped_maybe`); top-level `summary` with `total_entities`, `total_items`, `intent_breakdown`, `llm_calls`, `llm_failures`, `description`
- **Selectable:** false -- classification is informational, not a keep/exclude decision
- **Error handling:** throws if no intents are defined; per-batch try/catch -- a failed call or unparseable response defaults that batch to `other` and increments `llm_failures` instead of failing the run; successful batches are pushed to `tools._partialItems` for timeout resilience
- **Dependencies:** `tools.logger`, `tools.progress`, `tools.ai` (required -- LLM-first, no heuristic fallback)
- **Files:** `manifest.json`, `execute.js`, `README.md`, `CLAUDE.md`

---

<!-- ===== content-analyzer (step 5, v1.5.0) ===== -->

# Content Analyzer

> Structural fact extraction from scraped content. Classifies into categories, assigns tags, extracts key facts, and maps source citations.

**Module ID:** `content-analyzer` | **Step:** 5 (Generation) | **Category:** analysis | **Cost:** expensive
**Version:** 1.5.0 | **Data Operation:** add (+)

> **⚠ MODEL FLOOR -- minimum model: sonnet.** haiku-4-5 reads its reference taxonomy doc (`master_categories.md`) but does not comply with it: it fabricates categories instead of assigning from the configured list. Tested 2026-06, reproduced 100% of tries; sonnet resolves it. Any template running haiku on content-analyzer is misconfigured. Because the floor is a Claude-5 thinking model, a sonnet template must also override `max_tokens` to 32,768 -- the 16,384 default is haiku-sized and truncates a thinking model (see the manifest `usage_notes`).

---

## Background

### The Content Problem This Solves

After Steps 1-4, the pipeline has scraped, validated, and filtered pages - real text from real websites. But raw text is not structured knowledge. A company's About page, Products page, and Press page each contain fragments of information. No single page tells the full story. Before writing a profile, the system needs to *understand* the company: what it does, who it serves, how it positions itself, and what makes it different.

The original Content Creation Master described this as Node 6a - Analysis & Classification:
- *"Multi-source synthesis - cross-reference About, Products, Press, Partners pages"*
- *"Extract: primary/secondary categories, tags, USPs, founding year, HQ, employee count"*
- *"Every claim must cite which source URL it came from"*

This module is the first LLM-powered step in the pipeline. It reads all scraped pages for a company, sends them to an AI model, and gets back structured analysis JSON. This analysis becomes the foundation for everything downstream - SEO planning and content writing both depend on the quality of analysis here.

### How It Fits the Pipeline Architecture

This is the first shape change in the pipeline. Steps 1-4 all work with URL-shaped items (many items per entity). Content-analyzer collapses those into one analysis per entity - a fundamentally different output shape.

The Strategic Architecture describes this transition:
> *"Step 5 is where raw data becomes structured understanding. The input is many pages per company; the output is one structured profile per company."*

Content-analyzer uses the **add (+)** data operation - it reads from the Step 4 pool independently (not chaining from a previous Step 5 submodule) and produces fresh output. The user reviews the analysis before it feeds into seo-planner.

### Why Three Separate Submodules (Not One)

The analysis - planning - writing chain could be one monolithic step. Splitting it into three gives:

- **Human review at each stage** - catch wrong categories before they become wrong keywords before they become wrong articles
- **Reusability** - content-analyzer works alone for tagging projects (no writing needed), seo-planner + content-writer work without analyzer for topics where analysis comes from elsewhere
- **Cost control** - run the cheap planner multiple times to iterate on keyword strategy without re-running the expensive analyzer
- **Debugging** - when output is wrong, you know exactly which stage introduced the error

### The LLM Cost Reality

Content-analyzer is classified as **expensive** because it sends the full scraped text of every page to the LLM. For a company with 10 pages averaging 2,000 words each, that's 20,000 words of input per entity. With Sonnet, that's roughly $0.06-0.12 per company depending on output length.

The `max_content_chars` option exists specifically for cost control. At the default 200,000 characters (~33,000 words), even large companies fit comfortably. Companies with very long pages may need higher limits (up to 500,000), but the cost scales linearly. For cost-sensitive draft runs, lower to 30,000-50,000.

**Prompt caching (Anthropic).** The portion of the prompt *before* `{entity_content}` -- the instructions plus the reference-doc vocabulary (`master_categories.md` / `master_tags.md`, identical on every entity in a run) -- is sent as a cached prefix. On batches of 2+ entities within the 5-minute cache window, that stable prefix (~20K tokens) is re-read at ~10% input cost instead of re-charged in full. This is **billing-only** -- the model sees byte-identical input (verified by `test-cache-split.js`), and since the function-form replacement fix, scraped text containing `$`-sequences (`$$`, `$&`, etc.) no longer breaks the split -- it engages normally (asserted by `test-dollar-cache.js`). The remaining fallback-to-no-cache cases are structural: zero or multiple `{entity_content}` occurrences in the prompt template, or `{entity_content}` nested inside a `{doc:...}` token. Requires the skeleton `ai.complete` `cache_prefix` support to be deployed (it is, as of the #21 rollout).

### Reference Documents

Content-analyzer supports **reference documents** via the doc_selector option. The most important reference docs are:

- **master_categories.md** - Defines the fixed taxonomy (~80 categories with slugs, names, and descriptions). The analyzer MUST only assign categories from this list.
- **master_tags.md** - Defines available tags (~300 tags with slugs). The analyzer assigns from this list but may also suggest new tags for USPs not covered.

Other useful reference docs: classification guidelines, industry glossaries. These are project-level assets - upload once, use across every run.

### Critical Rules

**Output is structured JSON only** - not prose, not an article, not markdown. The analyzer extracts and classifies. The SEO planner and content writer handle planning and writing respectively.

**No summaries, opinions, or marketing prose.** v1.3.0 made this explicit: the analyzer is a "classification and fact-extraction machine." It does not produce summaries, differentiators lists, or target audience descriptions. Those are editorial judgements that belong in the writing step.

**Categories are a fixed taxonomy.** The analyzer assigns only from master_categories.md. It does NOT suggest new categories.

**Tags can be suggested.** If the analyzer identifies a USP not covered by existing tags, it may suggest new tags flagged as `"suggested_new"` for editorial review.

## Strategy & Role

**Why this module exists:** Transform raw scraped text into structured company understanding. This is the bridge between having pages (Step 4) and having knowledge (Step 5+). Every downstream content step depends on the accuracy of analysis here.

**Role in the pipeline:** First submodule in Step 5's three-part chain. Produces the foundational analysis that seo-planner and content-writer build upon.

**Relationship to other submodules:**
- **Receives from Step 4 pool:** Filtered scraped pages with text_content, title, word_count, url
- **Feeds into seo-planner:** Structured analysis_json (categories, tags, key facts, source citations)
- **Feeds into content-writer:** Same analysis_json (alongside seo-planner output and scraped source content)
- **Quality here determines quality everywhere downstream:** Wrong categories -> wrong keywords -> wrong article structure

## When to Use

**Always use when:**
- Building company profiles from scraped content
- You need structured categorization and fact extraction before writing

**Consider settings carefully when:**
- Companies have many pages (15+) - may exceed max_content_chars, prioritize About/Products pages
- Using reference docs - ensure master_categories.md matches your taxonomy
- Cost-sensitive runs - lower `max_content_chars`; do NOT drop below sonnet (the MODEL FLOOR) -- cost control here comes from input truncation, not model choice

**Can use standalone (without seo-planner/content-writer) for:**
- Bulk categorization of companies
- Tag assignment and taxonomy mapping
- Fact extraction for databases

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `ai_model` | `haiku` *(below floor -- see MODEL FLOOR)* | **Minimum model: sonnet.** haiku fabricates taxonomy categories despite reading the reference doc (tested 2026-06, 100% of tries). The `haiku` manifest default is a legacy value; a template MUST set sonnet (opus if you also want higher extraction accuracy on complex companies) | Which model runs the analysis. **Registry-driven** (`values_from: registry.models`): the skeleton populates the dropdown from the shared LLM registry, scoped to the default provider -- not a hardcoded list in this manifest |
| `ai_provider` | `anthropic` | Switch providers to compare extraction quality or route around an outage; anthropic is the tested default | Which LLM provider to call. **Registry-driven** (`values_from: registry.providers`): the skeleton populates the values from the shared registry (anthropic, openai, perplexity, gemini, openrouter) |
| `reference_docs` | (none) | Always upload master_categories.md at minimum. Add master_tags.md, classification guidelines as needed | Selected docs are injected into the prompt where `{doc:filename}` placeholders appear |
| `temperature` | 0.2 | Rarely. The low default exists for consistent structured extraction; lower toward 0.0 for maximum re-run consistency | LLM temperature for the analysis call (range 0.0-1.0). Lower = more deterministic extraction |
| `max_tokens` | 16,384 *(haiku-era; override to 32,768 for the sonnet floor)* | Set 32,768 whenever the module runs sonnet -- i.e. always, per the MODEL FLOOR. The 16,384 default was sized for haiku (no thinking overhead); sonnet's adaptive thinking consumes the budget invisibly and 16,384 truncates, which the skeleton fail-closed guard turns into a run failure | Max LLM response length (range 1,024-32,768). Covers visible JSON + (on a Claude-5 model) invisible thinking tokens |
| `max_content_chars` | 200,000 | Lower to 30-50k for cost control on simple companies. Raise to 300-500k for companies with many long pages | Truncates assembled source text. 200k ~ 33,000 words, enough for most companies |
| `vocabulary_checks` | (empty -- gate inert) | Set for content types that enforce a closed vocabulary. One line per check: `<analysis_json.path[].slug>=<reference_doc_name>`, e.g. `categories.primary[].slug=master_categories.md`. Blank lines and `#` comments ignored. Leave empty for content types without a fixed taxonomy | Opt-in vocabulary-fidelity gate (v1.4.1): after analysis, every slug at each configured path must exist in the named reference doc. An out-of-vocabulary slug FAILS that entity; a missing/empty referenced doc refuses the whole run before any LLM call |
| `prompt` | (analysis template) | Customize when your taxonomy differs from default, or when you need different output fields (presets enabled -- templates override per run) | The full LLM instruction. Uses `{entity_content}` for scraped pages and `{doc:filename}` for reference docs |

The model options are no longer hardcoded: the manifest declares `values_from` and the skeleton resolves the actual provider/model lists from the shared LLM registry at load time. Adding a provider or model to the registry makes it available here with no manifest change. The two options that most often need attention are `ai_model` (the floor is sonnet) and `max_tokens` (must be raised to 32,768 alongside it) -- forgetting the second is the most common misconfiguration, because truncation on a thinking model fails the run.

## Recipes

### Standard Analysis
Balanced for most companies (sonnet is the capability floor -- see MODEL FLOOR):
```
ai_model: sonnet
ai_provider: anthropic
temperature: 0.2
max_tokens: 32768
max_content_chars: 200000
vocabulary_checks: (empty -- fidelity gate off)
reference_docs: [master_categories.md, master_tags.md]
```

### Quick Draft Analysis
Fast wiring/smoke-test only. **⚠ haiku is below the capability floor -- the categories it returns are fabricated (not from the master list) and must NOT be trusted or approved. Re-run on sonnet before relying on any output.**
```
ai_model: haiku
ai_provider: anthropic
temperature: 0.2
max_tokens: 16384
max_content_chars: 50000
vocabulary_checks: (empty -- fidelity gate off)
reference_docs: [master_categories.md, master_tags.md]
```

### Deep Analysis (complex companies)
For companies with many products/brands/subsidiaries:
```
ai_model: sonnet
ai_provider: anthropic
temperature: 0.2
max_tokens: 32768
max_content_chars: 300000
vocabulary_checks: (empty -- fidelity gate off)
reference_docs: [master_categories.md, master_tags.md]
```

### Categorization Only (fidelity-gated)
When you only need categories, not full analysis (sonnet is mandatory here -- categorization is the exact task haiku fails). The `vocabulary_checks` lines make invented slugs a loud per-entity failure instead of a silent pass:
```
ai_model: sonnet
ai_provider: anthropic
temperature: 0.2
max_tokens: 32768
max_content_chars: 50000
vocabulary_checks:
  categories.primary[].slug=master_categories.md
  categories.secondary[].slug=master_categories.md
prompt: (modified to only return categories section)
reference_docs: [master_categories.md]
```

## Expected Output

**Healthy result:**
- One analysis item per entity (company)
- All fields populated - categories, tags, key_facts
- Source citations mapping claims to source URLs/titles
- Primary category assigned for 95%+ of entities
- All categories from master list only - no invented categories
- Output is valid JSON - not prose, not markdown, not an article

**Output fields per entity:**
- `entity_name` - entity name (carried from input)
- `status` - `analyzed` or `error` (`error` includes a **hollow analysis** -- one the model returned as valid-but-empty JSON with no usable extracted content; v1.4.3 fails it loud instead of shipping it green)
- `summary_preview` - auto-generated preview from the first few meaningful values in the analysis
- `word_count` - total source words analyzed
- `model_used` - which AI model was used (e.g., "anthropic/haiku")
- `analysis_json` - the full structured analysis object (carried to pool for downstream submodules)
- `_dynamic_sections` - auto-generated section definitions for the detail modal (derived from the LLM's JSON keys)

**Detail view sections:** Dynamic -- auto-generated from the LLM's JSON response keys. Labels are derived from key names (e.g., `key_facts` → "Key Facts"). Sections display as prose (multi-line) or text (single-line) depending on content. If the LLM returns non-JSON, the raw response is shown as a single "Analysis" prose section.

**The analysis_json structure:**
```json
{
  "categories": {
    "primary": [
      {"slug": "fraud-prevention", "why": "Core product is a fraud detection platform", "source": "https://example.com/about"}
    ],
    "secondary": [
      {"slug": "kyc-services", "why": "Location verification contributes to KYC workflows", "source": "https://example.com/products"}
    ]
  },
  "tags": {
    "existing": [
      {"slug": "ai-powered", "why": "Shortlisted in AI Solutions category"},
      {"slug": "gdpr-compliant", "why": "Privacy policy confirms GDPR compliance"}
    ],
    "suggested_new": [
      {"label": "clone-app-detection", "why": "Unique USP not covered by existing tags", "evidence": ["https://example.com/gatekeeper"]}
    ]
  },
  "key_facts": {
    "founded": null,
    "headquarters": "Athens, Greece",
    "employees": null,
    "key_people": [
      {"name": "Spiros Tassis", "role": "Data Protection Officer", "source": "https://example.com/privacy"}
    ],
    "licenses": [
      {"detail": "GLI Control Assessment -- Blueprint and Gatekeeper solutions", "source": "https://example.com/press/gli"}
    ],
    "awards": [
      {"detail": "EGR B2B Awards 2025 -- AI Solutions Supplier (shortlisted)", "source": "https://egr.global/awards"}
    ],
    "partnerships": [
      {"detail": "Gaming Laboratories International (GLI) -- certification partner", "source": "https://example.com/press/gli"}
    ],
    "offices": ["Athens, Greece"],
    "contact": {
      "email": "info@example.com",
      "phone": null,
      "website": "https://example.com"
    }
  },
  "source_citations": [
    {"index": 1, "url": "https://example.com/about", "title": "About Us"},
    {"index": 2, "url": "https://example.com/press/gli", "title": "GLI Certification Announcement"}
  ]
}
```

**Red flags to watch for:**
- Empty categories - reference doc may not have been selected, or company pages lack clear positioning
- No source citations - LLM may be hallucinating facts. Check analysis_json against scraped content
- Categories not in master list - prompt is wrong, LLM ignored the fixed taxonomy constraint
- Many suggested_new tags - company may have niche offerings. Review for taxonomy gaps
- Output is prose instead of JSON - prompt is wrong, LLM wrote an article instead of analyzing

## Citation-Map Stability Across Loop Re-Runs (v1.5.0)

Downstream articles cite sources inline as `[#n]`, minted against this module's
`analysis_json.source_citations` numbering. A loop pass re-runs the analyzer,
and the model regenerates that map nondeterministically -- observed live on run
`cb49ef80` (Hacksawgaming): 52 entries on loop 0, 19 on loop 1, from
byte-similar input (`stop_reason: end_turn` both times -- not truncation). The
`add`-upsert then replaced the 52-entry map every existing ref was written
against, so the round-2 rewrite's citations broke (27 broken refs, citation
coverage 41.3% vs a 70% threshold).

Since v1.5.0 the map is **append-only across re-runs**: when the input pool
carries a previous `analysis_json.source_citations` (hydrated via
`requires_columns`, which now includes `analysis_json`), the previous entries
are preserved verbatim -- same index, same URL -- and only genuinely new URLs are
appended after the previous max index. Refs minted against any earlier version
of the map stay resolvable.

- The previous map is selected as the candidate with the **highest max index**
  among pool items (§7b hydration broadcasts `analysis_json` onto every
  entity-keyed item, so stale copies can coexist; under append-only merging the
  most-evolved map always has the highest max index).
- The merge runs **after** the hollow-analysis gate -- preserved citations can
  never rescue a hollow analysis.
- A fresh (loop-0) run is untouched: no previous map, model output kept as-is.
- If a re-run's model output is valid JSON that omits `source_citations`, the
  previous map is preserved rather than dropped.
- Legacy-shaped maps (v1.0.0 plain URL strings, v1.2.0 `{claim, sources}`)
  are never merged -- the fix disengages and behaves exactly as pre-v1.5.0.

**Known residuals (documented, not fixed here):**

- **Non-JSON re-run responses still lose the map.** If the model answers in
  prose instead of JSON on a re-run, the raw-text path ships
  `analysis_json: null` and the add-upsert replaces the map -- the pre-v1.5.0
  collapse in full. Preserving the map there is NOT safe today because
  content-writer and seo-planner branch on `analysis_json` *truthiness* for
  their raw-text fallback -- a citations-only object would silently suppress
  that fallback. Closing this needs a fallback-aware change in those consumers
  first.
- **Downstream delivery of the merged map depends on skeleton §7b hydration.**
  `analysis_json` is stripped to per-run item data and re-hydrated for
  consumers; when multiple analyzer runs exist at the same step, the skeleton's
  row selection ties on `step_index` and the winning copy is arbitrary. The
  append-only guarantee is enforced *inside this module*; end-to-end
  determinism needs a skeleton tiebreaker (loop_iteration / recency).
- **URL-variant entries accumulate.** Dedup is by exact trimmed URL string, so
  `http/https` or trailing-slash variants of the same page can accrete separate
  indices across loops. The map stays resolvable; it just grows.

## Limitations & Edge Cases

- **Token limits** - Very large companies with 20+ long pages may exceed model context. max_content_chars prevents crashes but means some pages are truncated
- **Hallucination risk** - LLMs can infer facts not present in source text (e.g., guessing founding year from domain age). Source citations help catch this, but human review is essential
- **Category quality depends on reference doc** - Without master_categories.md, the LLM invents its own taxonomy. Garbage taxonomy in -> garbage categories out
- **Fixed taxonomy means missed companies** - If a company's core business doesn't match any of the ~80 categories, it will only get secondary assignments or no categories at all. Expand the taxonomy manually rather than letting the AI create one-off categories
- **Single-language assumption** - The default prompt is in English and expects English-language source text. Non-English companies may need a modified prompt
- **No cross-entity intelligence** - Each company is analyzed independently. The model doesn't know what categories other companies received, so consistency depends on the reference doc
- **JSON parse fragility** - LLMs occasionally return non-JSON. The parser strips markdown code fences (including truncated fences from max_tokens cutoff) and extracts the outermost JSON object past any preamble/trailing text. If parsing still fails, the entity does NOT error: the raw model text is displayed as a single "Analysis" prose section and the item ships with `analysis_json: null` -- a degraded success, visible in the detail view but unusable for structured downstream consumption
- **Hollow-analysis content gate (v1.4.3, M2 -- always on)** - shape-valid is not content-valid. If the model returns a *valid-but-empty* analysis (e.g. `{}` or `{ categories: [], key_facts: {} }` -- parses fine, but carries no usable extracted value), the module now fails **loud**: the entity gets `meta.status:'error'` and turns red, instead of shipping an empty analysis as success. "Usable" is defined from the downstream requirement, not arbitrarily: content-writer and seo-planner both serialize the *entire* `analysis_json` into their prompt, so an empty analysis cascades into a hollow profile one step downstream -- this is the producer-side twin of the seo-planner hollow-plan gate. The gate names no field (the schema is fully dynamic, per Rule 13); it fails only when *every* leaf is empty, and one real string/number/boolean anywhere makes the analysis usable (so a partly-populated analysis still passes). **Boundary:** this covers the parsed-but-empty case only -- a *non-JSON* response (parse fails) keeps its existing raw-text path (its raw text still flows to content-writer via the whole-item fallback), so it is degraded, not empty. Not a salvage: no default substitution, no retry-into-empty, no warning downgrade.
- **Vocabulary fidelity gate (v1.4.1, opt-in)** - the optional `vocabulary_checks` option turns the "garbage taxonomy" risk above into a loud failure instead of a silent pass. When configured (e.g. `categories.primary[].slug=master_categories.md`), the module (a) pre-flight FAILS the run before any LLM call if a referenced vocab doc is missing/empty, and (b) FAILS any entity whose assigned slug at a configured path is not present in the named doc. Leave empty (default) and the gate is inert -- the module behaves exactly as before. The slug-membership check is deliberately lenient (it never rejects a slug that appears in the doc) so it cannot false-fail a valid run; its job is to catch grossly-invented slugs. Operator note: the vocab doc must contain each allowed slug as a contiguous token (e.g. `casino-platforms`, not `casino - platforms`) -- the real master_categories.md / master_tags.md formats already satisfy this.

## What Happens Next

After the user reviews and approves the analysis, items enter the working pool with `source_submodule: "content-analyzer"`. These are picked up by **seo-planner**, which uses the analysis_json to plan keyword distribution, meta tags, and FAQs. The user reviews the SEO plan, then **content-writer** uses the analysis, SEO plan, and the original scraped source content to write the full company profile.

The analysis_json is the single source of truth for downstream submodules. If a category is wrong here, it propagates through the entire chain. This is why human review at this stage is critical - it's cheaper to fix a category assignment than to regenerate an entire article.

## Technical Reference

- **Step:** 5 (Generation)
- **Category:** analysis
- **Cost:** expensive
- **Data operation:** add (+) - reads Step 4 pool independently, produces analysis per entity
- **Pool precondition:** `requires_items` - the module needs scraped items in the pool for an entity; the skeleton skips (does not fail) entities with an empty pool, and inside execute an entity with zero items is recorded as `skipped` with 0 pages analyzed
- **Requires:** `text_content`, `entity_name`, `analysis_json` fields hydrated on input items (`analysis_json` carries this module's own previous output on loop re-runs -- it feeds the v1.5.0 citation-map merge)
- **Input:** `input.entities[]` with `items[]` from Step 4 working pool (scraped pages grouped by entity)
- **Output:** `results[]` grouped by `entity_name`, one item per entity containing flattened display fields + `analysis_json` object
- **Display type:** cards (not table) - one card per entity with expandable detail modal
- **Selectable:** true - operators approve/reject entire entity analysis
- **Detail view:** `detail_schema` with header (entity_name, status as badge, model_used) and dynamic sections auto-generated from LLM JSON keys via `_dynamic_sections`
- **Error handling:** LLM failures and missing input are handled per-entity (partial success pattern). JSON parse failures fall back to displaying raw LLM text as a prose section (degraded success, `analysis_json: null`). A parsed-but-hollow analysis (valid JSON, no usable content leaf) fails the entity loud with `meta.status: 'error'` (v1.4.3 content gate). Failed entities include the error message in a dynamic error section. With `vocabulary_checks` configured (v1.4.1), a missing/empty referenced vocab doc refuses the whole run before any LLM call, and an out-of-vocabulary slug fails that entity with an error naming the slug + source doc. Partial results are pushed to `tools._partialItems` after every entity so a timeout doesn't destroy progress.
- **Dependencies:** `tools.ai` (LLM calls; supports `cache_prefix` for the Anthropic prompt-cache split), `tools.logger`, `tools.progress`. Provider/model values resolve from the shared LLM registry via the manifest's `values_from` declarations
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== content-writer (step 5, v1.8.0) ===== -->

# Content Writer

> Write content using analysis data, optional SEO plan, and scraped source content.

**Module ID:** `content-writer` | **Step:** 5 (Generation) | **Category:** generation | **Cost:** expensive
**Version:** 1.8.0 | **Data Operation:** add (+)

> **⚠ PROSE FLOOR -- minimum model for shipped prose: opus.** sonnet reads acceptably but writes poorly (per Daniel + three external reviews, 2026-07-14). haiku is drafts only; sonnet is acceptable for internal drafts and for the QA-retry mechanics, but NOT for published output. Any template shipping haiku or sonnet prose to publication is below the floor. `max_tokens` stays 32,768 (the manifest max) to cover the invisible adaptive-thinking tokens opus/sonnet spend before writing -- see the manifest `usage_notes`.

---

## Background

### The Content Problem This Solves

The pipeline now has structured understanding (content-analyzer) and a keyword plan (seo-planner). What's missing is the actual writing. Content-writer is the final production step -- it takes facts, keywords, and raw source material and produces a publishable company profile.

This is the most visible output of the entire pipeline. Everything upstream -- URL discovery, scraping, filtering, analysis, SEO planning -- exists to make this step produce good articles. A 2,000-word company profile that reads well, ranks well, cites sources, and doesn't hallucinate is the deliverable.

The original Content Creation Master described this as Node 6c -- Draft Creation:
- *"Produce full draft profile in Markdown with proper heading hierarchy"*
- *"Each factual claim must cite the source URL"*
- *"Follow the format spec section structure"*
- *"Tone: authoritative B2B, benefit-first, not promotional"*

### How It Fits the Pipeline Architecture

Content-writer is the third and final submodule in Step 5's chain:

```
content-analyzer (+) -> seo-planner (+) -> content-writer (+)
```

It uses the **add (+)** data operation -- it chains from the working pool, finding content-analyzer items (required) and seo-planner items (optional) by their `source_submodule` fields, plus the original scraped source content. The analysis provides structure, the SEO plan (when present) provides keywords, and the source content provides raw material for specific, detailed prose. If seo-planner has not run, the writer warns and proceeds without the SEO plan section.

This is the most expensive individual LLM call in the pipeline. The prompt includes the full analysis JSON, the full SEO plan, scraped source content, and potentially multiple reference documents (tone guide, format spec).

### v1.4.0: Optional SEO Plan

In v1.4.0, the seo-planner dependency was made optional. The writer accepts up to **three inputs**:

1. **Analysis** (from content-analyzer, required) -- tells the writer WHAT to write about
2. **SEO Plan** (from seo-planner, optional) -- tells the writer WHICH KEYWORDS to use in each section
3. **Source Content** (scraped pages from Step 4) -- gives the writer RAW MATERIAL for specific, detailed prose

When seo-planner has not run upstream, the writer logs a warning and omits the SEO plan section from the assembled content. The LLM receives only the analysis and source content. Templates that don't use seo-planner should customize the prompt to omit SEO-specific instructions.

### Why This Is the First "Prose" Output

Every previous submodule produced data -- URLs, scores, word counts, JSON. Content-writer produces *text meant to be read*. This matters for the UI: the detail modal renders `content_markdown` with `"display": "prose"` -- a scrollable, whitespace-preserving view where the user reads the actual article. The card shows only a 300-character preview; the full article is in the detail modal.

This is also the first output that might go directly to a CMS. The markdown output is designed to be copy-pasted or imported into WordPress, Ghost, or any CMS that accepts Markdown.

### Reference Documents for Writing

Reference docs matter most here. The doc_selector typically receives:

- **tone_guide.md** -- Brand voice rules, sentence/paragraph constraints, keyword placement, citation format. Without this, the LLM writes in generic "AI article" tone
- **format_spec.md** -- Section structure requirements, [Type Marker] prefixes, word counts per section, citation format, validation rules. Without this, formatting is inconsistent across articles
- **style_examples.md** -- One or two example articles showing desired quality level. Few-shot examples are the most effective way to steer LLM writing quality (optional)

The difference between content-writer with and without reference docs is the difference between generic AI content and content that matches your publication's voice.

### Critical Rules

**Output is markdown only.** The writer produces prose in markdown format. No JSON output. Structured data conversion is a downstream concern.

**The manifest default prompt is pipeline-agnostic (v1.6.0).** The generic default produces well-cited prose from analyzer output; it knows nothing about company profiles, bracket headings, or any specific content type. Pipeline-specific structure (bracket-heading format, category sections, [Type Marker] prefixes, `[#n]` citations mapped to format-spec rules) comes from the template's prompt override and reference docs. Templates that DEPEND on that structure should set `requires_prompt_override: true` so a missing override fails loud instead of silently producing a generic article.

**Citations use [#n] format.** The default prompt instructs the model to cite every factual claim inline using `[#n]`, mapping to the source_citations from the analyzer output. The `has_citations` output flag checks for this pattern (plus legacy markdown-link and `(Source:` patterns).

**Closed slug vocabulary is template-configured.** When a template configures `allowed_slug_paths`, the writer prepends a per-entity `=== ALLOWED SLUGS FOR THIS ARTICLE ===` block extracted from `analysis_json`, and the prompt instructs the model to draw bracket-marker values exclusively from it.

## Strategy & Role

**Why this module exists:** Produce the final written deliverable -- a complete, SEO-optimized, factually cited article in Markdown. This is the end product of the entire content pipeline.

**Role in the pipeline:** Final submodule in Step 5's chain. Consumes all upstream work and produces publishable content.

**Relationship to other submodules:**
- **Receives from content-analyzer:** analysis_json -- facts, structure, citations to weave into the article (and slug vocabularies when `allowed_slug_paths` is configured)
- **Receives from seo-planner:** seo_plan_json -- keyword distribution per section, meta tags, FAQs to answer
- **Receives scraped source content:** Original pages from the pool with text_content -- raw material for specific details
- **Receives from reference docs:** tone guide, format spec, style examples
- **Feeds downstream:** Step 6 QA checkers read the article; meta-compliance-checker and Step 8 meta-output read the resolved `meta_title` / `meta_description`; Step 8 bundlers (markdown-output, html-output, json-output) consume `content_markdown`

## When to Use

**Always use when:**
- You need written content, not just data
- Analysis and SEO plan have been reviewed and approved

**Consider settings carefully when:**
- Model choice matters most here -- writing quality varies significantly between Haiku and Opus
- Reference docs dramatically affect quality -- always use tone guide and format spec if available
- Source content volume -- adjust max_source_chars if companies have many pages

**Without seo-planner:**
- Fully supported since v1.4.0. The writer warns and proceeds with analysis + source content only. For best results without an SEO plan, embed keyword guidance directly in the prompt.

**Don't use when:**
- You only need categorization (use content-analyzer alone)
- You only need a keyword plan/brief (use seo-planner alone)
- Content needs to be written by a human (use seo-planner output as a brief)

## Options Guide

`ai_model` and `ai_provider` are **registry-driven**: the manifest declares `values_from: registry.models` / `registry.providers` instead of a hardcoded list, and the skeleton populates the dropdowns from the shared LLM registry (providers: anthropic, openai, perplexity, gemini, openrouter; the model list is scoped to the selected/default provider). New models arrive via the registry, not manifest edits.

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `ai_model` | haiku *(manifest default -- below the prose floor)* | **Minimum for shipped prose: opus.** sonnet reads acceptably but writes poorly (Daniel + 3 external reviews, 2026-07-14); haiku is drafts only. haiku/sonnet are fine for internal drafts and the QA-retry mechanics, not for published output. A production template MUST set opus | Which model writes. Registry-driven values (see above). Model choice has the biggest quality impact of any option -- and below opus the prose is not publication-grade (see PROSE FLOOR) |
| `ai_provider` | anthropic | Switch for model comparison or preference | Which LLM provider to call. Registry-driven values (see above). Note: prompt caching and `disable_thinking` are Anthropic-only -- other providers get a plain uncached call with no thinking param |
| `reference_docs` | (none) | Always use tone_guide.md and format_spec.md if available. Add style examples for best results | Selected docs injected into the prompt at `{doc:filename}` placeholders. Most impactful option for quality. Docs placed BEFORE `{entity_content}` also join the cacheable prefix (see Prompt caching) |
| `temperature` | 0.4 | Raise toward 0.7-1.0 for more creative prose; lower toward 0-0.2 for maximum consistency across a batch | LLM temperature (0.0-1.0). Caveat: Claude-5 thinking models (sonnet-5, opus) reject an explicit `temperature` param, and the skeleton adapter drops it for those model families -- so on the models this module actually ships with, the value is inert |
| `max_tokens` | 32768 | Rarely -- 32,768 is already the manifest max. Lower (min 1,024) only for hard cost caps on haiku-only runs | Max LLM response length, covering BOTH visible markdown AND (on Claude-5 models -- opus for shipped prose, sonnet in QA-retry) invisible adaptive-thinking tokens. Sonnet retries think ~10-12k tokens before writing ~5-7k of text; 16,384 truncated 4/7 complete sonnet retries in the 2026-07-14 calibration, and truncation fails the run via the skeleton fail-closed guard. Streaming (verified in the skeleton) means the large cap does not risk an HTTP timeout (v1.6.2, was 16,384). Caveat: Sonnet 5 tokenizes ~30% higher than Haiku, so the token figures above (and any Haiku-vs-Sonnet comparison) are approximate, not same-unit -- the ~11k thinking headroom survives the correction |
| `disable_thinking` | false | Only for workbench A/B experiments on Anthropic Claude-5 models, until the prose question is settled | v1.8.0. When true, sends `thinking: {type:'disabled'}` on the model call -- Anthropic-gated in execute.js (never sent to other providers; setting it with a non-Anthropic provider just logs an info line). The skeleton adapter additionally gates by model family (`anthropicAcceptsThinking`), so models that reject an explicit thinking config (haiku, fable/mythos) never receive it. Default false = byte-identical request to v1.7.0. Why it exists: ~80% of the writer's output tokens on sonnet-5 are invisible adaptive thinking (measured 14,901 out for 1,792 words; 29,166 out for 1,877 words). The tone-seo-editor probe (run cb49ef80) cut output_tokens 24,592 -> 8,212 with visible text unchanged -- but an EDITING pass plausibly needs no thinking, while WRITING prose may. Settable per-call from workbench overrides so the A/B can actually run. **Coupled skeleton contract:** requires the skeleton `ai.complete` thinking pass-through (BACKLOG #53 surface), on skeleton main + deployed since 2026-08-01. On any OLDER skeleton the option is a silent no-op (old `ai.complete` destructuring drops unknown params without error) |
| `max_source_chars` | 100000 | Lower to 50k for cost control. Raise to 200-300k (max 300,000; min 10,000) for companies with many detailed pages | Truncates assembled scraped source text (with an explicit `[Source content truncated ...]` marker). Controls how much raw material the writer has to work with |
| `requires_prompt_override` | false | Set true on templates whose downstream steps depend on pipeline-specific output shape (company-profile bracket headings, news lede/quotes structure, podcast episode layout) | Per-template fail-loud flag. When true AND the runtime prompt still equals the manifest default (no override configured), the writer REFUSES the whole run early: every entity gets an error item with a clear message, and the summary reads "refused: template requires prompt override". Default false keeps the generic manifest prompt a valid run path |
| `allowed_slug_paths` | (empty) | Populate on templates whose prompt uses bracket headings like `[Category: <slug>]` -- anchors the model against inventing slug values | Optional closed vocabulary. One entry per line, `<BracketLabel>=<dot.notation.path>`; `field.sub[].leaf` walks arrays; repeated labels concatenate; `#` lines and blanks ignored (max 4,000 chars). When set, the writer extracts per-entity slug lists from `analysis_json` and prepends an `=== ALLOWED SLUGS FOR THIS ARTICLE ===` block to the entity content. Leave empty for content types without slug brackets (cover letters, news articles, podcast pages) -- behavior is then unchanged |
| `require_slug_paths` | false | Set true on templates whose output DEPENDS on the closed vocabulary, so a missing/empty analysis fails loud | Only relevant when `allowed_slug_paths` is configured. When false, zero resolved slugs for an entity logs a WARNING and proceeds without the closed-vocabulary block (the model may then emit invalid slugs). When true, that same condition HARD-FAILS the entity (status `error`). No effect when `allowed_slug_paths` is empty |
| `prompt` | (generic writing template) | Customize for different content types (bios vs profiles vs reviews), different section requirements, or different citation formats. Presets enabled | The full LLM writing instruction. Uses `{entity_content}` for the assembled analysis+plan+sources block and `{doc:filename}` for reference docs (unmatched `{doc:}` tokens are stripped). The default is deliberately pipeline-agnostic: it forbids topic/structure decisions (upstream owns those), demands `[#n]` citations, markdown-only output, no invented facts, and closed-vocabulary slug compliance when an ALLOWED SLUGS block is present |

The two highest-leverage options are `ai_model` (prose floor) and `reference_docs` (voice + structure). The most common mistake is lowering `max_tokens` to "save cost" -- on Claude-5 models the thinking tokens eat the budget invisibly and the fail-closed truncation guard turns the saving into a failed run.

## Recipes

`prompt` is omitted from the blocks below -- it is the manifest default unless the template configures an override (and `requires_prompt_override: true` forces one to exist).

### Standard Profile
Production-quality company profiles (opus is the prose floor for shipped output -- see PROSE FLOOR):
```
ai_provider: anthropic
ai_model: opus
temperature: 0.4
max_tokens: 32768
disable_thinking: false
max_source_chars: 100000
reference_docs: [tone_guide.md, format_spec.md]
requires_prompt_override: true   (template configures its prompt override)
allowed_slug_paths: (per template, e.g. "Primary Category=categories.primary[].slug")
require_slug_paths: false
```

### Flagship Content
Maximum quality for featured companies:
```
ai_provider: anthropic
ai_model: opus
temperature: 0.4
max_tokens: 32768
disable_thinking: false
max_source_chars: 200000
reference_docs: [tone_guide.md, format_spec.md, style_examples.md]
requires_prompt_override: true
allowed_slug_paths: (per template)
require_slug_paths: true
```

### Draft for Review
Quick drafts before human editing:
```
ai_provider: anthropic
ai_model: haiku
temperature: 0.4
max_tokens: 32768
disable_thinking: false
max_source_chars: 50000
reference_docs: [format_spec.md]
requires_prompt_override: false
allowed_slug_paths: (empty)
require_slug_paths: false
```

### A/B Comparison
Compare providers on the same input (model values come from the shared registry per provider):
```
Run 1: ai_provider: anthropic, ai_model: sonnet
Run 2: ai_provider: openai, ai_model: (a registry model for openai, e.g. gpt-4o)
(Same reference docs, same prompt, same temperature/max_tokens)
```
Note: on the openai run there is no prompt caching and no thinking control -- both are Anthropic-gated.

## Expected Output

**Healthy result:**
- One complete article per entity
- 1,800-2,200 words for default 2,000 target (+/-10% is normal)
- 4-8 H2 sections following the format spec structure
- One section per category from the analysis (when the template's format spec demands it)
- Source citations throughout using [#n] format
- Meta title and description matching the SEO plan
- FAQ section with schema-ready Q&A pairs (when the SEO plan carries FAQs)

**Output fields per entity:**
- `entity_name` -- company name
- `status` -- `written` or `error`
- `word_count` -- total words in the written article
- `section_count` -- number of H2/H3 sections
- `has_citations` -- boolean, whether [#n] references (or legacy markdown-link / `(Source:` patterns) were found
- `meta_title` -- resolved from the seo-planner output. Priority: `seo_plan_json.meta.title` (top-level, legacy), then `seo_plan_json.sections.meta.meta_title.candidate` (the planner's real length-validated output), then a flat `meta_title` field, then the entity name. Emitting the planned title lets meta-compliance-checker read it (priority-1) instead of falling back to the entity name. (Step 8 meta-output consumes these fields as of BACKLOG #52 -- meta-output v1.0.1, whose resolution chain is mirrored from meta-compliance-checker and invariant-tested -- so the delivered SEO metadata now carries the planned meta too.)
- `meta_description` -- resolved the same way (`meta.description`, then `sections.meta.meta_description.candidate`, then flat field). Empty when the plan carries no description (never invented).
- `content_preview` -- first 300 characters of the article (for card view)
- `content_markdown` -- the FULL article in Markdown (visible in detail modal only, rendered as prose)
- `error` -- error message on failed entities, empty string on success

**Detail modal:** This is where the article is actually read. The `content_markdown` field renders with `"display": "prose"` in a scrollable area. The card's `content_preview` shows only a teaser.

**Quality indicators:**
- `has_citations: true` -- confirms the article references sources using [#n], not inventing claims
- `section_count` matching the category count -- confirms the LLM followed the format spec
- `word_count` within +/-10% of target -- confirms the LLM respected length guidance

**Red flags to watch for:**
- `has_citations: false` -- the article may contain hallucinated facts. Check the full markdown for [#n] references
- Word count significantly under target -- LLM may have run out of material. Check if analysis had enough content
- Word count significantly over target -- LLM went off-script. Common with Opus. Not necessarily bad but review for bloat
- Generic opening paragraphs -- LLM fell back to template language instead of using specific facts from source content. Tone guide and source content help prevent this
- Missing FAQ section -- LLM may have deprioritized FAQs for main content. Check if seo_plan_json had FAQs
- Missing category sections -- compare H2 headings against analyzer categories. Every category must have a section
- Duplicate content across sections -- categories overlap and writer repeated the same information
- Whole run errored with "Template requires a content-writer prompt override" -- the template sets `requires_prompt_override: true` but no prompt override is configured. Upload the override or unset the flag

## Limitations & Edge Cases

- **Quality ceiling is the analysis + source content** -- Content-writer can only write about what content-analyzer found and what the scraped pages contain. If sources are thin, the article will be thin
- **No web research** -- The writer only uses information from the analysis, source content, and reference docs. It cannot look up additional information or verify facts against live websites
- **Citation accuracy** -- Citations reference the source_citations from the analysis using [#n], but the writer may slightly misattribute which source a fact came from. Source citations are directional, not legally precise
- **Tone consistency across entities** -- Each article is generated independently. Without a tone guide, tone may drift between articles. With a tone guide, consistency is much better but not perfect
- **Markdown rendering assumptions** -- Output assumes a standard Markdown renderer. Complex formatting (tables within articles, embedded media, custom HTML) is not supported
- **No revision cycle** -- The writer produces a single draft. There's no built-in "revise based on feedback" loop. To revise, re-run with a modified prompt or switch to a human editor
- **Long article fragility** -- For very long articles (5,000+ words), LLMs may lose coherence in later sections
- **Many categories stretch word budget** -- With 6+ categories at 150-300 words each, the article may exceed the word target
- **Source content truncation** -- max_source_chars truncates scraped content. If important details are on pages beyond the truncation point, they won't appear in the article
- **Allowed-slug-paths fidelity (v1.6.1)** -- when `allowed_slug_paths` is configured but no slugs resolve from `analysis_json` (e.g. content-analyzer produced none of the expected fields), the writer logs a WARNING and omits the closed-vocabulary block (the model may then emit invalid slug values). Set `require_slug_paths: true` to hard-fail the entity instead, so a missing/empty analysis surfaces loud. No effect when `allowed_slug_paths` is empty
- **Latest-item wins** -- when multiple content-analyzer or seo-planner items exist for an entity (e.g. after re-runs), the writer uses the most recent one (`findLast`)

## What Happens Next

After the user reviews and approves the written content, articles enter the working pool with `source_submodule: "content-writer"`. Step 6 QA checkers verify the article (citations, keywords, hallucination, structure); Step 8 bundlers (markdown-output, html-output, json-output) format `content_markdown` for delivery, and meta-output ships the resolved planned meta. The approved content_markdown is the deliverable -- copy it, import it, or let the Step 8/9 delivery chain package it.

## Prompt caching (v1.7.0, BACKLOG #21)

The writer splits its assembled prompt at `{entity_content}`: the stable head
(instructions + any `{doc:}` reference docs placed before the entity content)
is sent as an Anthropic prompt-cache block (`cache_prefix`), the per-entity
tail stays uncached. `cachePrefix + prompt` is byte-identical to the old
single prompt -- caching changes billing only (a runtime self-check falls back
to the uncached single prompt on any divergence; the divergence and
multiple-placeholder fallbacks are logged). The split is **Anthropic-gated**:
any other provider gets the plain single prompt, byte-identical to pre-1.7.0
behavior, because the skeleton's non-Anthropic branches ignore `cache_prefix`
and would silently drop the stable head. The split also only happens when
`{entity_content}` occurs exactly once in the template -- multiple occurrences
fall back to the single prompt (logged); ZERO occurrences fall back SILENTLY
(no log line), and note that such a template also omits the entity content
from the model input entirely -- check your template if outputs read generic. A prefix below the model's cacheable minimum silently
won't cache -- the module logs when the prefix is under ~16,384 chars (~4096
tokens, the largest documented per-model minimum); `ai_usage` cache_write/read
tokens are the ground truth. **To actually benefit, the template must put its stable bulk (reference
docs, writing rules) BEFORE `{entity_content}`** -- a template whose head is a
short intro caches nothing.

## Technical Reference

- **Step:** 5 (Generation)
- **Category:** generation
- **Cost:** expensive -- LLM-heavy tier (longest timeout class, 30 min)
- **Data operation:** add (+) -- chains from working pool, finds content-analyzer items (required) and seo-planner items (optional) by source_submodule, plus scraped source content items
- **Pool precondition:** `requires_items` -- an entity with an empty pool is marked `skipped_no_input` (not failed) before enqueue
- **Requires columns:** `entity_name`, `text_content`, `analysis_json`, `seo_plan_json` (selective field loading)
- **Depends on:** content-analyzer (required); seo-planner (optional_depends_on)
- **Input:** Content-analyzer output, seo-planner output, and scraped source pages from working pool (found via `source_submodule` field; scraped items = anything not from the two Step 5 submodules that carries `text_content`)
- **Output:** `results[]` grouped by `entity_name`, one item per entity containing word_count, section_count, has_citations, meta_title, meta_description, content_preview, and content_markdown
- **Display type:** cards (not table) -- one card per entity with expandable detail modal showing full article as prose
- **Selectable:** true -- operators approve/reject entire entity article
- **Detail view:** `detail_schema` with header (entity_name, status as badge, word_count, meta_title) and sections (content_markdown as prose, meta_title + meta_description as text, error). The prose section is scrollable and is the primary way users read the article
- **Error handling:** Run-level refusal when `requires_prompt_override` is true and the prompt equals the manifest default (every entity errored, summary says "refused"). Per-entity: missing content-analyzer output errors that entity ("Missing upstream output: content-analyzer. Run content-analyzer first."); missing seo-planner logs a warning and proceeds; no scraped source pages logs a warning (writer relies on analysis/plan only); configured-but-unresolved `allowed_slug_paths` warns by default or hard-fails the entity when `require_slug_paths` is true (v1.6.1); LLM call failures error that entity and the loop continues. Partial results are pushed to `tools._partialItems` after every entity so a timeout does not destroy progress
- **Model/provider values:** resolved by the skeleton from the shared LLM registry (`values_from: registry.models` / `registry.providers`)
- **Dependencies:** `tools.ai` (LLM calls), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== seo-planner (step 5, v2.4.0) ===== -->

# SEO Planner

> Keyword distribution planner with web-researched keyword data. Selects target keywords and produces meta tags, optional FAQs, and section-level keyword distribution. The manifest default is fully project-agnostic; pipeline-specific shapes (e.g. company-profile section breakdowns) come from template-level prompt overrides.

**Module ID:** `seo-planner` | **Step:** 5 (Generation) | **Category:** planning | **Cost:** expensive
**Version:** 2.4.0 | **Data Operation:** add (+)

> **⚠ MODEL FLOOR (inferred by analogy — UNVERIFIED) — recommended minimum model: sonnet.** Daniel's 2026-06 doc-non-compliance test covered content-analyzer, NOT seo-planner. seo-planner shares the same doc-following pattern (it reads `format_spec.md` / `tone_guide.md` and must honor a strict JSON output contract), so the risk that haiku reads its reference docs without complying is plausible here — but it has **not** been reproduced. Treat sonnet as the recommended floor pending a seo-planner-specific test; do not present it as proven. Moving to sonnet also means overriding `max_tokens` to 32,768 — the 16,384 default is haiku-sized (see the manifest `usage_notes`).

---

## Background

### The Content Problem This Solves

Content-analyzer produced structured understanding - categories, tags, key facts. But structured data isn't a writing plan. Before writing 2,000 words, someone needs to decide: which keywords to target, where to place them, what questions to answer, and how to optimize the content for search engines.

Without an SEO plan, the content-writer has to make all these decisions simultaneously while also writing prose. That produces mediocre results - generic keyword usage, missed FAQ schema opportunities. Separating planning from writing lets each step focus on what it's best at.

The original Content Creation Master described this as Node 6b - Tone & SEO Plan:
- *"For each entity, produce: target keywords, slug suggestion, meta-title (<=60 chars), meta-description (150-160 chars)"*
- *"FAQ questions based on buyer intent and search patterns"*

### How It Fits the Pipeline Architecture

SEO Planner is the second submodule in Step 5's chain, sitting between analysis and writing:

```
content-analyzer (=) -> seo-planner (+) -> content-writer (+)
```

It uses the **add (+)** data operation - it chains from the working pool, finding content-analyzer output by the `source_submodule` field, and adds its own output alongside. After approval, the pool contains both analysis items and SEO plan items, distinguished by `source_submodule`.

This is the cheapest step in the chain. The input is just the analysis JSON (a few KB), not the full scraped text (50KB+). This makes it safe to re-run multiple times while iterating on keyword strategy without significant cost.

### v2.3.0: Quantitative keyword-data providers (2026-07-07)

Adds an **additive** `keyword_data_providers` layer that grounds the plan in **real numbers** — search volume, keyword difficulty, own-site rank/impressions/clicks — from SEO/search APIs, running **alongside** the qualitative (Perplexity) research, not instead of it. It resolves the long-standing limitation that seo-planner "explicitly refuses to invent volume numbers" and had "no search volume data."

**Empty by default → fully inert.** The `keyword_data_providers` default is `[]`, so existing templates make **zero** extra API calls and produce **byte-identical** output (proven via A/B diff against the prior version on the empty-providers path). The whole layer only activates when a template configures at least one provider.

**How it works.** Per entity: (1) seeds are derived generically (entity name + conventional analysis fields — categories/tags/primary_category/industry/keywords); (2) **expansion** providers widen the seed set; (3) **metrics** providers score the widened set with real numbers; (4) results normalize to `keyword_metrics[]` and are attached to `seo_plan_json.keyword_metrics` (an **additive** audit-trail field — the backbone `target_keywords`/`meta`/`faqs`/`keyword_distribution`/`keyword_sources` are untouched). To feed the numbers into the planning LLM, add a `{keyword_metrics}` placeholder to your prompt override; the metrics land in `seo_plan_json.keyword_metrics` regardless of whether the prompt uses them.

**Built-in provider kinds** (see [Keyword Data Providers](#keyword-data-providers-v230) for the full config schema): `gsc` (Google Search Console — **free**, own verified properties only, real rank/impressions/clicks), `dataforseo` (**paid** — true search volume + CPC + competition via the Google-Ads live endpoint), `autocomplete` (**free**, no auth — seed expansion). New providers of an existing kind are config-only; a new kind is one small handler.

**Cost guards** (only apply when the layer is active): `max_seed_keywords` (25), `max_metric_lookups_per_entity` (100), `per_run_budget_usd` (1.0 — refuses paid lookups past the cap, warns, continues with free providers), and `metrics_required` (loud warning if the layer produces nothing — never silent). A provider with missing credentials is **config-present-but-inert** (warning + skip, never a failure). Pipeline-agnostic per Rule 13: the GSC site URL, DataForSEO locale, and provider selection are all template config; the manifest carries no domain, vertical, or content-type assumptions. Tested in `test-keyword-data.js` (82 assertions; the real RS256 JWT signing path is exercised with a throwaway keypair). **GSC live-verify deferred** (the service-account key was not resolvable in the build shell) — see [Limitations](#limitations--edge-cases).

### v2.3.4: Content gate reads keywords container-shape-agnostically (2026-07-20 — fixes run f4d501bd)

Run `f4d501bd` (Hacksawgaming, sonnet-5) failed the v2.3.2 content gate with *"SEO plan has no usable keywords/head_terms — model returned non-conforming (empty) output"* — but the raw capture (v2.3.3) proved the model returned a **keyword-rich** plan (two `end_turn` calls, ~17k tokens of output). The gate's `hasUsableKeywords` enumerated fixed container shapes (`head_terms`, top-level `target_keywords`, `sections.<any>.target_keywords`, `keyword_summary_table`, flat `keywords`), but the company-profile prompt nests keywords under **top-level** section containers (`overview` / `category_sections` / `tag_sections` / `credentials`) with `target_keywords` as a flat `string[]` and per-tag `keywords`. None matched, so a rich plan read as hollow and errored — a **false positive** that blocked the run at step 5, and would have tripped the identical blindness in meta-compliance-checker's `extractHeadTerms` at step 6.

Fix: both the gate and the checker now share a generic collector (`collectPlanKeywords`) that harvests keyword strings under any key named `target_keywords`/`keywords`/`head_terms` **at any depth**, whatever the container. It keys only on the pipeline-agnostic keyword *field* names — never on template-specific container names (Rule 13) — so it holds across content types and stops the recurring "next template nests differently → re-break" cycle. `keyword_sources`/`notes` are exact-key mismatches, so provenance and prose are never counted. All prior shapes still recognized; genuinely hollow plans still fail loud. Tested in `test-hollow-plan.js` (real prod shape + hollow-shape guard) and `meta-compliance-checker/test-meta-chain.js`.

### v2.3.3: Keyword-research context from rich analysis + raw capture on the content gate (2026-07-20 — fixes run 85bc05e1)

Two changes, both seo-planner-only, from tracing run `85bc05e1` (Hacksawgaming shipped a keyword-less plan even though the analyzer produced a rich 15,050-word analysis).

1. **`buildEntityContext` fed the keyword research the bare entity name.** It read `primary_category` / `categories[].name` / `industry` / `description` — fields the **current** content-analyzer does not emit (it emits `categories` as an object `{primary:[{slug}]…}` plus `key_facts`, with none of those flat fields). Every branch missed, so it fell through to `entity.name`, and the Perplexity Sonar `{entity_context}` became a meaningless self-reference: *"Hacksawgaming is in the Hacksawgaming space."* The research finished (3/3 queries) but researched nothing, so the plan came back with no usable keywords → the v2.3.2 content gate correctly failed it. The fix rebuilds the context by **harvesting a rich descriptor generically from the analysis the analyzer actually produced** (it names no analysis key, so it does not rebreak on the next schema change — the brittle fixed-field contract was the whole bug). The Sonar queries now research the real subject (e.g. `game-providers, game-aggregators, slots, instant-win, …`). **Why generic, not a new field list:** re-pointing at `categories.primary[].slug` would just recreate the same brittle contract one field deeper. `analysisContent` (execute.js:666) is built **after** the research runs, so it can't be reused for the context; the harvest happens inside `buildEntityContext` from the `analyzerItem` it already receives.

2. **The content-gate throw now captures the model output.** Previously the hollow-plan throw discarded the response (unlike the JSON-parse path, which preserves `rawText`), so a keyword-less plan left us inferring what the model returned. The gate now attaches the parsed model output (`JSON.stringify(plan)`) to the error, and `execute()` writes it to the error item's **`raw_response`** field and `meta.raw_response` (capped at 12,000 chars). So the next hollow plan is diagnosable from `output_data` directly, which is how we prove whether change 1 was the complete fix or whether a residual model-conformance issue remains underneath.

Tested in `test-entity-context.js` (14 assertions — rich context from the current analyzer shape, legacy-field regression, empty-analysis fallback, raw capture). **Proof pending:** the live prompt template lives in the DB `preset_map`, not the repo, so passing repo tests does not prove the prod fix — the proof is a live re-run on the real template.

### v2.3.2: Hollow-plan content gate (2026-07-19, Program A / A1 — fixes C2)

`completeWithJsonRetry` (v2.2.1) is fail-loud only when the model returns **no JSON at all** — it throws, and the entity turns red. It does **not** catch the case where the model returns a **valid-but-empty JSON object**: the parse succeeds, so no throw fires. Before v2.3.2 seo-planner validated JSON **shape** but never **content** — it flattened the empties (`target_keywords.primary || 'Not specified'`) and emitted `status:'success'`. Prod run `d9c21199` (2026-07-19, sonnet-5) did exactly this: an untargeted profile (0 keywords, 0 FAQs, `""` meta title) shipped **green**, while meta-compliance-checker failed every pass with *"No head_terms found in SEO plan"*. The QA gate detected the problem; nothing acted on it.

v2.3.2 adds a **second gate** — a CONTENT assertion after the parse. If the plan yields **zero usable keyword/head terms**, seo-planner fails **loud**: it emits `meta.status:'error'`, which the skeleton honors (`content-pipeline-v2/server/utils/entityRunStatus.js:23` → entity `'failed'`), turning the entity red **at the source with no skeleton change**. This is **not** a salvage — no defaults are substituted, there is no retry-into-empty, and it is never downgraded to a warning. A hollow plan is an error, full stop.

**What "hollow" means (defined from the downstream requirement, not arbitrarily).** A plan is hollow **iff** it yields no usable keyword/head term — the exact condition under which meta-compliance-checker (step-6 QA) emits *"No head_terms found in SEO plan"*. The gate shares an identical generic collector with that checker's `extractHeadTerms` (v2.3.4): it harvests every non-empty string under any key named `target_keywords`, `keywords`, or `head_terms` — **at any nesting depth**, and whether the value is a string, a flat `string[]`, or a `{primary,secondary,long_tail}` object — plus `keyword_summary_table[].keyword`. So "usable here" == "the checker would find a head term." Section **container** names (`overview`/`category_sections`/`tag_sections`/`sections`/`credentials`) are never enumerated — that vocabulary is template-specific (Rule 13), and `keyword_sources`/`notes` (exact-key mismatch) are never mistaken for keywords.

**The boundary (both directions tested):**
- **Keywords absent → error, even if `meta`/`faqs` are present.** Keywords are the one requirement with **no downstream fallback** — content-writer's `resolveMetaFromPlanner` and meta-output both fall the meta title back to the entity name, and FAQs are optional (`faq_count` may be 0). So meta/faqs presence must **not** rescue a keyword-empty plan.
- **Keywords present → success, even if `meta` is empty.** A keyword-bearing plan is usable; the empty meta resolves via its downstream fallback. This prevents false-failing real plans that emit meta as `sections.meta.*.candidate` rather than top-level `plan.meta`.

Note the flatten `primary || 'Not specified'` tell is a **symptom**, not the definition: a plan carrying only per-section keywords displays "Not specified" for the top-level primary yet is **not** hollow (the checker finds the per-section terms). That is exactly why the gate reads the checker's full shape set, not flatten's narrow `target_keywords.primary`. Additive by design: a real, populated plan (e.g. run `9f12bb8a`) is unchanged — only hollow plans change behavior. Tested in `test-hollow-plan.js` (34 assertions).

### v2.2.1: Corrective JSON retry (2026-06-13)

The defensive parser (v2.2.0) recovers JSON when markdown *headings leak into* an otherwise-JSON response. It cannot recover when the model returns the entire plan as **markdown prose** (no JSON object at all) — observed 2026-06-13 on a template whose prompt had lost its `OUTPUT FORMAT`/JSON-contract section, so sonnet produced a readable report instead of JSON. v2.2.1 adds `completeWithJsonRetry`: on a parse failure it re-issues the call **once** at `temperature: 0` with a strict JSON-only correction that includes the prior (invalid) response and asks the model to re-output the same information as a single JSON object (a reformat, which models comply with reliably). On a second failure it still throws loudly, preserving `rawText`. The retry is pipeline-agnostic — it names no content-type-specific keys, only constrains the output format — so it protects every template against prompt drift and stochastic markdown. The root-cause fix for a missing JSON contract still lives in the template prompt (the `OUTPUT FORMAT` section); this retry is the second line of defense. Tested in `test-json-retry.js`.

### v2.2.0: Agnostic Manifest + Per-Template Refusal Flag + Defensive Parser (2026-06-09)

v2.2.0 is the pilot of an architectural principle that will be rolled out across all submodule manifests: **manifest defaults must be 100% project-agnostic**. Pipeline-specific shape (company-profile categories/tags/credentials sections, news-article lede/quotes, podcast episode/guest structure, etc.) lives only in template-level prompt overrides, never in manifest defaults.

#### What changed

1. **Manifest default prompt is now fully agnostic.** All references to company-profile concepts (categories, tags, credentials, FAQ sections by name, 5-FAQ hardcoding, B2B/iGaming framing) have been removed from `options[prompt].default` and the matching `options_defaults.prompt`. The agnostic default produces a flat plan: `target_keywords` (primary/secondary/long_tail), `keyword_sources` (provenance audit), `meta` (title/description with character counts), `faqs` (count-driven), `tone_notes`, `warnings`, and a free-form `keyword_distribution: {}` object that the template fills via `format_spec.md`.

2. **New `requires_prompt_override` option (boolean, default `false`).** Per-template fail-loud flag. When a template sets this `true` via `preset_map.<sub>.fallback_values.requires_prompt_override` and the runtime prompt equals the manifest default (no override configured), seo-planner refuses the run *before* any keyword research fires, with an actionable error: *"Template requires a seo-planner prompt override but none is configured. Upload a prompt override in this template's seo-planner settings, or unset requires_prompt_override on this template."* When the flag is `false` (or absent), the agnostic manifest default is a legitimate run path.

3. **Refusal detection is comparison-based, not sentinel-based.** `execute.js` loads its own manifest at module-load time and stores `MANIFEST_DEFAULT_PROMPT`. The refusal trigger is strict equality: `options.prompt === MANIFEST_DEFAULT_PROMPT`. Any UI edit — even a single-character tweak — counts as an override and proceeds. No sentinel string is injected into the prompt text. (Detection survives all edit styles.)

4. **New `faq_count` option (number, default 0).** Drives FAQ count on the agnostic path (`{faq_count}` placeholder in the manifest default prompt). On override paths, `faq_count` is ignored unless the override prompt explicitly uses the `{faq_count}` placeholder. Single source of truth per run: either the override's hardcoded count or `faq_count`, never both.

5. **Defensive parser with markdown-leak recovery.** `parseJsonResponse()` now runs a defensive cleanup pass when initial parse fails: it strips lines starting with `#` (markdown headings) from inside the extracted JSON region and retries. This recovers from the failure pattern seen in 2026-06-08 production runs where the LLM emitted `# KEYWORD PLAN` headings before or inside the JSON.

6. **Raw LLM output preserved on parse failure.** When JSON parsing fails after defensive cleanup, the error carries the original (pre-cleanup) LLM response as `err.rawText`. The catch block in `execute()` logs the first 2000 characters of that raw text to the submodule_run's `logs` array. Forensic diagnosis after a parse failure is now minutes instead of hours.

7. **JSON-only enforcement strengthened in the prompt.** The agnostic default's OUTPUT FORMAT section ends with: *"The first character of your response MUST be `{` and the last character MUST be `}`. No markdown headings before, after, or inside the JSON. No code fences. No explanation. No preamble."* The defensive parser is the second line of defense; the prompt is the first.

#### Semver decision

This is a **minor bump (2.1.0 → 2.2.0)**, not major, because no code path in `content-pipeline-v2/` or `content-pipeline-modules-v2/` consumes manifest defaults at the field-name level. The skeleton's `moduleLoader.js` and `submoduleRuns.js` pass `output_schema` through as `output_render_schema` for the UI's result cards, but downstream submodules (content-writer, tone-seo-editor, meta-compliance-checker, keyword-sufficiency-checker) introspect runtime `seo_plan_json` data, not the manifest. Documented assumption: if a future consumer of manifest defaults emerges, the consumer needs to handle the now-thinner agnostic schema, but the existing four are unaffected.

#### Configuring per content type (template prompt overrides)

The manifest default is a legitimate generic run path. Pipelines that need section-structured output (the company-profile pipeline today, future news/podcast/marketplace pipelines tomorrow) override the prompt via the template's `preset_map.<sub>.fallback_values.prompt`, paired with `requires_prompt_override = true` to fail-loud if the override is later removed.

Three example template configurations:

##### Example A — Company-profile pipeline (live: template `7th june 17.15`)

```jsonc
{
  "preset_map": {
    "seo-planner": {
      "fallback_values": {
        "requires_prompt_override": true,
        "prompt": "You are an SEO strategist for OnlyiGaming, a B2B directory ... [full text in /modules/step-5-generation/pipeline-company-profiles/seo_planner_prompt.md]",
        "ai_model": "sonnet"
      }
    }
  }
}
```

Output shape: target_keywords + keyword_distribution with **categories[]** / **tags[]** / **credentials** / **faq** sub-objects + 5 hardcoded FAQs + meta. The override's prompt drives FAQ count (hardcoded 5); `faq_count` is unused on this path.

##### Example B — News-article pipeline (hypothetical)

```jsonc
{
  "preset_map": {
    "seo-planner": {
      "fallback_values": {
        "requires_prompt_override": true,
        "prompt": "You are an SEO strategist for a news outlet ... Map keywords to: lede, nut graf, quotes, context, callout box ...",
        "faq_count": 0,
        "ai_model": "haiku"
      }
    }
  }
}
```

Output shape: target_keywords + keyword_distribution with **lede / nut_graf / quotes / context / callout** sub-objects + 0 FAQs (news articles don't use FAQ schema) + meta.

##### Example C — Podcast-episode pipeline (hypothetical)

```jsonc
{
  "preset_map": {
    "seo-planner": {
      "fallback_values": {
        "requires_prompt_override": true,
        "prompt": "You are an SEO strategist for a podcast ... Map keywords to: episode_summary, timestamps, guest_intros, key_takeaways ...",
        "faq_count": 3,
        "ai_model": "haiku"
      }
    }
  }
}
```

Output shape: target_keywords + keyword_distribution with **episode_summary / timestamps / guest_intros / key_takeaways** sub-objects + 3 FAQs + meta. Podcast pipeline uses the `{faq_count}` placeholder in its prompt to make count template-configurable.

#### Cross-submodule schema coupling (downstream consumers)

Override prompts must produce a `seo_plan_json` shape that downstream submodules can read. The shared, backward-compatible backbone is:

| Field | Required by | Required value |
|---|---|---|
| `meta.title` (string) | content-writer | Any non-empty string |
| `target_keywords.primary` (string) | meta-compliance-checker, tone-seo-editor, keyword-sufficiency-checker | Any non-empty string |
| `target_keywords.secondary` (string[]) | (same as above) | Array of strings (can be empty) |
| `target_keywords.long_tail` (string[]) | (same as above) | Array of strings (can be empty) |

Optional fields downstream consumers handle gracefully when present:

| Field | Used by | What it enables |
|---|---|---|
| `meta.description`, `meta.title_chars`, `meta.description_chars` | meta-compliance-checker | Per-field length compliance checks |
| `keyword_distribution.overview.headline_keywords[]` | keyword-sufficiency-checker | Extra head-term coverage source |
| `keyword_sources` | (forensic audit only) | Records which research query each keyword came from |
| `faqs[].{question, answer_brief, target_keyword}` | content-writer (carried in JSON.stringify) | FAQ section in the article |
| `tone_notes` | tone-seo-editor (carried in JSON.stringify) | Tone guidance for the editor |
| `warnings[]` | UI display | Operator review flags |

Override prompts that produce additional `keyword_distribution` sub-objects (categories/tags/credentials/faq for company profiles, etc.) are extensions on top of this backbone — they don't replace it.

### v2.1.0: Prompt Coherence + Configurable Perplexity Model (2026-06-07)

v2.1.0 closes the half-migration left by v2.0.0. v2.0.0 swapped IN Perplexity keyword research but left the LLM prompt scaffolded as if a `keyword-summary.md` reference document were still the source. v2.1.0 makes the whole submodule coherent with the Perplexity-as-source design.

Changes:

1. **New `perplexity_model` option** — operators can choose between Perplexity's Sonar tiers without editing code:
   - `sonar` (default) — cheapest, fastest, basic search grounding
   - `sonar-pro` — better quality, more expensive
   - `sonar-reasoning` — chain-of-thought capable for complex queries
   - `sonar-reasoning-pro` — top-tier reasoning, highest cost
   
   Previously hardcoded to `sonar` in execute.js.

2. **Restructured `research_queries` default** — three queries are now explicitly labeled (Query 1 Core / Query 2 Competitor / Query 3 Real Questions) with B2B/audience inference, source URL requests, and a 3+3+3+3 forced split on Query 3 (definitional, comparison, operational, problem-framed). Previously: vague "include primary, long-tail, related" wording, asked Perplexity for "estimated search intent and competition level" (data Perplexity does not have — would be invented), allowed 8-12 questions (downstream uses exactly 5).

3. **Restructured main LLM prompt** — adds an upfront CRITICAL RULE section explicitly forbidding LLM training-data invention of keywords, with one defined exception (entity-name-prefixed long-tail constructions). Adds a section 7 CITATION rule that requires per-keyword provenance tags (Q1/Q2/Q3/analysis) for audit. Reinforces the FAQ rule to pick exactly 5 from Query 3's 12 verbatim, with a documented FAQ shortage warning if fewer are answerable.

4. **Added `keyword_sources` to the output schema** — alongside `target_keywords`, the LLM now records which query (Q1/Q2/Q3) each keyword came from. This lets us audit drift over time: if a keyword is tagged "analysis" or untagged, the LLM is falling back to its training data.

5. **Expanded warnings list** — added explicit categories: meta length problems, keyword gaps, FAQ shortage, research absence.

6. **Manifest metadata updates** — description now mentions Perplexity grounding; reference_docs description demotes `keyword-summary.md` to "fallback when keyword_research disabled" rather than primary input.

7. **Agnosticism polish (post-CTO review)** — four additional refinements before commit:
   - `keyword_sources` schema uses `Q<n> | analysis` notation (n = 1-based query number) rather than hardcoded Q1/Q2/Q3, so templates with non-default query counts (1-5 queries supported) audit correctly.
   - `usage_notes` cost claim shows range (defaults ~$0.025 to max ~$0.25/entity), not a single number that misleads operators choosing expensive Sonar tiers.
   - Exception clause for entity-specific long-tail keyword construction now includes consumer/comparison/podcast/news examples alongside B2B, so the rule reads as audience-agnostic rather than B2B-only.
   - **New explicit fallback instruction in the INPUTS section** — when `{keyword_research}` arrives empty (Perplexity failed, timed out, or was disabled), the LLM is now instructed to emit a HIGH-PRIORITY warning to the output, tag all keywords as `analysis` in `keyword_sources`, and NOT silently produce a plan as if research succeeded. This makes silent Perplexity failures loud and operator-visible. Confirmed needed by the Pronet Gaming + Wazdan v2.0.0 baseline run (2026-06-07 run aa81daa2) which fell through to the empty-research fallback without any clear signal to operators that research had not actually fired.

### v2.0.0: Keyword Research Pre-Step via Perplexity Sonar

v2.0.0 adds a web research step that runs **before** the SEO planning LLM call. Instead of relying on general LLM knowledge to select keywords, the module now:

1. Runs 1–5 configurable search queries via the Perplexity Sonar API
2. Synthesizes the results into a structured keyword research block
3. Injects that block into the planning prompt as `{keyword_research}`

This replaces manually uploaded `keyword-summary.md` reference docs and eliminates the need for expensive tools like Ahrefs. The planning LLM now works from actual search data rather than guessing.

The three default queries cover: primary search demand, top-ranking competitor articles, and People Also Ask signals. All queries support `{entity_name}` and `{entity_context}` placeholders.

**Cost note:** Perplexity Sonar API charges per request (~$0.005 each). Three queries per entity = ~$0.015/entity. At 100 entities, that's $1.50 for keyword research. Toggle `keyword_research: false` to skip for batches where cost matters.

### v1.3.0: Keyword Distribution Only

In v1.3.0, the SEO planner's role was clarified: it produces a **keyword distribution plan** only. It does NOT define article structure - that is fixed in `format_spec.md`. The planner maps which keywords should appear in which predefined sections (overview, categories, tags, credentials, FAQ).

This prevents the problem of two competing structures - an outline from the planner vs a format spec for the writer - which caused the content-writer to produce inconsistent results.

### Why Planning Before Writing Matters

The split between planning and writing exists for three reasons:

1. **Human checkpoint** - An editor can review and adjust keywords and meta tags before the expensive writing step. Changing a keyword costs nothing; regenerating an article costs $0.10+
2. **SEO quality** - Keyword research requires different thinking than prose writing. An LLM given both tasks at once tends to sacrifice one for the other
3. **Reusability** - The same SEO plan can feed different content-writer configurations (different tones, different formats) without re-planning

### Reference Documents for SEO Planning

The doc_selector option is valuable here for keyword packs - CSV or markdown files listing target keywords, search volumes, and competition levels. With a keyword pack, the LLM selects from known high-value terms rather than guessing. Without one, keyword selection is based on the LLM's general SEO knowledge, which is decent but not data-driven.

Other useful reference docs: format_spec.md (defines the fixed section structure), tone_guide.md (voice rules), competitor keyword analyses.

## Strategy & Role

**Why this module exists:** Transform company analysis into an actionable SEO keyword plan. The plan bridges the gap between understanding a company (analysis) and writing about it (content-writer).

**Role in the pipeline:** Second submodule in Step 5's chain. Receives analysis, produces keyword distribution that content-writer follows.

**Relationship to other submodules:**
- **Receives from content-analyzer:** analysis_json with categories, tags, key facts
- **Feeds into content-writer:** seo_plan_json with keywords per section, meta tags, FAQs
- **Does NOT access scraped text** - works purely from the structured analysis. This keeps it cheap and fast
- **Does NOT define article structure** - structure is fixed in format_spec.md

## When to Use

**Always use when:**
- Building SEO-optimized content of any kind
- You want human review of keywords/meta before expensive writing

**Consider settings carefully when:**
- Using keyword packs - ensures the LLM picks from your researched keywords rather than guessing
- FAQ questions matter for schema markup

**Can skip when:**
- Writing non-SEO content (internal reports, emails)
- Content-writer is given a very specific prompt that already includes keyword guidance

**Can use without content-writer for:**
- Generating content briefs for human writers
- Keyword planning for manual content creation
- SEO audits - compare planned vs actual keyword usage

## Configuring per content type

The manifest defaults are pipeline-agnostic. Content-shape decisions (how many FAQs, which sections appear in `keyword_distribution`, what voice the meta description has) are NOT manifest options — they live in the **prompt**, which is itself a configurable option.

### How to change content-shape defaults

Override the `prompt` option at template level. Patterns:

**Change FAQ count.** The default prompt says *"Write exactly 5 FAQ questions..."* For a news article (3 FAQs), comparison piece (8 FAQs), or knowledge-base article (10 FAQs), copy the manifest default into your template's `preset_map.seo-planner.fallback_values.prompt`, edit the count, and save. No manifest change required.

**Change output schema sections.** The default prompt's OUTPUT FORMAT shows `keyword_distribution` with `overview`, `categories`, `tags`, `credentials`, `faq` keys. A news template might replace `credentials` with `sources` and add `timeline`. A podcast template might use `episodes`, `guests` instead of `categories`, `tags`. The LLM follows whatever schema your template's prompt shows it — replace the schema block in the prompt override, and the output structure changes accordingly.

**Change vertical / audience framing.** The default prompt says nothing about iGaming, B2B, OnlyiGaming, or any other vertical (per the May 22 architectural commitment). To target consumer reviews, B2B operators, job seekers, podcast listeners, etc., specify that context in the template's prompt override. The OnlyiGaming-specific framing for the `30 april` template (company profile generation) lives in that template's `preset_map.seo-planner.fallback_values.prompt`, NOT here.

**Change number of research queries.** The `research_queries` option supports 1-5 queries (a cost warning is logged above 5). Template authors edit the `research_queries` value to add/remove query slots -- multi-line queries via `Query N --` markers (with any text before the first marker as shared preamble), or plain one-query-per-line; the main prompt's `keyword_sources` schema uses `Q<n>` notation so it adapts to any query count.

### Why this pattern?

Per modules-v2 CLAUDE.md (Rule 12 + Architectural Commitments): *"Content type variation is handled via configuration (cards, prompts, reference docs) of a small number of flexible generic modules. Specialized modules per content type are an anti-pattern."* Adding `faq_count`, `output_schema_sections`, or similar manifest options for every content-shape knob would multiply the option surface; using template prompt overrides keeps the manifest small and the configuration flexible.

### Cross-submodule schema coupling

When changing seo-planner's OUTPUT FORMAT schema in a template prompt override, the downstream submodules may depend on specific field names. Verified consumers of `seo_plan_json` (as of 2026-06-07):

| Consumer | Fields read |
|----------|-------------|
| content-writer | Whole blob via `JSON.stringify` — additive schema changes safe; removing fields it iterates may break |
| tone-seo-editor | `target_keywords.{primary, secondary, long_tail}` by name |
| meta-compliance-checker | `target_keywords.{primary, secondary, head_terms, keywords}` |
| keyword-sufficiency-checker | `target_keywords.*` + `keyword_distribution` (iterates by name) |
| meta-output, schema-org-injector (Step 8) | `target_keywords`, `meta`, `faqs` |
| json-output (Step 8) | Whole blob |
| hallucination-detector, citation-coverage-checker | Don't read seo_plan_json |

**Before changing the schema in a template prompt override**, grep these consumers for the field names you intend to remove or restructure. If a consumer iterates a field you remove, you'll need to either (a) keep the field but document it as empty for the new content type, OR (b) configure the consumer's prompt override (or skip the consumer entirely in the template) to match.

**Additive fields are safe.** `seo_plan_json.keyword_metrics[]` (v2.3.0) is an additive audit-trail field present **only** when the keyword-data layer is active. It does not touch the backbone fields above, so it is safe for every consumer (content-writer/json-output read the whole blob and simply carry it; the by-name consumers don't read it).

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `ai_model` | haiku *(recommended floor: sonnet -- inferred/UNVERIFIED)* | Recommended minimum sonnet by analogy to content-analyzer's tested doc-non-compliance finding (not yet tested on seo-planner). haiku for quick iterations only | Which model plans. Registry-driven (`values_from: registry.models`) -- see the registry note below the table. The doc-following risk that broke content-analyzer on haiku plausibly applies here -- see MODEL FLOOR |
| `ai_provider` | anthropic | Switch for model comparison | Which LLM provider to call. Registry-driven (`values_from: registry.providers`). Prompt caching only engages on `anthropic` -- other providers get the plain uncached prompt (see [Prompt caching](#prompt-caching-v240-backlog-21)) |
| `keyword_research` | true | Set false to skip web research and reduce cost/latency | When true, runs Perplexity Sonar queries before the planning LLM call |
| `search_provider` | perplexity | Only `perplexity` supported today (more providers -- Gemini, Ahrefs, Semrush -- can be added later) | Controls which search API is used for keyword research |
| `perplexity_model` | sonar | Raise to `sonar-pro` / `sonar-reasoning` / `sonar-reasoning-pro` for better research quality on complex spaces; ~$0.005/query (sonar) to ~$0.05/query (sonar-reasoning-pro) | Which Perplexity Sonar tier runs the research queries |
| `research_queries` | (3 default queries) | Customize for specific industries, pipelines, or entity types | Multi-line queries supported when delimited by `Query N --` markers; any text before the first marker is a shared preamble prepended to every query. Templates without markers fall back to one-query-per-line. Supports `{entity_name}` and `{entity_context}` placeholders. <=5 queries recommended (a warning is logged above 5) |
| `reference_docs` | (none) | Upload format spec, tone guide, or supplemental keyword data | Selected docs injected into prompt at `{doc:filename}` placeholders. `keyword-summary.md` is read ONLY as a fallback when `keyword_research` is off or returns nothing |
| `temperature` | 0.3 | Lower toward 0 for maximum keyword-mapping consistency; raise for more varied phrasing | LLM temperature for planning. The corrective JSON retry always runs at temperature 0 regardless. Skeleton-level note: Claude-5 models (sonnet/opus) reject `temperature`, so the skeleton omits it for them -- this option is inert there |
| `max_tokens` | 16,384 *(haiku-era; override to 32,768 when running sonnet)* | Set 32,768 whenever the module runs sonnet. The 16,384 default was sized for haiku (no thinking overhead); sonnet's adaptive thinking consumes the budget invisibly and 16,384 can truncate, which the skeleton fail-closed guard turns into a run failure | Max LLM response length. Covers visible JSON + (on a Claude-5 model) invisible thinking tokens |
| `faq_count` | 0 | Raise on the agnostic (no-override) path when the content should carry FAQs | Number of FAQs the manifest default prompt asks for. Agnostic path only -- override prompts drive their own FAQ count and ignore this unless they explicitly use the `{faq_count}` placeholder |
| `requires_prompt_override` | false | Set true on templates that depend on section-structured output (categories/tags/credentials/faq sections etc.) | If true and the runtime prompt equals the manifest default (no override configured), the run is refused early -- before any research fires -- with a clear actionable error instead of silently producing a generic plan |
| `keyword_data_providers` | `[]` | Add real search-volume/difficulty/rank data (v2.3.0). Empty = layer off, no cost | Array of provider configs. See [Keyword Data Providers](#keyword-data-providers-v230) |
| `max_seed_keywords` | 25 | Lower to trim cost; raise for broad entities | Cap on seed keywords per entity (cost guard; only when the layer is active) |
| `max_metric_lookups_per_entity` | 100 | Lower to trim cost | Hard cap on keyword->metrics lookups per entity (cost guard) |
| `per_run_budget_usd` | 1.0 | Raise to allow more paid lookups; 0 = free providers only | Refuses paid lookups past the cap, warns, continues with free providers |
| `metrics_required` | false | Set true when a template depends on real numbers | If nothing is produced, adds a **loud** warning (never silent) |
| `prompt` | (SEO planning template) | Customize when you need different keyword strategies or industry-specific SEO patterns | The full LLM instruction. Uses `{entity_content}` for analysis JSON, `{keyword_research}` for research results, `{faq_count}` for the configurable FAQ count (agnostic path), `{keyword_metrics}` for the quantitative keyword-data table (v2.3.0, opt-in), and `{doc:filename}` for reference docs |

**Registry-driven model/provider values.** `ai_model` and `ai_provider` no longer carry hardcoded value lists in the manifest -- they declare `values_from` (`registry.models` / `registry.providers`), and the skeleton populates the dropdowns from the shared LLM registry (providers: anthropic, openai, perplexity, gemini, openrouter; models scoped to the default provider). Adding a model or provider is a registry change, not a manifest edit. Defaults are unchanged (haiku / anthropic).

The most impactful pairing is `ai_model` + `max_tokens`: switching to sonnet without raising `max_tokens` to 32,768 is the most common mistake -- adaptive thinking eats the 16,384 budget invisibly and truncation fails the run.

## Keyword Data Providers (v2.3.0)

The `keyword_data_providers` option is a JSON array of provider config objects. Empty (the default) means the layer is **off** — no API calls, no cost, output unchanged. Each provider names a `kind` that selects a small generic handler; everything else is config. There are two roles: **expansion** (widen the seed set) and **metrics** (score keywords with real numbers). Expansion runs first, then metrics on the widened set. Results are normalized and attached to `seo_plan_json.keyword_metrics`.

**Built-in kinds**

| `kind` | Role | Cost | Env var(s) | Produces |
|--------|------|------|------------|----------|
| `gsc` | metrics | **free** | `GSC_SERVICE_ACCOUNT_KEY_PATH` (path to a service-account JSON key) | `current_rank`, `impressions`, `clicks` for the queries your **own verified property** already ranks for |
| `dataforseo` | metrics | **paid** | `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` (Basic auth) | `search_volume`, `cpc`, `competition` (Google-Ads **live** endpoint) |
| `autocomplete` | expansion | **free** | none | seed-expansion suggestion strings |

**Config schema** (per provider object)

| Field | Applies to | Notes |
|-------|-----------|-------|
| `id` | all | Short identifier; also the `source` tag on each metric row and the `keyword_sources` provenance id. |
| `kind` | all | One of `gsc` \| `dataforseo` \| `autocomplete`. |
| `est_cost_per_lookup` | all | Per-keyword cost estimate for the budget guard. **Leave 0 (or unset) for free providers** (`gsc`, `autocomplete`); setting it makes them budget-guarded and possibly skipped. |
| `auth.env_var` | `gsc` | Env var holding the service-account key **file path** (default `GSC_SERVICE_ACCOUNT_KEY_PATH`). |
| `site_url` | `gsc` | GSC property, e.g. `sc-domain:example.com` or `https://example.com/`. Required. |
| `scope` | `gsc` | OAuth scope (default `https://www.googleapis.com/auth/webmasters.readonly`). |
| `date_range_days`, `row_limit` | `gsc` | Look-back window (default 90) and max rows (default 100, cap 25000). |
| `auth.login_env` / `auth.password_env` | `dataforseo` | Env vars for Basic auth (default `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`). |
| `location_code`, `language_code` | `dataforseo` | Google-Ads locale (default `2840` = US, `en`). |
| `endpoint` | `dataforseo` | Override the live endpoint if needed. **Live endpoints only** — the standard queue's 1–3h latency would blow the 30-min module timeout. |
| `hl`, `max_seeds` | `autocomplete` | Suggestion language (default `en`) and per-provider seed cap. |

**Example** (company-profile style — GSC free tier + optional paid volume, `{env:VAR}` values come from the environment):
```json
[
  { "id": "gsc", "kind": "gsc", "site_url": "sc-domain:example.com",
    "auth": { "env_var": "GSC_SERVICE_ACCOUNT_KEY_PATH" }, "est_cost_per_lookup": 0 },
  { "id": "autocomplete", "kind": "autocomplete", "est_cost_per_lookup": 0 },
  { "id": "dataforseo", "kind": "dataforseo", "location_code": 2840, "language_code": "en",
    "est_cost_per_lookup": 0.05 }
]
```
Then add a `{keyword_metrics}` placeholder to the template's `prompt` override to feed the numbers into the planning LLM (e.g. "prefer high-volume/low-difficulty targets, and terms you already rank 5–20 for").

**Cost model note:** the budget guard sums `est_cost_per_lookup × keyword_count`. DataForSEO's live search-volume endpoint bills **per request** (all keywords in one task), so the guard is intentionally conservative — it may skip a provider that would actually be within budget rather than overspend. Set `est_cost_per_lookup` to the per-request price divided by your expected keyword count, or raise `per_run_budget_usd`, if you see over-eager skips.

**Failure behavior:** a provider whose credentials are missing is **inert** (a warning is added, the provider is skipped, no HTTP call is made) — the module never fails because a provider is unconfigured. A provider that errors mid-call is likewise skipped with a warning. With `metrics_required: true`, producing zero metrics adds a loud warning to `warnings[]` (it is never silent). GSC returns data only for properties the service account is added to as a user; a new/small property returns empty with a warning.

## Recipes

### Standard SEO Plan
Web-researched keywords + AI planning (sonnet is the recommended floor — see MODEL FLOOR):
```
keyword_research: true
search_provider: perplexity
ai_model: sonnet
max_tokens: 32768
reference_docs: [tone_guide.md, format_spec.md]
```
Keyword packs (`keyword-summary.md`) are no longer needed — Perplexity replaces them.

### High-Quality Plan
More capable model + web research:
```
keyword_research: true
ai_model: sonnet
reference_docs: [tone_guide.md, format_spec.md]
```

### Fast/Cheap Plan (no web research)
Skip Perplexity for batch processing where cost matters. **⚠ haiku is below the recommended (inferred/UNVERIFIED) sonnet floor — validate the plans follow your `format_spec.md` before trusting them.**
```
keyword_research: false
ai_model: haiku
reference_docs: [keyword-summary.md, format_spec.md]
```
Upload a `keyword-summary.md` to compensate when `keyword_research` is off.

### Custom Research Queries
For review article pipelines (category-level research):
```
keyword_research: true
research_queries:
  What do iGaming operators search when comparing {entity_name} providers?
  What keywords do top-ranking {entity_context} comparison articles target?
  People Also Ask questions for '{entity_name}' in iGaming?
```

## Expected Output

**Healthy result:**
- One SEO plan per entity
- Primary keyword + 2-4 secondary + 3-5 long-tail keywords per entity
- Keyword distribution mapping keywords to the sections your template's format spec defines (the company-profile override uses overview, categories, tags, credentials, FAQ). Without a format spec, the agnostic default returns `keyword_distribution: {}` and the writer works from `target_keywords` directly
- Meta title <=60 characters, meta description 150-160 characters
- FAQs per template: the agnostic default asks for `faq_count` FAQs (default 0 -- `faqs: []`); override prompts fix their own count (the company-profile override hardcodes 5)

**Output fields per entity:**
- `entity_name` - company name
- `status` - `planned` or `error` (`error` includes a **hollow plan** — one the model returned as valid-but-empty JSON with no usable keywords; v2.3.2 fails it loud instead of shipping it green)
- `primary_keyword` - the top target keyword
- `keyword_plan_preview` - summary of keyword distribution (e.g., "3 categories, 4 tags, 12 unique keywords")
- `meta_title` - proposed meta title
- `faq_count` - number of FAQs generated
- `seo_plan_json` - the full structured SEO plan (carried to pool for content-writer). When the keyword-data layer is active it additionally carries `keyword_metrics[]` (v2.3.0): `{ keyword, search_volume, difficulty, cpc, competition, current_rank, impressions, clicks, source }`, with `null` where a provider lacks a field.

**Detail view sections:** target keywords (text), keyword distribution (prose), meta tags (text), FAQs (prose), tone notes (text), warnings (text)

**The seo_plan_json structure:**
```json
{
  "target_keywords": {
    "primary": "geolocation verification for iGaming",
    "secondary": ["GPS spoofing detection", "clone app fraud prevention", "GLI certified geolocation"],
    "long_tail": ["geolocation compliance for sports betting operators", "GLI certified location verification solutions"]
  },
  "keyword_distribution": {
    "overview": {
      "headline_keywords": ["geolocation verification for iGaming"],
      "body_keywords": ["iGaming geolocation provider", "location intelligence"]
    },
    "categories": [
      {
        "category_slug": "fraud-prevention",
        "category_tier": "primary",
        "heading_keywords": ["fraud prevention solutions"],
        "body_keywords": ["clone app fraud prevention", "GPS spoofing detection"]
      },
      {
        "category_slug": "kyc-services",
        "category_tier": "secondary",
        "heading_keywords": ["KYC services"],
        "body_keywords": ["geolocation KYC compliance"]
      }
    ],
    "tags": [
      {
        "tag_slug": "gli-certified",
        "keywords": ["GLI certified geolocation", "GLI control assessment"]
      }
    ],
    "credentials": {
      "keywords": ["GLI certified", "independently validated"]
    },
    "faq": {
      "keywords": ["geolocation compliance for sports betting operators"]
    }
  },
  "meta": {
    "title": "Bespot: GLI-Certified Geolocation & Fraud Prevention",
    "title_chars": 52,
    "description": "Athens-based geolocation provider offering GLI-certified verification, clone app detection, and GPS spoofing prevention for iGaming operators.",
    "description_chars": 148
  },
  "faqs": [
    {
      "question": "What is GLI certification and why does it matter for geolocation verification?",
      "answer_brief": "Explain GLI assessment, what it validates, why operators need it for licensing",
      "target_keyword": "GLI certified geolocation"
    },
    {
      "question": "How does Bespot detect clone app fraud in iGaming?",
      "answer_brief": "Cover Gatekeeper's detection methods: app signatures, device fingerprinting, behavioral analysis",
      "target_keyword": "clone app fraud prevention"
    }
  ],
  "tone_notes": "Authoritative B2B tone for compliance professionals. Emphasize technical capabilities and regulatory validation. Avoid marketing hype.",
  "warnings": []
}
```

**Key points about the keyword distribution:**
- Maps keywords to predefined sections from format_spec.md
- Does NOT define article structure or headings
- `category_slug` and `category_tier` link back to the analyzer's classification
- Primary categories appear first, then secondary
- Each FAQ includes a `target_keyword` for long-tail SEO

**Validation warnings (non-fatal):**
- Meta title > 60 characters - will be truncated in search results. Flagged in output but doesn't fail
- Meta description outside 150-160 range - suboptimal for SERP display. Flagged but doesn't fail
- These warnings appear in the detail view's Warnings section so the operator can adjust before approving

**Red flags to watch for:**
- Generic keywords (e.g., "online gaming") - LLM didn't have enough specificity from analysis
- FAQ questions that are too broad - may not capture buyer intent. Keyword pack helps here
- Missing keyword distribution for important categories - planner may have skipped them

## Limitations & Edge Cases

- **No search volume data (default mode)** - Perplexity Sonar returns qualitative keyword research (PAA questions, competitor coverage) but not numeric search volume or competition scores. For real numbers, enable the v2.3.0 [keyword-data providers](#keyword-data-providers-v230) (`dataforseo` for volume/difficulty; `gsc` for own-site rank) instead of relying on a static reference doc
- **GSC live-verify deferred (v2.3.0)** - The `gsc` provider is unit-tested with a real RS256 JWT signing path (throwaway keypair, no network), but a live run against the real Google Search Console API was not performed because the service-account key (`GSC_SERVICE_ACCOUNT_KEY_PATH`) was not resolvable in the build shell. Before relying on `gsc` in production, do a one-off free live test: confirm the Search Console API is enabled, the scope is `webmasters.readonly`, and the service account is added as a user on the property
- **GSC returns own-property data only** - Google Search Console reports rank/impressions/clicks only for properties the service account is verified on. It surfaces queries you *already* rank for — it is not a general keyword-volume tool (that's `dataforseo`)
- **Autocomplete is unofficial** - The `autocomplete` kind uses Google's undocumented suggest endpoint; it may rate-limit (429 → warning, skipped) or change without notice. Treat it as best-effort free seed expansion, never a hard dependency
- **Research query failures don't fail the module** - Individual query failures are caught and logged. If all queries fail, the module falls back to `keyword-summary.md` (if uploaded) or proceeds with no keyword data. Check logs if results look generic
- **≤5 queries recommended** - More queries are allowed but multiply cost linearly. The module logs a warning if >5 queries are configured
- **Hollow plans fail loud, not soft (v2.3.2)** - A *valid-but-empty* plan (parses fine, but carries no usable keyword/head term) is treated as an **error**, not a warning: the entity gets `meta.status:'error'` and turns red. Keyword content is load-bearing (meta-compliance-checker fails "No head_terms found" without it), so unlike meta-length this is not soft. `meta`/`faqs` present but zero keywords still fails; keywords present with empty `meta` still passes (meta title has a downstream fallback). See the [v2.3.2 changelog](#v232-hollow-plan-content-gate-2026-07-19-program-a--a1--fixes-c2)
- **Meta length validation is soft** - The module warns about meta title/description lengths but doesn't force compliance. Some LLMs consistently produce titles slightly over 60 characters
- **Language-specific SEO** - Default prompt assumes English SEO conventions. Other languages have different title length norms, keyword patterns, and FAQ structures
- **No duplicate keyword detection** - If multiple companies in the same run target the same keywords, the planner doesn't coordinate. Each entity is planned independently

## What Happens Next

After the user reviews and approves the SEO plan, items enter the working pool with `source_submodule: "seo-planner"`. The pool now contains both content-analyzer items and seo-planner items for each entity.

**Content-writer** picks up both, plus the original scraped source content. The analysis provides facts, the SEO plan provides keywords, and the source content provides raw material for detailed prose. Content-writer places the specified keywords in the specified sections, writes to the format spec, and answers the FAQs.

The user can re-run seo-planner with different settings (different keyword pack) without re-running the analyzer. This is the cheapest step in the chain, so iteration here costs very little.

## Prompt caching (v2.4.0, BACKLOG #21)

The planner splits its assembled prompt before the FIRST per-entity
placeholder (`{entity_content}`, `{keyword_research}`, or
`{keyword_metrics}`): the stable head (instructions, `{faq_count}`, `{doc:}`
refs placed before it) is sent as an Anthropic prompt-cache block
(`cache_prefix`). `cachePrefix + prompt` is byte-identical to the old single
prompt -- billing only; a runtime self-check falls back to the uncached single
prompt on any divergence. The JSON-correction retry deliberately strips
`cache_prefix` (the correction prompt is standalone).

**The split is anthropic-gated.** It runs ONLY when `ai_provider` is
`anthropic`. The skeleton's openai/perplexity branches ignore `cache_prefix`
and would silently DROP the stable head, so every other provider gets the
plain single prompt -- byte-identical to pre-2.4.0 behavior, no caching.

**Every no-cache outcome is logged, never silent:** a reassembly divergence
logs a warning (caching disabled for that call, model input unchanged); a
prefix under ~16,384 chars (~4,096 tokens, the largest documented per-model
cache minimum -- sonnet-5's own minimum is undocumented and likely lower) logs
an info note. Either way, the `ai_usage` cache_write/cache_read token counts
are the ground truth for whether caching actually engaged. **To benefit, move
reference docs/stable rules BEFORE the first per-entity placeholder in the
template** -- the current company-profile template has them after
`{entity_content}`, so nothing caches until it is restructured.

## Technical Reference

- **Step:** 5 (Generation)
- **Category:** planning
- **Cost:** expensive (30 min timeout -- includes Perplexity research calls + planning LLM call per entity)
- **Data operation:** add (+) - chains from working pool, finds content-analyzer items by source_submodule
- **Pool precondition:** `requires_items` - needs items in the pool for each entity; an entity with an empty pool is marked `skipped_no_input` (not failed) before enqueue
- **Required input columns:** `entity_name`, `analysis_json`
- **Depends on:** `content-analyzer`
- **Input:** Content-analyzer output from working pool (found via `source_submodule === 'content-analyzer'`; the most recent analyzer item wins)
- **Output:** `results[]` grouped by `entity_name`, one item per entity containing flattened display fields + `seo_plan_json` object
- **Display type:** cards (not table) - one card per entity with expandable detail modal
- **Selectable:** true - operators approve/reject entire entity SEO plan
- **Detail view:** `detail_schema` with header (entity_name, status as badge, primary_keyword, faq_count) and sections (keywords_text, keyword_distribution_text as prose, meta_text, faqs_text as prose, tone_notes, warnings, error)
- **Error handling:** Per-entity. `requires_prompt_override` refusal fires before any research; missing analysis input, LLM failures, JSON parse errors (one corrective retry, then loud fail preserving `rawText`), and hollow plans (content gate) all emit `meta.status:'error'` for that entity. Entities without content-analyzer items get clear error: "No content-analyzer output found. Run content-analyzer first."
- **Dependencies:** `tools.ai` (LLM calls + Perplexity Sonar for keyword research), `tools.http` (keyword-data providers), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`, `keyword-data-providers.js`

---

<!-- ===== tone-seo-editor (step 5, v1.3.0) ===== -->

# Tone & SEO Editor

> Post-writing editing pass that refines content for tone and SEO keyword integration. Content-type-agnostic by default; vertical/brand framing is layered in via presets or template-level prompt overrides.

**Module ID:** `tone-seo-editor` | **Step:** 5 (Generation) | **Category:** generation | **Cost:** medium
**Version:** 1.3.0 | **Data Operation:** add (+)

## Changelog

- **1.3.0** -- Anthropic **prompt caching** (BACKLOG #21) + **`$`-sequence literal-insertion fix** + **extended thinking disabled** on the editing call (BACKLOG #53). Review-hardening follow-ups landed on the same version: the cache split now applies ONLY when `ai_provider` is `anthropic` (other providers get the plain single prompt, byte-identical to pre-1.3.0 behavior), and every no-cache outcome is logged instead of silent. Separately (LLM-registry rollout, no version bump), `ai_model` / `ai_provider` option values are now populated from the shared LLM registry via `values_from` instead of hardcoded lists. See **Prompt caching, $-sequence fix, thinking** below.
- **1.2.1** -- Added a post-edit **marker-preservation gate** (W1.5). Every heading bracket marker the Step 8 bundlers can parse in the input (e.g. `[Primary Category: slug]`, `[Tag: slug]`) MUST still be parseable in the revised output, or the entity hard-fails with an error naming the dropped markers. The gate reuses the bundlers' own parser (`modules/_shared/marker-parser.js`), so it can never drift from what the bundlers actually accept. Pipeline-agnostic: input with no markers passes trivially. Behaviour is otherwise unchanged.
- **1.2.0** -- Module-level default genericised per the "small generic modules, not specialized ones" architectural commitment. Removed iGaming-vertical and B2B framing, removed hardcoded `{doc:tone_guide.md}` placeholder, removed company-profile-specific `[Overview]` / `[Primary Category: ...]` literal examples (rule kept generically). Generic SEO/structural/citation/FAQ rules retained. `{doc:<filename>}` mechanism still supported -- operator chooses the filename in their preset or override. See **Configuring per content type** below for the preset + template-override pattern.
  - **Upgrade note:** existing templates with a customized stored prompt do NOT auto-pick-up the new default. Templates that previously customized around the v1.0.0/v1.1.0 iGaming framing or `{doc:tone_guide.md}` placeholder continue to work unchanged. To adopt the v1.2.0 genericised default + preset architecture on an existing template, load the new default into the prompt textarea, then layer the OnlyiGaming voice preset on top.
- **1.1.0** -- (committed, not pushed) Added `{doc:tone_guide.md}` hardcoded placeholder and "leave good sections alone" license. Lock-ins reverted in v1.2.0; license retained.
- **1.0.0** -- Initial release.

---

## Background

### The Content Problem This Solves

Content-writer produces complete company profiles, but the first draft often has uneven tone and imprecise keyword placement. The writer focuses on generating comprehensive, factual prose at a creative temperature (0.4-0.7). Tone refinement and keyword integration are different tasks that benefit from a separate pass at a lower temperature (0.3-0.5).

Without a dedicated editing step, improving tone or keyword density requires regenerating the entire article -- an expensive operation that risks losing good content. By separating editing from writing, operators can iterate on tone and SEO without the cost of full regeneration.

### How It Fits the Pipeline Architecture

Tone & SEO Editor is the third submodule in Step 5's chain, running after content-writer:

```
content-analyzer (+) -> seo-planner (+) -> content-writer (+) -> tone-seo-editor (+)
```

It uses the **add** data operation -- it produces a revised version of the content as new pool items. The content structure, citations, and heading markers are preserved; only tone, clarity, and keyword placement are improved.

### Why Separate From Content-Writer?

1. **Different LLM temperature** -- Creative writing benefits from 0.4-0.7; editing works best at 0.3-0.5
2. **Retry without regeneration** -- Can re-run the tone pass without regenerating the entire article
3. **Cheaper/faster model** -- Editing is a structured task; haiku handles it well, saving cost compared to sonnet
4. **QA feedback loop** -- If QA identifies "tone/SEO weak" issues, this step can be re-run in isolation
5. **Tone experimentation** -- Try different tone styles (B2B, casual, technical) on the same content

## When to Use

**Always use when:**
- Content needs consistent B2B tone for client-facing profiles
- SEO keyword placement needs improvement after initial writing
- Content passes through QA and gets flagged for tone or keyword issues

**Consider settings carefully when:**
- Working with non-English content (tone rules assume English conventions)
- Content is already well-optimized (unnecessary passes add cost without value)

**Can skip when:**
- Content-writer prompt already includes detailed tone and keyword instructions
- Content will go through a human editing pass anyway
- Internal/draft content where tone consistency is not critical

## Options Guide

| Option | Type | Default | When to Change | What It Does |
|--------|------|---------|----------------|--------------|
| `ai_model` | select (registry-driven) | `haiku` | Sonnet for higher-quality editing; haiku for fast/cheap iteration | Which model runs the edit. Editing is less creative than writing -- haiku produces good results. The dropdown is NOT a hardcoded list: the skeleton populates it from the shared LLM registry (`values_from: registry.models`), scoped to the default provider's models. |
| `ai_provider` | select (registry-driven) | `anthropic` | Switch for model comparison or cost experiments | Which LLM provider to call. Values come from the shared LLM registry (`values_from: registry.providers`): anthropic, openai, perplexity, gemini, openrouter. Note: prompt caching engages ONLY on the anthropic path -- other providers always get the plain single prompt. |
| `reference_docs` | doc_selector | (none) | Attach any reference doc your prompt references via a `{doc:<filename>}` placeholder (e.g. a voice guide, style sheet, brand brief) | Files selected here are injected into the prompt wherever a matching `{doc:<filename>}` placeholder appears. Unmatched placeholders are silently stripped. The module default uses NO `{doc:...}` placeholders -- add one in your preset or template-level override and tick the matching file. |
| `temperature` | number (0.1-0.7) | `0.4` | Lower (0.3) for minimal changes; higher (0.5) for more aggressive rewrites | Controls how much the editor deviates from the original. Default 0.4 balances fidelity with improvement. |
| `tone_style` | select | `b2b_authoritative` | Switch based on audience and content type (`casual_informative`, `technical_precise`) | Selects which built-in tone instruction set is injected via `{tone_instructions}`. See **Tone Styles Explained**. |
| `max_tokens` | number (1024-32768) | `32768` | Should match or exceed content-writer's `max_tokens`; lower only for short content forms | Maximum tokens in the LLM response. The output is a full revised article -- a low cap truncates it mid-article. |
| `max_content_chars` | number (5000-100000) | `50000` | Increase for very long profiles; decrease to save tokens | Input content is truncated to this many characters (with a visible truncation notice appended) before being sent to the model. Most company profiles are under 20,000 characters. |
| `prompt` | textarea (presets enabled) | (editing template) | Customize for specific editorial guidelines or brand voice | Full LLM instruction with `{content_markdown}`, `{keyword_targets}`, `{tone_instructions}`, and `{doc:<filename>}` placeholders. Max 10,000 chars. |

The `ai_model` / `ai_provider` dropdowns are registry-driven: instead of value lists baked into this manifest, the skeleton resolves the shared LLM registry at load time and fills in the available providers (anthropic, openai, perplexity, gemini, openrouter) and the models scoped to the default provider. Defaults are unchanged (`anthropic` / `haiku`), so existing templates behave identically; new providers/models become selectable without touching this module.

### Tone Styles Explained

**b2b_authoritative** (default)
Professional, confident, benefit-first language. Targets decision-makers (CTOs, compliance officers, procurement leads). Active voice, strong verbs, no hedging. Industry terminology used without over-explanation. Sentences kept under 25 words.

**casual_informative**
Friendly, approachable tone. Uses contractions, occasional rhetorical questions, short paragraphs. Like explaining to a smart colleague. Simple words over complex ones. Good for blog-style content or introductory profiles.

**technical_precise**
Exact terminology, no marketing language. Specific numbers, version numbers, protocol names. Passive voice where the actor is irrelevant. Completeness over brevity. Good for technical product profiles or integration guides.

## Configuring per content type

The module default prompt is intentionally content-type-agnostic (no vertical lock, no hardcoded reference-doc filename, no content-type-specific output markers). Per the project's architectural commitment ("small generic modules, not specialized ones"), vertical/brand/content-type specifics layer on via two mechanisms:

### Preset -- for specifics reused across multiple templates

Presets are operator-authored and stored in the skeleton's `option_presets` Supabase table. They are not files in this repo -- there is nothing to commit. Author flow:

1. In the UI, open any template's Tone & SEO Editor step.
2. Paste the full customized prompt (e.g. add the vertical framing, append `{doc:tone_guide.md}` under a "### BRAND TONE GUIDE" section) into the `prompt` textarea.
3. Click **Save as preset**, name it (e.g. `OnlyiGaming B2B iGaming Voice`), choose **Global** so all projects see it.
4. Other templates select it from the **-- Presets --** dropdown above the prompt field; the full prompt loads.

**Stacking is NOT supported.** The preset dropdown REPLACES the field value -- picking a preset clobbers whatever is there, picking a second preset clobbers the first. One preset per option per template.

### Template-level override -- for one-off specifics

Anything specific to a single template (e.g. company-profile output markers like `[Overview]` or `[Primary Category: ...]`) belongs in the template's stored prompt, not the preset. Workflow:

1. Select the relevant preset from the dropdown to load its prompt as a starting point.
2. Edit the prompt textarea directly to append/insert the template-specific rules.
3. Save the template. The customized prompt is stored against that template only.

The OnlyiGaming company-profile template, for example, loads the `OnlyiGaming B2B iGaming Voice` preset and then appends a rule: *"Do NOT change or remove these heading/type markers: [Overview], [Primary Category: ...]."*

### `{doc:<filename>}` placeholder mechanism

Any text inside the prompt of the form `{doc:somefile.md}` is replaced at execution time with the contents of `somefile.md`, IF the operator ticks `somefile.md` in `reference_docs`. If the file is not attached, the placeholder is silently stripped. The filename is arbitrary -- pick whatever the operator will upload (`tone_guide.md`, `voice_brief.md`, `style_guide.md`, etc.). The module makes no assumptions about which filenames exist.

## Recipes

### Standard B2B Edit
Balanced tone and keyword optimization for production profiles:
```
ai_model: haiku
tone_style: b2b_authoritative
temperature: 0.4
```

### SEO Focus
Emphasize keyword placement with minimal tone changes:
```
ai_model: haiku
tone_style: b2b_authoritative
temperature: 0.3
```
Tip: Lower temperature makes the editor more conservative, focusing on keyword insertions over stylistic changes.

### Light Touch
Minimal editing -- fix only obvious issues:
```
ai_model: haiku
tone_style: b2b_authoritative
temperature: 0.3
max_content_chars: 50000
```

### Technical Product Profile
Precise, no-marketing-fluff editing for technical products:
```
ai_model: sonnet
tone_style: technical_precise
temperature: 0.3
```

## Expected Output

**Healthy result:**
- Revised content_markdown with improved tone and keyword placement
- Line change count indicating editing scope (typically 20-40% of lines)
- Keyword placement analysis showing where target keywords appear
- Word count roughly similar to original (within 10%)

**Output fields per entity:**
- `entity_name` -- company name
- `status` -- `edited` or `error`
- `word_count` -- word count of revised content
- `tone_changes_count` -- number of lines that differ from original
- `keywords_placed` -- number of target keywords found in revised content
- `revision_summary` -- one-line summary of changes made
- `content_preview` -- first 300 characters of the revised content
- `content_markdown` -- the revised content (replaces original)
- `keyword_placements` -- array of `{ keyword, locations[] }` objects
- `keyword_placements_text` -- human-readable keyword placement report
- `error` -- error message when `status` is `error`, empty otherwise

**Detail view sections:** Revised Content (prose), Revision Summary (text), Keyword Placements (prose), Error (text)

**Example revision summary:**
```
42 lines changed | 8/10 target keywords placed | keyword occurrences: 12 -> 23 | word count: 1850 -> 1920 (+70) | tone style: b2b_authoritative
```

**Red flags to watch for:**
- `tone_changes_count` is 0 or very low -- the LLM may have returned the original unchanged
- `tone_changes_count` exceeds 80% of total lines -- the LLM rewrote instead of editing
- Word count dropped significantly -- the LLM may have removed content
- Keyword placements is 0 when keywords were provided -- check if the prompt is working correctly

## Limitations & Edge Cases

- **No factual verification** -- The editor cannot verify that its changes preserve factual accuracy. It is instructed not to add or remove claims, but LLMs occasionally do so
- **Citation preservation** -- The prompt instructs preservation of `[#n]` citations, but aggressive edits may occasionally relocate or drop them
- **Heading marker fidelity** -- Type markers like `[Overview]` and `[Primary Category: ...]` are ENFORCED (v1.2.1): if the LLM drops or mangles any marker present in the input, the entity hard-fails instead of silently passing garbled output downstream. The check uses the Step 8 bundlers' own parser. (Markers lost to `max_content_chars` truncation are not counted -- only markers in the text actually sent to the model.)
- **No SEO plan is a soft degrade, not a failure** -- If no pool item carries `seo_plan_json`, the entity is still edited for tone only (a warning is logged and the prompt receives "No SEO plan available. Focus on tone improvements only.")
- **Keyword stuffing risk** -- If too many keywords are targeted, the LLM may over-insert them. Keep target lists under 15 total keywords
- **Language limitations** -- Tone instructions assume English. Other languages may not benefit from the same editing patterns
- **Content length** -- Very long content (40,000+ chars) may be truncated, causing partial editing. Monitor the `max_content_chars` setting

## What Happens Next

After the operator reviews and approves the edited content, items enter the working pool with the revised `content_markdown`. This replaces the content-writer's original draft.

Downstream Step 8 bundling submodules (markdown-output, html-output, json-output) will pick up the revised content via data-shape routing -- they look for `content_markdown` on items regardless of which submodule produced it.

If the editing quality is insufficient, the operator can re-run tone-seo-editor with different settings (different tone style, different temperature) without re-running content-writer.

## Prompt caching, $-sequence fix, thinking (v1.3.0, BACKLOG #21/#53)

**`$`-sequence fix:** `buildPrompt` inserts the article, keyword targets, tone instructions and `{doc:}` content with function-form replacement, so `$`-sequences (`$$`, `$&`, `` $` ``, `$'`, `$n`) are inserted literally instead of being interpreted as replacement patterns (same fix class as c5b0ef6; previously the edited article was silently mangled around money amounts).

**Prompt caching is Anthropic-only.** When `ai_provider` is `anthropic`, the editor splits its prompt before the first per-entity placeholder (`{content_markdown}` / `{keyword_targets}`) and sends the stable head as a `cache_prefix`. Reassembly is guarded at runtime: `cachePrefix + prompt` must be byte-identical to the single-pass prompt, or the split falls back to the plain prompt with caching disabled and a logged warning. Any other provider gets the plain single prompt, byte-identical to pre-1.3.0 behavior -- the skeleton's non-anthropic branches ignore `cache_prefix` and would silently drop the stable head.

**Every no-cache outcome is logged, not silent:** a diverged reassembly logs a warning; a cache prefix under ~16,384 chars (~4,096 tokens, the largest documented per-model cache minimum) logs an info note explaining that caching may not engage and that `ai_usage` cache_write/read tokens are the ground truth. The current default template's head is ~170 chars, far below the minimum, so caching stays inert (and logged) until the template moves stable bulk ahead of `{content_markdown}`.

**Extended thinking is disabled** on the editing call (`thinking: { type: 'disabled' }`): an editing pass needs no reasoning budget -- on a real run (cb49ef80), adaptive thinking burned ~17-24k invisible tokens and truncated the output at the 32,768-token cap. The skeleton adapter gates the flag by model family, so models without a thinking control are unaffected.

## Technical Reference

- **Step:** 5 (Generation)
- **Category:** generation
- **Cost tier:** medium -- LLM call per entity; sized for a 5-minute per-entity timeout window
- **Data operation:** add (+) -- produces revised content_markdown as new pool items
- **Pool precondition:** `requires_items` -- the pool must already contain items for an entity; the skeleton marks entities with an empty pool `skipped_no_input` instead of running (or failing) them
- **Required input columns:** `seo_plan_json` (manifest `requires_columns`, for selective field loading); `content_markdown` arrives via data-shape routing
- **Depends on:** `content-writer`, `seo-planner` (seo-planner output is used when present; see Limitations for the tone-only degrade)
- **Input:** Content items found by field presence (`item.content_markdown`), SEO items found by field presence (`item.seo_plan_json`); the LATEST item of each shape is used (last in pool = most recent on re-runs). SEO keywords are read from both `seo_plan_json.target_keywords` and `seo_plan_json.keywords_used` shapes, deduplicated, plus `keyword_distribution` per-section detail when present
- **Output:** `results[]` grouped by `entity_name`, one item per entity with revised content_markdown and editing metrics
- **Display type:** cards (not table) -- one card per entity with expandable detail modal
- **Selectable:** true -- operators approve/reject the edited version
- **Detail view:** `detail_schema` with header (entity_name, status as badge, word_count, tone_changes_count, keywords_placed) and sections (content_markdown as prose, revision_summary as text, keyword_placements_text as prose, error as text)
- **Error handling:** Per-entity. Missing `content_markdown` -> error item ("Run content-writer first"). LLM failure -> error item with the exception message. Dropped/mangled heading markers -> LOUD per-entity fail naming the exact markers (see v1.2.1). Code fences around the LLM output are stripped defensively. After every entity (success or error), results are pushed to `tools._partialItems` so a timeout preserves progress
- **Dependencies:** `tools.ai` (LLM calls), `tools.logger`, `tools.progress`; `modules/_shared/marker-parser.js` (shared with the Step 8 bundlers)
- **Files:** `manifest.json`, `execute.js`, `README.md`, `CLAUDE.md`, `test-cache-split.js`, `test-marker-gate.js`

---

<!-- ===== citation-coverage-checker (step 6, v1.0.0) ===== -->

# Citation Coverage Checker

> Verifies that every factual claim in generated content is backed by an inline citation referencing a valid source URL from the content-analyzer's source_citations array.

**Module ID:** `citation-coverage-checker` | **Step:** 6 (QA) | **Category:** qa | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## What This Module Does

Parses content_markdown for inline citation references (`[#1]`, `[#2]`, etc.), cross-references them against the source_citations array in analysis_json, and uses heuristics to flag factual claims that lack citations. Produces a citation_score (0--1) and a pass/fail verdict per entity, emitted as one QA verdict item per entity into the pool (upstream content items are not modified).

```
content-writer + content-analyzer -> THIS MODULE -> loop-router (Step 7)
```

### Checks

1. **Content has citations** -- Content with zero inline `[#n]` references is an automatic fail (score 0) when `require_at_least_one_citation` is true (the default). If the writer did not cite anything, coverage is zero.

2. **Citation references resolve** -- Every `[#n]` in the content must have a matching entry in `source_citations`. A reference to `[#5]` when the citations array only has 3 entries is a broken citation.

3. **Factual claims have citations** -- Sentences containing numbers, dates, statistics, currency amounts, percentages, or company-specific claims ("founded in", "headquartered in", "employs", "licensed by", "acquired by") are flagged if they lack an inline citation. General knowledge statements ("iGaming is a growing industry") are excluded.

4. **Source URLs are live** (optional) -- When `verify_urls` is enabled, HEAD requests (10s timeout, deduplicated across sources, sent in parallel) check that each unique source URL responds with a 2xx/3xx status.

### Input Data

This module uses data-shape routing. It finds its input by checking which fields exist on pool items, never by checking `source_submodule`:

- **Content items**: items with `content_markdown` (from content-writer). All content items for an entity are combined before checking.
- **Analysis items**: items with `analysis_json` containing `source_citations` (from content-analyzer). The first analysis_json found is used.

If an entity has no `content_markdown` item at all, it fails loudly: `qa_pass: false`, score 0, with summary "No content_markdown found -- ensure content-writer has run."

If `analysis_json` is missing (or has no `source_citations`), the source map is empty, so **every** `[#n]` reference counts as broken -- the score collapses. This is not a skip; run content-analyzer first.

---

## When to Use

**Always run when:**
- content-writer and content-analyzer have both run and the content is expected to carry inline `[#n]` citations
- Content is heading toward publishing or distribution (Step 9) -- this is the citation gate

**Skip when:**
- The template's content style has no citations at all AND you don't want a QA verdict for it (alternatively, keep it running with the no-citation recipe below)
- content-analyzer is not part of the pipeline -- without source_citations every reference counts as broken and the check only produces noise

**Tune the settings when:**
- Draft-stage runs: lower `pass_threshold`, keep `verify_urls` off
- Final pre-publish QA: raise `pass_threshold`, turn `verify_urls` on
- Citation-free house style: see the "No-citation content style" recipe -- flipping `require_at_least_one_citation` alone is not enough (see Options Guide)

---

## Options Guide

| Option | Type | Default | What It Does | When to Change |
|--------|------|---------|--------------|----------------|
| `pass_threshold` | number | 0.7 | Minimum citation_score (0--1) for qa_pass to be true. 1.0 means every factual claim must have a citation. | Raise to 0.9--1.0 for production content going out without human review. Lower to 0.5 for early drafts. |
| `verify_urls` | boolean | false | Send HEAD requests to each source URL to check it is still live. Adds HTTP cost and latency. | Enable for final QA before publishing. Keep off for draft-stage checks. |
| `require_factual_citations` | boolean | true | Flag sentences with numbers, dates, statistics, or company-specific claims that lack an inline citation. | Disable if the content style intentionally avoids inline citations. |
| `require_at_least_one_citation` | boolean | true | Content with zero `[#n]` citations fails automatically, regardless of pass_threshold. | Disable for content styles that legitimately ship without citations. |

The most impactful pair is `require_at_least_one_citation` + `pass_threshold`. Note the interaction: turning `require_at_least_one_citation` off does NOT make zero-citation content pass on its own -- with zero citations the score is always 0, so the entity still fails any `pass_threshold` above 0.0. To fully accept citation-free content you must also set `pass_threshold: 0.0` (and usually `require_factual_citations: false`).

---

## How Scoring Works

The citation_score is calculated as:

```
citation_score = valid_citations / (valid_citations + uncited_claims + broken_citations)
```

Where:
- **valid_citations** = number of unique `[#n]` references that have a matching source in source_citations
- **uncited_claims** = number of factual-claim sentences without any citation (only counted when `require_factual_citations` is true)
- **broken_citations** = number of `[#n]` references with no matching source

The entity passes when `citation_score >= pass_threshold`.

### Special cases

- Zero citations in content = automatic fail (score 0) when `require_at_least_one_citation` is true. With the option off, the entity still gets score 0 and only passes if `pass_threshold` is 0.0.
- No content_markdown at all = automatic fail with an explicit "ensure content-writer has run" summary.
- No analysis_json available = all citation refs are treated as broken (no source map to match against).
- Same source cited multiple times = fine; `citation_count` counts unique reference numbers.
- Dead URLs (from `verify_urls`) are reported in the detail view and counted in meta, but do NOT reduce the citation_score or flip qa_pass on their own.

---

## Recommended Configurations

### Standard (default)

Balanced check for draft-stage content:

```
pass_threshold: 0.7
verify_urls: false
require_factual_citations: true
require_at_least_one_citation: true
```

### Strict

For content going directly to production without human review:

```
pass_threshold: 0.9
verify_urls: true
require_factual_citations: true
require_at_least_one_citation: true
```

### Lenient

For early drafts where citations may be incomplete:

```
pass_threshold: 0.5
verify_urls: false
require_factual_citations: false
require_at_least_one_citation: true
```

### No-citation content style

For templates whose content intentionally carries no inline citations (all three changes are required -- see Options Guide):

```
pass_threshold: 0.0
verify_urls: false
require_factual_citations: false
require_at_least_one_citation: false
```

---

## What Good Output Looks Like

### All checks pass

```
entity_name: "Bet365"
qa_pass: true
citation_score: 0.923
citation_count: 12
source_count: 8
uncited_claims_count: 1
broken_citations_count: 0
```

### Typical failures

```
entity_name: "NewCasino"
qa_pass: false
citation_score: 0.429
citation_count: 3
source_count: 5
uncited_claims_count: 4
broken_citations_count: 0
uncited_claims_text: "1. The company employs over 500 staff across three offices.\n2. Revenue reached $2.1 billion in 2025.\n3. Founded in 2018 by two industry veterans.\n4. Licensed by the Malta Gaming Authority and the UKGC."
```

### Output fields

| Field | Type | Description |
|-------|------|-------------|
| `entity_name` | string | Entity this check applies to |
| `qa_pass` | boolean | Whether citation_score meets the pass_threshold. Rows with `qa_pass: false` are flagged in the results table. |
| `citation_score` | number | Coverage score from 0 to 1 |
| `citation_count` | number | Unique inline `[#n]` references found in content |
| `source_count` | number | Entries in the source_citations array |
| `uncited_claims_count` | number | Factual-claim sentences without citations |
| `broken_citations_count` | number | `[#n]` references with no matching source |
| `uncited_claims_text` | string | Numbered list of uncited factual claims (detail view) |
| `broken_citations_text` | string | List of broken citation references (detail view) |
| `dead_urls_text` | string | List of dead source URLs, or "URL verification disabled." (detail view) |
| `summary_text` | string | Human-readable summary of all findings |

### Warning signs

- **Every entity fails with "Content contains no inline citations"** -- the content-writer template prompt does not instruct `[#n]` citations. Fix the prompt, or use the No-citation recipe if that's intentional.
- **High `broken_citations_count` with `source_count: 0`** -- content-analyzer didn't run for these entities or its analysis_json has no `source_citations`. Check Step 5 output before blaming the writer.
- **summary_text says "No content_markdown found"** -- content-writer failed or was skipped for that entity; the verdict is about missing input, not citation quality.
- **Many dead URLs reporting timeouts/errors** -- some sites reject HEAD requests. Dead URLs are advisory (they don't fail the entity); verify manually before removing sources.

---

## Limitations

- **Heuristic-based claim detection.** The factual claim patterns cover common cases (numbers, dates, company facts) but will miss unusual phrasings and may flag non-factual sentences that happen to contain numbers.
- **No semantic understanding.** The module cannot tell if a number is a factual claim or a UI element ("Step 1", "Section 3"). It uses pattern matching, not NLP.
- **URL verification is basic.** HEAD requests check reachability, not content. A URL returning 200 with a "Page Not Found" body would pass.
- **Single-pass analysis.** Citation references and factual claims are checked independently. The module does not verify that a citation actually supports the claim it is attached to.
- **General knowledge filter is conservative.** Some domain-specific common knowledge may still be flagged. Operators should review uncited claims rather than treating the count as absolute.

---

## What Happens Next

Results feed into Step 7 (loop-router) for routing decisions. Typical configurations:

- **All pass**: route to Step 8 (bundling) or Step 9 (distribution)
- **Failures present**: route back to Step 5 (content-writer) with uncited_claims feedback for regeneration
- **pass_threshold < 1.0**: allows partially-cited content through for operator review at Step 10

---

## Technical Reference

- **Step:** 6 (QA)
- **Category:** qa
- **Cost tier:** cheap -- pure deterministic checks, shortest timeout tier (URL verification adds HTTP latency but no LLM cost)
- **Data operation:** add (+) -- emits one QA verdict item per entity, keyed by `entity_name`; upserted alongside upstream items without modifying them
- **Pool precondition:** `requires_items` -- entities with an empty pool are marked `skipped_no_input` (not failed) before execution
- **Required input columns:** `analysis_json`
- **Depends on:** `content-writer` (content_markdown), `content-analyzer` (analysis_json.source_citations)
- **Input format:** data-shape routing on pool items -- `content_markdown` for content, `analysis_json.source_citations` for the source map. Tolerates three source_citations shapes: `[{index, url, title}]`, `[{claim, sources: [url, ...]}]`, and plain `["url", ...]` (1-indexed).
- **Output format:** one item per entity matching the output fields table above; per-entity `meta` carries qa_pass, citation_score, and counts; run summary reports passed/failed totals and average score
- **Error handling:** missing content or zero citations produce explicit fail items (never silent skips); each entity's result is pushed to `tools._partialItems` so a timeout preserves completed entities; failed URL checks are caught per-URL and reported as dead
- **External dependencies:** none for the core checks (no AI calls, purely deterministic). Optional HEAD requests via `tools.http` when `verify_urls` is true.

---

<!-- ===== hallucination-detector (step 6, v1.0.3) ===== -->

# Hallucination Detector

> Compare generated content claims against original source material to flag statements that aren't supported by any source.

**Module ID:** `hallucination-detector` | **Step:** 6 (QA) | **Category:** qa | **Cost:** medium
**Version:** 1.0.3 | **Data Operation:** add (+)

---

## What This Module Does

Extracts factual claims from content_markdown using heuristic patterns (numbers, dates, statistics, company-specific facts), then sends batches of claims to an LLM along with the original source text_content for verification. Each claim gets a verdict: supported, partially supported, or unsupported. The module produces a hallucination_score (0--1) and a pass/fail verdict.

### Process

1. **Claim extraction** -- Sentences containing numbers, dates, percentages, currency amounts, or company-specific assertions ("founded in", "headquartered in", "employs", "licensed by", "operates in") are extracted from content_markdown. General knowledge sentences are excluded.

2. **Source gathering** -- All text_content from scraped pages (page-scraper, browser-scraper) is combined into a single source corpus, respecting the max_source_chars limit.

3. **LLM verification** -- Claims are batched (default 10 per batch) and sent to the configured LLM with the source text. The LLM returns a verdict per claim: supported, unsupported, or partial, along with a severity rating and supporting quote.

4. **Scoring** -- `hallucination_score = (supported + partial * 0.5) / total_claims`. The entity passes when `hallucination_score >= pass_threshold`.

---

## When to Use

- **Always** after content-writer has generated content from scraped sources
- **Before** publishing or distribution (Step 9)
- Particularly important for content about specific companies where facts must be verifiable
- Run alongside citation-coverage-checker for comprehensive QA

---

## Input Data

This module uses data-shape routing. It finds its input by checking which fields exist on pool items:

- **Content items**: items with `content_markdown` (from content-writer)
- **Source items**: items with `text_content` (from page-scraper or browser-scraper)

---

## Options Guide

| Option | Type | Default | What It Does | When to Change |
|--------|------|---------|--------------|----------------|
| `pass_threshold` | number | `0.9` | Minimum hallucination_score (0--1) for qa_pass to be true. 1.0 means every claim must be verified | Lower to 0.7 for draft-stage content. Set to 1.0 for zero-tolerance on unsupported claims |
| `ai_model` | select | `sonnet` | Which model runs claim verification. **Registry-driven** (`values_from: registry.models`): the skeleton populates the dropdown from the shared LLM registry, scoped to the default provider -- not a hardcoded list in this manifest | Switch to a larger registry model for better accuracy on nuanced claims; a smaller one to cut cost on draft batches |
| `ai_provider` | select | `anthropic` | Which LLM provider to call. **Registry-driven** (`values_from: registry.providers`): the skeleton populates the values from the shared registry (anthropic, openai, perplexity, gemini, openrouter) | Switch providers to compare verification quality or route around an outage |
| `max_source_chars` | number | `100000` | Max total characters of source text in the LLM context (range 10,000--500,000). Truncates from the end if exceeded | Increase if sources are large and claims reference distant content. Decrease to save tokens |
| `claims_per_batch` | number | `10` | Claims verified per LLM call (range 1--25) | Lower to 5 for more reliable results. Higher values use fewer API calls but may reduce accuracy |
| `allow_empty_content` | boolean | `false` | When `false`, an entity with no `content_markdown` **fails closed** (`qa_pass: false`) -- content was expected but is absent, and a QA gate must not certify content it never read. When `true`, such an entity skips with a pass (nothing to verify) | Set `true` only for pipelines that legitimately produce entities with no content to check |

The model options are no longer hardcoded: the manifest declares `values_from` and the skeleton resolves the actual provider/model lists from the shared LLM registry at load time. Adding a provider or model to the registry makes it available here with no manifest change.

> **Verification prompt is code-locked (W2.3).** The fact-checking prompt is a
> truth metric standardized system-wide -- it is inlined in `execute.js`
> (`MANIFEST_DEFAULT_PROMPT`) and is **not** a template-overridable option. A
> template must not be able to weaken the fact-check (a `prompt` supplied by a
> template is silently ignored). To change the verdict criteria or severity
> definitions, edit the module code (a deliberate, reviewed change), not a
> template preset.

---

## How Scoring Works

The hallucination_score is calculated as:

```
hallucination_score = (supported_count + partial_count * 0.5) / total_claims
```

Where:
- **supported_count** = claims the LLM confirmed are backed by source material
- **partial_count** = claims partially supported (key details may differ)
- **total_claims** = all factual claims extracted from content

The entity passes when `hallucination_score >= pass_threshold`. The half-weighting of partials lives only in the score -- the reported counts (verified / partial / flagged) sum to the total without blending.

### Severity ratings

Each unsupported claim is rated by severity:
- **high** = specific number, date, statistic, or financial claim not found in sources
- **medium** = specific factual claim (company name, product, feature) not found in sources
- **low** = general phrasing, opinion, or common knowledge that is hard to verify

### Special cases

- No content_markdown available = **fail closed** (`qa_pass: false`) by default -- content was expected but is absent, so nothing could be verified (set `allow_empty_content` to skip with a pass instead)
- No source text_content available = skip with pass and warning (cannot verify without sources)
- No factual claims detected = automatic pass (content has no verifiable facts)
- LLM call fails = that batch's claims treated as unsupported (fail-safe)
- LLM response unparseable, or fewer verdicts returned than claims sent = affected claims treated as unsupported (fail-safe)

---

## Recommended Configurations

Model values below are registry aliases -- pick from whatever the registry dropdown offers in your deployment.

### Standard (default)

Balanced check for most content pipelines:

```
pass_threshold: 0.9
ai_model: sonnet
ai_provider: anthropic
max_source_chars: 100000
claims_per_batch: 10
allow_empty_content: false
```

### Strict

For content going directly to production without human review:

```
pass_threshold: 1.0
ai_model: sonnet
ai_provider: anthropic
max_source_chars: 100000
claims_per_batch: 5
allow_empty_content: false
```

### Quick

For draft-stage content or large batches where speed matters:

```
pass_threshold: 0.7
ai_model: haiku
ai_provider: anthropic
max_source_chars: 50000
claims_per_batch: 15
allow_empty_content: false
```

---

## What Good Output Looks Like

### All claims verified

```
entity_name: "Bet365"
qa_pass: true
hallucination_score: 0.952
verified_claims_count: 19
partial_claims_count: 2
total_claims_count: 21
flagged_claims_count: 0
```

### Typical failure

```
entity_name: "NewCasino"
qa_pass: false
hallucination_score: 0.714
verified_claims_count: 9
partial_claims_count: 2
total_claims_count: 14
flagged_claims_count: 3
flagged_claims_text: "1. [HIGH] Revenue reached $2.1 billion in 2025.\n2. [MEDIUM] The company partners with over 40 game providers.\n3. [HIGH] NewCasino holds licenses in 12 regulated markets."
```

### Output fields

| Field | Type | Description |
|-------|------|-------------|
| `entity_name` | string | Entity this check applies to |
| `qa_pass` | boolean | Whether hallucination_score meets the pass_threshold |
| `hallucination_score` | number | Verification score from 0 to 1 (1.0 = all verified) |
| `verified_claims_count` | number | Claims with "supported" verdict (matches `meta.supported`) |
| `partial_claims_count` | number | Claims with "partial" verdict (half-weighted in the score only) |
| `total_claims_count` | number | Total factual claims extracted from content (verified + partial + flagged) |
| `flagged_claims_count` | number | Claims with "unsupported" verdict |
| `flagged_claims` | array | Objects with `claim` and `severity` for each unsupported claim |
| `flagged_claims_text` | string | Formatted list of unsupported claims with severity (detail view) |
| `partial_claims_text` | string | Formatted list of partially supported claims with quotes (detail view) |
| `summary_text` | string | Human-readable summary of all findings |

### Warning signs

- **Entities passing with `total_claims_count: 0` and "No source text_content available"** -- the pass is a warning-level skip, not a verification. Check why Step 3 scraping produced no text_content for those entities.
- **`qa_pass: false` with summary "No content_markdown found"** -- the failure is upstream: content-writer produced nothing for this entity. Fix generation, or set `allow_empty_content` if the pipeline legitimately has content-free entities.
- **Log lines "returned unparseable response"** -- that whole batch was marked unsupported and the score dropped. Try a lower `claims_per_batch` or a stronger model.
- **`hallucination_score` of exactly 1 with zero claims** -- no factual claims were detected, so nothing was actually checked; this is normal for opinion-heavy content but worth a spot-check on factual content.

---

## Limitations

- **LLM-dependent accuracy.** The verification quality depends on the LLM model. Smaller models may miss nuanced paraphrasing or incorrectly flag supported claims. Larger models are more accurate but cost more.
- **Heuristic claim extraction.** The factual claim patterns cover common cases but will miss unusual phrasings and may flag non-factual sentences that happen to contain numbers (e.g. "Step 3 of the process").
- **Source text truncation.** If source material exceeds max_source_chars, some sources are truncated. Claims referencing truncated content may be incorrectly flagged.
- **No cross-reference verification.** Claims are checked against the combined source corpus, not against external databases or APIs. If the source itself is wrong, the claim passes.
- **General knowledge is subjective.** The heuristic filter for general knowledge is conservative. Some domain-specific common knowledge may still be sent to the LLM for verification, adding cost without value.
- **Cost scales with claims.** Each batch of claims requires an LLM call. Content with many factual claims will generate more API calls. Monitor costs with large batches of entities.

---

## What Happens Next

Results feed into Step 7 (loop-router) for routing decisions. Typical configurations:

- **All pass**: route to Step 8 (bundling) or Step 9 (distribution)
- **Failures present**: route back to Step 5 (content-writer) with flagged_claims feedback for regeneration
- **High-severity unsupported claims**: may warrant manual review at Step 10

---

## Technical Reference

- **Step:** 6 (QA)
- **Category:** qa
- **Cost tier:** medium -- LLM calls per claim batch; gets the medium execution timeout
- **Data operation:** add (+) -- emits one QA-verdict item per entity, keyed by `entity_name` (`item_key: entity_name`)
- **Pool precondition:** `requires_items` -- entities with an empty pool are skipped upstream (`skipped_no_input`) before this module runs
- **Required input columns:** `text_content`
- **Depends on:** `content-writer`, `page-scraper` (per manifest; via data-shape routing, any module producing `text_content` -- e.g. browser-scraper -- also qualifies as a source)
- **Input format:** pool items with `content_markdown` (content to check) and `text_content` (sources), found by field presence, never by `source_submodule`
- **Output format:** one item per entity matching the output fields table above; `meta` additionally carries `supported` / `partial` / `unsupported` / `batches_sent` (and `skipped` + `skip_reason` on skip paths)
- **Error handling:** LLM failures and unparseable responses fail safe (affected claims marked unsupported, run continues); missing content fails closed unless `allow_empty_content`; successfully-verified per-entity results are pushed to `tools._partialItems` so a timeout preserves completed entities (the skip and fail-closed paths return immediately and do not push)
- **External dependencies:** none beyond `tools.ai.complete()` -- no direct HTTP calls
- **Spec:** `Content-Pipeline/specs/SUBMODULE_DEVELOPMENT.md`

---

<!-- ===== keyword-sufficiency-checker (step 6, v1.0.1) ===== -->

# Keyword Sufficiency Checker

Validates that generated content includes target SEO keywords at the right density and in the right positions (headlines, first paragraphs, meta tags), producing a pass/fail verdict with a detailed placement report.

| Field | Value |
|-------|-------|
| Module ID | `keyword-sufficiency-checker` |
| Step | 6 -- QA |
| Category | qa |
| Cost | cheap |
| Data operation | transform (same items, enriched with QA verdicts) |

---

## What This Module Does

Takes content from content-writer (`content_markdown`) and the keyword plan from seo-planner (`seo_plan_json`), then checks four dimensions of keyword usage:

1. **Head term placement and density** -- Are primary keywords in H1/H2 headings and first paragraphs? Is density between 1-3%?
2. **Mid-tail term coverage** -- Do secondary and long-tail keywords appear in subheadings or body text?
3. **Entity keyword coverage** -- Are entity-specific terms present in the content?
4. **Negative keyword absence** -- Do any forbidden keywords appear anywhere?

Citation references (`[#1]`, `[#2]`) are stripped before analysis so keywords appearing only in citations do not count.

---

## When to Use

- **Always** after content-writer and seo-planner have both run
- **Works without seo-planner** -- if no SEO plan is found at all, returns pass with a warning (nothing to check against)
- **Fails loudly on an empty plan** -- if an SEO plan IS present but contains zero keyword targets (upstream seo-planner produced empty output), the check fails by default. This is a contract-hardening guard; see the `allow_empty_keyword_plan` option and Edge Cases below.
- **Before Step 7** (loop-router) so failed entities can be routed back for rewriting
- Pairs well with `meta-compliance-checker` for comprehensive QA coverage

---

## Input Data

This module uses data-shape routing. It finds its input by checking which fields exist on pool items:

- **Content items**: items with `content_markdown`
- **SEO plan items**: items with `seo_plan_json`

The SEO plan keywords are extracted from two possible shapes:

1. `seo_plan_json.keywords_used` (with `head_terms`, `mid_tail`, `entities`, `negatives` arrays)
2. `seo_plan_json.target_keywords` (with `primary`, `secondary`, `long_tail`) plus `keyword_distribution`

Both shapes are handled transparently.

---

## Options Guide

| Option | Type | Default | What It Does | When to Change |
|--------|------|---------|--------------|----------------|
| `pass_threshold` | number | 0.6 | Minimum keyword_score for the entity to pass | Raise to 0.8 for strict SEO compliance. Lower to 0.4 for draft content. |
| `head_term_density_min` | number | 0.01 | Minimum density for head terms (1%) | Lower for long-form content where natural density is lower. |
| `head_term_density_max` | number | 0.03 | Maximum density for head terms (3%) | Lower to 0.02 for content where keyword stuffing is a bigger risk. |
| `check_negatives` | boolean | true | Whether to check for negative keywords | Disable if the SEO plan has no negative keywords defined. |
| `allow_empty_keyword_plan` | boolean | false | When false, FAIL loudly if an SEO plan is present but has zero keyword targets (a sign seo-planner produced empty output). When true, restore the legacy pass-with-warning. | Leave false for production. Set true only for a deliberate carve-out where empty plans are expected and acceptable. Does **not** affect the no-plan-at-all case, which always passes with a warning. |

---

## Scoring Breakdown

The composite `keyword_score` (0-1) is a weighted average of four category scores:

| Category | Weight | How Scored |
|----------|--------|------------|
| Head terms | 40% | 60% placement (in H1/H2/first paragraph) + 40% density (1-3% range). Missing = 0. Body only = 0.5. |
| Mid-tail terms | 25% | Coverage ratio. Need at least 2 present. Below minimum gets harsh 50% penalty. |
| Entity terms | 15% | Simple found/total ratio. |
| Negatives | 20% | Binary: 1.0 if none found, 0.0 if any found. |

If a category has no keywords (e.g., no entity terms in the plan), its weight is redistributed proportionally to the other categories.

**Pass/fail**: `keyword_score >= pass_threshold` (default 0.6).

### Density rules for head terms

- Below `head_term_density_min` (default 1%): density score = 0.5 (partial credit)
- Within range (1-3%): density score = 1.0
- Above `head_term_density_max` (default 3%): density score = 0.3 (keyword stuffing penalty)
- Not found: density score = 0.0

---

## Example Output

### Passing entity

```
entity_name: "Bet365"
qa_pass: true
keyword_score: 0.85
missing_keywords: "[]"
misplaced_keywords: "[]"
negative_keywords_found: "[]"
placement_report: |
  Word count: 1240

  HEAD TERMS (2, score: 90%):
    "online betting": density=1.45% (ok), correctly placed
    "sports betting platform": density=1.05% (ok), correctly placed

  MID-TAIL TERMS (4/5 found, score: 80%):
    Missing: bet365 mobile app review

  COMPOSITE SCORE: 85% (threshold: 60%) -- PASS
```

### Failing entity

```
entity_name: "NewCasino"
qa_pass: false
keyword_score: 0.35
missing_keywords: "[\"online casino\",\"casino games\"]"
misplaced_keywords: "[\"casino bonus\"]"
negative_keywords_found: "[\"gambling addiction\"]"
placement_report: |
  Word count: 890

  HEAD TERMS (3, score: 30%):
    "online casino": density=0% (missing), MISSING
    "casino bonus": density=0.56% (low), in body only (should be in H1/H2/first paragraph)
    "casino games": density=0% (missing), MISSING

  NEGATIVE KEYWORDS (score: 0%):
    FOUND (must not appear): gambling addiction

  COMPOSITE SCORE: 35% (threshold: 60%) -- FAIL
```

### Skipped (no SEO plan)

```
entity_name: "UnplannedCorp"
qa_pass: true
keyword_score: 1
placement_report: "No SEO plan with keywords found. Keyword check skipped -- returning pass with warning."
```

### Loud-fail (SEO plan present but empty)

```
entity_name: "EmptyPlanCorp"
qa_pass: false
keyword_score: 0
placement_report: "SEO plan has no keyword targets -- upstream seo-planner produced empty output. (Set allow_empty_keyword_plan to skip this check with a pass.)"
```

---

## Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `entity_name` | string | Entity this check applies to |
| `qa_pass` | boolean | Whether the entity passed the keyword sufficiency threshold |
| `keyword_score` | number | Composite score from 0 to 1 |
| `missing_keywords` | string | JSON array of keywords not found anywhere in the content |
| `misplaced_keywords` | string | JSON array of keywords found in body but not in prominent positions |
| `negative_keywords_found` | string | JSON array of negative keywords found (should be empty) |
| `placement_report` | string | Full human-readable breakdown of all checks |
| `density_report` | string | Per-keyword density values for head terms |

---

## Recommended Configurations

### Standard (default)

All defaults. Balanced check with 60% pass threshold.

```
pass_threshold: 0.6
head_term_density_min: 0.01
head_term_density_max: 0.03
check_negatives: true
allow_empty_keyword_plan: false
```

### Strict SEO

For content going directly to production. Requires higher keyword coverage.

```
pass_threshold: 0.8
head_term_density_min: 0.01
head_term_density_max: 0.025
check_negatives: true
```

### Relaxed

For draft-stage content or when the SEO plan is incomplete.

```
pass_threshold: 0.4
head_term_density_min: 0.005
head_term_density_max: 0.05
check_negatives: false
```

---

## Edge Cases

- **No `seo_plan_json` available** (seo-planner did not run): returns pass with warning. Nothing to check against. Unaffected by `allow_empty_keyword_plan`.
- **`seo_plan_json` present but with zero keyword targets** (seo-planner ran but produced empty output): returns **fail** with score 0 and an error reason by default. Set `allow_empty_keyword_plan: true` to restore the legacy pass-with-warning. This guard exists because an empty plan silently passing (the pre-1.0.1 behavior) hides upstream seo-planner failures.
- **No `content_markdown` found**: returns fail with score 0. No content = no keywords.
- **Very short content** (< 200 words): density calculations are unreliable. Flagged in the placement report but does not automatically fail.
- **Keywords in citations only**: citation references (`[#1]`, `[#2]`) are stripped before analysis. Keywords must appear in prose.
- **Multi-word keywords**: matched as exact phrases with word boundaries. "online casino" matches "the best online casino bonus" but not "casinoonline".

---

## Limitations

- **Keyword matching is literal substring with word boundaries.** "online casino" does not match "casino online" (word order matters). Stemming and synonyms are not considered.
- **No semantic understanding.** The module checks for exact keyword presence, not whether the topic is adequately covered.
- **Density is approximate.** Based on simple word count of body text. Markdown formatting, code blocks, and tables may skew the count slightly.
- **Entity terms require explicit plan data.** If the SEO plan does not include an `entities` list, entity term checking is skipped (with weight redistributed).

---

## What Happens Next

Results feed into Step 7 (loop-router) for routing decisions:

- **Pass**: route to Step 8 (bundling) or Step 9 (distribution)
- **Fail**: route back to Step 5 (content-writer) for rewriting, with the placement report providing specific feedback on what to fix. An empty-SEO-plan failure (see Edge Cases) points further upstream -- to seo-planner -- rather than to content-writer.
- **Skipped**: treat as pass -- no SEO plan (at all) means nothing to enforce

---

## Technical Reference

- **Spec**: `Content-Pipeline/specs/SUBMODULE_DEVELOPMENT.md`
- **Pattern**: Data-shape routing (field existence on items, never `source_submodule`)
- **Dependencies**: Upstream `content-writer` (for `content_markdown`), `seo-planner` (for `seo_plan_json`)
- **No external API calls**: All checks are local string operations
- **No AI calls**: Purely deterministic rule-based checks

---

<!-- ===== meta-compliance-checker (step 6, v1.0.3) ===== -->

# Meta Compliance Checker

> Validates that generated meta titles and meta descriptions meet SEO length requirements and contain target keywords -- producing a per-entity pass/fail verdict with specific violations.

**Module ID:** `meta-compliance-checker` | **Step:** 6 (QA) | **Category:** qa | **Cost:** cheap
**Version:** 1.0.3 | **Data Operation:** add (+)

---

## What This Module Does

Runs up to seven automated checks against each entity's meta title and meta description, producing a `qa_pass` verdict with specific violations. Without it, over-length titles, thin descriptions, keyword-free meta, and duplicate meta across entities would flow straight to bundling and distribution unnoticed.

It sits after generation (content-writer, seo-planner) and before routing:

```
content-writer + seo-planner -> META-COMPLIANCE-CHECKER -> loop-router (Step 7)
```

It emits one new QA-verdict item per entity (keyed by `entity_name`, data operation `add`) alongside the upstream items -- it never modifies the content it grades.

### Checks

1. **Title length (max)** -- Meta title must be <= `title_max_length` (default 60). Google truncates titles beyond this point, wasting the effort put into crafting them.

2. **Title length (min)** -- Fails if the meta title is under `title_min_length` (default 30) characters, or empty. Very short titles miss the opportunity to include keywords and context that improve click-through rates.

3. **Description length (range)** -- Meta description must be between `description_min_length` and `description_max_length` (default 150--160). Too short wastes SERP real estate; too long gets truncated by Google. One check covering both bounds.

4. **Keyword in title** (only when `require_keyword_in_title`) -- At least one head_term from the SEO plan must appear in the meta title (case-insensitive substring). Titles without target keywords rank poorly for those terms.

5. **Keyword in description** (only when `require_keyword_in_description`) -- At least one head_term must appear in the meta description. While not a direct ranking factor, keyword presence in descriptions increases click-through rate from SERPs.

6. **No truncation indicators** -- Neither field may end with "..." or the ellipsis character. This signals the upstream content-writer truncated the field rather than writing it to fit.

7. **No duplicates across entities** -- If multiple entities in the same run have identical (case-insensitive) meta titles or descriptions, every entity involved is flagged. Duplicate meta across pages causes keyword cannibalization and confuses search engines. Title and description duplication together count as one check.

`checks_total` is 5 with both keyword checks disabled, 7 with both enabled (the default).

---

## Input Data & Meta Resolution

This module uses data-shape routing. It finds its input by checking which fields exist on pool items:

- **Content items**: items with `meta_title`, `meta_description`, or `content_markdown`
- **SEO plan items**: items with `seo_plan_json`

The meta title and description to grade are resolved in this priority (v1.0.3):

1. **Direct `meta_title` / `meta_description` fields on GENERATED items only** -- items that also carry `content_markdown`. Scraped page items carry og:description/meta-tag scrapes but never `content_markdown`, so they are excluded. (v1.0.3 fix: in run `cb49ef80`, ~45 scraped items preceded the writer's item in pool order, so the checker graded a scraped 102-char site tagline instead of the writer's validated 151-char meta.)
2. **YAML frontmatter** in `content_markdown` (`title`/`meta_title` and `description`/`meta_description` keys).
3. **The SEO plan's validated meta candidates** -- `seo_plan_json.meta.{title,description}` (legacy top-level) OR `seo_plan_json.sections.meta.meta_{title,description}.candidate` (seo-planner's actual output). This is the authoritative planned meta, so it beats the heuristics below.
4. **First H1 heading** (for title) / **first non-heading paragraph** (for description) -- heuristic last resort, only when no explicit or planned meta exists.

If NO meta title AND no description can be resolved from any item, the entity loud-fails: `qa_pass: false`, `checks_passed: 0`, `checks_total: 0`, with the error "No meta data found -- ensure content-writer or meta-output has run". This is not a skip -- it counts as a failed entity in the summary.

**Keyword source (v1.0.2):** `head_terms` are harvested container-shape-agnostically by `extractHeadTerms` -> `collectPlanKeywords`: every non-empty string under any key named `target_keywords`, `keywords`, or `head_terms` -- **at any nesting depth** (max 8), and whether the value is a string, a flat `string[]`, or a `{primary,secondary,long_tail}` object -- plus the `keyword_summary_table[].keyword` rollup. It keys only on the pipeline-agnostic keyword *field* names, never on section **container** names (`overview`/`category_sections`/`tag_sections`/`sections`/`credentials`), so it covers seo-planner's real per-section/per-tag output across content types. `keyword_sources`/`notes`/`meta` are exact-key mismatches and are never counted. History: v1.0.1 added per-section (`sections.<any>`) reading after a batch-wide "No head_terms found" auto-fail; v1.0.2 (fixes run `f4d501bd`) generalized to the top-level `overview`/`category_sections`/`tag_sections` flat-array shape that v1.0.1 still missed. Kept 1:1 in sync with seo-planner's content gate (identical `collectPlanKeywords`).

---

## When to Use

**Always run when:**
- content-writer (and ideally seo-planner) has produced meta tags -- this is the compliance gate before publication
- Content is heading to Step 8 (bundling) or Step 9 (distribution)

**Skip when:**
- The run produces no meta at all (no content-writer in the plan) -- every entity would loud-fail with "No meta data found"

**Tune the settings when:**
- **No SEO plan data in the run**: disable `require_keyword_in_title` and `require_keyword_in_description`. With them on (the default) and no head_terms harvestable, both keyword checks FAIL with "No head_terms found in SEO plan -- cannot verify keyword..." -- they are NOT silently skipped, so a plan-less entity scores at best 5/7 and fails the default threshold.
- **Draft-stage QA**: lower `pass_threshold` so minor violations pass through to human review instead of triggering regeneration.

---

## Options Guide

| Option | Type | Default | When to Change | What It Does |
|--------|------|---------|----------------|--------------|
| `title_max_length` | number | 60 | Raise toward 70--80 if targeting Bing (more generous display); lower to ~55 for mobile-first sites | Maximum characters for meta title. Google typically truncates at 60. |
| `description_min_length` | number | 150 | Lower to 120 for entities with naturally short descriptions | Minimum characters for meta description. Below this loses SEO value. |
| `description_max_length` | number | 160 | Raise to 170 if targeting featured snippets | Maximum characters for meta description. Google typically truncates at 160. |
| `require_keyword_in_title` | boolean | true | Disable if running without SEO plan data -- otherwise the check fails, it is not skipped | Fail if no head_term from the SEO plan appears in the meta title. |
| `require_keyword_in_description` | boolean | true | Disable for brand/about pages where keyword density matters less, or when no SEO plan exists | Fail if no head_term from the SEO plan appears in the meta description. |
| `title_min_length` | number | 30 | Lower to 15--20 for content types with legitimately terse titles (news wires, product SKUs) | Minimum characters for meta title. Below this (or an empty title) triggers a check failure. |
| `pass_threshold` | number | 1.0 | Lower to ~0.85 to tolerate one failed check of seven; ~0.7 for draft-stage QA | Fraction of checks that must pass for `qa_pass: true`. 1.0 means all checks must pass. |

The two most impactful options are the keyword requirements and `pass_threshold`. Common mistake: running without seo-planner while leaving the keyword checks on -- every entity then carries two guaranteed failures (5/7 = 0.71), which fails the default threshold. The UI clamps ranges: `title_max_length` 40--80, `title_min_length` 10--60, `description_min_length` 100--200, `description_max_length` 120--200, `pass_threshold` 0.5--1.0.

---

## Recommended Configurations

### Standard (default)

Strictest SEO compliance -- all seven checks must pass:

```
title_max_length: 60
title_min_length: 30
description_min_length: 150
description_max_length: 160
require_keyword_in_title: true
require_keyword_in_description: true
pass_threshold: 1.0
```

### Strict

For content going directly to production without human review -- tighter lengths leave headroom under Google's truncation points:

```
title_max_length: 55
title_min_length: 30
description_min_length: 150
description_max_length: 155
require_keyword_in_title: true
require_keyword_in_description: true
pass_threshold: 1.0
```

### Lenient

For draft-stage content or entities where the SEO plan may be incomplete:

```
title_max_length: 70
title_min_length: 20
description_min_length: 120
description_max_length: 170
require_keyword_in_title: false
require_keyword_in_description: false
pass_threshold: 0.7
```

### No SEO Plan

When seo-planner is not in the run -- length and duplicate discipline only (5 checks):

```
title_max_length: 60
title_min_length: 30
description_min_length: 150
description_max_length: 160
require_keyword_in_title: false
require_keyword_in_description: false
pass_threshold: 1.0
```

---

## What Good Output Looks Like

A healthy run with real SEO plans upstream passes most entities 7/7; the summary reads "All N entities passed meta compliance checks".

### All checks pass

```
entity_name: "Bet365"
qa_pass: true
checks_passed: 7
checks_total: 7
meta_title: "Bet365 Review 2026 -- Betting Odds, Bonuses & Features"
meta_title_length: 54
meta_description_length: 155
violations: ""
```

### Typical failure

```
entity_name: "NewCasino"
qa_pass: false
checks_passed: 4
checks_total: 7
meta_title: "NewCasino"
meta_title_length: 9
meta_description_length: 89
violations: "Title too short: 9 chars (recommend >= 30 for SEO value)
Description too short: 89 chars (min 150)
No head_term found in title. Expected one of: online casino, casino bonus"
```

### Output fields

| Field | Type | Description |
|-------|------|-------------|
| `entity_name` | string | Entity this check applies to |
| `qa_pass` | boolean | Whether checks_passed/checks_total met `pass_threshold`. Rows with `false` are flagged in the UI (`flagged_when`). |
| `checks_passed` | number | Number of checks that passed |
| `checks_total` | number | Total checks run (5--7 depending on keyword options; 0 when no meta was found at all) |
| `meta_title` | string | The meta title that was checked |
| `meta_title_length` | number | Character count of the meta title |
| `meta_description_length` | number | Character count of the meta description |
| `meta_description_text` | string | The meta description that was checked (detail view) |
| `violations` | string | Newline-joined violation messages; empty string when all checks pass |

The entity-level `meta` block mirrors `qa_pass`, `checks_passed`, `checks_total`, and adds `violations_count`. The run summary counts `passed`, `failed`, and `errors` (entities with no meta found).

**Warning signs:**
- **Every entity fails the two keyword checks with "No head_terms found in SEO plan"** -- seo-planner is missing from the run or produced empty plans; either fix upstream or disable the keyword requirements.
- **A graded `meta_title` that looks like a website tagline rather than the writer's meta** -- should not happen since v1.0.3 (scraped items are excluded from direct-field resolution); if it does, the writer's item is missing `content_markdown`.
- **"No meta data found" errors** -- content-writer (or meta-output) did not run for that entity, or its item carries neither meta fields, frontmatter, nor a plan candidate.
- **Widespread duplicate-title violations** -- the writer is emitting a shared template title; fix the prompt, don't lower the threshold.

---

## Limitations

- **No content quality assessment.** This module checks structural compliance (length, keyword presence), not whether the meta is well-written or compelling.
- **Keyword matching is literal substring.** "online casino" matches "the best online casino site" but does not match "casino online" (word order matters).
- **No search volume or competition data.** The module checks whether keywords are present, not whether they are the right keywords to target.
- **Frontmatter parsing is basic.** Handles simple `key: value` and `key: "value"` patterns. Deeply nested YAML or multiline values may not parse correctly.
- **Duplicate detection is within-run only.** Does not check against previously published meta from past runs.
- **Missing head_terms is a hard failure, not a skip.** With the keyword requirements on, an entity without a harvestable SEO plan cannot reach 1.0.

---

## What Happens Next

Results feed into Step 7 (loop-router) for routing decisions. Typical configurations:

- **All pass**: route to Step 8 (bundling) or Step 9 (distribution)
- **Failures present**: route back to Step 5 (content-writer) for regeneration with specific violation feedback
- **pass_threshold < 1.0**: allows partial failures through, letting the operator decide at Step 10 (review)

Per the pipeline QA convention, a `qa_pass: false` verdict does not fail the run -- the entity stays `completed` and the verdict is routing/review input.

---

## Technical Reference

- **Step:** 6 (QA)
- **Category:** qa
- **Cost tier:** cheap -- 2-minute timeout, no external I/O so it never comes close
- **Data operation:** add (+) -- emits one new QA-verdict item per entity (`item_key: entity_name`); upstream items are preserved untouched
- **Pool precondition:** `requires_items` -- entities with an empty pool are skipped as `skipped_no_input`, not failed
- **Required input columns:** `seo_plan_json`
- **Depends on:** `content-writer`, `seo-planner`
- **Input format:** pool items selected by data-shape routing (field presence: `meta_title`/`meta_description`/`content_markdown` for content, `seo_plan_json` for plans) -- never by `source_submodule`
- **Output format:** one item per entity matching the output fields table above; successfully-checked items are pushed to `tools._partialItems` for timeout resilience (the error path returns without pushing)
- **Error handling:** entities with no resolvable meta get a loud-fail result row plus an `error` on the entity result; there are no retries or external calls to fail
- **External dependencies:** none -- no AI calls, no HTTP; purely deterministic local string operations
- **Tests:** `test-meta-chain.js` in the module folder; `execute.js` exports `__testing` helpers (`extractHeadTerms`, `addTargetKeywords`, `extractMetaFromFrontmatter`)

---

<!-- ===== qa-structural (step 6, v1.1.0) ===== -->

# Structural Compliance Checker

> Checks that generated content meets basic format requirements -- heading hierarchy, section count, FAQ presence, and word counts -- without using an LLM.

**Module ID:** `qa-structural` | **Step:** 6 (QA) | **Category:** qa | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## What This Module Does

Structural Compliance Checker reads the `content_markdown` field from each entity's items and runs a series of pure-text checks against configurable thresholds. It verifies that the content has the right heading levels, enough H2 sections, sufficient word count overall and per section, and (optionally) an FAQ section.

Each check contributes to a `structural_score` (0 to 1). If the score meets the `pass_threshold`, the entity passes. If not, the violations are listed so operators can see exactly what fell short -- "Too few H2 sections: 3 (minimum 5)" or "Total word count too low: 920 (minimum 1500)".

Because this is pure text parsing with no LLM or API calls, it runs instantly and costs nothing. It catches structural problems early before more expensive QA modules (hallucination-detector, citation-coverage-checker) spend time and credits on content that's obviously incomplete.

```
content-writer (Step 5) -> qa-structural -> hallucination-detector / citation-coverage-checker / etc.
```

## When to Use

**Always run when:**
- Content has been generated by content-writer or any Step 5 generation module
- You have a format spec with structural requirements (section count, word count, FAQ)
- You want a fast, free gate before running expensive LLM-based QA

**Skip when:**
- No content has been generated yet -- the module needs `content_markdown` in the working pool
- The content format is intentionally short or non-standard (e.g., meta descriptions, social posts)

**Tune the settings when:**
- Content is consistently failing on section count -- lower `min_sections` to match your actual format spec
- Generated content is long-form (3000+ words) -- raise `min_total_words` and `min_words_per_section`
- FAQ is not part of your format spec -- set `require_faq` to false
- You want to allow partial passes -- lower `pass_threshold` below 1.0

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `min_sections` | 5 | Lower to 3-4 for shorter formats; raise to 8-10 for comprehensive profiles | Minimum number of H2 sections required. Content with fewer H2s fails this check |
| `require_faq` | true | Set to false if your format spec doesn't include an FAQ section | Fails if no heading contains "FAQ" or "Frequently Asked Questions" (case-insensitive) |
| `min_words_per_section` | 100 | Lower to 50 for sections that are naturally short (e.g., contact info); raise to 150-200 for in-depth sections | Each H2 section is checked individually. Sections below this threshold are flagged as "thin" |
| `min_total_words` | 1500 | Lower to 800-1000 for shorter content types; raise to 2500-5000 for long-form articles | Minimum word count for the entire content. Catches content that has many sections but all are shallow |
| `required_heading_levels` | `"h1,h2"` | Add `h3` if your format requires subheadings; remove `h1` if content is embedded without a title | Comma-separated list of heading levels that must appear at least once. Missing levels trigger a violation |
| `pass_threshold` | 0.8 | Set to 1.0 for strict compliance (all checks must pass); lower to 0.6 for lenient gating | Fraction of checks that must pass for `qa_pass` to be true. 5 checks at 0.8 means 4 of 5 must pass |

The most impactful options are `min_sections` and `min_total_words` -- these catch the most common structural failures. If content is consistently failing, check whether your format spec actually requires 5 H2 sections and 1500 words. Adjust the thresholds to match your spec, not the other way around.

## Recommended Configurations

### Standard (Company Profiles)
For the default company profile format spec with FAQ:
```
min_sections: 5
require_faq: true
min_words_per_section: 100
min_total_words: 1500
required_heading_levels: h1,h2
pass_threshold: 0.8
```

### Strict
All structural checks must pass -- no tolerance for violations:
```
min_sections: 5
require_faq: true
min_words_per_section: 100
min_total_words: 1500
required_heading_levels: h1,h2
pass_threshold: 1.0
```

### Long-Form Articles
For in-depth content with higher word count expectations:
```
min_sections: 8
require_faq: true
min_words_per_section: 150
min_total_words: 3000
required_heading_levels: h1,h2,h3
pass_threshold: 0.8
```

### Short-Form (No FAQ)
For shorter content types where FAQ is not expected:
```
min_sections: 3
require_faq: false
min_words_per_section: 50
min_total_words: 800
required_heading_levels: h1,h2
pass_threshold: 0.8
```

### Lenient Gate
Catch only the worst structural failures -- let marginal content through for manual review:
```
min_sections: 3
require_faq: false
min_words_per_section: 50
min_total_words: 1000
required_heading_levels: h2
pass_threshold: 0.6
```

## What Good Output Looks Like

**Healthy result:**
- 80-100% of entities passing with `structural_score` of 0.8 or higher
- Zero or few thin sections flagged
- FAQ detected in all entities (when `require_faq` is true)

**Output fields:**

| Field | Description |
|-------|-------------|
| `entity_name` | Which entity this result belongs to |
| `qa_pass` | Whether the entity met the `pass_threshold` -- true or false |
| `structural_score` | Fraction of checks passed (0 to 1). E.g., 0.8 means 4 of 5 checks passed |
| `total_words` | Total word count across all content |
| `section_count` | Number of H2 sections found |
| `has_faq` | Whether an FAQ heading was detected |
| `violations` | Newline-separated list of failed checks, or "All structural checks passed." |
| `section_report` | Detailed breakdown: word counts per section, heading inventory, thin section flags |

**Warning signs:**
- All entities failing -- thresholds may be too high for your content format. Compare `total_words` and `section_count` in the output against your actual format spec
- Thin sections on the same heading across entities -- the content-writer may be consistently under-generating that section. Adjust the writer's prompt or format spec
- FAQ missing across all entities -- check if the content-writer's format spec includes an FAQ section. If not, set `require_faq` to false
- `structural_score` of exactly 0 -- the entity had no `content_markdown` at all. Check that content-writer ran successfully

## Limitations

- **Markdown only** -- reads `content_markdown` field. HTML or plain text content is not supported
- **Heading detection is regex-based** -- ATX headings only (`# Heading`). Setext-style headings (underlined) are not detected
- **Word counting is naive** -- splits on whitespace. Markdown syntax, URLs, and code blocks are counted as words
- **Per-section counts are H2 only** -- H1 and H3 sections are tracked for heading hierarchy but not individually word-counted for the thin-section check
- **No content quality assessment** -- checks structure only. A section could have 200 words of nonsense and still pass. Use hallucination-detector and citation-coverage-checker for content quality
- **Frontmatter is stripped** -- YAML frontmatter between `---` markers is removed before analysis
- **Multiple content items are concatenated** -- if an entity has multiple items with `content_markdown`, they are joined before analysis. This means section counts and word counts reflect the combined content

## What Happens Next

Entities that pass flow into the remaining Step 6 QA modules -- hallucination-detector checks factual accuracy against source material, citation-coverage-checker verifies claims are backed by scraped data, and keyword-sufficiency-checker ensures SEO targets are met. Entities that fail can be routed back to content-writer via loop-router for regeneration.

The `violations` field gives content-writer clear feedback on what to fix -- "Too few H2 sections" or "Section X below 100 words" -- making automated rewrite loops possible.

## Taxonomy-leakage checks (v1.1.0, M3)

Two always-on heading checks were added after taxonomy markers were found in
DELIVERED prod output (`## [Tag: scratchcards] [Suggested tag] Scratchcard
Games Provider Heritage`, and earlier `Api API Integration`):

- **Check 6 — marker leakage:** a heading with a SECOND bracketed marker
  after the type marker, or a literal `[Suggested tag]` anywhere in a
  heading. `[Suggested tag]` is marker-grammar vocabulary (like the
  `[Tag:]`/`[Primary Category:]` prefixes the Step 8 bundlers parse), never
  legitimate heading text.
- **Check 7 — duplicated-token artifacts:** consecutive case-insensitive
  duplicate words in a heading (`Api API …`). Bracketed markers are stripped
  first so `[Tag: api] API Integration` does not false-positive.

Both sit OUTSIDE the score ratio (score semantics are unchanged from v1.0,
so threshold-tuned templates are not diluted) and instead force `qa_pass` to
false directly when they fire — at the 0.8 default a pure leak would
otherwise score 7/8 and ship silently. Step-6 convention respected: qa_pass
false is a flag that loop-router routes on; the entity is never failed and
delivery is never blocked. Check 7 fires only on case-DIFFERING consecutive
duplicates ("Api API"), so identical-case repeats ("Pago Pago") and
hyphenated names ("Baden-Baden") do not false-positive. Counts surface in
meta as `marker_leak_headings` / `dup_token_headings`.

## Technical Reference

- **Step:** 6 (QA)
- **Category:** qa
- **Cost:** cheap -- pure text parsing, no API calls or LLM usage
- **Data operation:** add (+) -- QA verdict items added alongside existing content
- **Required input columns:** `content_markdown`
- **Depends on:** content-writer
- **Input:** `input.entities[]` with `items[]` containing `content_markdown` field
- **Output:** `{ results[], summary }` where results are grouped by entity_name, each with QA verdict items
- **Selectable:** false -- QA verdicts are informational, not selectable by operators
- **Detail view:** `detail_schema` with header fields (entity_name, qa_pass badge, structural_score, total_words, section_count) and expandable sections (violations as prose, section_report as prose)
- **Error handling:** Entities with no `content_markdown` get a failing verdict with a clear message. All other entities are processed independently -- one failure does not block others
- **External dependencies:** None -- pure JavaScript text parsing
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== loop-router (step 7, v1.0.1) ===== -->

# Loop Router

**Version:** 1.0.1

Read QA verdicts from Step 6 submodules and route failed entities back to the appropriate earlier step for rework. Pure decision logic -- no API calls, no LLM calls.

| Field | Value |
|-------|-------|
| Module ID | `loop-router` |
| Step | 7 -- Routing |
| Category | routing |
| Cost | cheap |
| Data operation | add (one routing decision per entity) |

---

## What This Module Does

Aggregates QA verdicts from all Step 6 submodules (keyword-sufficiency-checker, meta-compliance-checker, citation-coverage-checker, hallucination-detector, qa-structural) and applies a priority-ordered routing table to produce a single decision per entity:

- **approve** -- all QA checks passed, entity is ready for bundling/distribution
- **loop_discovery** -- route back to Step 1 for better/more source material
- **loop_generation** -- route back to Step 5 (Content Writer) to regenerate meta fields or fix structural compliance
- **loop_tone** -- route back to Step 5 (Tone/SEO Editor) to improve keyword integration
- **flag_manual** -- too complex for automated routing, needs human review

This submodule produces routing **recommendations**. It does NOT execute the loops -- the skeleton handles backward routing. In Phase 1/2, the operator acts on these decisions manually.

---

## Routing Rules

Rules are evaluated in priority order. First match wins.

| Priority | Condition | Decision | Reason |
|----------|-----------|----------|--------|
| 1 | Entity looped >= `max_loops` times | `flag_manual` | Max loops exceeded -- reworked too many times |
| 2 | 2+ QA checks failed | `flag_manual` | Multiple failures -- too complex for auto-routing |
| 3 | Hallucination check failed | `loop_discovery` | Need better source material to support claims |
| 3a | ...but source pages < `min_source_pages` | `flag_manual` | Can't gather better sources with so few pages |
| 4 | Citation coverage failed | `loop_discovery` | Need more sources to cite |
| 4a | ...but source pages < `min_source_pages` | `flag_manual` | Can't add citations without more sources |
| 5 | Keyword sufficiency failed | `loop_tone` | Rewrite with better keyword integration |
| 6 | Meta compliance failed | `loop_generation` | Regenerate meta title/description |
| 7 | Structural compliance failed | `loop_generation` | Regenerate content with the required structure |
| 8 | All checks passed | `approve` | Ready for bundling and distribution |
| 9 | No QA results found | configurable | `default_no_qa` option (default: `flag_manual`) |

---

## When to Use

- **Always** after Step 6 QA submodules have run
- Before manual review of entities in the pipeline
- As the decision layer that determines which entities proceed to Step 8 (bundling) vs. which go back for rework

---

## Input Data

This module uses data-shape routing. It finds its input by checking which fields exist on pool items:

- **QA result items**: items with `qa_pass`, `keyword_score`, `citation_score`, `hallucination_score`, `meta_title_ok`, or `structural_score`
- **Source page items**: items with `text_content` or `_blob_ref` (counted to determine if discovery loops are viable)
- **Loop count**: read from `entity.loop_count` or `entity.meta.loop_count` (set by the skeleton on rework)

---

## Options Guide

| Option | Type | Default | What It Does | When to Change |
|--------|------|---------|--------------|----------------|
| `default_no_qa` | string | `"flag_manual"` | Action when no QA results exist for an entity. `"approve"` auto-approves, `"flag_manual"` flags for review. | Set to `"approve"` if Step 6 is optional in your workflow. |
| `max_loops` | number | `3` | Maximum rework iterations before flagging for manual review. | Increase for content that needs many revision passes. Decrease to limit costs. |
| `min_source_pages` | number | `8` | Minimum source pages required for discovery loops. Below this, `loop_discovery` becomes `flag_manual`. | Lower for niche entities with few available sources. Raise for high-quality content requirements. |

---

## Example Output

### Approved entity (all QA passed)

```
entity_name: "Bet365"
decision: "approve"
route_reason: "All QA checks passed. Entity is ready for bundling and distribution."
qa_summary: |
  Keyword Sufficiency: PASS
  Meta Compliance: PASS
  Citation Coverage: PASS
  Hallucination Detection: PASS
failed_checks: "none"
loop_count: 0
source_page_count: 24
```

### Looped entity (hallucination failure)

```
entity_name: "NewCasino"
decision: "loop_discovery"
route_reason: "Unsupported claims detected by hallucination checker. Routing back to Step 1 (Discovery) to gather better source material."
qa_summary: |
  Keyword Sufficiency: PASS
  Meta Compliance: PASS
  Citation Coverage: PASS
  Hallucination Detection: FAIL
failed_checks: "hallucination"
loop_count: 0
source_page_count: 15
```

### Flagged entity (multiple failures)

```
entity_name: "SketchyCorp"
decision: "flag_manual"
route_reason: "Multiple QA failures (keyword, hallucination). Too complex for automated routing -- requires manual review."
qa_summary: |
  Keyword Sufficiency: FAIL
  Meta Compliance: PASS
  Citation Coverage: PASS
  Hallucination Detection: FAIL
failed_checks: "keyword_sufficiency, hallucination"
loop_count: 1
source_page_count: 6
```

### Flagged entity (max loops exceeded)

```
entity_name: "LoopedTooMuch"
decision: "flag_manual"
route_reason: "Max loop count exceeded (3/3). Entity has been reworked too many times without passing QA."
qa_summary: |
  Keyword Sufficiency: FAIL
  Meta Compliance: PASS
  Citation Coverage: PASS
  Hallucination Detection: PASS
failed_checks: "keyword_sufficiency"
loop_count: 3
source_page_count: 12
```

### No QA results (Step 6 skipped)

```
entity_name: "SkippedQA"
decision: "flag_manual"
route_reason: "No QA results found (Step 6 was skipped). Flagged for manual review per configuration."
qa_summary: |
  Keyword Sufficiency: NOT RUN
  Meta Compliance: NOT RUN
  Citation Coverage: NOT RUN
  Hallucination Detection: NOT RUN
failed_checks: "none"
loop_count: 0
source_page_count: 18
```

---

## Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `entity_name` | string | Entity this routing decision applies to |
| `decision` | string | One of: `approve`, `loop_discovery`, `loop_generation`, `loop_tone`, `flag_manual` |
| `route_reason` | string | Human-readable explanation of why this route was chosen |
| `qa_summary` | string | Multi-line summary showing pass/fail/not-run for each QA check |
| `failed_checks` | string | Comma-separated list of failed checks, or "none" |
| `loop_count` | number | How many times this entity has been looped previously |
| `source_page_count` | number | Number of source pages (text_content or _blob_ref items) available |
| `qa_scores` | object | Structured per-check verdicts: `{ keyword, citation, hallucination, meta, structural }` — each value is `pass`, `fail`, or `missing` |
| `failure_reason` | string/null | Machine-readable failure reason (e.g., `max_loops_exceeded`, `multiple_failures`) for downstream terminal-state tracking |
| `config_overrides` | object | Reserved for future per-entity config overrides (currently empty `{}`) |

---

## Recommended Configurations

### Standard (default)

Flag entities for manual review when QA is missing or routing is ambiguous. Good for production workflows where a human reviews all decisions.

```
default_no_qa: "flag_manual"
max_loops: 3
min_source_pages: 8
```

### Auto-Approve

For pipelines where Step 6 is optional and you want entities to flow through even without QA. Use when speed matters more than quality gates.

```
default_no_qa: "approve"
max_loops: 5
min_source_pages: 4
```

### Strict

For high-quality content production. Lower source threshold means entities with fewer sources get looped rather than flagged, and max loops is tight to avoid wasting resources.

```
default_no_qa: "flag_manual"
max_loops: 2
min_source_pages: 12
```

---

## Edge Cases

- **No QA results (Step 6 was skipped)**: configurable via `default_no_qa`. Default is `flag_manual`.
- **Entity has been looped 3+ times**: always `flag_manual` with "max_loops_exceeded" regardless of QA state. Prevents infinite rework loops.
- **Insufficient sources for discovery loop**: if hallucination or citation fails but `source_page_count < min_source_pages`, routes to `flag_manual` instead of `loop_discovery`. Can't fix source problems without enough sources to work from.
- **Only some QA checks ran**: routes based on whichever checks are present. Missing checks are treated as "not run" and do not count as failures.
- **Single failure with enough sources**: routes to the appropriate loop target (discovery, tone, or generation).
- **All QA checks missing but items exist**: checks for `qa_pass` field presence on items. Items without any QA-related fields are ignored.

---

## Limitations

- **Does not execute loops.** Produces routing recommendations only. The skeleton (or operator) must act on the decisions.
- **Loop count relies on entity metadata.** If the skeleton does not set `loop_count` on reworked entities, max_loops detection will not work.
- **Priority order is fixed.** The routing rules are evaluated in a hardcoded priority order. Custom priority ordering is not supported.
- **Binary QA verdicts.** Routes based on pass/fail from Step 6. Does not consider partial scores (e.g., a keyword_score of 0.59 vs 0.01 gets the same treatment).

---

## What Happens Next

Routing decisions inform the operator (or future automated skeleton logic):

- **approve**: Entity proceeds to Step 8 (bundling) and Step 9 (distribution)
- **loop_discovery**: Entity goes back to Step 1 (Discovery) for more/better sources, then re-runs Steps 2-6
- **loop_generation**: Entity goes back to Step 5 (Content Writer) to regenerate meta fields, then re-runs Step 6
- **loop_tone**: Entity goes back to Step 5 (Tone/SEO Editor) for keyword optimization, then re-runs Step 6
- **flag_manual**: Entity is held for human review. Operator decides the next action.

---

## Technical Reference

- **Spec**: `Content-Pipeline/specs/SUBMODULE_DEVELOPMENT.md`
- **Pattern**: Data-shape routing (field existence on items, never `source_submodule`)
- **Dependencies**: Upstream Step 6 QA submodules (keyword-sufficiency-checker, meta-compliance-checker, citation-coverage-checker, hallucination-detector, qa-structural)
- **No external API calls**: All routing is local decision logic
- **No AI calls**: Purely deterministic rule-based routing

---

<!-- ===== company-media (step 8, v2.0.0) ===== -->

# Company Media

> Find company logos, OG images, team photos, product screenshots, and award badges by fetching key pages from company websites.

**Module ID:** `company-media` | **Step:** 8 (Bundling) | **Category:** media | **Cost:** medium
**Version:** 2.0.0 | **Data Operation:** add (+)

---

## Background

### The Content Problem This Solves

A company profile without visual assets is incomplete. Editorial teams need logos for directory listings, team photos for leadership sections, product screenshots for review articles, and award badges for credibility. Manually visiting each company's website, navigating to the right pages, and downloading the right images is time-consuming and inconsistent.

This module automates visual asset discovery: it fetches the homepage and key internal pages (about, team, products, awards), extracts images using HTML parsing and pattern-based classification, scores logo candidates for quality (preferring horizontal/dark variants suitable for light backgrounds), and validates every discovered URL via HEAD requests.

### How It Fits the Pipeline Architecture

This is a Step 8 Bundling module -- but unlike the other five Step 8 modules, it does not primarily consume `content_markdown`. Instead, it uses **data-shape routing** to find `analysis_json` (for deriving the homepage URL from source citations; the most recent analysis item in the pool is used) and the `website` field on the entity itself. It independently fetches pages from the company's website using `tools.http`.

The module is classified as **medium** cost -- the only Step 8 module that is not cheap. This reflects the HTTP requests required to fetch homepage + up to 7 subpages and validate all discovered image URLs.

Important limitation: this module only searches the company's own website. It does not search Google Images, LinkedIn, or external sources. A future multi-source image pipeline would extend this to external sources.

## Strategy & Role

**Why this module exists:** Automate visual asset discovery from company websites. Find logos, team photos, product screenshots, and award badges without manual browsing. Score and rank logo candidates to prefer usable variants (dark, horizontal, SVG).

**Role in the pipeline:** One of six Step 8 modules. The only one that makes fresh HTTP requests to discover content not already in the pipeline. All other Step 8 modules work from existing pool data.

**Relationship to other steps:**
- **No hard dependencies** -- can run with or without prior pipeline steps
- **Optionally uses:** analysis_json source_citations to derive homepage URL when `website` field is missing
- **Sibling modules:** markdown-output, html-output, json-output, meta-output, schema-org-injector

## When to Use

**Always use when:**
- You need visual assets for company profiles, directory listings, or editorial content
- Logo images are needed for a light-background layout

**Consider settings carefully when:**
- Entities are small companies with simple websites -- lower `max_pages_per_entity` to avoid wasted requests
- You do not need all media types -- disable `find_team_photos`, `find_product_screenshots`, or `find_awards` to reduce page fetches
- URL validation is slowing down processing -- disable `validate_urls` for faster but less reliable results

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `find_logo` | true | Disable if logos are sourced from elsewhere | Searches all fetched pages for images with logo/brand signals. Scores candidates by format (SVG preferred), color variant (dark preferred), and orientation (horizontal preferred) |
| `find_team_photos` | true | Disable if team/people photos are not needed | Fetches /about, /team, /leadership pages and extracts images classified as person photos by alt text, class names, or name patterns |
| `find_product_screenshots` | true | Disable if product images are not needed | Fetches /products, /solutions, /platform pages and extracts large images classified as product/software screenshots |
| `find_awards` | true | Disable if award badges are not needed | Looks for award/certification/compliance images on both award pages and the homepage |
| `validate_urls` | true | Disable for faster processing (skip HEAD request verification) | Sends HEAD requests to every discovered image URL. Removes broken links from output. Processes in batches of 5 |
| `max_pages_per_entity` | 8 | Lower to 1 for a homepage-only logo scan; lower to 3-4 for quick scans; 9 is the effective ceiling | Total pages fetched per entity (homepage + subpages). Manifest allows up to 20, but subpage discovery is capped per category (3 team + 3 products + 2 awards), so values above 9 fetch nothing extra |

The most impactful option is `max_pages_per_entity`: at the default 8, one candidate subpage is dropped when all three categories are enabled and fully populated; set 9 for full coverage. Disabling a `find_*` toggle removes that category's subpages from the fetch list entirely, so the remaining categories get their pages sooner. Disabling `validate_urls` is the main speed lever but risks broken image links in the output.

## Recipes

### Full Media Discovery (Standard)
All media types with validation:
```
find_logo: true
find_team_photos: true
find_product_screenshots: true
find_awards: true
validate_urls: true
max_pages_per_entity: 8
```

### Logo Only (Quick)
Just find the company logo:
```
find_logo: true
find_team_photos: false
find_product_screenshots: false
find_awards: false
validate_urls: true
max_pages_per_entity: 1
```

### Deep Scan (Large Sites)
Maximum coverage for comprehensive media libraries (9 is the effective maximum -- homepage + 3 team + 3 products + 2 awards pages):
```
find_logo: true
find_team_photos: true
find_product_screenshots: true
find_awards: true
validate_urls: true
max_pages_per_entity: 9
```

### Fast Scan (No Validation)
Quick discovery without URL verification:
```
find_logo: true
find_team_photos: true
find_product_screenshots: true
find_awards: true
validate_urls: false
max_pages_per_entity: 5
```

## Expected Output

**Healthy result:**
- One media profile per entity
- Logo found for 60-80% of entities
- OG image found for 50-70% of entities
- 0-10 team photos, 0-10 screenshots, 0-5 award images per entity

**Output fields per entity:**
- `entity_name` -- the company/entity name
- `logo_url` -- best logo candidate URL (or empty string)
- `og_image_url` -- Open Graph image URL (or empty string)
- `team_photo_count` -- number of validated team/people photos
- `screenshot_count` -- number of validated product screenshots
- `award_count` -- number of validated award badge images
- `team_photos_json` -- JSON array of team photo URLs
- `screenshots_json` -- JSON array of screenshot URLs
- `awards_json` -- JSON array of award image URLs
- `all_logos_json` -- JSON array of all logo variant URLs (up to 5)
- `media_summary` -- human-readable text summary of what was found
- `status` -- `ok` (logo found), `partial` (some media but no logo), or `no_media` (nothing found)

**Logo scoring system:**
- +10: `logo` in URL/alt/class/id
- +5: `brand` in attributes; SVG format; dark/black/primary/colored in URL
- +3: horizontal/wide/full in URL
- +2: width > 100px
- -5: white/light/reversed/inverted in URL; favicon.ico
- -3: icon without logo; width < 32px

If the top-scored logo fails HEAD validation, the next validated variant is promoted (or `logo_url` is left empty if none validate). The favicon/apple-touch-icon fallback applies only when no logo-signal images were found at all.

**Subpage categories searched:**
- Team: /about, /team, /leadership, /people, /management, /our-team, /staff, /executives, /founders, /who-we-are
- Products: /products, /solutions, /platform, /services, /software, /features, /demo, /tools, /technology
- Awards: /awards, /certifications, /recognition, /achievements, /accreditations, /partners

**Red flags to watch for:**
- `status: no_media` -- homepage may have failed to fetch, or site uses JavaScript-only rendering
- Logo URL points to a light/white variant -- scoring system penalizes these but may still select one if no dark variant exists
- Very high screenshot count -- may include non-product images misclassified as screenshots

## Limitations & Edge Cases

- **Company website only** -- does not search Google Images, LinkedIn, Unsplash, or external sources. A dark-themed site may only have light logos (unusable on a light background). Multi-source pipeline planned for the future
- **HTTP fetch only** -- does not use Playwright/browser rendering. JavaScript-rendered images and lazy-loaded images will be missed
- **Image classification is heuristic** -- based on alt text, CSS classes, IDs, and URL patterns. Misclassification is common for sites with non-standard naming
- **No image download** -- all images stored as external URLs. URLs may break if the company redesigns their website
- **Logo scoring favors dark variants** -- by design, for use on light backgrounds. If your platform uses a dark background, the scoring is inverted from what you need
- **Favicon as fallback** -- if no logo images are found, the apple-touch-icon or favicon is used as a last resort. These are typically small (16-180px) and low quality
- **Team photo detection relies on patterns** -- looks for names in alt text (two+ capitalized words) and team-related CSS classes. Photos without descriptive alt text will be missed
- **Homepage URL derivation** -- if the entity has no `website` field, the module attempts to derive the homepage from source_citations in the most recent `analysis_json` pool item by counting the most common origin domain

## What Happens Next

The media output provides visual assets for editorial use. Typical destinations:

- **Directory listings** -- use `logo_url` for company logo display
- **Profile pages** -- use team photos for leadership sections, screenshots for product galleries
- **CMS import** -- download images from the validated URLs and upload to CMS media library
- **Editorial review** -- use the image grid views in the detail panel to visually assess quality

The detail view provides image grids for each media type (team photos, screenshots, awards, logo variants), making it easy for operators to review discovered assets and select the best ones.

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** media
- **Cost:** medium
- **Data operation:** add (+) -- adds one media-profile item per entity, keyed by `entity_name`; re-runs replace this module's own prior output without touching other modules' items
- **Pool precondition:** `requires_items` -- entities with an empty pool are marked `skipped_no_input` (not failed) before execution; other entities proceed normally
- **Requires columns:** none (reads from pool items and entity fields)
- **Depends on:** none (can run independently)
- **Input:** `input.entities[]` with `website` field and/or `items[]` containing `analysis_json`
- **Output:** `{ results[], summary }` where each result has `entity_name`, `items[]` with media URLs, counts, and status
- **Error handling:** page fetches fail soft (an unreachable page yields no images, run continues); a thrown error for an entity records `error` on that entity's result with empty items while other entities proceed; each successfully-completed entity's items are pushed to `tools._partialItems` so a timeout/abort preserves already-processed entities (the error path does not push)
- **Selectable:** true -- operators can deselect individual entity outputs
- **Flagged when:** `status` is `no_media` (highlighted in the table)
- **Detail view:** header fields (entity_name, status badge, logo_url image, counts) and image/image_grid sections for each media type plus prose summary
- **Dependencies:** `tools.http` (page fetching and URL validation), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== html-output (step 8, v1.0.1) ===== -->

# HTML Output

> Convert pipeline Markdown to HTML with optional schema.org Organization JSON-LD and CSS styling.

**Module ID:** `html-output` | **Step:** 8 (Bundling) | **Category:** formatting | **Cost:** cheap
**Version:** 1.0.1 | **Data Operation:** transform (=)

> **v1.0.1 (W1.5):** the heading-marker regex is now sourced from the shared `modules/_shared/marker-parser.js` (single source of truth, also used by tone-seo-editor's marker-preservation gate). Strip behavior is byte-identical to v1.0.0 — verified by an old-vs-new output diff.

---

## Background

### The Content Problem This Solves

Markdown is great for portability and editing, but many publishing workflows require HTML: email newsletters, standalone web pages, CMS fields that expect HTML input, and SEO-optimized pages that need embedded schema.org structured data. Converting Markdown to HTML manually is tedious, and adding schema.org JSON-LD requires understanding both the Organization schema type and the available analysis data.

This module automates the full conversion: Markdown to HTML, inline citations to superscript anchor links with a Sources section, schema.org Organization JSON-LD from analysis data, and optional CSS templates for immediate preview.

### How It Fits the Pipeline Architecture

This is a Step 8 Bundling module that uses **data-shape routing** -- it finds input by checking for `content_markdown` and `analysis_json` fields on pool items, never by `source_submodule`. It always strips `[Type Marker]` heading prefixes (unlike markdown-output which makes this configurable) because HTML output is inherently for display, not machine parsing.

The schema.org generation maps analysis_json fields to Organization schema properties: key_facts.founded to foundingDate, key_facts.headquarters to address, key_facts.employees to numberOfEmployees, awards to award array, licenses to hasCredential, and key_people to member.

## Strategy & Role

**Why this module exists:** Produce ready-to-publish HTML with embedded structured data. The HTML output serves two purposes: direct publishing (standalone pages, email) and CMS import (HTML fragments for rich text fields).

**Role in the pipeline:** One of five Step 8 output modules. Produces the most web-ready format -- HTML with optional CSS and schema.org markup.

**Relationship to other steps:**
- **Depends on:** content-writer (produces `content_markdown`)
- **Optionally uses:** content-analyzer (provides `analysis_json` for schema.org generation)
- **Sibling modules:** markdown-output, json-output, meta-output, company-media

## When to Use

**Always use when:**
- You need HTML for web publishing, email newsletters, or CMS rich text fields
- SEO is important and you want schema.org Organization markup embedded in the page
- You want a preview-ready standalone page (use `article` CSS template + `wrap_in_document`)

**Consider settings carefully when:**
- Importing HTML fragments into a CMS -- disable `wrap_in_document` and `css_template` to avoid style conflicts
- You do not have analysis data -- disable `include_schema_org` since the JSON-LD would be minimal
- Publishing to platforms with their own styling -- use `css_template: none` to avoid conflicts

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `include_schema_org` | true | Disable if no analysis data is available or schema.org is handled elsewhere | Generates `<script type="application/ld+json">` with Organization schema from analysis_json key_facts |
| `css_template` | `none` | Set to `basic` for clean sans-serif styling; `article` for polished serif editorial layout | Injects a `<style>` block. `none` = no CSS (for CMS embedding), `basic` = system-ui, `article` = Georgia serif with article-optimized spacing |
| `include_sources_section` | true | Disable if citations are not relevant or handled elsewhere | Converts `[#n]` to superscript anchor links and appends a Sources section with back-reference arrows |
| `wrap_in_document` | false | Enable for standalone HTML files (email, static hosting, preview pages) | Wraps output in `<!DOCTYPE html>` with `<head>`, `<meta charset>`, viewport tag, and `<title>`. Disable for HTML fragments |

## Recipes

### CMS Fragment (Standard)
Clean HTML fragment for Strapi/WordPress rich text fields:
```
include_schema_org: true
css_template: none
include_sources_section: true
wrap_in_document: false
```

### Standalone Preview Page
Complete HTML document for browser preview:
```
include_schema_org: true
css_template: article
include_sources_section: true
wrap_in_document: true
```

### Email Newsletter
Basic styled HTML document:
```
include_schema_org: false
css_template: basic
include_sources_section: false
wrap_in_document: true
```

### SEO-Optimized Fragment
HTML with schema.org but no styling (CMS handles CSS):
```
include_schema_org: true
css_template: none
include_sources_section: true
wrap_in_document: false
```

## Expected Output

**Healthy result:**
- One HTML output per entity
- 3-15 KB per file depending on content length and options
- 5-15 headings per file
- schema.org JSON-LD with Organization properties (when analysis data is available)

**Output fields per entity:**
- `entity_name` -- the company/entity name
- `final_html` -- the complete HTML string (downloadable as .html file)
- `html_size_kb` -- file size in kilobytes (rounded to one decimal)
- `has_schema_org` -- whether schema.org JSON-LD was included
- `heading_count` -- number of h1-h6 headings in the HTML
- `content_preview` -- first 200 characters of text content (tags stripped)

**Schema.org fields mapped:**
- `name` -- entity name
- `foundingDate` -- from key_facts.founded
- `address` -- from key_facts.headquarters (PostalAddress)
- `numberOfEmployees` -- from key_facts.employees (QuantitativeValue)
- `award` -- from key_facts.awards (array)
- `hasCredential` -- from key_facts.licenses (EducationalOccupationalCredential array)
- `member` -- from key_facts.key_people (Person array)
- `email`, `telephone` -- from key_facts.contact
- `description` -- generated from primary category

**Red flags to watch for:**
- `has_schema_org: false` when expected -- check that analysis_json exists in the working pool
- Very large HTML size (> 50 KB) -- content may be excessively long
- Low heading count (< 3) -- content-writer may have produced poorly structured content

## Limitations & Edge Cases

- **Requires content_markdown field** -- items without this field are skipped with a warning
- **Always strips [Type Marker] prefixes** -- unlike markdown-output, this is not configurable. HTML output is always display-ready
- **CSS templates are embedded inline** -- the `<style>` block is included directly in the HTML, not as an external stylesheet. This can conflict with CMS styling
- **Schema.org is Organization type only** -- does not generate Article, Product, or other schema types. The Organization schema is always used regardless of content type
- **Citations become anchor links** -- `[#n]` is converted to `<sup><a href="#source-n">[n]</a></sup>` with back-references. If source_citations are missing from analysis_json, generic "Source N" labels are used
- **HTML escaping** -- entity names and citation content are HTML-escaped to prevent XSS, but content_markdown is passed through `marked.parse()` which trusts the input

## What Happens Next

The HTML output is a terminal artifact ready for use outside the pipeline. Typical destinations:

- **CMS import** -- paste the HTML fragment into a Strapi/WordPress rich text field
- **Static hosting** -- serve the standalone HTML document directly
- **Email** -- use the full-document output as an email template body
- **SEO audit** -- review the schema.org JSON-LD for completeness

The other Step 8 modules run in parallel on the same working pool, allowing you to produce Markdown, JSON, meta, and media outputs alongside HTML from the same source content.

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** formatting
- **Cost:** cheap
- **Data operation:** transform (=) -- content converted to HTML format
- **Requires columns:** none (reads from pool items, not CSV columns)
- **Depends on:** content-writer
- **Input:** `input.entities[]` with `items[]` containing `content_markdown` and optionally `analysis_json`
- **Output:** `{ results[], summary }` where each result has `entity_name`, `items[]` with `final_html`, `html_size_kb`, `has_schema_org`, `heading_count`, `content_preview`
- **Selectable:** true -- operators can deselect individual entity outputs
- **Downloadable:** `final_html` field downloadable as `.html` file
- **Detail view:** header fields (entity_name, html_size_kb, heading_count, has_schema_org badge) and prose section for final_html
- **Dependencies:** `marked` (Markdown to HTML conversion), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== json-output (step 8, v1.1.0) ===== -->

# JSON Output

> Assemble structured JSON per entity from all available pipeline data shapes (analysis, SEO plan, content).

**Module ID:** `json-output` | **Step:** 8 (Bundling) | **Category:** data | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## Background

### The Content Problem This Solves

The pipeline produces multiple data shapes across different steps: `content_markdown` from content-writer, `analysis_json` from content-analyzer (categories, tags, key facts, citations), and `seo_plan_json` from seo-planner (keywords, meta, FAQs). These are scattered across pool items. For CMS import, API integration, or data analysis, all of this information needs to be assembled into a single structured JSON object per entity with predictable field names.

Different consumers need different structures. A Strapi CMS import needs flat category slugs and a `content` field. A data analysis workflow needs the raw nested objects. This module supports both through configurable output formats.

### How It Fits the Pipeline Architecture

This is a Step 8 Bundling module that uses **data-shape routing**. Unlike markdown-output and html-output which primarily need `content_markdown`, json-output can work with **any combination** of the three data shapes. If only analysis_json is available, it produces a JSON with just categories, tags, and key facts. If all three shapes are present, it assembles the full structure.

The module supports two output formats: `strapi` (CMS-optimized with flat field names) and `flat` (raw nested objects for data analysis). It also prefers AI-written content items over raw scraped content when both are present.

## Strategy & Role

**Why this module exists:** Assemble all pipeline data into a single structured JSON per entity for CMS import, API feeding, or downstream data processing. This is the most structured and machine-readable output format.

**Role in the pipeline:** One of five Step 8 output modules. Produces JSON that combines all available data shapes into one object. The only module that merges analysis, SEO, and content data into a unified structure.

**Relationship to other steps:**
- **Depends on:** content-analyzer, seo-planner, content-writer (all optional -- works with any combination)
- **Sibling modules:** markdown-output, html-output, meta-output, company-media

## When to Use

**Always use when:**
- You need structured data for CMS import (Strapi, Contentful, etc.)
- You want a single JSON file per entity containing all pipeline outputs
- Downstream systems consume JSON via API

**Consider settings carefully when:**
- Only some data shapes are available -- the module gracefully handles partial data
- Your CMS has specific field name requirements -- check Strapi format field mapping
- You want raw pipeline data for analysis -- use `flat` format instead of `strapi`

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `output_format` | `strapi` | Set to `flat` for raw nested objects; keep `strapi` for CMS-ready flat fields | `strapi` maps categories to `primary_category`, `secondary_category`, `categories[]`; `flat` keeps `analysis`, `seo_plan`, `content_markdown` as-is |
| `include_markdown` | true | Disable if you only need structured data without article text | Includes the `content_markdown` string in the JSON. Can significantly increase file size |
| `include_analysis` | true | Disable if analysis data is not relevant to the consumer | Includes categories, tags, key_facts, source_citations from analysis_json |
| `include_seo_plan` | true | Disable if SEO data is not needed | Includes target_keywords, meta title/description, FAQs from seo_plan_json |
| `flatten_key_facts` | false | Enable to hoist key_facts fields (founded, headquarters, employees, etc.) to the top level | Only applies in `strapi` format. Moves key_facts subfields to root level instead of nesting under `key_facts` |

## Recipes

### Strapi CMS Import (Standard)
Full data assembly with CMS-friendly field names:
```
output_format: strapi
include_markdown: true
include_analysis: true
include_seo_plan: true
flatten_key_facts: false
```

### Data Analysis Export
Raw nested objects for analytical processing:
```
output_format: flat
include_markdown: true
include_analysis: true
include_seo_plan: true
flatten_key_facts: false
```

### Metadata Only (No Content)
Just structured data without the article text:
```
output_format: strapi
include_markdown: false
include_analysis: true
include_seo_plan: true
flatten_key_facts: true
```

### Minimal SEO Focus
Just content and SEO plan:
```
output_format: flat
include_markdown: true
include_analysis: false
include_seo_plan: true
flatten_key_facts: false
```

## Expected Output

**Healthy result:**
- One JSON object per entity
- 20-100 fields per object (depending on data shapes and options)
- 2-50 KB per file (smaller without markdown content)

**Output fields per entity:**
- `entity_name` -- the company/entity name
- `final_json` -- the JSON string (downloadable as .json file)
- `field_count` -- total fields in the JSON object (including nested)
- `json_size_kb` -- file size in kilobytes
- `has_markdown` -- whether content_markdown was included
- `has_analysis` -- whether analysis_json data was included
- `has_seo_plan` -- whether seo_plan_json data was included

**Strapi format field mapping:**
- `name` -- entity name
- `content` -- content_markdown string
- `primary_category` / `primary_category_slug` -- first primary category slug
- `secondary_category` / `secondary_category_slug` -- first secondary category slug
- `categories` -- flat array of all category slugs
- `tags` -- flat array of tag slugs and labels
- `key_facts` -- nested object (or flattened to root level)
- `sources` -- source_citations array
- `seo.meta_title`, `seo.meta_description`, `seo.target_keywords`, `seo.faqs` -- SEO plan data

**Red flags to watch for:**
- `has_markdown: false`, `has_analysis: false`, `has_seo_plan: false` -- no data shapes found; entity was skipped
- Very large json_size_kb (> 100 KB) -- markdown content may be exceptionally long
- Low field_count (< 5) -- only minimal data was available from upstream steps

## Limitations & Edge Cases

- **Works with any combination of data shapes** -- unlike other Step 8 modules, json-output does not require any specific field. But if none of the three shapes (`content_markdown`, `analysis_json`, `seo_plan_json`) are present, the entity is skipped with an error
- **Strapi format assumes specific category/tag structures** -- if analysis_json uses a non-standard format for categories or tags, the field mapping may produce unexpected results
- **Multiple markdown items are concatenated** -- if an entity has multiple items with `content_markdown`, they are joined with double newlines into a single string
- **Undefined values are cleaned** -- in Strapi format SEO object, undefined values are explicitly removed to produce clean JSON
- **Field count is recursive** -- the `field_count` metric counts all fields including nested objects, which means complex analysis_json structures inflate the count
- **No JSON Schema validation** -- the output JSON structure is not validated against a schema. Consumers should handle missing fields gracefully

## What Happens Next

The JSON output is a terminal artifact ready for use outside the pipeline. Typical destinations:

- **CMS import** -- use the Strapi format JSON to create/update entries via CMS API
- **Data warehouse** -- store flat format JSON for analysis and reporting
- **API integration** -- feed JSON objects to downstream services
- **Backup** -- archive the complete pipeline output as structured data

The JSON format is the most complete output -- it can contain everything the pipeline knows about an entity in a single file.

## QA verdict block (v1.1.0, M2)

Failing QA does not block delivery — a human decides whether the content
ships. So the verdict now travels WITH the content: when the pool carries QA
shapes, `final_json` gains a `qa` block — `verdict` (the Step 7 router
decision, e.g. `flag_manual`), `failed_checks` (names), `scores`, per-checker
`checks_passed`/`checks_failed` counts, and `flagged` (true when the router
did not approve, or — with no router item — when any checker failed). Found
by data shape (`decision`+`qa_scores` for the router item, `qa_pass` for
checker items; shared collector in `modules/_shared/qa-verdict.js`). These
are light pool fields — no `requires_columns` change. Additive: QA-less
pipelines produce byte-identical bundles; `include_qa: false` turns it off.
The item row also exposes `has_qa` and `qa_flagged` for the results table.

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** data
- **Cost:** cheap
- **Data operation:** transform (=) -- data assembled into JSON format
- **Requires columns:** none (reads from pool items, not CSV columns)
- **Depends on:** content-analyzer, seo-planner, content-writer (all optional)
- **Input:** `input.entities[]` with `items[]` containing any combination of `content_markdown`, `analysis_json`, `seo_plan_json`
- **Output:** `{ results[], summary }` where each result has `entity_name`, `items[]` with `final_json`, `field_count`, `json_size_kb`, `has_markdown`, `has_analysis`, `has_seo_plan`
- **Selectable:** true -- operators can deselect individual entity outputs
- **Downloadable:** `final_json` field downloadable as `.json` file
- **Detail view:** header fields (entity_name, field_count, json_size_kb, has_markdown badge, has_analysis badge, has_seo_plan badge) and prose section for final_json
- **Dependencies:** `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== markdown-output (step 8, v1.1.0) ===== -->

# Markdown Output

> Transform pipeline content into clean, publishable Markdown with optional YAML frontmatter.

**Module ID:** `markdown-output` | **Step:** 8 (Bundling) | **Category:** formatting | **Cost:** cheap
**Version:** 1.1.0 | **Data Operation:** add (+)

> **v1.0.1 (W1.5):** the heading-marker regex is now sourced from the shared `modules/_shared/marker-parser.js` (single source of truth, also used by tone-seo-editor's marker-preservation gate). Strip behavior is byte-identical to v1.0.0 -- verified by an old-vs-new output diff.
>
> **v1.1.0 (M2):** the QA verdict travels with the content -- `qa_verdict` / `qa_flagged` / `qa_failed_checks` in the YAML frontmatter, plus a `qa_flagged` field on every item row that is emitted even when frontmatter is off. See "QA verdict propagation" below.

---

## Background

### The Content Problem This Solves

The content-writer module produces raw Markdown with internal conventions: `[Type Marker]` prefixes on headings (e.g., `## [Overview]`, `## [Primary Category: online-casinos]`), inline `[#n]` citation references, and a `## [Meta]` section with structured metadata. These conventions are useful for pipeline processing but unsuitable for publishing. Before content can be imported into a CMS, shared with editors, or published as standalone files, it needs to be cleaned, reformatted, and optionally enriched with YAML frontmatter.

### How It Fits the Pipeline Architecture

This is a Step 8 Bundling module -- the final stage of the pipeline where processed content is formatted for output. It uses **data-shape routing**: it finds its input by checking which fields exist on pool items (`content_markdown`, `analysis_json`), never by checking `source_submodule`. This means any upstream module that produces a `content_markdown` field will automatically feed into this module.

When an entity carries several `content_markdown` items (re-runs, or the tone-seo-editor refinement chain adding on top of content-writer via the `add` data operation), the module uses the **latest** item -- a tone-seo-editor refinement automatically supersedes the original content-writer draft. The same latest-item rule applies to `analysis_json`.

## Strategy & Role

**Why this module exists:** Convert internal pipeline Markdown into clean, publishable Markdown files ready for CMS import or editorial review. Strip internal conventions, convert citations to standard formats, and add YAML frontmatter with categories and tags from the analysis phase.

**Role in the pipeline:** One of five Step 8 output modules. Produces the most portable format -- Markdown files work with virtually every CMS, static site generator, and content management system.

**Relationship to other steps:**
- **Depends on:** content-writer (produces `content_markdown`)
- **Optionally uses:** content-analyzer (provides `analysis_json` for frontmatter categories and tags)
- **Sibling modules:** html-output, json-output, meta-output, company-media

## When to Use

**Always use when:**
- You need clean Markdown files for CMS import (WordPress, Strapi, Hugo, Jekyll, etc.)
- Content needs to be reviewed by human editors in a readable format
- You want portable files that work across platforms

**Consider settings carefully when:**
- Your CMS expects specific frontmatter fields -- check that the generated YAML matches
- You need citations preserved -- choose between footnotes, inline, or stripped
- The `## [Meta]` section should be kept for debugging -- enable `include_meta_section`

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `heading_style` | `strip_markers` | Set to `keep_markers` if downstream tools need the `[Type Marker]` prefixes for machine parsing | `strip_markers` converts `## [Overview]` to `## Overview` and category slugs to title case |
| `citation_format` | `footnotes` | Set to `inline` to keep `[#n]` as-is; set to `strip` to remove all citations | `footnotes` converts `[#n]` to `[^n]` with a footnote definitions section at the bottom |
| `include_frontmatter` | `true` (boolean) | Disable if your CMS does not support YAML frontmatter or you want raw Markdown only | Adds `---` delimited YAML block with title, categories, and tags from analysis data, plus QA verdict fields when the pool carries QA shapes |
| `include_meta_section` | `false` (boolean) | Enable to keep the `## [Meta]` section for debugging or if meta-output is not being used | The Meta section contains structured metadata that is typically handled by meta-output instead |

## Recipes

### CMS Import (Standard)
Clean Markdown with frontmatter for Strapi, WordPress, or similar CMS:
```
heading_style: strip_markers
citation_format: footnotes
include_frontmatter: true
include_meta_section: false
```

### Editorial Review
Clean readable Markdown without frontmatter or citations:
```
heading_style: strip_markers
citation_format: strip
include_frontmatter: false
include_meta_section: false
```

### Machine-Parseable
Keep all internal markers for automated processing:
```
heading_style: keep_markers
citation_format: inline
include_frontmatter: true
include_meta_section: true
```

### Static Site Generator
Full frontmatter with footnote citations for Hugo/Jekyll:
```
heading_style: strip_markers
citation_format: footnotes
include_frontmatter: true
include_meta_section: false
```

## Expected Output

**Healthy result:**
- One Markdown file per entity
- 800-3,000 words per file (depending on content-writer output)
- 5-15 sections (h2/h3 headings) per file
- YAML frontmatter with title, categories, and tags

**Output fields per entity:**
- `entity_name` -- the company/entity name
- `final_markdown` -- the complete Markdown string (downloadable as .md file)
- `word_count` -- total words in the final output
- `section_count` -- number of h2/h3 headings
- `has_frontmatter` -- whether YAML frontmatter was included
- `qa_flagged` -- `"true"`/`"false"` when Step 6 QA shapes are present in the pool, empty string when no QA ran; surfaces flagged entities on the item row even with frontmatter off
- `content_preview` -- first 200 characters (newlines replaced with spaces)

**Detail view:** Each item has a detail view showing the full Markdown output as prose, with header badges for entity name, word count, section count, and frontmatter status.

**Red flags to watch for:**
- Missing frontmatter categories/tags -- analysis_json may not have been produced by content-analyzer
- Very short output (< 300 words) -- content-writer may have produced minimal content
- No entities processed -- check that content_markdown field exists in the working pool

## Limitations & Edge Cases

- **Requires content_markdown field** -- items without this field are skipped with a warning. Run content-writer first
- **Frontmatter depends on analysis_json** -- if content-analyzer did not run, frontmatter will only contain the title (no categories or tags)
- **Citation footnotes require source_citations** -- if analysis_json lacks `source_citations`, footnotes will show generic "Source N" labels
- **Only the latest markdown item is used** -- if an entity has multiple items with `content_markdown` (re-runs, tone-seo-editor refinements), only the most recent one is formatted; earlier drafts are ignored
- **Category slug conversion** -- slugs like `online-casinos` are converted to title case `Online Casinos` when stripping markers. Non-standard slugs may convert awkwardly
- **Meta section removal uses regex** -- matches from `## [Meta]` or `## Meta` to the end of the string. If the Meta section is not the last section, content after it will also be removed

## What Happens Next

The Markdown output is a terminal artifact -- it is ready for use outside the pipeline. Typical destinations:

- **CMS import** -- upload the `.md` file to Strapi, WordPress, or any Markdown-supporting CMS
- **Static site generation** -- place in a Hugo/Jekyll/Gatsby content directory
- **Editorial workflow** -- send to editors for review and revision
- **Archive** -- store as the canonical content record for the entity

The other Step 8 modules (html-output, json-output, meta-output) can run in parallel on the same working pool to produce alternative output formats from the same source content.

## QA verdict propagation (v1.1.0, M2)

The QA verdict is collected from the pool on every run via the shared collector
`modules/_shared/qa-verdict.js` -- same semantics as json-output's `qa` block.
It surfaces in two places:

- **Frontmatter** -- when `include_frontmatter` is on and the pool carries QA
  shapes, the YAML gains `qa_verdict`, `qa_flagged`, and (when present)
  `qa_failed_checks`.
- **Item row** -- every output item carries a `qa_flagged` field (`"true"`/
  `"false"`, or empty string when no QA ran), emitted **regardless** of
  `include_frontmatter`. Without this, a markdown-only template with
  frontmatter off would ship flagged content with zero QA trace.

Additive metadata, never a gate -- flagged content still ships; QA-less
pipelines produce byte-identical files.

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** formatting
- **Cost:** cheap -- pure text transform, no network or LLM calls; short timeout tier
- **Data operation:** add (+) -- content reformatted for output as new pool items
- **Pool precondition:** `requires_items` -- entities with an empty pool are marked `skipped_no_input` before enqueue (not failed); the module never runs against an empty pool
- **Required input columns (manifest `requires_columns`):** `seo_plan_json`, `analysis_json` -- note that execution itself routes by field presence on pool items (`content_markdown`, `analysis_json`), never by `source_submodule`
- **Item key:** `entity_name`
- **Depends on:** content-writer
- **Input:** `input.entities[]` with `items[]` containing `content_markdown` and optionally `analysis_json`
- **Output:** `{ results[], summary }` where each result has `entity_name`, `items[]` with `final_markdown`, `word_count`, `section_count`, `has_frontmatter`, `qa_flagged`, `content_preview`
- **Selectable:** true -- operators can deselect individual entity outputs
- **Downloadable:** `final_markdown` field downloadable as `.md` file
- **Detail view:** header fields (entity_name, word_count, section_count, has_frontmatter badge) and prose section for final_markdown
- **Error handling:** per-entity try/catch -- an entity with no `content_markdown` items (or a thrown formatting error) produces an error result (`items: []`, `meta.errors: 1`) and is listed in `summary.errors`; other entities continue. Successful items are pushed to `tools._partialItems` so partial results survive a timeout. No retries -- the transform is deterministic
- **Dependencies:** `js-yaml` (frontmatter serialization), shared helpers `modules/_shared/marker-parser.js` (heading-marker regex) and `modules/_shared/qa-verdict.js` (QA verdict collector), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

<!-- ===== meta-output (step 8, v1.0.2) ===== -->

# Meta Output

> Generate validated SEO metadata (title, description, keywords, Open Graph, Twitter Card) from pipeline data.

**Module ID:** `meta-output` | **Step:** 8 (Bundling) | **Category:** seo | **Cost:** cheap
**Version:** 1.0.1 | **Data Operation:** add (+)

## Changelog

### v1.0.1 (2026-07-16) — BACKLOG #52: ship the planned meta, not the entity name
- Meta title/description now resolve in **the same priority order meta-compliance-checker validates** (the QA check is only honest if it verifies what ships): (1) direct `meta_title`/`meta_description` fields on any pool item (content-writer emits the planner candidate here since v1.6.2) → (2) YAML frontmatter in `content_markdown` → (3) `seo_plan_json.meta.{title,description}` (legacy), then `seo_plan_json.sections.meta.meta_{title,description}.candidate` (seo-planner's actual output) → (4) H1 / first-paragraph heuristics → (5) entity name / empty string (last resort, surfaced via length warnings).
- Keyword assembly mirrors the checker's `extractHeadTerms` via an identical `collectPlanKeywords` (v1.0.2): keyword strings are harvested under any `target_keywords`/`keywords`/`head_terms` key at any depth (string, flat `string[]`, or `{primary,secondary,long_tail}`), plus `keyword_summary_table[].keyword`. SEO-plan keywords are trimmed + lowercased for consistent dedup.
- Previously only legacy top-level `seo_plan_json.meta.title` was read, so after FIX D the QA gate passed on the planner candidate while the deliverable still shipped `title="<entity name>"` / empty description.

---

## Background

### The Content Problem This Solves

Every published page needs SEO metadata: a title within Google's display limit, a description that fits the SERP snippet, keywords that match search intent, and social sharing tags (Open Graph, Twitter Cards) that control how the page appears when shared on social media. Getting these lengths right is critical -- a title over 60 characters gets truncated in search results, a description under 150 characters wastes valuable SERP real estate.

The seo-planner module produces `seo_plan_json` with raw meta title and description, but these need validation against length constraints and assembly with keywords, OG tags, and Twitter Card tags. Doing this manually for dozens of entities is error-prone and tedious.

### How It Fits the Pipeline Architecture

This is a Step 8 Bundling module that uses **data-shape routing**. It requires `seo_plan_json` as its primary input (from seo-planner) and optionally uses `analysis_json` (from content-analyzer) to assemble keywords from categories, tags, and target keywords.

Unlike markdown-output and html-output which focus on content formatting, meta-output focuses purely on SEO metadata. Its output is a validated meta object with warnings for any values that violate length constraints, making it easy for operators to spot and fix SEO issues before publishing.

## Strategy & Role

**Why this module exists:** Validate and assemble SEO metadata from pipeline data. Ensure titles and descriptions meet Google's display limits, assemble keywords from multiple sources, and generate Open Graph and Twitter Card tags -- all in a single validated output.

**Role in the pipeline:** One of five Step 8 output modules. The only module focused on SEO metadata validation. Complements html-output's schema.org JSON-LD with page-level meta tags.

**Relationship to other steps:**
- **Depends on:** seo-planner (produces `seo_plan_json` -- required)
- **Optionally uses:** content-analyzer (provides `analysis_json` for keyword assembly)
- **Sibling modules:** markdown-output, html-output, json-output, company-media

## When to Use

**Always use when:**
- You need validated SEO metadata for published pages
- You want to catch title/description length issues before publishing
- Pages will be shared on social media (Open Graph tags)

**Consider settings carefully when:**
- Your platform has different title/description length requirements than Google's defaults
- Twitter Cards are relevant to your audience -- enable `include_twitter_tags`
- You want keywords from analysis data -- ensure content-analyzer has run

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `max_title_length` | 60 | Raise to 70-80 if targeting Bing (more generous); lower to 50 for strict compliance | Characters above this trigger a "Title too long" warning. Google typically displays 50-60 characters |
| `min_description_length` | 150 | Lower to 100 for short-form content; raise to 155 for strict SERP optimization | Characters below this trigger a "Description too short" warning. Google shows 150-160 characters |
| `max_description_length` | 160 | Raise to 300 for knowledge panel descriptions; lower to 155 for strict SERP | Characters above this trigger a "Description too long" warning |
| `include_keywords_array` | true | Disable if keywords are not used by your CMS or publishing platform | Assembles keywords from categories, tags (existing + suggested), and SEO target keywords (primary, secondary, long-tail) |
| `include_og_tags` | true | Disable if pages will not be shared on social media | Generates og:title, og:description, og:type (always "article") |
| `include_twitter_tags` | false | Enable if pages will be shared on Twitter/X | Generates twitter:card (summary), twitter:title, twitter:description |

## Recipes

### Standard SEO Validation
Google-optimized with Open Graph:
```
max_title_length: 60
min_description_length: 150
max_description_length: 160
include_keywords_array: true
include_og_tags: true
include_twitter_tags: false
```

### Full Social Media
All social tags enabled:
```
max_title_length: 60
min_description_length: 150
max_description_length: 160
include_keywords_array: true
include_og_tags: true
include_twitter_tags: true
```

### Relaxed Validation
For platforms with different display limits:
```
max_title_length: 80
min_description_length: 100
max_description_length: 300
include_keywords_array: true
include_og_tags: true
include_twitter_tags: false
```

### Metadata Only (No Social)
Just title, description, keywords, and slug:
```
max_title_length: 60
min_description_length: 150
max_description_length: 160
include_keywords_array: true
include_og_tags: false
include_twitter_tags: false
```

## Expected Output

**Healthy result:**
- One meta output per entity
- Status `ok` when title and description lengths are within bounds
- Status `warning` when any length constraint is violated
- 5-20 keywords assembled from multiple sources

**Output fields per entity:**
- `entity_name` -- the company/entity name
- `meta_title` -- the SEO title (resolved: item meta_title field → frontmatter → plan meta/candidate → H1 → entity name)
- `meta_description` -- the SEO description (resolved: item meta_description field → frontmatter → plan meta/candidate → first paragraph → empty)
- `title_length` -- character count of the title
- `description_length` -- character count of the description
- `keyword_count` -- number of assembled keywords
- `status` -- `ok` or `warning`
- `meta_json` -- the full meta object as a JSON string (viewable in detail view)

**Full meta object fields:**
- `title` -- meta title
- `description` -- meta description
- `slug` -- URL-safe slug generated from entity name
- `keywords` -- array of assembled keywords (when enabled)
- `og` -- Open Graph tags object (when enabled)
- `twitter` -- Twitter Card tags object (when enabled)
- `warnings` -- array of validation warning messages (when present)

**Keyword assembly sources:**
- Categories: primary and secondary category slugs from analysis_json
- Tags: existing tag slugs + suggested new tag labels from analysis_json
- SEO keywords (v1.0.2, container-shape-agnostic, kept 1:1 in sync with meta-compliance-checker's extractHeadTerms via an identical `collectPlanKeywords`): every non-empty string under any key named `target_keywords`/`keywords`/`head_terms` at any nesting depth (string, flat `string[]`, or `{primary,secondary,long_tail}` object), plus `keyword_summary_table[].keyword` -- from the first seo_plan_json with any extractable keywords; trimmed + lowercased. Section **container** names are never enumerated (Rule 13); `keyword_sources`/`notes` are never counted. Fixes run `f4d501bd`, whose top-level `overview`/`category_sections`/`tag_sections` flat-array shape the prior fixed-shape extractor missed.

**Red flags to watch for:**
- Many entities with `status: warning` -- seo-planner may be generating titles/descriptions outside Google limits
- `keyword_count: 0` -- neither analysis_json nor seo_plan_json contained categorization data
- Missing meta_description (empty string) -- seo_plan_json did not include a meta description

## Limitations & Edge Cases

- **Requires seo_plan_json** -- entities without this field are skipped with an error. Run seo-planner first
- **Title fallback to entity name** -- only when NO source resolves (no item meta fields, no frontmatter, no plan meta/candidate, no H1). The fallback may exceed max_title_length for long company names -- surfaced as a warning
- **Slug generation is basic** -- uses simple regex to lowercase, strip special characters, and replace spaces with hyphens. Non-ASCII characters may be handled inconsistently
- **OG type is always "article"** -- does not support other Open Graph types (product, website, etc.)
- **Twitter Card is always "summary"** -- does not support summary_large_image, player, or other card types
- **Keywords are not deduplicated across sources** -- the same keyword could appear from both categories and SEO target keywords (though they are stored in a Set, so exact duplicates are removed)
- **No character encoding validation** -- special characters in titles/descriptions are not checked for HTML entity encoding

## What Happens Next

The meta output is a terminal artifact ready for use outside the pipeline. Typical destinations:

- **CMS meta fields** -- populate title, description, and keywords fields in your CMS
- **HTML head tags** -- use the OG and Twitter objects to generate `<meta>` tags in page headers
- **SEO audit** -- review the warnings to identify entities that need manual title/description adjustment
- **API integration** -- feed the meta JSON to publishing APIs

The status/warning system provides an immediate quality gate -- operators can review all warnings in the table view before publishing.

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** seo
- **Cost:** cheap
- **Data operation:** add (+) -- metadata items added to the pool (item_key: entity_name)
- **Requires columns:** none (reads from pool items, not CSV columns)
- **Depends on:** seo-planner (required)
- **Input:** `input.entities[]` with `items[]` containing `seo_plan_json` and optionally `analysis_json`
- **Output:** `{ results[], summary }` where each result has `entity_name`, `items[]` with `meta_title`, `meta_description`, `title_length`, `description_length`, `keyword_count`, `status`, `meta_json`
- **Selectable:** true -- operators can deselect individual entity outputs
- **Flagged when:** `status` is `warning` (highlighted in the table)
- **Detail view:** header fields (entity_name, status badge, title_length, description_length, keyword_count) and sections for meta_title (text), meta_description (text), meta_json (prose)
- **Dependencies:** `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`, `test-meta-resolution.js`

---

<!-- ===== schema-org-injector (step 8, v1.0.0) ===== -->

# Schema.org Injector

> Generate Schema.org structured data (JSON-LD) for company profiles -- Organization, Product, FAQPage -- for SEO rich snippets.

**Module ID:** `schema-org-injector` | **Step:** 8 (Bundling) | **Category:** bundling | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## Background

### The Content Problem This Solves

Search engines use Schema.org structured data to generate rich snippets -- enhanced search results with company details, FAQ accordions, product info, and more. Manually creating JSON-LD for each company profile is tedious and error-prone: you need to map pipeline data to the correct Schema.org types, validate required fields, and format the output as a `<script>` block ready for HTML injection. This module automates all of that.

### How It Fits the Pipeline Architecture

This is a Step 8 Bundling module that uses **data-shape routing**. It reads from json-output items (structured JSON with `overview`, `categories`, `faq`, `credentials`, `contact`, `meta`), from analysis_json items (key_facts, categories), and from seo_plan_json items (seo-planner FAQs, used as the FAQ fallback source). When multiple items of the same shape exist in an entity's pool, the **most recent** item of each shape is used. It produces JSON-LD structured data as a `<script type="application/ld+json">` block ready to inject into any HTML `<head>`.

When multiple Schema.org types are generated (e.g. Organization + FAQPage + Products), they are combined using the `@graph` pattern in a single JSON-LD block. When only one type is generated, it uses a flat structure.

## Strategy & Role

**Why this module exists:** Produce SEO-ready Schema.org structured data that enables rich snippets in Google, Bing, and other search engines. Organization schema provides company knowledge panels, FAQPage schema enables FAQ accordions directly in search results, and Product schema provides product rich snippets.

**Role in the pipeline:** One of six Step 8 output modules. Produces JSON-LD structured data focused on SEO rich snippets. Complements html-output (which has basic Organization schema only) by adding FAQPage and Product schemas plus more comprehensive Organization data.

**Relationship to other steps:**
- **Depends on:** json-output (structured JSON), content-analyzer (analysis_json) -- both optional, works with either. The FAQ builder additionally reads seo-planner's seo_plan_json when json-output carries no FAQ data.
- **Sibling modules:** markdown-output, html-output, json-output, meta-output, company-media

## When to Use

**Always use when:**
- SEO rich snippets are important for the published content
- You want FAQ accordions to appear in Google search results
- You need structured data separate from the HTML output (for injection into templates, CMS, or static site generators)

**Consider settings carefully when:**
- The entity is not product-focused -- disable `generate_products`
- No FAQ data exists in the pipeline -- disable `generate_faq` to avoid empty warnings
- Company URL is stored in a non-standard entity field -- set `company_url_field` accordingly

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `generate_organization` | `true` | Rarely disable -- Organization is the foundational schema for company profiles | Generates Organization schema with name, url, description, foundingDate, employees, address, logo, sameAs, credentials, awards |
| `generate_products` | `true` | Disable if entity is not product/service-focused or categories data is not available | Generates one Product schema per primary category/product found in the data |
| `generate_faq` | `true` | Disable if no FAQ data exists in upstream steps | Generates FAQPage schema from FAQ items -- maps directly to Google's FAQ rich snippet format |
| `company_url_field` | `website` | Change if the company URL is stored in a different entity field (e.g. `url`, `domain`) | Used for the Organization `url` property and Product `url` property |

The most impactful option is `company_url_field`: if it points at an empty or wrong entity field, every Organization schema gets a "missing recommended field url" validation warning and Products lose their `url` property. A URL without a protocol is automatically prefixed with `https://`. Disabling all three `generate_*` toggles produces a per-entity error ("No schemas could be generated from available data") -- keep at least one enabled.

## Schema.org Types Generated

### Organization (always recommended)
Maps entity data to Schema.org Organization:
- `name` -- entity name
- `url` -- from entity's company URL field
- `description` -- from overview (first sentence or first 200 chars) or primary category
- `foundingDate` -- from key_facts.founded
- `address` -- from key_facts.headquarters (PostalAddress)
- `numberOfEmployees` -- from key_facts.employees (QuantitativeValue)
- `logo` -- from meta.logo
- `email`, `telephone` -- from contact data
- `sameAs` -- social links (LinkedIn, Twitter, Facebook, Instagram, YouTube)
- `hasCredential` -- from credentials/licenses
- `award` -- from key_facts.awards
- `member` -- from key_facts.key_people (Person)

### Product (one per category)
Generated for each primary product/service category:
- `name` -- category name (formatted from slug)
- `brand` -- Organization reference back to the entity
- `url` -- company URL
- `description` -- category description or reasoning (when available)

### FAQPage (from FAQ items)
Maps FAQ data directly to Google's FAQ rich snippet format:
- `mainEntity` -- array of Question/Answer pairs
- Each Question has `name` (the question) and `acceptedAnswer.text` (the answer)

FAQ items come from json-output's `faq` array first; if that yields nothing, seo-planner's `seo_plan_json.faqs` is used as fallback.

## Example Output

A company with Organization + FAQPage generates:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "name": "Betsson Group",
      "url": "https://www.betssongroup.com",
      "description": "Betsson Group is a leading iGaming operator offering sports betting and casino.",
      "foundingDate": "1963",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "Stockholm, Sweden"
      },
      "numberOfEmployees": {
        "@type": "QuantitativeValue",
        "value": "1800+"
      },
      "sameAs": [
        "https://www.linkedin.com/company/betsson-group",
        "https://twitter.com/BetssonGroup"
      ],
      "hasCredential": [
        {
          "@type": "EducationalOccupationalCredential",
          "credentialCategory": "license",
          "name": "Malta Gaming Authority (MGA)"
        }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "When was Betsson Group founded?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Betsson Group was founded in 1963 in Stockholm, Sweden."
          }
        },
        {
          "@type": "Question",
          "name": "What licenses does Betsson hold?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Betsson holds licenses from the Malta Gaming Authority (MGA) and several other jurisdictions."
          }
        }
      ]
    }
  ]
}
```

This is wrapped in a `<script type="application/ld+json">` tag, ready for injection into any HTML `<head>`.

## Recipes

### Full Schema Coverage (Standard)
Generate all three schema types for maximum rich snippet potential:
```
generate_organization: true
generate_products: true
generate_faq: true
company_url_field: website
```

### Organization Only
Just the company knowledge panel schema:
```
generate_organization: true
generate_products: false
generate_faq: false
company_url_field: website
```

### FAQ Only
Just the FAQ rich snippet schema (e.g. for a page that already has Organization markup):
```
generate_organization: false
generate_products: false
generate_faq: true
company_url_field: website
```

## Expected Output

**Healthy result:**
- One JSON-LD script block per entity
- 1-5 KB per entity depending on data richness
- 1-3 schema types per entity
- Zero validation errors for well-populated entities

**Output fields per entity:**
- `entity_name` -- the company/entity name
- `schema_jsonld` -- the complete `<script type="application/ld+json">` block (downloadable as .json)
- `schema_types` -- comma-separated list of generated Schema.org types (e.g. "Organization, Product (2), FAQPage")
- `validation_errors` -- array of validation error strings
- `validation_error_count` -- number of validation issues found
- `has_validation_errors` -- string flag ("true"/"false") indicating whether any validation issues were found
- `validation_errors_text` -- human-readable validation report
- `jsonld_size_kb` -- size of the JSON-LD block in kilobytes

**Red flags to watch for:**
- High `validation_error_count` -- check upstream data quality
- Missing `url` on Organization -- set `company_url_field` to the correct entity field
- No FAQPage generated when expected -- verify FAQ data exists in json-output or seo-planner output
- Zero schema types -- no data shapes found; check that json-output or content-analyzer ran before this step

## Limitations & Edge Cases

- **Missing fields are omitted, never fabricated** -- if founding date, address, or employee count are not in the data, those Schema.org properties are simply absent
- **FAQ section empty or missing** -- FAQPage schema is silently skipped (not an error)
- **Multiple products** -- one Product schema per primary category; secondary categories are not included
- **Only the latest item per shape is read** -- when an entity's pool holds several json-output, analysis_json, or seo_plan_json items (e.g. after re-runs), only the most recent of each shape feeds the schemas
- **No JSON Schema validation against schema.org** -- validation checks required fields and basic types, but does not validate against the full Schema.org specification
- **Validation errors are warnings, not blockers** -- schemas are still generated even with validation warnings (e.g. missing recommended fields like `url`)
- **Social links depend on meta field names** -- expects `linkedin`, `twitter`, `facebook`, `instagram`, `youtube` fields in json-output's meta object
- **foundingDate format** -- validated as ISO date (YYYY or YYYY-MM or YYYY-MM-DD); non-conforming values are included with a validation warning

## What Happens Next

The JSON-LD output is ready for use outside the pipeline:

- **HTML injection** -- paste the `<script>` block into any HTML `<head>` section
- **CMS integration** -- feed the JSON-LD string into a CMS structured data field
- **Static site generators** -- include in page templates for SEO
- **Validation** -- test with Google's Rich Results Test or Schema.org Validator
- **Combine with html-output** -- use html-output for content + this module for comprehensive structured data

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** bundling
- **Cost:** cheap (pure data transformation, no API calls) -- 2 min timeout tier
- **Data operation:** add (+) -- adds one new JSON-LD item per entity to the pool (keyed by `entity_name`), preserving upstream items from other modules
- **Pool precondition:** `requires_items` -- entities with an empty pool are skipped before enqueue (`skipped_no_input`, not failed); other entities proceed normally
- **Requires columns:** none (reads from pool items, not CSV columns)
- **Depends on:** json-output, content-analyzer (both optional)
- **Input:** `input.entities[]` with `items[]` containing any combination of json-output fields (`overview`, `categories`, `faq`, `credentials`, `contact`, `meta`, `final_json`), `analysis_json`, or `seo_plan_json` -- the latest item of each shape is used
- **Output:** `{ results[], summary }` where each result has `entity_name`, `items[]` with `schema_jsonld`, `schema_types`, `validation_errors`, `validation_error_count`, `has_validation_errors`, `jsonld_size_kb`
- **Error handling:** per-entity try/catch -- an entity with no recognized data shapes, no generatable schemas, or a thrown error gets an error result (empty `items`, counted in `summary.errors`); other entities are unaffected. Each completed entity's items are pushed to `tools._partialItems`, so a timeout preserves already-processed entities
- **Selectable:** true -- operators can deselect individual entity outputs
- **Downloadable:** `schema_jsonld` field downloadable as `.json` file
- **Detail view:** header fields (entity_name, schema_types, jsonld_size_kb, validation_error_count badge) and prose sections for JSON-LD output and validation errors
- **Dependencies:** `tools.logger`, `tools.progress` (no external APIs, no LLM calls)
- **Files:** `manifest.json`, `execute.js`, `README.md`, `CLAUDE.md`

---

<!-- ===== content-delivery (step 9, v1.0.0) ===== -->

# Content Delivery (Step 9 — Distribution)

**Version:** 1.0.0

Delivers each entity's bundled artifact to a configured endpoint.

The code is **pipeline-agnostic (Rule 13)**: it knows HTTP verbs, payload
assembly, header interpolation, and error capture — nothing about any specific
destination. "Webhook", "CMS", "Google Doc" are not concepts in the code; they
are provider config a template supplies. The module branches only on a
provider's **`type`** field (the transport verb), never on its `id` or `name`.

Built for **Unit 5.5 / U1-A** (`UNIT_5_5_STEP9_10_DELIVERY_DESIGN.md`, §1–§2).

## What it does

For each entity:
1. Selects the deliverable pool item **by field shape** — the latest item
   carrying `final_json` (written by `json-output` at Step 8), never by
   `source_submodule`.
2. For each active provider, assembles a body and POSTs it.
3. Captures the outcome as an **item** (`delivered` / `failed` / `skipped`).
   A failed or errored delivery never throws — one bad delivery cannot lose the
   others. Items are pushed to `_partialItems` (Rule 10) so a timeout preserves
   progress.

An entity with **no `final_json` item** is reported as `skipped` (loudly, in the
summary and logs) — never a silent empty success.

## Input contract — how `final_json` reaches the pool

This module consumes one field: **`final_json`**, produced by `json-output` at
Step 8. It declares it in the manifest:

```json
"requires_columns": ["final_json"]
```

That declaration is load-bearing, not cosmetic. `json-output` marks `final_json`
as a `downloadable_field`, so after it runs the skeleton **strips `final_json`
from the pool item** and preserves it in `submodule_run_item_data` (keeping the
pool lean). By the time Step 9 executes, the pool item no longer carries
`final_json` inline. The skeleton's §7b enrichment path
(`content-pipeline-v2/server/workers/stageWorker.js`) **rehydrates** any field
named in `requires_columns` back onto the pool item *before* `execute()` runs —
matching each item by `item_key` (`entity_name`) against the stored `item_data`.
(§7b's enabling gate is a non-empty `requires_columns`; it then only fetches the
subset of those fields actually missing from the pool items.)
This is the identical mechanism `content-analyzer` uses to get `text_content`
back after it too is stripped.

`entity_name` is deliberately **not** in `requires_columns`: it is the module's
`item_key`, always present on the pool item, and is never stripped.

> If `requires_columns` were empty, §7b would be gated off (`requiresColumns.length > 0`
> is the only trigger) and the selector at `execute.js` would find no `final_json`
> in the pool — every entity would `skip` despite json-output having produced the
> artifact. That was the U1 delivery blocker; the one-line declaration is the fix.

## Options

| Option | Type | Default | Meaning |
|--------|------|---------|---------|
| `providers` | `json` | `[]` | Array of provider configs (schema below). Empty = nothing delivered, loud message. |

## Provider config schema

```jsonc
{
  "id": "u1-webhook",              // required; identity/log label only (code never branches on it)
  "name": "U1 delivery webhook",   // optional human label
  "type": "json_post",             // transport verb; v1 supports json_post only
  "endpoint": "{env:DELIVERY_WEBHOOK_URL}", // URL, or {env:VAR}; unset {env:VAR} → provider skipped
  "method": "POST",
  "headers": { "X-Delivery-Secret": "{env:DELIVERY_WEBHOOK_SECRET}" }, // optional; {env:VAR} interpolated
  "source_field": "final_json",    // optional; which pool-item field is the payload (default final_json)
  "envelope": true                 // optional; wrap the payload with provenance (below)
}
```

- **`type`** — only `json_post` (assemble a JSON body, POST it) in v1. Any other
  `type` is skipped with a warning (the verb set is a fixed code branch, so
  `file_upload` / `row_upsert` can slot in later without a config mini-language).
- **`endpoint`** — the target URL. Supports `{env:VAR}` interpolation. (This is
  the design's `endpoint` field, not `url`.)
- **`headers`** — a static header map; each value is interpolated for `{env:VAR}`
  tokens. `auth: none` = simply omit `headers`.
- A provider whose `endpoint` or `headers` reference an **unset** `{env:VAR}`, or
  that has **no `endpoint`**, an **unsupported `type`**, or **no `id`**, is
  **skipped up-front with a warning** — the module never POSTs to an empty URL or
  sends an empty auth header, and a config mistake surfaces once, loudly, not as
  one confusing failure per entity.

### Body shapes

- **Envelope** (`envelope: true`, recommended) — adds provenance without touching
  content:
  ```json
  { "entity_name": "Acme", "run_id": "…", "delivered_at": "2026-07-18T…Z", "payload": { …parsed final_json… } }
  ```
- **Pass-through** (`envelope` omitted/false) — the parsed `final_json` object as
  the raw body.

The module does not reshape content — content shape is `json-output`'s concern
(its `output_format` option). `final_json` is parsed from its JSON string so it
embeds as an object, not a string blob.

## Example — the U1 webhook provider

```json
[
  {
    "id": "u1-webhook",
    "name": "U1 delivery webhook",
    "type": "json_post",
    "endpoint": "{env:DELIVERY_WEBHOOK_URL}",
    "method": "POST",
    "source_field": "final_json",
    "envelope": true
  }
]
```

Set `DELIVERY_WEBHOOK_URL` in the skeleton `.env` (a test endpoint —
webhook.site, or a local handler). Use a **distinct** var from the skeleton's own
`WEBHOOK_URL` (consumed by the event notifier) so content and event traffic stay
separable. For a shared-secret endpoint, add
`"headers": { "X-Delivery-Secret": "{env:DELIVERY_WEBHOOK_SECRET}" }` — config
only, no code change.

## Output

Per-entity items:

| Field | Values |
|-------|--------|
| `delivery_status` | `delivered` \| `failed` \| `skipped` |
| `http_status` | the response status (delivered/failed), or `null` on a network/timeout error |
| `provider_id` | which provider handled it |
| `error` | on failure: `HTTP <status>` or the network error message |
| `reason` | on skip: why (e.g. no deliverable item) |

Summary `description` reports counts: `N delivered, N failed, N skipped across N entities`.

## Secrets

Resolved env-var values (auth tokens, capability URLs) **never** appear in logs,
error items, or stored output. The module logs the provider `id` only, never the
resolved `endpoint` or `headers`. Enforced by a test
(`test-content-delivery.js`, Test 6).

## Design deviation from UNIT_5_5 (recorded)

The design (`UNIT_5_5_STEP9_10_DELIVERY_DESIGN.md` §1.3/§2.3) proposed
`auth: { type: "custom_header", header, env_var }`. This module instead mirrors
**api-search's proven headers-map pattern** (v1.1.0, live-verified 2026-07-07):
an optional `headers` map with `{env:VAR}` interpolation, and `auth: none` = no
`headers` entry. One auth dialect across modules, not two. Decided in the
planning chat; recorded here and in the decision_log.

## Not built in v1 (deferred)

- **`file_upload` / `row_upsert` verbs** — designed, not built (`doc-exporter`,
  `sheet-logger`). A webhook needs only POST.
- **URL field-templating** (`{field}` from pool-item fields into `endpoint`) —
  listed as a code capability in §1.3 but unused by U1; deferred (see the
  `ponytail:` note in `execute.js`). `{env:VAR}` in the endpoint IS supported.
- **Retry loop** — single pass in v1.

## Tests

`node modules/step-9-distribution/content-delivery/test-content-delivery.js`
(mocked, offline, no credentials) — happy path/envelope, no-providers no-op,
missing-`final_json` skip, delivery failures (HTTP + network), missing-env skip,
secret non-leak, field-shape selection, missing-`endpoint` skip, `$`-safe
interpolation, and the strip→rehydrate contract
(`requires_columns:["final_json"]`). 40 assertions.
