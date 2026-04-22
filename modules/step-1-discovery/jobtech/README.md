# JobTech / Platsbanken

Step 1 discovery submodule for the Job Search template.

## What it does

Searches the Swedish public employment service API (Arbetsförmedlingen / Platsbanken) for job postings matching configured keywords. Makes one API call per keyword, deduplicates results by external ID, and filters out titles containing excluded terms.

## API

- **Endpoint:** `https://jobsearch.api.jobtechdev.se/search`
- **Auth:** None required (public API)
- **Rate limits:** Not documented; be reasonable with request frequency
- **Docs:** https://jobsearch.api.jobtechdev.se/

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `keywords` | json (array) | `["CMO", "CPO", "CEO"]` | Keywords to search. Each triggers one API call. |
| `locations` | json (array) | `["Stockholm", "Remote"]` | Location reference (filtering done by job-filter module). |
| `exclude_keywords` | json (array) | `["intern", "junior", "student"]` | Titles containing these are filtered out (case-insensitive). |
| `max_results` | number | 50 | Max results per keyword from the API. |
| `municipality_code` | text | `""` | Swedish municipality code (e.g., `0180` for Stockholm). Empty = all Sweden. |

## Output

Table with columns: title, company, location, url, source, externalId, postedAt.

## Known issues

- Full-text matching returns noise for broad terms like "digital"
- Some Swedish terms (e.g., "Marknadschef") return 0 results when municipality filter is active
- API occasionally returns duplicate hits across different keyword searches (handled by dedup)
