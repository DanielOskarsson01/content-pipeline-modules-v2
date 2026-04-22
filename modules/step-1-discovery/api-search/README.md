# API Search

> Discovers job postings from multiple REST APIs using a single config-driven module. Supports keyword-search APIs and feed APIs -- adding a new job board means adding a JSON config, not writing code.

**Module ID:** `api-search` | **Step:** 1 (Discovery) | **Category:** Job Search | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

API Search queries job board APIs to discover job postings matching your search criteria. Instead of having a separate submodule for every job board, this single module handles any REST API that returns JSON -- you just configure a provider object describing how to talk to that API.

The module supports two types of job board APIs:

- **Search mode** -- APIs that accept a keyword parameter and return filtered results (e.g., JobTech, Adzuna). One API call per keyword.
- **Feed mode** -- APIs that return all recent jobs with no server-side filtering (e.g., RemoteOK, Remotive). One API call total, then keywords are matched client-side against title and description.

Three providers are built in (JobTech, RemoteOK, Remotive). You can add more by dropping a provider config JSON into the `custom_providers` option -- no code changes needed.

```
api-search (Step 1) -> url-dedup (Step 2) -> scrapers (Step 3) -> ...
```

## When to Use

**Always run when:**
- Starting a job search pipeline -- this is the primary discovery module for job postings
- You want to search multiple job boards in a single step

**Skip when:**
- You already have a list of specific job URLs (use seed data directly instead)
- The target job boards don't have a public JSON API (use browser-crawler for HTML scraping)

**Tune the settings when:**
- Search results are too broad -- use more specific keywords, or add `provider_params` to filter by location
- You need international coverage -- add remoteok and remotive to `active_providers`
- Adding a new job board -- create a provider config in `custom_providers`

## Built-in Providers

| Provider | Mode | API | Auth | Coverage |
|----------|------|-----|------|----------|
| `jobtech` | search | JobTech / Platsbanken | None (free) | Sweden -- all public job postings |
| `remoteok` | feed | RemoteOK | None (free) | Global remote jobs |
| `remotive` | feed | Remotive | None (free) | Global remote jobs |

### Important: How JobTech search works

JobTech uses **full-text search** -- the keyword is matched against the entire job description, not just the title. This means:
- Broad terms like "marketing" will return hundreds of loosely-related jobs
- Compound keywords like "iGaming CMO" use AND matching and may return zero results
- Use short, specific terms: "CMO", "CTO", "product manager" work better than long phrases

Use `provider_params` to add `municipality` codes for location filtering (e.g., `0180` for Stockholm).

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `keywords` | `["CMO", "CPO", "CEO"]` | Add domain-specific terms; keep them short and specific for search-mode providers | Search mode: one API call per keyword. Feed mode: client-side filter on title/description |
| `exclude_keywords` | `["intern", "junior", "student"]` | Add terms for roles you never want (e.g., "warehouse", "receptionist") | Filters out any item whose title contains these terms (case-insensitive) |
| `max_results` | 50 | Raise to 100-200 for broader coverage; lower to 20 for focused searches | Search mode: passed as limit to API. Feed mode: not currently enforced (all matching items returned) |
| `active_providers` | `["jobtech"]` | Add `"remoteok"`, `"remotive"` for international remote jobs | Controls which providers actually run. Only IDs listed here are queried |
| `custom_providers` | `[]` | Add when connecting a new job board API | Array of provider config objects (see Adding a Provider below) |
| `provider_params` | `{}` | Set per-provider query params like location filters | Keyed by provider ID. Values are query param key-value pairs added to every request |
| `requests_per_minute` | 30 | Lower to 10-15 if a provider rate-limits you; raise for paid APIs with generous limits | Global rate limit across all providers. Uses token-bucket throttling |

**Most impactful options:** `keywords` and `active_providers` determine what you find. Everything else is tuning. The biggest mistake is using too many broad keywords with search-mode providers -- you'll get hundreds of irrelevant results.

## Recommended Configurations

### Sweden Only (Default)
For Swedish job market searches via JobTech:
```
keywords: ["CMO", "CPO", "CEO", "CTO", "VD"]
exclude_keywords: ["intern", "junior", "student"]
max_results: 50
active_providers: ["jobtech"]
provider_params: {"jobtech": {"municipality": "0180"}}
requests_per_minute: 30
```

### Sweden + Remote
Combine Swedish jobs with global remote opportunities:
```
keywords: ["CMO", "CPO", "CEO", "marketing director", "product director"]
exclude_keywords: ["intern", "junior", "student"]
max_results: 50
active_providers: ["jobtech", "remoteok", "remotive"]
provider_params: {"jobtech": {"municipality": "0180"}}
requests_per_minute: 30
```

### Remote Only
Global remote job discovery without Swedish-specific search:
```
keywords: ["CMO", "marketing", "product", "growth"]
exclude_keywords: ["intern", "junior", "student", "assistant"]
max_results: 100
active_providers: ["remoteok", "remotive"]
provider_params: {}
requests_per_minute: 30
```

