# Sitemap Parser

> Parse XML sitemaps to discover all indexed URLs for a company website, with regex include/exclude filtering at source and an automatic headless-browser retry for bot-protected sites.

**Module ID:** `sitemap-parser` | **Step:** 1 (Discovery) | **Category:** website | **Cost:** medium
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## Background

### The Content Problem This Solves

OnlyiGaming needs content at scale -- 1,400+ company profiles initially, with continuous expansion as new companies join the platform. Each profile requires research across multiple sources: company websites, news, directories, social media. The first challenge is always the same: *find the right pages to read.*

The original Content Creation Master document (2025) defined "Track B: Exploratory" discovery -- starting from a company's homepage URL and systematically finding every relevant page. The recommended seed paths were: `/about`, `/company`, `/products`, `/solutions`, `/platform`, `/press`, `/news`, `/blog`, `/partners`, `/careers`, `/contact`, `/investors`, `/resources`, `/case-studies`. But before crawling individual paths, there's a faster approach: ask the site what pages it has.

That's what sitemaps are. They're a site's own declaration of its indexed content -- an XML file listing every URL the company wants search engines to know about. For a content pipeline that needs to discover pages cheaply and at scale, sitemaps are the obvious starting point.

### How It Fits the Pipeline Architecture

The Content Creation Tool follows an 11-step sequence (Steps 0-10). Step 1 (Discovery) is about casting a wide net -- finding every possible source of information about each entity. The Strategic Architecture states:

> *"Different entities have different footprints on the web. A large company might have a rich sitemap, LinkedIn presence, news coverage, Crunchbase profile, and YouTube channel. A small startup might only have a basic website."*

Discovery submodules each know how to find information through a different channel. Sitemap Parser is the broadest and cheapest channel -- a single HTTP request to `/sitemap.xml` can yield thousands of URLs. It provides a structured baseline that other discovery modules supplement.

All Step 1 discovery modules use the **add (+)** data operation with `pool_precondition: empty_ok` -- each runs against an empty (or populated) pool and adds its own discovered items, upserted by `(url, source_submodule)`. Re-running Sitemap Parser replaces its own prior output but preserves items from other discovery modules. This means Sitemap Parser doesn't depend on other modules and other modules don't depend on it, but together they build a comprehensive URL pool.

### Bot-Protected Sites: Automatic Browser Fallback

Some sites front their sitemap with Cloudflare or similar bot protection, answering plain HTTP requests with 403, 429, or 503. When that happens, the module automatically retries the same URL with the headless browser (20s timeout, waits for network idle). The browser response is then verified to actually be sitemap XML -- if it contains neither `<urlset` nor `<sitemapindex`, the module treats it as a challenge page and fails that entity loudly ("Browser returned HTML instead of sitemap XML") rather than parsing junk. Any other HTTP error status fails directly without the browser retry.

### Original Vision and Discovery Provenance

The Raw Appendix envisioned tracking `found_via` provenance for every discovered URL -- tagging whether it came from `seed`, `rss`, `pse_news`, `pse_dir`, `linkedin`, or `social`. This sitemap module corresponds to the `seed` discovery track. The provenance concept ensures that downstream steps (validation, filtering, scraping) can make source-aware decisions -- for example, trusting sitemap URLs more than search engine results, or prioritizing URLs found via multiple discovery methods.

## Strategy & Role

**Why this module exists:** Sitemaps are the most structured and reliable source of URL discovery. They represent what a company *wants* search engines to find -- their curated, indexed content. This makes sitemap URLs inherently higher-signal than random crawling.

**Role in the pipeline:** This is the *first* discovery module to run (`sort_order: 1`) -- cheapest and fastest discovery method, returning the most URLs with the least cost. It provides a broad, structured baseline of URLs that other discovery modules (Page Links, Deep Links) can then supplement with pages the sitemap might miss.

**Relationship to siblings:**
- **Page Links** catches navigation pages not in the sitemap (common for SPAs, small sites)
- **RSS Feeds** finds news/blog content that may be sitemap-listed but also provides feed metadata
- **Deep Links** builds on Sitemap Parser's output -- crawling pages *found by this module* one level deeper

## When to Use

**Always use when:**
- Processing company websites (the default starting point)
- You need comprehensive URL coverage quickly
- The company has a well-maintained website (enterprise companies, public companies)

