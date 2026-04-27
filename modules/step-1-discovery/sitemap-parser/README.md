# Sitemap Parser

> Parse XML sitemaps to discover all indexed URLs for a company website.

**Module ID:** `sitemap-parser` | **Step:** 1 (Discovery) | **Category:** crawling | **Cost:** medium
**Version:** 1.0.0 | **Data Operation:** transform (＝)

---

## Background

### The Content Problem This Solves

OnlyiGaming needs content at scale — 1,400+ company profiles initially, with continuous expansion as new companies join the platform. Each profile requires research across multiple sources: company websites, news, directories, social media. The first challenge is always the same: *find the right pages to read.*

The original Content Creation Master document (2025) defined "Track B: Exploratory" discovery — starting from a company's homepage URL and systematically finding every relevant page. The recommended seed paths were: `/about`, `/company`, `/products`, `/solutions`, `/platform`, `/press`, `/news`, `/blog`, `/partners`, `/careers`, `/contact`, `/investors`, `/resources`, `/case-studies`. But before crawling individual paths, there's a faster approach: ask the site what pages it has.

That's what sitemaps are. They're a site's own declaration of its indexed content — an XML file listing every URL the company wants search engines to know about. For a content pipeline that needs to discover pages cheaply and at scale, sitemaps are the obvious starting point.

### How It Fits the Pipeline Architecture

The Content Creation Tool follows an 11-step sequence (Steps 0-10). Step 1 (Discovery) is about casting a wide net — finding every possible source of information about each entity. The Strategic Architecture states:

> *"Different entities have different footprints on the web. A large company might have a rich sitemap, LinkedIn presence, news coverage, Crunchbase profile, and YouTube channel. A small startup might only have a basic website."*

Discovery submodules each know how to find information through a different channel. Sitemap Parser is the broadest and cheapest channel — a single HTTP request to `/sitemap.xml` can yield thousands of URLs. It provides a structured baseline that other discovery modules supplement.

All Step 1 modules operate independently using the **transform (＝)** data operation — each produces its own results, which are merged into a shared working pool when approved. This means Sitemap Parser doesn't depend on other modules and other modules don't depend on it, but together they build a comprehensive URL pool.

### Original Vision and Discovery Provenance

The Raw Appendix envisioned tracking `found_via` provenance for every discovered URL — tagging whether it came from `seed`, `rss`, `pse_news`, `pse_dir`, `linkedin`, or `social`. This sitemap module corresponds to the `seed` discovery track. The provenance concept ensures that downstream steps (validation, filtering, scraping) can make source-aware decisions — for example, trusting sitemap URLs more than search engine results, or prioritizing URLs found via multiple discovery methods.

## Strategy & Role

**Why this module exists:** Sitemaps are the most structured and reliable source of URL discovery. They represent what a company *wants* search engines to find — their curated, indexed content. This makes sitemap URLs inherently higher-signal than random crawling.

**Role in the pipeline:** This is typically the *first* discovery module to run. It provides a broad, structured baseline of URLs that other discovery modules (Page Links, Deep Links) can then supplement with pages the sitemap might miss.

**Relationship to siblings:**
- **Page Links** catches navigation pages not in the sitemap (common for SPAs, small sites)
- **RSS Feeds** finds news/blog content that may be sitemap-listed but also provides feed metadata
- **Deep Links** builds on Sitemap Parser's output — crawling pages *found by this module* one level deeper

## When to Use

**Always use when:**
- Processing company websites (the default starting point)
- You need comprehensive URL coverage quickly
- The company has a well-maintained website (enterprise companies, public companies)

**Skip or deprioritize when:**
- The company has no sitemap (small startups, single-page sites) — Page Links is better here
- You only need news/blog content — RSS Feeds is more targeted
- The site blocks sitemap access via robots.txt

**Use alongside:**
- Page Links (catches what sitemaps miss — nav menus, footer links)
- Deep Links (follows interesting pages found here one level deeper)

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `max_urls` | 10,000 | Lower to 100-500 for quick scans; raise to 50,000 for exhaustive crawls of large enterprise sites | Directly controls how many URLs enter the pool. Large numbers increase Step 2 filtering load |
| `include_nested_sitemaps` | true | Disable if the site has many sub-sitemaps for product/game pages you don't need | Prevents following sitemap index files into child sitemaps. Turning off dramatically reduces URLs for sites with thousands of product pages |
| `url_pattern` | "" (all) | Set to filter URLs early — e.g., `/about\|/company\|/partners` to only keep corporate pages | Regex include filter applied before results return. Reduces noise early but be careful not to filter out useful pages |
| `exclude_patterns` | "" (none) | Add one regex per line to drop B2C template URLs at the source. Use presets for Operator/Affiliate/B2B entity types | Regex exclude filter applied before include filter and max_urls limit. Prevents bulk junk from ever entering the pool |

