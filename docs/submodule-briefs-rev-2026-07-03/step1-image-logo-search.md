# Submodule Brief: Image & Logo Search (revised) — provider/mode configs of `search-discovery` (+ `api-search` for stock imagery)

**Step:** 1 — Discovery
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Find company logos, product images, and branded visuals via image search and lookup services.
**Build status:** not built (no new module — ships as search-discovery provider/mode configs + api-search provider configs)
**Design verdict:** provider/mode configuration of `search-discovery` (images vertical + `lookup`-kind logo providers). Stock/illustrative imagery = provider configs of the BUILT `api-search` (keys EXIST). No `asset-search` module — hierarchy justification below.

## Goal

Three distinct image needs hid inside the original brief; each already has a home:

| Need | Home | Why |
|---|---|---|
| Entity-specific images via image search (logos in context, product shots, screenshots) | `search-discovery`, `result_type: images` | Image search is a SERP vertical (Serper `/images`, Brave images endpoint) — a mode, not a module |
| Domain→logo resolution (canonical brand logo file) | `search-discovery` `lookup`-kind provider | Deterministic URL template per entity + HEAD verify — the lookup kind exists in the canonical spec precisely for this |
| Generic/illustrative stock imagery for articles | `api-search` provider configs (Pixabay/Unsplash/Pexels — **keys EXIST today**) | Plain keyword→JSON search APIs; api-search's exact contract |

A dedicated `asset-search` module was rejected: it would re-implement provider config, auth, rate limiting, and `_partialItems` plumbing around ~40 lines of unique logic, against the "module catalog stays small" commitment. Homepage logo extraction (`og:image`, `link rel=icon`, header `<img>`) is scraping — cross-ref **page-scraper** (built; og:image already extracted for truncation detection) and **company-media** (built, step 8, consumes media URLs).

## Design (agnostic)

- Image-vertical config: `result_type: images`; provider `field_map` adds `image_url` (canonical brief already specifies it). Query flavor (`"{entity_name}" logo`) is template config.
- Lookup providers render `url_template` from entity fields (`{website_domain}`) — no query, no SERP; result HEAD-verified (mandatory), emitted with `image_url = $url`, `image_type: "logo"`. Entities without `website` skip lookup providers with a logged warning.
- `image_type` classification beyond lookup-provider constants (logo vs product vs screenshot) is NOT done in code — it's an LLM/step-2 concern (url-relevance with metadata, or a step-4 tagger) if a template needs it.
- **The original brief's primary provider is dead:** Clearbit Logo API sunset December 2025 (`logo.clearbit.com` no longer resolves logos). Brandfetch and Logo.dev are the successors.

## Module contract

Inherited from `search-discovery` (canonical brief): item_key `url` · `add` · `empty_ok` · cost `medium` · requires_columns `["name"]` · `_partialItems` per query/lookup. Stock-imagery runs inherit api-search's contract unchanged. Note: for lookup items, `url` (pool key) = the logo file URL; `image_url` duplicates it for downstream shape-routing consistency (step-8 modules route on fields present, per Step 8 discipline).

## Options (manifest sketch)

None new beyond the canonical spec — this brief exercises: `providers` (serp kind with images endpoint + lookup kind), `result_type: images`, `query_templates`, `verify_liveness` (forced for lookups). api-search side: existing `providers`/`keywords` options only.

## Providers (researched 2026-07-03)

| Provider | Env var | Free tier | Pricing | Notes |
|---|---|---|---|---|
| **Pixabay** (stock, via api-search) | `PIXABAY_API_KEY` — **key EXISTS today, live-testable now** | Free (rate-limited ~100 req/60s, unverified exact) | Free | Query-param auth → api-search-compatible today. https://pixabay.com/api/docs/ |
| **Unsplash** (stock, via api-search) | `UNSPLASH_ACCESS_KEY` — **key EXISTS today** | Demo tier 50 req/hr (production tier by approval — unverified current terms) | Free | `client_id` query param → api-search-compatible today. https://unsplash.com/documentation |
| **Pexels** (stock, via api-search) | `PEXELS_API_KEY` — **key EXISTS today** | Free (~200 req/hr historical, unverified) | Free | Requires `Authorization` **header** — blocked on api-search's query-param-only auth until header auth ships |
| Brandfetch Logo Link (lookup) | `ASSET_PROVIDER_BRANDFETCH_CLIENT_ID` (new, free signup) | 500,000 req/mo | Free at that tier; no attribution, client ID mandatory | `https://cdn.brandfetch.io/{website_domain}?c={clientId}`; official Clearbit migration target. https://docs.brandfetch.com/migrations/migrate-from-clearbit-logo-api |
| Logo.dev (lookup) | `ASSET_PROVIDER_LOGODEV_KEY` (new, free signup) | 500,000 CDN req/mo | Free tier requires visible attribution for commercial use; Startup $280/yr removes it | Alternative/fallback to Brandfetch. https://www.logo.dev/pricing |
| Serper.dev images (serp) | `SEARCH_PROVIDER_SERPER_KEY` (new) | 2,500 credits one-time | $0.30–$1.00/1k | `/images` endpoint; entity-specific image search. https://serper.dev/ |
| Brave image search (serp) | `SEARCH_PROVIDER_BRAVE_KEY` (new) | $5/mo renewing credits | ~$5/1k | Images endpoint included in plans. https://api-dashboard.search.brave.com/documentation/pricing |
| Clearbit Logo API | — | — | — | **DEAD — sunset 2025-12.** Original brief's design anchor; do not reference. https://clearbit.com/changelog/2025-06-10 |

