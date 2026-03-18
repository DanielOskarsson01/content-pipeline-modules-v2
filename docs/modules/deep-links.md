# Deep Link Crawler

> Follow key pages from earlier discovery and extract links one level deeper.

**Module ID:** `deep-links` | **Step:** 1 (Discovery) | **Category:** crawling | **Cost:** medium
**Version:** 1.0.0 | **Data Operation:** transform (＝)

---

## Background

### The Content Problem This Solves

Company profiles on OnlyiGaming need to cover partnerships, integrations, leadership teams, case studies, and regulatory credentials. These pages rarely appear in sitemaps or top-level navigation — they live one click deeper. An "About" page links to "About > Leadership" and "About > History". A "Partners" page links to individual partner detail pages. A "Products" page links to specific solution pages with technical details.

The original Content Creation Master defined seed paths for exploratory discovery: `/about`, `/company`, `/products`, `/solutions`, `/press`, `/partners`, `/careers`, `/contact`, `/investors`, `/resources`, `/case-studies`. But these are just entry points. The real content often lives in the sub-pages beneath them. To build comprehensive profiles, you need to follow those entry points one level deeper.

### How It Fits the Pipeline Architecture

This is the only Step 1 module that reads the working pool from sibling modules. While Sitemap Parser, Page Links, and RSS Feeds all work independently from entity data alone, Deep Link Crawler operates on the *results* of those modules. It reads `entity.items` from the working pool, selects pages matching configurable path patterns, visits those pages, and extracts the links on them.

This creates a natural discovery sequence:
1. **Sitemap Parser** → finds hundreds of URLs from the sitemap
2. **Page Links** → finds key navigation URLs from the homepage
3. **Deep Links** → follows the most promising URLs from both and discovers sub-pages

The Strategic Architecture emphasizes that within a step, submodules share context: *"data uploaded or produced by one submodule is available to others in the same step."* Deep Link Crawler is the primary consumer of this shared context in Step 1.

### Depth Control and Cost Awareness

The module is classified as **medium cost** (vs "cheap" for the other Step 1 modules) because it makes many HTTP requests per entity — up to `max_pages_per_entity` requests just for fetching pages, plus the entity overhead. The original Content Creation Master recommended a scraping depth of "1-2 (Full can use 2-3 selectively)" — this module implements the "depth 1" approach: follow links one level from already-discovered pages.

Going deeper than one level is intentionally excluded. The Strategic Architecture notes that *"each step is a silo"* — if deeper crawling is needed, the user can run Deep Links again after approving the first pass (re-opening Step 1), or rely on Step 2's validation to surface the most valuable URLs for Step 3's scraping.

## Strategy & Role

**Why this module exists:** The most valuable content for company profiles — partner lists, integration pages, case studies, sub-team pages — often lives one click deeper than what sitemaps and navigation reveal.

**Role in the pipeline:** Second-pass discovery module that depends on sibling modules having populated the working pool first. It reads that pool, selects pages matching configurable patterns, crawls those pages, and adds newly discovered links.

**Relationship to siblings:**
- **Depends on:** Sitemap Parser and/or Page Links having been run and approved first (needs `entity.items` from the working pool)
- **Complements:** RSS Feeds (which discovers content streams, while Deep Links discovers page links)
- **Unique capability:** The only Step 1 module that reads the working pool from sibling modules

## When to Use

**Use when:**
- You need thorough coverage beyond the homepage and sitemap
- The company has deep site structure (enterprise companies with many sub-pages)
- You're specifically looking for partnership, integration, or team sub-pages
- The first discovery pass (Sitemap + Page Links) found promising parent pages

**Skip when:**
- Speed is critical and first-pass discovery was sufficient
- The company has a small, flat website (< 50 pages)
- You're in a news-only pipeline (RSS Feeds is more appropriate)
- The working pool is empty (no siblings have run yet)

**Must run after:** At least one other Step 1 module (Sitemap Parser or Page Links) has been approved.

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `max_pages_per_entity` | 10 | Raise to 30-50 for enterprise sites with deep structures; lower to 3-5 for quick second-pass | Each page crawled = 1 HTTP request + link extraction. More pages = more URLs but slower |
| `max_urls_per_page` | 50 | Raise if pages have many links you want; lower to 20 for focused extraction | Caps new URLs per crawled page. Prevents a single listing page from flooding the pool |
| `crawl_patterns` | `/about`, `/company`, `/partners`, `/products`, `/solutions`, `/press`, `/news`, `/blog` | Customize for your content type. For news, focus on `/news`, `/press`, `/blog`. For profiles, focus on `/about`, `/team`, `/partners` | Determines which pool URLs get crawled. Only URLs whose path contains these strings are visited |
| `same_domain_only` | true | Disable to discover partner/subsidiary sites linked from internal pages | Prevents following links to external domains. Usually keep true to stay focused |
| `exclude_already_discovered` | true | Disable if you want to see overlap between discovery sources (url-dedup will clean it later) | Prevents adding URLs already in the pool. Reduces noise but url-dedup in Step 2 handles this too |

