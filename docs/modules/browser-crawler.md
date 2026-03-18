# Browser Link Crawler

> Extract URLs from websites using a headless browser (Playwright) with Wayback Machine fallback for blocked or unreachable sites.

**Module ID:** `browser-crawler` | **Step:** 1 (Discovery) | **Category:** crawling | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## Background

### The Content Problem This Solves

Many modern websites use Cloudflare protection, JavaScript rendering, or aggressive bot detection that prevents simple HTTP-based crawlers from extracting links. When the cheaper crawlers (page-links, deep-links) return 403 errors or empty results, the pipeline has a blind spot — it cannot discover any content URLs for that company. Without URLs, everything downstream (scraping, analysis, content generation) is impossible for that entity.

The original Content Creation Master anticipated this split: some sites need simple HTTP requests, others need a headless browser. This module is the browser-powered fallback that ensures even well-protected sites yield discoverable URLs.

### How It Fits the Pipeline Architecture

This is a Step 1 Discovery module — the very beginning of the pipeline. It sits alongside cheaper HTTP-based crawlers (sitemap-parser, page-links, deep-links) and is intended as a fallback when those fail. The Strategic Architecture describes this:

> *"Not all pages can be fetched the same way. Some need simple HTTP requests. Some need a headless browser for JavaScript rendering. Some are behind authentication or rate limiting. Different submodules handle different scraping challenges."*

This is the first **native per-entity module** in the pipeline. Unlike other modules that receive `input.entities` (an array), this module receives `input.entity` (a single entity) and returns results for just that entity. The skeleton handles the per-entity dispatch.

The module also includes a **Wayback Machine fallback** — if even the headless browser cannot reach the site (complete outage, geo-blocking, etc.), it fetches the most recent archived snapshot from web.archive.org via plain HTTP and extracts links from that cached version.

## Strategy & Role

**Why this module exists:** Ensure every entity gets a chance at URL discovery, even when the site is Cloudflare-protected, JavaScript-heavy, or temporarily unreachable. This is the last-resort crawler before giving up on an entity.

**Role in the pipeline:** Expensive fallback in Step 1. Run after cheaper crawlers have been tried. Only use on entities that returned zero URLs from sitemap-parser, page-links, or deep-links.

**Relationship to other steps:**
- **Runs alongside:** sitemap-parser, page-links, deep-links (other Step 1 modules)
- **Feeds into Step 2:** Discovered URLs for validation, deduplication, and relevance filtering
- **Unique capability:** Renders JavaScript, handles Cloudflare, falls back to Wayback Machine archive

## When to Use

**Always use when:**
- An entity returned zero URLs from cheaper crawlers (403 errors, empty results)
- The target site is known to be Cloudflare-protected or JavaScript-rendered (SPA)

**Do not use when:**
- Cheaper crawlers already found sufficient URLs — this module is expensive (Playwright per page)
- You are testing pipeline flow — use test-dummy instead

**Consider settings carefully when:**
- Crawling very large sites — adjust `max_urls` and `max_depth_pages` to control scope
- Sites are slow to load — increase `request_timeout` beyond the 20s default
- Memory is constrained on the server — reduce `concurrency` to 1

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `max_urls` | 300 | Lower to 50-100 for focused discovery; raise to 500-1000 for comprehensive crawls | Maximum URLs returned per entity. Higher = more data but longer runtime |
| `max_depth_pages` | 5 | Set to 0 for homepage-only; raise to 10-20 for deep discovery | Number of key internal pages (/blog, /news, /about, etc.) to follow from the homepage for second-level link extraction |
| `request_timeout` | 20,000ms | Raise to 30-60s for very slow sites; lower to 10s for known-fast sites | Per-page browser timeout. Too low = missed pages on slow-loading SPAs |
| `same_domain_only` | true | Set to false if you need cross-domain links (partner sites, subdomains) | Filters out links to external domains. Usually keep true to focus on the entity's own content |
| `concurrency` | 2 | Lower to 1 on memory-constrained servers; raise to 3-4 on powerful machines | How many internal pages to fetch in parallel. Browser tabs are memory-heavy |