**Skip or deprioritize when:**
- The company has no sitemap (small startups, single-page sites) -- Page Links is better here
- You only need news/blog content -- RSS Feeds is more targeted
- The site's bot protection defeats even the browser fallback (entity fails with a challenge-page error) -- Page Links or a scraping-tier module is the alternative

**Use alongside:**
- Page Links (catches what sitemaps miss -- nav menus, footer links)
- Deep Links (follows interesting pages found here one level deeper)

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `max_urls` | 10000 | Lower to 100-500 for quick scans; raise to 50000 for exhaustive crawls of large enterprise sites | Caps how many URLs are collected per site (min 1, max 50000). Applied during sitemap fetch AND again after filtering. Large numbers increase Step 2 filtering load |
| `include_nested_sitemaps` | true | Disable if the site has many sub-sitemaps for product/game pages you don't need | If a sitemap index is found, follows child sitemaps (one level deep only). Turning off returns 0 URLs for sites whose `/sitemap.xml` is an index file |
| `url_pattern` | "" (all) | Set to filter URLs early -- e.g., `/about\|/company\|/partners` to only keep corporate pages | Regex include filter applied after exclude patterns. An invalid regex is logged as an error and the filter is ignored (all URLs pass) |
| `exclude_patterns` | "" (none) | Add one regex per line to drop B2C template URLs at the source. Use presets for common entity types (Operator, Affiliate, B2B) | Case-insensitive regex exclude filters applied before the include filter and the final max_urls slice. Invalid lines are skipped with a warning |

One gotcha worth knowing: `max_urls` caps *collection*, not just output. The module stops reading sitemap entries once it has `max_urls` raw URLs, and only then applies exclude/include filters. On a huge sitemap with a restrictive `url_pattern`, the pages you want may sit beyond the collection cap -- raise `max_urls` when combining a large site with tight filters.

## Recipes

### Quick Scan (fast, focused)
For a first pass or when you just need key pages:
```
max_urls: 500
include_nested_sitemaps: false
url_pattern: ""
exclude_patterns: ""
```

### Deep Crawl (thorough, comprehensive)
For enterprise companies with rich sitemaps:
```
max_urls: 50000
include_nested_sitemaps: true
url_pattern: ""
exclude_patterns: ""
```

### Corporate Pages Only (targeted for company profiles)
When you're building company profiles and only want about/team/partner pages:
```
max_urls: 10000
include_nested_sitemaps: true
url_pattern: /about|/company|/team|/partner|/career|/press|/investor|/leadership
exclude_patterns: ""
```

### Affiliate Entity (drop B2C product pages)
When profiling an affiliate site like AskGamblers -- exclude their product catalog:
```
max_urls: 10000
include_nested_sitemaps: true
url_pattern: ""
exclude_patterns:
  /casino-bonuses/latest/[^/]+
  /casino-affiliate-programs/[^/]+
  /sports-betting/bonuses/latest/[^/]+
  /sports-betting/sportsbook-reviews/[^/]+
  /free-spins/[^/]+
```

### News/Blog Only (targeted for news content)
When you're building news articles:
```
max_urls: 2000
include_nested_sitemaps: true
url_pattern: /news|/blog|/press|/article|/post
exclude_patterns: ""
```

## Expected Output

**Healthy result:**
- Enterprise company (e.g., Evolution Gaming): 500-5,000 URLs
- Mid-size company: 50-500 URLs
- Small startup: 10-50 URLs (if sitemap exists)

**Output fields per URL:**
- `url` -- the discovered URL
- `last_modified` -- when the page was last changed (from sitemap `<lastmod>`, often null)
- `change_frequency` -- how often it changes (daily, weekly, monthly -- often null)
- `priority` -- sitemap priority value 0.0-1.0 (often null)

**Per-entity meta counters:** `total_found` (raw URLs collected), `excluded` (dropped by exclude_patterns), `filtered` (dropped by url_pattern), `limited` (dropped by the final max_urls slice), `returned`, `errors`. The run summary reads "N URLs found across X of Y entities (Z failed)" when any entity errored.

