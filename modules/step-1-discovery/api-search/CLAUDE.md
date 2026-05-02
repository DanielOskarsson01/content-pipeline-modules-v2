# api-search -- CLAUDE.md

## Module identity

- **ID:** api-search
- **Step:** 1 (Discovery)
- **Category:** search
- **Data operation:** transform (discovers items per entity)

## Rules

1. Uses `tools.http` for all API calls -- never import http libraries directly
2. Returns errors as items with error field, does not throw
3. Two provider modes: `search` (one API call per keyword) and `feed` (one API call total, client-side keyword filter)
4. Deduplicates by externalId within a single run, across all providers
5. Exclude keyword filtering is case-insensitive substring match on title
6. Every output item MUST have `url`, `source`, `externalId`, `status` -- downstream modules depend on `url`
7. Providers are fully config-driven via the `providers` option (presets_enabled) -- no hardcoded providers in code
8. HTML is stripped from snippet fields (some APIs return HTML in descriptions)
9. Rate limiter is global across all providers -- uses token-bucket pattern from api-scraper
10. Providers with missing auth env vars are silently skipped with a warning log

## Options contract

- `search_input`: "keywords" | "entity" | "entity_names" -- where search terms come from
- `keywords`: string[] -- search terms (only used when search_input="keywords")
- `exclude_keywords`: string[] -- title substring exclusion filter
- `max_results`: number -- per-keyword API limit for search mode
- `providers`: object[] -- provider config objects (presets_enabled: save/name/star in UI)
- `provider_params`: object -- extra query params keyed by provider ID
- `requests_per_minute`: number -- global rate limit
- `entity_production`: boolean -- each approved item becomes its own downstream entity
- `entity_name_template`: string -- template for produced entity names, e.g. "{title} - {company}"

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
