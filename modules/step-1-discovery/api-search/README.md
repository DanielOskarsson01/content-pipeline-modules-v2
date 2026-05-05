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

Providers are configured via the `providers` option. Each provider is a JSON object describing the API endpoint, field mapping, and mode.

```
api-search (Step 1) -> url-dedup (Step 2) -> scrapers (Step 3) -> ...
```

## When to Use

**Always run when:**
- You need to discover items from REST APIs that return JSON
- You want to search multiple API sources in a single step

**Skip when:**
- You already have a list of specific URLs (use seed data directly instead)
- The target sources don't have a public JSON API (use browser-crawler for HTML scraping)

## Options Guide

| Option | Default | Description |
|--------|---------|-------------|
| `keywords` | `["CMO", "CPO", "CEO"]` | Search mode: one API call per keyword. Feed mode: client-side filter on title/description |
| `exclude_keywords` | `["intern", "junior", "student"]` | Items whose title contains these terms (case-insensitive) are filtered out |
| `max_results` | 50 | Search mode: passed as limit to API. Feed mode: not enforced (all matching items returned) |
| `providers` | `[]` | Array of provider config objects (see Provider Config below) |
| `provider_params` | `{}` | Extra query params per provider, keyed by provider ID |
| `requests_per_minute` | 30 | Global rate limit across all providers |
| `score_rules` | `[]` | Scoring rules to flag high-signal items. See Scoring below |
| `entity_production` | `false` | Each approved item becomes its own entity for downstream steps |
| `entity_name_template` | `"{title}"` | Name template for produced entities. Placeholders: `{title}`, `{company}`, `{source}`, `{url}` |

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

Results are sorted by `_score` descending (highest signal first). When `score_rules` is empty (default), scoring is completely skipped — no fields added, no sorting.

## Output Fields

| Field | Description |
|-------|-------------|
| `title` | Item title |
| `company` | Source/company name |
| `location` | Location |
| `url` | Direct link -- used by downstream scrapers |
| `source` | Provider ID that found this item |
| `externalId` | Provider-prefixed unique ID for deduplication |
| `snippet` | First 200 characters of description (HTML stripped) |
| `text_content` | Full description text if > 200 chars |
| `postedAt` | Publication date from the API |
| `status` | Always "success" for discovered items |
| `_score` | Scoring total (only when score_rules configured) |
| `_signal` | `high`, `medium`, or `low` (only when score_rules configured) |

## Limitations

- **No HTML scraping** -- only works with APIs that return JSON
- **Feed-mode keyword filtering is basic** -- case-insensitive substring match on raw fields
- **No pagination** -- fetches one page of results per keyword
- **Auth limited to query params** -- header-based auth not yet supported
- **15-second timeout per request** -- hardcoded