**Red flags to watch for:**
- Entity error `HTTP 404 fetching .../sitemap.xml` → site has no sitemap at the standard path. Try Page Links instead
- Entity error `Browser returned HTML instead of sitemap XML (likely Cloudflare challenge page)` → bot protection beat the browser fallback. This site needs the scraping tier, not sitemap discovery
- 0 URLs with no error → sitemap index found while `include_nested_sitemaps` is off, or the sitemap is empty
- 50,000+ URLs → site has massive product catalogs. Use `exclude_patterns`/`url_pattern` to filter, or rely heavily on Step 2 validation
- All `last_modified` fields null → sitemap exists but isn't well-maintained. Content freshness unknown
- Many URLs with `/tag/`, `/page/`, `/category/` patterns → pagination/taxonomy bloat. Step 2's url-filter will clean this

## Limitations & Edge Cases

- **No sitemap.xml** -- the fetch returns HTTP 404 and the entity is recorded as an error (0 items). Other entities continue processing. Use Page Links as fallback
- **Bot-protected sitemaps** -- 403/429/503 triggers one browser retry; if the browser gets a challenge page (no `<urlset`/`<sitemapindex` in the body) or a non-2xx/3xx status, the entity fails with a combined error naming both attempts. Other HTTP error statuses fail without a retry
- **Compressed sitemaps** (.gz) -- not supported. If a site serves gzipped sitemaps, URLs won't be found
- **Non-standard sitemap locations** -- only checks `/sitemap.xml` at the site root (a missing `https://` on the entity's website field is added automatically). Sites using `/sitemap_index.xml` or other paths won't be found unless nested from the main sitemap
- **Rate limiting** -- large sitemap indexes with many child sitemaps make many HTTP requests (15s timeout each). There is NO throttling: `tools.http` is a plain fetch wrapper, and child sitemaps are fetched sequentially without delay -- a very large index can both be slow and trip bot protection on sensitive hosts
- **Sitemap index depth** -- recursion limited to one level (index → children, but not children of children) to prevent infinite loops. A failed child sitemap is logged as a warning and skipped, not fatal
- **Entities without a `website` field** -- skipped with a per-entity error ("No website field"), counted in the failure summary

## What Happens Next

URLs discovered by this module enter the Step 1 working pool. When the user approves the step, all approved URLs flow into **Step 2 (Validation)** where they pass through:

1. **URL Deduplicator** -- removes duplicates across all discovery sources (sitemap + page links + deep links may find the same URLs)
2. **URL Pattern Filter** -- removes junk URLs by regex patterns (e.g., `/tag/`, `/page/`, `/category/`) and optionally checks HTTP status codes
3. **URL Relevance Filter** -- LLM-based classification that determines which URLs are worth scraping for the target content type

The original Content Creation Master envisioned this as a two-gate system: cheap pre-scrape validation (Step 2/old Step 4) to reduce scrape cost, followed by post-scrape quality filtering (Step 4/old Step 7) with adaptive page caps. Sitemap Parser's broad output is intentionally lightly filtered -- the philosophy is "discover everything, filter later" so that no potentially valuable page is lost at the discovery stage; `exclude_patterns` exists only to keep known-bulk junk (product catalogs) from ever entering the pool.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** website
- **Cost tier:** medium -- network I/O module, 5-minute timeout class
- **Data operation:** add (+) -- adds net-new items to the pool, upserted by `(url, source_submodule)`; re-runs replace this module's own prior output only
- **Pool precondition:** `empty_ok` -- runs against an empty or populated pool; always executes (discovery/seed module)
- **Required input columns:** `website`
- **Depends on:** none
- **Item key:** `url`
- **Input:** `input.entities[]` -- each entity must have a `website` field (scheme optional; `https://` is prefixed if missing)
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `last_modified`, `change_frequency`, `priority`, plus per-entity `meta` counters and a run `summary`
- **Error handling:** partial-success pattern -- entities without a `website` field or with fetch failures are recorded as per-entity errors without stopping other entities. HTTP fetch (15s timeout) with browser fallback (20s, network idle) on 403/429/503, guarded by an XML sanity check against challenge pages. Invalid regex options are ignored (include) or skipped per line (exclude) with a logged warning. After each successful entity, accumulated items are pushed to `tools._partialItems` so a timeout on a later entity doesn't destroy earlier results
- **External dependencies:** none (uses `tools.http`, `tools.browser`, `tools.logger`, `tools.progress`; no npm packages, APIs, or env vars)
- **Files:** `manifest.json`, `execute.js`