## Recipes

### Quick Scan (fast, focused)
For a first pass or when you just need key pages:
```
max_urls: 500
include_nested_sitemaps: false
url_pattern: ""
```

### Deep Crawl (thorough, comprehensive)
For enterprise companies with rich sitemaps:
```
max_urls: 50000
include_nested_sitemaps: true
url_pattern: ""
```

### Corporate Pages Only (targeted for company profiles)
When you're building company profiles and only want about/team/partner pages:
```
max_urls: 1000
include_nested_sitemaps: true
url_pattern: /about|/company|/team|/partner|/career|/press|/investor|/leadership
```

### Affiliate Entity (drop B2C product pages)
When profiling an affiliate site like AskGamblers — exclude their product catalog:
```
max_urls: 10000
include_nested_sitemaps: true
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
```

## Expected Output

**Healthy result:**
- Enterprise company (e.g., Evolution Gaming): 500-5,000 URLs
- Mid-size company: 50-500 URLs
- Small startup: 10-50 URLs (if sitemap exists)

**Output fields per URL:**
- `url` — the discovered URL
- `last_modified` — when the page was last changed (from sitemap, often null)
- `change_frequency` — how often it changes (daily, weekly, monthly — often null)
- `priority` — sitemap priority value 0.0-1.0 (often null)

**Red flags to watch for:**
- 0 URLs returned → site likely has no sitemap. Try Page Links instead
- 50,000+ URLs → site has massive product catalogs. Consider using `url_pattern` to filter, or rely heavily on Step 2 validation
- All `last_modified` fields null → sitemap exists but isn't well-maintained. Content freshness unknown
- Many URLs with `/tag/`, `/page/`, `/category/` patterns → pagination/taxonomy bloat. Step 2's url-filter will clean this

## Limitations & Edge Cases

- **No sitemap.xml** — Many small/startup sites don't have one. The module returns 0 URLs (not an error). Use Page Links as fallback
- **JavaScript-rendered sitemaps** — Rare but exists. This module fetches raw XML only (no browser rendering)
- **Compressed sitemaps** (.gz) — Not currently supported. If a site serves gzipped sitemaps, URLs won't be found
- **Non-standard sitemap locations** — Only checks `/sitemap.xml`. Sites using `/sitemap_index.xml` or other paths won't be found unless nested from the main sitemap
- **Rate limiting** — Large sitemap indexes with many child sitemaps make many HTTP requests. The `tools.http` rate limiter handles this, but very large sites may be slow
- **Sitemap index depth** — Recursion limited to one level (index → children, but not children of children) to prevent infinite loops

## What Happens Next

URLs discovered by this module enter the Step 1 working pool. When the user approves the step, all approved URLs flow into **Step 2 (Validation)** where they pass through:

1. **URL Deduplicator** — removes duplicates across all discovery sources (sitemap + page links + deep links may find the same URLs)
2. **URL Pattern Filter** — removes junk URLs by regex patterns (e.g., `/tag/`, `/page/`, `/category/`) and optionally checks HTTP status codes
3. **URL Relevance Filter** — LLM-based classification that determines which URLs are worth scraping for the target content type

The original Content Creation Master envisioned this as a two-gate system: cheap pre-scrape validation (Step 2/old Step 4) to reduce scrape cost, followed by post-scrape quality filtering (Step 4/old Step 7) with adaptive page caps. Sitemap Parser's broad output is intentionally unfiltered — the philosophy is "discover everything, filter later" so that no potentially valuable page is lost at the discovery stage.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** crawling
- **Cost:** medium
- **Data operation:** transform (＝) — independent results, merged into pool on approval
- **Requires:** `website` column in entity data
- **Input:** `input.entities[]` — each entity must have a `website` field
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `last_modified`, `change_frequency`, `priority`
- **Error handling:** Entities without a `website` field are skipped with a warning. HTTP errors per entity are logged but don't stop processing of other entities (partial success pattern)
- **Dependencies:** None (uses only `tools.http` and `tools.logger`)
- **Files:** `manifest.json`, `execute.js`
