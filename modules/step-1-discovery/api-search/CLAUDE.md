# api-search -- CLAUDE.md

## Module identity

- **ID:** api-search
- **Step:** 1 (Discovery)
- **Template:** Job Search
- **Data operation:** transform (discovers items per entity)

## Rules

1. Uses `tools.http` for all API calls -- never import http libraries directly
2. Returns errors as items with error field, does not throw
3. Two provider modes: `search` (one API call per keyword) and `feed` (one API call total, client-side keyword filter)
4. Deduplicates by externalId within a single run, across all providers
5. Exclude keyword filtering is case-insensitive substring match on title
6. Every output item MUST have `url`, `source`, `externalId`, `status` -- downstream modules depend on `url`
7. Built-in providers (jobtech, remoteok, remotive) are hardcoded in execute.js -- custom providers come from options
8. HTML is stripped from snippet fields (RemoteOK and Remotive return HTML)
9. Rate limiter is global across all providers -- uses token-bucket pattern from api-scraper
10. Providers with missing auth env vars are silently skipped with a warning log

## Options contract

- `keywords`: string[] -- search terms (search mode: per-keyword API call; feed mode: client-side filter)
- `exclude_keywords`: string[] -- title substring exclusion filter
- `max_results`: number -- per-keyword API limit for search mode
- `active_providers`: string[] -- which provider IDs to query (default: ["jobtech"])
- `custom_providers`: object[] -- user-defined provider config objects
- `provider_params`: object -- extra query params keyed by provider ID
- `requests_per_minute`: number -- global rate limit

## Provider config shape

```
{
  id, name, mode, url, keyword_param?, limit_param?,
  results_path, filter_fields?, field_map, auth?
}
```

- `field_map` values: dot-notation string, fallback array, or null
- `results_path`: dot-notation into JSON response, or `$slice_first` (skip element 0)
- `auth.type`: only `query_param` supported currently
