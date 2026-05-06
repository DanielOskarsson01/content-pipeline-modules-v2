# API Search

> Discovers items from multiple REST APIs using a single config-driven module. Supports keyword-search APIs and feed APIs -- adding a new API source means adding a JSON config, not writing code.

**Module ID:** `api-search` | **Step:** 1 (Discovery) | **Category:** search | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

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
| `auth` | Optional | Auth config: `{ "type": "query_param", "key": "param_name", "env_var": "ENV_VAR_NAME" }` |

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
- **Auth limited to query params** -- header-based auth not yet supported
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
