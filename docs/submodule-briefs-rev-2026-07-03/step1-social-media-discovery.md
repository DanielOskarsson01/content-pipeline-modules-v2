# Submodule Brief: Social Media Discovery (revised) — template configuration of `search-discovery`

**Step:** 1 — Discovery
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Find an entity's social media profiles (Twitter/X, Telegram, Instagram, Facebook) via search.
**Build status:** not built (no module to build — ships as template config once `search-discovery` exists)
**Design verdict:** template configuration of `search-discovery`, plus a cross-reference to the built `page-links` module for homepage social-link extraction. No new module.

## Goal

Discover an entity's official social profile URLs. Verdict rationale against the (a)/(b)/(c) hierarchy:

- **(a) template config — CHOSEN.** Profile discovery is `site:` queries over platform domains: `site:x.com "{entity_name}"`, `site:t.me "{entity_name}"`. That is literally search-discovery's site_restricted mode with a platform-domain site list.
- **(b) provider config — rejected.** Platform APIs are the wrong tool for URL discovery: X API paid tiers start ~$200/mo for search (unverified exact current tier pricing — irrelevant since discovery doesn't need it); Meta/Instagram APIs require app review and don't do public profile search; Telegram has no profile-search API. All cost/complexity, no discovery benefit.
- **(c) separate module — rejected.** The original brief's only non-search behavior — "check the entity's website footer for social links" — is already built: **page-links** extracts links from entity homepages; a platform-domain filter on its output (or step-2 url-filter with `x.com|t.me|instagram.com|facebook.com` patterns) covers it. Highest-precision source, zero search cost.

**Recommended composition:** page-links (homepage social links, free, precise) THEN this search-discovery config (catches profiles not linked from the site). Step-2 url-dedup merges.

## Design (agnostic)

Pure `preset_map` configuration:

- `search_mode: site_restricted`, `site_list` = platform domains (which platforms matter is template flavor — a B2B pipeline wants LinkedIn/X; a creator pipeline wants Instagram/TikTok/Twitch).
- `query_templates`: `"{entity_name}"` (optionally with a qualifier term per template).
- `platform` derives from the result's `domain` field — the module already emits `domain`; no platform enum in code (Rule 13: the platform list is config, so the enum can't live in code anyway).
- Validation that a result is the entity's own profile (not a mention/fan page) is a step-2 concern: url-relevance with a template prompt ("keep only official profile pages of {entity_name}") — the original's "validate results are company pages" step, in its architecturally correct home.

## Module contract

Inherited from `search-discovery`: item_key `url` · `add` · `empty_ok` · cost `medium` · requires_columns `["name"]` · `_partialItems` per query.

## Options (manifest sketch)

None new — configures existing options: `search_mode`, `site_list`, `query_templates`, `max_results_per_query`, `max_queries_per_entity`.

## Providers (researched 2026-07-03)

Canonical table applies. Platform-specific note: Google's index (Serper, `SEARCH_PROVIDER_SERPER_KEY`, new key) has materially better coverage of X/Instagram/Facebook profile pages than smaller indexes; Telegram (`t.me`) is weakly indexed everywhere — the original brief's "lower success rate for Telegram" caveat holds regardless of provider. Perplexity Search API (`PERPLEXITY_API_KEY` — **key EXISTS today, live-testable now**) is the zero-provisioning starting point; validate its profile-page coverage on a sample before choosing.

## Example template configurations

**Company-profiles template (iGaming flavor lives HERE):**
```json
{
  "search_mode": "site_restricted",
  "site_list": "x.com\ntwitter.com\nlinkedin.com\nfacebook.com\ninstagram.com\nt.me\nyoutube.com",
  "query_templates": ["\"{entity_name}\"", "\"{entity_name}\" igaming"],
  "max_results_per_query": 3,
  "max_queries_per_entity": 14
}
```
Paired step-2 url-relevance preset: *"Keep only URLs that are official social media profile/channel pages belonging to {entity_name} (a B2B iGaming company). Drop mentions, fan pages, employee personal accounts, and posts."*

**Job-search template — hiring-manager/employer presence:**
```json
{
  "search_mode": "site_restricted",
  "site_list": "linkedin.com\nx.com",
  "query_templates": ["\"{entity_name}\" careers OR hiring"],
  "max_results_per_query": 3
}
```

## Credentials & testing

- **Live-testable today** with existing `PERPLEXITY_API_KEY` (approved reuse); Serper key = new provisioning if Google-index coverage proves necessary (likely for Instagram/Facebook).
- No platform API credentials needed at all — that is the point of the search-based design.
- Unit tests: canonical module's tests cover the mechanics; add a fixture asserting `domain` is emitted correctly for profile URLs (it feeds the platform classification downstream).
- E2E: preset + url-relevance prompt wiring, attended session.

## Edge cases & failure modes

- Handle ≠ company name → include-but-low-rank; url-relevance (step 2) judges with entity context, per original design.
- Multiple accounts per platform (brand vs careers vs regional) → keep all; human/step-2 filtering decides. No "one per platform" logic in code.
- `x.com` vs `twitter.com` duplication → both in site list; url-canonicalizer/url-dedup (step 2, built) collapse redirects.
- Telegram weak indexing → documented expectation, not a bug; page-links composition is the mitigation (official sites usually link their Telegram).

## Open questions

1. Follower counts / bio metadata from SERP snippets are unreliable — is snippet-level metadata worth keeping, or should a step-3 scraper own profile metadata? (Recommend: keep snippet as-is, defer enrichment to step 3.)
2. TikTok/Twitch/Discord for other content types — purely additional `site_list` lines; listed here so nobody proposes a module for them.