### Focused Executive Search
Narrow search for C-level positions only:
```
keywords: ["CMO", "CPO", "CEO", "CTO", "COO", "VP Marketing", "VP Product"]
exclude_keywords: ["intern", "junior", "student", "assistant", "coordinator", "specialist"]
max_results: 50
active_providers: ["jobtech", "remoteok", "remotive"]
provider_params: {"jobtech": {"municipality": "0180"}}
requests_per_minute: 30
```

## Adding a Provider

To add a new job board, create a provider config object in `custom_providers`. No code changes needed.

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

### Feed-mode provider (API returns all jobs)
```json
{
  "id": "myjobboard",
  "name": "My Job Board",
  "mode": "feed",
  "url": "https://api.myjobboard.com/jobs",
  "results_path": "data.jobs",
  "filter_fields": ["title", "description"],
  "field_map": {
    "url": "apply_url",
    "title": "job_title",
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
| `results_path` | Yes | Dot-notation path to the results array in the JSON response (e.g., `"hits"`, `"data.jobs"`) |
| `filter_fields` | Feed only | Which raw fields to search for keyword matches (e.g., `["title", "description"]`) |
| `field_map` | Yes | Maps canonical output fields to API response fields using dot notation |
| `auth` | Optional | Auth config: `{ "type": "query_param", "key": "param_name", "env_var": "ENV_VAR_NAME" }` |

### field_map supports

- **Simple path:** `"employer.name"` -- dot-notation into the API response object
- **Fallback array:** `["url", "$remoteok_slug"]` -- tries each path in order, uses first non-empty value
- **null:** Field is always null for this provider (e.g., RemoteOK has no location field)

## What Good Output Looks Like

**Healthy results:**
- JobTech with 3-5 specific keywords: 10-50 unique jobs per keyword, 50-200 total after dedup
- RemoteOK feed: ~99 total items, 5-30 matching keywords depending on specificity
- Remotive feed: 20-50 items, keyword filtering reduces to relevant matches
- Zero errors, all items have URLs

**Output fields:**

| Field | Description |
|-------|-------------|
| `title` | Job title from the posting |
| `company` | Employer name |
| `location` | Job location (city, region, or "Remote") |
| `url` | Direct link to the job posting -- used by downstream scrapers |
| `source` | Provider ID that found this job (e.g., "jobtech", "remoteok") |
| `externalId` | Provider-prefixed unique ID for deduplication (e.g., "jobtech-12345") |
| `snippet` | First 200 characters of the job description (HTML stripped) |
| `postedAt` | Publication date from the API |
| `status` | Always "success" for discovered items |

**Warning signs:**
- 0 results from JobTech -- keywords may be too specific or compound. Try simpler single-word terms
- Hundreds of results from a single keyword -- term is too broad. Replace "marketing" with "CMO" or "marketing director"
- HTTP 429 errors -- rate limit hit. Lower `requests_per_minute` or wait before retrying
- Missing URLs on items -- provider's field_map may be misconfigured. Check the `url` mapping path
- RemoteOK returning 0 items -- the API may be temporarily down or returning HTML instead of JSON

## Limitations

- **No HTML scraping** -- only works with APIs that return JSON. For job boards without an API, use browser-crawler
- **Feed-mode keyword filtering is basic** -- case-insensitive substring match on raw fields. No fuzzy matching or semantic search
- **RemoteOK has no keyword search** -- it returns ALL recent jobs. With many broad keywords, most items will match. With no keywords, all ~99 items are returned
- **JobTech full-text search** -- keywords match anywhere in the description, not just titles. Expect some irrelevant results
- **No pagination** -- fetches one page of results per keyword. For APIs with thousands of results, you only get the first `max_results`
- **Auth limited to query params** -- header-based auth (Bearer tokens, API keys in headers) is not yet supported
- **15-second timeout per request** -- hardcoded. Very slow APIs may time out

## What Happens Next

Discovered job postings flow into **Step 2 (url-dedup)** which removes duplicates found across keywords or providers. The `url` field is the dedup key. After dedup, **Step 3 scrapers** fetch the full job ad text from each URL. That text eventually feeds into **Step 5 (job-analyzer)** for CV tailoring analysis.

The `source` field persists through the pipeline, so you can always trace which provider originally discovered each job.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** Job Search
- **Cost:** cheap -- short timeout, fast queue priority
- **Data operation:** transform (=) -- entities pass through, items are discovered and attached
- **Required input columns:** `name`
- **Depends on:** nothing (first step)
- **Input:** `input.entities[]` with `name` field
- **Output:** `{ results[], summary }` with items grouped by entity_name
- **Error handling:** per-provider and per-keyword try/catch. Failed providers are logged and skipped. Partial results saved via `_partialItems` for timeout resilience
- **Rate limiting:** token-bucket limiter shared across all providers, configurable via `requests_per_minute`
- **External dependencies:** None (uses only `tools.http` for API calls)