Stock APIs solve *illustrative* imagery, not entity-specific brand assets — the existing keys make them the free live-test path, but they cannot replace the logo lookups or entity image search.

## Example template configurations

**Company-profiles template (iGaming flavor lives HERE) — search-discovery preset:**
```json
{
  "search_mode": "open",
  "result_type": "images",
  "query_templates": ["\"{entity_name}\" logo", "\"{entity_name}\" casino platform screenshot"],
  "max_results_per_query": 5,
  "providers": [
    {"id": "serper", "kind": "serp", "...": "(canonical brief serper block, images endpoint)"},
    {"id": "brandfetch-logo", "name": "Brandfetch Logo Link", "kind": "lookup",
     "url_template": "https://cdn.brandfetch.io/{website_domain}?c={env:ASSET_PROVIDER_BRANDFETCH_CLIENT_ID}",
     "verify": "head",
     "emit": {"image_url": "$url", "image_type": "logo", "found_via": "brandfetch_lookup"}}
  ]
}
```

**Any-content-type template — stock imagery via api-search (existing key, works today):**
```json
{
  "search_input": "keywords",
  "keywords": ["abstract technology background"],
  "providers": [{
    "id": "pixabay", "name": "Pixabay", "mode": "search",
    "url": "https://pixabay.com/api/", "keyword_param": "q", "limit_param": "per_page",
    "results_path": "hits",
    "field_map": {"url": "pageURL", "title": "tags", "snippet": null,
      "externalId": "id", "company": "user", "postedAt": null},
    "auth": {"type": "query_param", "key": "key", "env_var": "PIXABAY_API_KEY"}
  }]
}
```

## Credentials & testing

- **Live-testable today (existing keys, approved reuse):** Pixabay and Unsplash through api-search — validates the whole stock-imagery leg with zero provisioning. Pexels waits on api-search header auth.
- **New (free) signups:** Brandfetch client ID and/or Logo.dev key — both free tiers vastly exceed pipeline volumes; Brandfetch preferred (no attribution requirement). Serper/Brave keys only for the entity-image SERP leg.
- Unit tests: canonical module's suite + fixtures for lookup rendering (`{website_domain}` extraction from entity.website, `{env:...}` substitution — assert the client ID is read from env and never logged), HEAD-verify pass/fail, missing-website skip.
- E2E: template preset wiring, attended session; verify logo URLs render in step-8 company-media output.

## Edge cases & failure modes

- Lookup 404 (brand unknown to Brandfetch/Logo.dev) → drop silently-with-meta, normal for small entities; the images-vertical search is the fallback.
- SVG/embedded logos not at a fetchable URL → out of scope here (scraping concern; page-scraper).
- Dark/light logo variants → Brandfetch supports theme params — template `url_template` detail, not code.
- Hotlink-rot: SERP image URLs decay fast → `verify_liveness` recommended for image results; step-8 company-media should re-verify at bundle time regardless.
- Attribution compliance (Logo.dev free tier, Unsplash attribution norms) → a template/operator responsibility; note it in template docs, not enforceable in module code.

## Open questions

1. Does api-search header-auth support ship with the YouTube/PodcastIndex work (same blocker, see `step1-youtube-podcast-discovery.md`)? Pexels rides the same enhancement.
2. Should downloaded/verified brand assets be persisted (fetched bytes) rather than hot-linked at step 8? That's a step-8/company-media architecture question — flag at template-wiring time.
3. Brandfetch's full Brand API (colors, fonts, multiple logo formats) goes beyond Logo Link — worth it only if profiles start rendering brand kits; ignore for now.