## Recipes

### Standard Company Profile (second-pass)
Follow key corporate pages one level deeper:
```
max_pages_per_entity: 10
max_urls_per_page: 50
crawl_patterns: /about\n/company\n/partners\n/products\n/solutions\n/press\n/team\n/leadership
same_domain_only: true
exclude_already_discovered: true
```

### Thorough Enterprise Crawl
For large companies with deep structures:
```
max_pages_per_entity: 40
max_urls_per_page: 100
crawl_patterns: /about\n/company\n/partners\n/products\n/solutions\n/press\n/news\n/blog\n/investors\n/careers\n/integrations\n/case-studies
same_domain_only: true
exclude_already_discovered: true
```

### News-Focused Second Pass
Find article links from news/blog listing pages:
```
max_pages_per_entity: 15
max_urls_per_page: 100
crawl_patterns: /news\n/blog\n/press\n/media\n/articles
same_domain_only: true
exclude_already_discovered: true
```

### Partner & Integration Discovery
Specifically hunting for partnership/integration content:
```
max_pages_per_entity: 20
max_urls_per_page: 80
crawl_patterns: /partners\n/integrations\n/technology\n/ecosystem\n/marketplace\n/vendors
same_domain_only: false
exclude_already_discovered: true
```

## Expected Output

**Healthy result:**
- Enterprise company: 50-300 new URLs discovered
- Mid-size company: 10-100 new URLs
- Small company: 0-20 new URLs
- If pool is empty: 0 URLs (skipped, not an error)

**Output fields per URL:**
- `url` — the newly discovered URL
- `found_on` — the parent page URL where this link was found
- `link_text` — the anchor text of the link

**Red flags to watch for:**
- 0 URLs with "no pool items" → no siblings have been approved yet. Run Sitemap Parser or Page Links first
- Very high URL counts (500+) → crawl patterns might be too broad, or you're hitting listing pages. Consider tightening patterns
- Many URLs from the same `found_on` page → that page is a directory/listing. The `max_urls_per_page` cap prevents one page from dominating
- All `link_text` empty → pages use image-based or JavaScript-based navigation

## Limitations & Edge Cases

- **Pool dependency** — Returns nothing if no sibling modules have been approved. Must run after at least one other discovery module
- **One level only** — Does not recursively follow links beyond the crawled pages. This is by design — deeper crawling is exponentially expensive and diminishing in value
- **Pattern matching is path-based** — Matches URL paths, not page content. A page at `/services/overview` won't match the pattern `/partners` even if it contains partner information
- **JavaScript-rendered links** — Like Page Links, this module parses raw HTML. Links built by JavaScript frameworks won't be found. The original Content Creation Master addressed this with the Cheerio/Playwright split — a future browser-rendered variant could solve this
- **No built-in delay** — Crawls sequentially but relies on `tools.http` rate limiting. For sites that rate-limit aggressively, some pages may fail
- **Medium cost** — Makes many HTTP requests per entity (up to `max_pages_per_entity`), unlike the single-request modules

## What Happens Next

URLs discovered by this module are added to the Step 1 working pool. The `found_on` field provides provenance — downstream modules know these URLs were found as second-level links, which can inform relevance scoring. URLs then flow through Step 2 validation where duplicates with Sitemap Parser and Page Links results are removed by URL Deduplicator, and relevance is assessed.

The original Content Creation Master noted that discovery provenance (`found_via`) should inform downstream decisions. Deep-linked URLs carry implicit context: a URL found on `/about` is likely corporate content, while a URL found on `/blog` is likely editorial. The `found_on` field enables this kind of source-aware reasoning.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** crawling
- **Cost:** medium
- **Data operation:** transform (＝) — independent results, merged into pool on approval
- **Requires:** `website` column in entity data + existing pool items from sibling modules
- **Input:** `input.entities[]` — each entity must have a `website` field and `items[]` from the working pool
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `found_on`, `link_text`
- **Special behavior:** Reads `entity.items` from working pool (only Step 1 module that does this)
- **Error handling:** Entities without pool items are skipped (not an error). Failed page fetches are warned but don't stop processing of other pages. Entities without a `website` field are skipped
- **Dependencies:** Sibling modules must have been run and approved first. Uses `tools.http` and `tools.logger`
- **Files:** `manifest.json`, `execute.js`
