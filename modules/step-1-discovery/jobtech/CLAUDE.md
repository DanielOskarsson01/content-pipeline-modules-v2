# jobtech — CLAUDE.md

## Module identity

- **ID:** jobtech
- **Step:** 1 (Discovery)
- **Template:** Job Search
- **Data operation:** transform (replaces items per entity)

## Rules

1. Uses `tools.http` for all API calls — never import http libraries directly
2. Returns errors as items with error field, does not throw
3. One API call per keyword — no batching into boolean queries (keeps results predictable)
4. Deduplicates by externalId within a single run
5. Exclude keyword filtering is case-insensitive substring match on title

## Options contract

- `keywords`: string[] — from template preset_map
- `exclude_keywords`: string[] — from template preset_map
- `max_results`: number — per-keyword API limit
- `municipality_code`: string — optional Swedish municipality filter
