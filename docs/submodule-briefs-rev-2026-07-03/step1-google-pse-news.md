# Submodule Brief: News Search (revised) — template configuration of `search-discovery`

**Step:** 1 — Discovery
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Search a curated news-site whitelist to find news articles about each entity.
**Build status:** not built (no module to build — ships as template config once `search-discovery` exists)
**Design verdict:** template configuration of `search-discovery` (canonical brief: `step1-google-pse-directories.md`). No new module.

## Goal

Find recent news coverage of each entity from a trusted whitelist of news domains. The original brief proposed a dedicated "Google PSE News" module with the whitelist living in Google's Custom Search console. Both halves of that design are obsolete: the whitelist is template configuration (Rule 13 — vertical flavor never lives in module code or an external console nobody versions), and Google CSE is closed to new customers (sunset 2027-01-01). The entire goal is expressible as a `search-discovery` preset.

## Design (agnostic)

Everything below is a `preset_map` entry on a template — zero code:

- `search_mode: site_restricted` over the news whitelist (`site_list` textarea or `site_list_doc` reference doc — the doc is the version-controlled replacement for the old Google-console whitelist).
- `result_type`: `news` where the provider has a news vertical (Serper `/news`, Brave news endpoint) — **caveat:** news verticals search the engine's news index, which under-covers niche trade press; `web` + site_restricted is the safer default for specialist whitelists. Offer both configs; measure on a real run.
- `date_range` for recency (`month`/`year` mapped per provider).
- Query templates carry the entity name plus any disambiguation qualifier — qualifiers are template flavor, not module defaults.

Output items arrive with `pub_date` where the provider returns it; step-2 modules (url-relevance, url-filter) do the teaser/tag-page filtering, exactly as the original brief intended.

**Cross-references:** rss-feeds (existing module) already monitors news sites that publish feeds — prefer it for continuous monitoring of a fixed whitelist (free, no per-query cost); use this search config for on-demand, per-entity retrospective search, which feeds cannot do (feeds only expose recent items).

## Module contract

Inherited from `search-discovery`: item_key `url` · `add` · `empty_ok` · cost `medium` · requires_columns `["name"]` · `_partialItems` per query. Nothing news-specific in the contract.

## Options (manifest sketch)

None new — this brief configures existing `search-discovery` options: `search_mode`, `site_list`/`site_list_doc`, `query_templates`, `result_type`, `date_range`, `max_results_per_query`, `max_queries_per_entity`.

## Providers (researched 2026-07-03)

See the canonical brief's full table. News-relevant highlights:

| Provider | Env var | News support | Notes |
|---|---|---|---|
| Perplexity Search API | `PERPLEXITY_API_KEY` — **key EXISTS today, live-testable now** | No separate news vertical; domain filter param + recency filter | Approved-reuse key; default starting point. https://docs.perplexity.ai/docs/getting-started/pricing |
| Serper.dev | `SEARCH_PROVIDER_SERPER_KEY` (new) | `/news` endpoint + `tbs` date ranges; full `site:` support | $0.30–$1.00/1k. https://serper.dev/ |
| Brave Search API | `SEARCH_PROVIDER_BRAVE_KEY` (new) | News endpoint; $5 renewing monthly credits | ~$5/1k. https://api-dashboard.search.brave.com/documentation/pricing |
| Google CSE JSON API | legacy only | — | Closed to new customers, sunset 2027-01-01 — the original brief's provider is not provisionable. |

## Example template configurations

**Company-profiles template — iGaming news whitelist (the original brief's flavor lives HERE):**
```json
{
  "search_mode": "site_restricted",
  "site_list": "igamingbusiness.com\ngamblinginsider.com\nsbcnews.co.uk\negr.global\ncalvinayre.com\nigamingnext.com\nyogonet.com",
  "query_templates": ["\"{entity_name}\"", "\"{entity_name}\" acquisition OR partnership OR license"],
  "result_type": "web",
  "date_range": "year",
  "max_results_per_query": 10,
  "max_queries_per_entity": 20
}
```

**Job-search template — employer news check (same module, different vertical):**
```json
{
  "search_mode": "open",
  "query_templates": ["\"{entity_name}\" layoffs OR hiring OR funding"],
  "result_type": "news",
  "date_range": "month",
  "max_results_per_query": 5
}
```

## Credentials & testing

- **Live-testable today** with the existing `PERPLEXITY_API_KEY` (approved reuse) — 1 entity against a 5-domain whitelist ≈ 5 requests, ~$0.03.
- New keys only if Google-shaped news SERP is required (Serper/Brave — table above).
- Unit tests are the canonical module's tests; this config adds a fixture case: site_restricted rendering over a multi-line `site_list` with a `date_range` set.
- E2E: template preset_map wiring + attended session.

## Edge cases & failure modes

- Common entity names → qualifier terms in this template's `query_templates` (e.g. `"Evolution" igaming` — flavor stays here, never in module defaults).
- Whitelist domain dead/renamed → zero results from that domain, logged per query; prune the list in the template — no code involvement.
- News verticals missing niche trade sites → use `web` + site_restricted variant (primary config above).
- Zero coverage for small entities → empty result is a normal outcome, not a failure.

## Open questions

1. Whitelist governance: who owns the reference doc, and is there a review cadence? (Process, not code.)
2. Is per-article `pub_date` from SERP metadata reliable enough for step-5 recency weighting, or should step-3 scraping re-extract dates? Measure on first real run.
