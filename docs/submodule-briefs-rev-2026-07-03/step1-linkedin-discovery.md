# Submodule Brief: LinkedIn Discovery (revised) — template configuration of `search-discovery`

**Step:** 1 — Discovery
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Find an entity's LinkedIn company page URL and capture public metadata from search results, without scraping LinkedIn directly.
**Build status:** not built (no module to build — ships as template config once `search-discovery` exists)
**Design verdict:** template configuration of `search-discovery`. No new module. Deep LinkedIn data is already covered by built step-3 modules (`linkedin-profile-scraper`, `linkedin-post-scraper`).

## Goal

Resolve entity → LinkedIn company-page URL (+ whatever headline/location/employee-range metadata the SERP snippet carries). Verdict rationale:

- **(a) template config — CHOSEN.** The entire mechanism is one or two `site:` queries: `site:linkedin.com/company "{entity_name}"` (and `site:linkedin.com/company "{website_domain}"` as fallback). That is search-discovery's site_restricted mode with a one-domain site list.
- **(b) provider config — rejected.** LinkedIn's official API doesn't offer company search without partner-program access; there is nothing to configure as a provider.
- **(c) separate module — rejected.** Everything beyond URL discovery already has a home: **linkedin-profile-scraper** (built, step 3, Profile API mode) does the actual data extraction once a URL exists; **linkedin-post-scraper** (built) covers posts. The original brief's own scope line — "does NOT scrape LinkedIn, finds the URL only" — describes a search query, not a module.

## Design (agnostic)

Pure `preset_map` configuration:

- `search_mode: site_restricted`, `site_list: "linkedin.com/company"` — note the site list entry carries a **path**, so search-discovery's site_restricted rendering must support `site:{domain-or-domain/path}` (canonical brief accommodates this: entries are passed through verbatim after the `site:` operator; the `/company` path filter is what excludes `/in/` and `/jobs/` results at the query level, replacing the original's post-hoc URL-shape validation).
- `query_templates`: `["\"{entity_name}\"", "\"{website_domain}\""]` — the domain-based fallback catches entities whose LinkedIn name differs from their trading name.
- Disambiguation for common names → step-2 url-relevance with entity context (template prompt), not code.
- Liveness check → the canonical module's generic `verify_liveness` option (HEAD; treat LinkedIn's auth-wall 999/302 responses as "live" — a documented verify_liveness behavior in the canonical module, since LinkedIn blocks anonymous HEADs).

**Honesty note carried over from the original:** search engines de-rank LinkedIn pages; expect 60–80% first-query hit rate, provider-dependent. The domain-fallback template and step-2 filtering are the mitigation; do not add retry cleverness to module code.

## Module contract

Inherited from `search-discovery`: item_key `url` · `add` · `empty_ok` · cost `medium` · requires_columns `["name"]` (`website` optional, powers the fallback template) · `_partialItems` per query.

## Options (manifest sketch)

None new — configures existing options: `search_mode`, `site_list`, `query_templates`, `max_results_per_query` (set 3 — top hits only), `verify_liveness`.

## Providers (researched 2026-07-03)

Canonical table applies. LinkedIn-specific notes:

| Provider | Env var | Note for this config |
|---|---|---|
| Perplexity Search API | `PERPLEXITY_API_KEY` — **key EXISTS today, live-testable now** | Domain filter via param; LinkedIn coverage in its index unverified — measure on a 10-entity sample first |
| Serper.dev | `SEARCH_PROVIDER_SERPER_KEY` (new) | Google index has the best LinkedIn company-page coverage; `site:linkedin.com/company` works natively; $0.30–$1.00/1k |
| Brave Search API | `SEARCH_PROVIDER_BRAVE_KEY` (new) | Independent index — LinkedIn coverage historically weaker (unverified currently); fallback only |

## Example template configurations

**Company-profiles template (iGaming flavor lives HERE — note: only the url-relevance prompt carries flavor; the search config itself is generic):**
```json
{
  "search_mode": "site_restricted",
  "site_list": "linkedin.com/company",
  "query_templates": ["\"{entity_name}\"", "\"{website_domain}\""],
  "max_results_per_query": 3,
  "max_queries_per_entity": 2,
  "verify_liveness": true
}
```
Paired step-2 url-relevance preset: *"Keep the single LinkedIn company page that belongs to {entity_name}, a B2B iGaming company (match on industry, headquarters, or website domain in the snippet). Drop lookalike companies, personal profiles, and job listings."*

**Job-search template — identical search config**, different url-relevance prompt ("keep the employer's page"); demonstrates zero content-type coupling.

## Credentials & testing

- **Live-testable today** with existing `PERPLEXITY_API_KEY` (approved reuse); provision Serper only if Perplexity's LinkedIn coverage disappoints on the sample run.
- No LinkedIn credentials involved at any point (that stays true to the original's design constraint; step-3 scrapers own that problem).
- Unit tests: canonical module's suite; add fixtures for path-bearing site-list entries (`linkedin.com/company`) and the auth-wall-tolerant liveness check.
- E2E: preset + url-relevance prompt, attended session; measure hit rate on 10 known entities.

## Edge cases & failure modes

- Multiple plausible company pages (subsidiaries, regional pages) → keep all from top-3; step-2 picks. No "take first result" logic in code.
- No LinkedIn presence → empty result, normal; downstream must not treat absence as failure.
- LinkedIn URL variants (`/company/foo` vs `/company/foo/about/`) → url-canonicalizer (built, step 2) normalizes.
- Snippet metadata (employee count, location) is best-effort SERP text — emit as plain fields, never parsed/validated in code; step-3 linkedin-profile-scraper is the authoritative source.

## Open questions

1. Should a successful match write `linkedin_url` onto the entity record (not just the pool) so step-3 linkedin-profile-scraper can consume it directly? That's a skeleton/entity-enrichment question — surface at template-wiring time.
2. Is Perplexity's index adequate for LinkedIn pages, or is Serper effectively mandatory for this config? Answer with the 10-entity sample before provisioning anything.
