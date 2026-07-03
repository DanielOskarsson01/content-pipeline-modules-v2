# Submodule Brief: Curated Source-List Search (revised) — template configuration of `search-discovery`

**Step:** 1 — Discovery
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Import pre-built lists of known industry sources and search them for entity mentions.
**Build status:** not built (no module to build — ships as template config once `search-discovery` exists)
**Design verdict:** template configuration of `search-discovery` (canonical brief: `step1-google-pse-directories.md`). No new module.

## Goal

Given a curated list of high-value domains (news sites, regulators, conference sites, competitor directories), find pages on those domains that mention each entity. The original brief bundled three separable concerns; two are already covered by built modules, and the residual is exactly `search-discovery`'s site_restricted mode:

| Original concern | Where it lives now |
|---|---|
| Import a list of URLs/sources (CSV, sheet) | **csv-discovery** (built) — direct list import into the pool |
| Monitor sources with RSS feeds for mentions | **rss-feeds** (built) — feed monitoring |
| Search N known domains for entity mentions | **search-discovery site_restricted mode** — this brief |

## Design (agnostic)

Pure `preset_map` configuration — zero code:

- `search_mode: site_restricted` with the curated list in `site_list` (textarea, one domain per line) or `site_list_doc` (reference doc — preferred for lists shared across templates; version-controlled, unlike the original brief's Google Sheets idea).
- `query_templates` express what "mention" means per use case: bare entity name, or qualified (`"{entity_name}" license`, `"{entity_name}" speaker`).
- Multiple curated lists (news vs regulators vs conferences) = multiple submodule cards/runs of search-discovery, each with its own preset — the multi-card system already supports this; no `source_list_name` plumbing needed in code. The `found_via`/preset name distinguishes provenance in the pool.
- Cost cap: `max_queries_per_entity` bounds the templates × domains explosion the original flagged.

**Rule 13 check:** the module knows "search these domains for these rendered queries." Which domains are authoritative for iGaming (or any vertical) is template knowledge, shown below and nowhere else.

## Module contract

Inherited from `search-discovery`: item_key `url` · `add` · `empty_ok` · cost `medium` · requires_columns `["name"]` · `_partialItems` per query. Empty site list in site_restricted mode → loud fail (misconfiguration), matching the original brief's "No source list configured" error.

## Options (manifest sketch)

None new — configures existing `search-discovery` options: `search_mode`, `site_list`, `site_list_doc`, `query_templates`, `max_results_per_query`, `max_queries_per_entity`, `requests_per_minute`.

## Providers (researched 2026-07-03)

See the canonical brief's table. For this use case: Perplexity Search API (`PERPLEXITY_API_KEY` — **key EXISTS today, live-testable now**; domain filtering via param) is the day-one path; Serper.dev (new key, $0.30–$1.00/1k, full `site:` operator) when Google-index coverage of small niche domains matters — Google's index is usually deeper on low-traffic regulator/conference sites than alternative indexes (worth verifying on the actual list).

## Example template configurations

**Company-profiles template — regulator + conference lists (original iGaming flavor lives HERE):**
```json
{
  "search_mode": "site_restricted",
  "site_list_doc": "igaming-authority-sources.md",
  "query_templates": ["\"{entity_name}\""],
  "max_results_per_query": 5,
  "max_queries_per_entity": 30
}
```
Reference doc `igaming-authority-sources.md` (uploaded via UI, versioned with the template):
```
# regulators
gamblingcommission.gov.uk
mga.org.mt
spelinspektionen.se
# conferences
sbcevents.com
sigma.world
# competitor directories
askgamblers.com
lcb.org
```

**Job-search template — same mechanism, different list:**
```json
{
  "search_mode": "site_restricted",
  "site_list": "glassdoor.com\nlevels.fyi\nteamblind.com",
  "query_templates": ["\"{entity_name}\" reviews", "\"{entity_name}\" salary"],
  "max_results_per_query": 5
}
```

## Credentials & testing

- **Live-testable today** with the existing `PERPLEXITY_API_KEY` (approved reuse). New keys (Serper etc.) only for Google-index depth — see canonical brief.
- Unit tests live with the canonical module; this config contributes a fixture: `site_list_doc` resolution + comment-line handling + the empty-list loud-fail.
- E2E: upload the reference doc + preset via UI, attended session.

## Edge cases & failure modes

- Curated domain dead → zero results, logged; list hygiene is a template concern (see open question).
- Cost explosion (sources × entities) → `max_queries_per_entity` cap, inherited.
- A domain that is itself a directory of entities → results may be list pages, not entity pages; step-2 url-relevance filters, as the original intended.
- Both `site_list` and `site_list_doc` set → doc wins (canonical brief rule); log which source was used.

## Open questions

1. Should search-discovery emit per-domain zero-result stats in meta so operators can spot dead curated domains without reading logs? (Cheap, generic — recommend yes.)
2. Google Sheets as a list source (original idea): out of scope — reference docs are the pipeline's config surface. Revisit only if list churn becomes weekly.