## Recipes

### Standard Fallback Crawl
Balanced settings for most blocked sites:
```
max_urls: 300
max_depth_pages: 5
request_timeout: 20000
same_domain_only: true
concurrency: 2
```

### Quick Homepage Scan
Just grab links from the homepage, no depth crawling:
```
max_urls: 100
max_depth_pages: 0
request_timeout: 15000
same_domain_only: true
concurrency: 1
```

### Deep Comprehensive Crawl
Maximum coverage for important entities:
```
max_urls: 500
max_depth_pages: 15
request_timeout: 30000
same_domain_only: true
concurrency: 3
```

### Cross-Domain Discovery
When entity operates across multiple subdomains:
```
max_urls: 300
max_depth_pages: 5
request_timeout: 20000
same_domain_only: false
concurrency: 2
```

## Expected Output

**Healthy result:**
- 50-300 URLs per entity depending on site size
- Links categorized by source location (nav, header, footer, body)
- Metadata showing which pages were crawled and whether Wayback Machine was used

**Output fields per URL:**
- `url` -- the discovered link URL
- `link_text` -- anchor text of the link (first 200 characters)
- `source_location` -- where on the page the link was found: `nav`, `header`, `footer`, or `body`
- `found_on` -- the URL of the page where this link was discovered

**Meta fields:**
- `total_found` -- raw link count before filtering
- `after_filter` -- count after same-domain filtering
- `unique` -- count after deduplication
- `returned` -- final count after max_urls limit
- `pages_crawled` -- total pages fetched (1 + depth pages)
- `depth_pages` -- number of internal pages crawled beyond the homepage
- `wayback_fallback` -- boolean indicating whether Wayback Machine was used

**Red flags to watch for:**
- `wayback_fallback: true` -- site was unreachable even by browser; links may be outdated
- Very low URL count (< 10) -- site may be a single-page application with no internal links
- All links from `body` section only -- site may not use standard nav/header/footer HTML elements

## Limitations & Edge Cases

- **Requires Playwright on the server** -- the module will throw an error if `tools.browser.fetch` is not available. Playwright must be installed on the server
- **Memory-heavy** -- each browser tab consumes significant memory. Running multiple entities concurrently with high `concurrency` can exhaust server RAM
- **Wayback Machine links may be stale** -- archived snapshots can be months or years old. Links discovered via Wayback may point to pages that no longer exist
- **Query strings and fragments stripped** -- all URLs have `?query` and `#fragment` removed for cleaner deduplication. This means parameterized pages (e.g., `/products?id=123`) will be collapsed
- **No cookie consent handling** -- the browser does not click cookie consent banners. Some sites may show an overlay that hides content/links
- **Sectioned link detection uses regex** -- nav/header/footer detection relies on HTML tag matching, which may misclassify links on non-standard layouts

## What Happens Next

Discovered URLs enter the working pool and flow into **Step 2 (Validation)** where they are deduplicated, filtered for relevance (include/exclude patterns), and validated as reachable. The `source_location` and `link_text` fields help Step 2 modules prioritize — navigation links often point to key structural pages, while body links point to specific content.

Since this module is a fallback for blocked sites, its output often represents the only URLs available for an entity. The Wayback Machine fallback ensures that even temporarily unreachable sites contribute to the pipeline rather than being silently dropped.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** crawling
- **Cost:** expensive
- **Data operation:** transform (=) -- entities enriched with discovered URLs
- **Requires:** `website` field on input entity
- **Input:** `input.entity` (single entity -- native per-entity module) with `website` field
- **Output:** `{ entity_name, items[], meta }` where items contain `url`, `link_text`, `source_location`, `found_on`
- **Selectable:** false (standard table output)
- **Error handling:** browser failure triggers Wayback Machine fallback; both failing returns empty items with error message
- **Dependencies:** `tools.browser` (Playwright), `tools.http` (Wayback Machine fallback), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
