# Content Pipeline Modules v2 — Complete Module Documentation

> All submodule README files combined into a single reference document.
> Generated: 2026-05-20

---

# STEP 1: DISCOVERY

---

# Page Link Extractor

> Extract URLs from homepage navigation, header, footer, and main content areas.

**Module ID:** `page-links` | **Step:** 1 (Discovery) | **Category:** crawling | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (＝)

---

## Background

### The Content Problem This Solves

When OnlyiGaming researches a company for its directory, the most important pages are often the ones the company puts front and center: the navigation menu, the header links, the footer. These are the pages a company considers *most important for visitors* — their primary user journeys. For a B2B iGaming directory building 1,400+ profiles, these high-signal pages (About Us, Partners, Products, Leadership, Careers) are exactly what's needed.

The original Content Creation Master document defined "Track B: Exploratory" discovery with specific seed paths: `/about`, `/company`, `/products`, `/solutions`, `/platform`, `/press`, `/news`, `/blog`, `/partners`, `/careers`, `/contact`, `/investors`, `/resources`, `/case-studies`. Rather than hardcoding these paths and hoping they exist, this module takes a smarter approach: it reads the actual homepage HTML and extracts what the company has chosen to link to. The navigation *is* the company's own curation of their most important pages.

### How It Fits the Pipeline Architecture

Step 1 (Discovery) uses multiple modules to cast a wide net. Sitemap Parser provides breadth (thousands of URLs from the sitemap index). Page Link Extractor provides *depth of signal* — fewer URLs but each one hand-picked by the company for their navigation. Together they cover both structured discovery (sitemap) and navigational discovery (what humans see on the homepage).

The Strategic Architecture notes that different companies have different web footprints:

> *"A large publicly-traded company has rich sitemaps, LinkedIn presence, news coverage. A small startup might only have a basic website."*

For startups and small companies without sitemaps, Page Link Extractor may be the *only* discovery module that finds useful URLs. It's the universal fallback — every website has a homepage with links, even if it doesn't have a sitemap.

### Section-Aware Link Extraction

This module doesn't just extract links — it categorizes them by *where* on the page they appear. Links in `<nav>` elements are navigation links (highest signal). Links in `<header>` are header links. Links in `<footer>` are footer links (often legal/corporate pages). Links elsewhere are body links (promotional content, lower signal).

This section awareness serves two purposes:
1. **For operators:** You can choose to include/exclude footer and body links based on what you need
2. **For downstream modules:** The `source_location` field carries through the pipeline, helping Step 2's URL Relevance Filter make better classification decisions

## Strategy & Role

**Why this module exists:** Navigation menus, header links, and footer links represent the pages a company considers most important. These are high-signal, curated entry points into the site's content structure — more selective than a sitemap's comprehensive listing.

**Role in the pipeline:** Complements Sitemap Parser by finding pages the sitemap might miss. Particularly valuable for single-page apps (SPAs), small sites without sitemaps, and catching key corporate pages.

**Relationship to siblings:**
- **Sitemap Parser** provides breadth (thousands of URLs); Page Links provides *depth of signal* (fewer but higher relevance)
- **Deep Links** can follow pages found here one level deeper — e.g., `/about` found by Page Links leads Deep Links to discover `/about/leadership` and `/about/history`
- **RSS Feeds** is a parallel, independent discovery channel for news content

## When to Use

**Always use when:**
- Running any company profile pipeline (core module)
- The company might not have a sitemap
- You want high-signal pages (nav/header = company's most important pages)

**Skip when:**
- You already have comprehensive URLs from sitemap and only need news/blog content
- The site is known to be a single-page application with no useful nav links in raw HTML

**Use alongside:**
- Sitemap Parser (combined, they cover structured + navigational discovery)
- Deep Links (to follow promising pages one level deeper)

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `max_urls` | 200 | Lower to 50 for quick scans; keep at 200 for thorough discovery | Controls total URLs per site. Nav/header/footer rarely exceed 200 unique links |
| `include_footer` | true | Disable if footer links are mostly legal/privacy pages you don't want | Footer often has "About", "Careers", "Investors" — valuable for profiles. But also "Terms", "Privacy" — noise. Keep enabled and let Step 2 filter the junk |
| `include_body` | false | Enable if you want links from the page body content (product cards, feature sections) | Body links are lower-signal — promotional content, product listings. Increases URLs significantly but adds noise |
| `same_domain_only` | true | Disable if you want to discover partner/subsidiary sites linked from the homepage | When disabled, catches links to LinkedIn, Twitter, parent company sites. Useful for discovering social media presence |

## Recipes

### Standard Company Profile
Best for most company profile research:
```
max_urls: 200
include_footer: true
include_body: false
same_domain_only: true
```

### Quick Nav Scan
Just the primary navigation:
```
max_urls: 50
include_footer: false
include_body: false
same_domain_only: true
```

### Comprehensive (with external links)
Find everything including social media and partner links:
```
max_urls: 500
include_footer: true
include_body: true
same_domain_only: false
```

### Social Media & Partner Discovery
Specifically looking for external references:
```
max_urls: 200
include_footer: true
include_body: false
same_domain_only: false
```

## Expected Output

**Healthy result:**
- Enterprise company: 30-150 unique links
- Mid-size company: 15-80 unique links
- Small startup: 5-30 unique links

**Output fields per URL:**
- `url` — the discovered URL
- `link_text` — the anchor text of the link (e.g., "About Us", "Our Team")
- `source_location` — where on the page: `nav`, `header`, `footer`, or `body`

**Source location priority:** When the same URL appears in multiple sections, the highest-signal location wins: nav > header > footer > body.

**Red flags to watch for:**
- 0 URLs → site may be entirely JavaScript-rendered (SPA). This module parses raw HTML, not rendered DOM
- Very few URLs (< 5) → minimal site or heavy JavaScript rendering
- Many `body` URLs with no `nav`/`header` → the site uses non-standard HTML structure (no `<nav>`, `<header>`, `<footer>` tags)
- All links go to external domains → might be a redirect page or link aggregator, not a real company site

## Limitations & Edge Cases

- **JavaScript-rendered navigation** — SPAs that build their nav with React/Vue won't have links in the raw HTML. Returns 0 or very few URLs. The original Content Creation Master accounted for this with the Cheerio/Playwright split (old Step 5c/5d) — a future browser-rendered variant of this module could solve this
- **Non-semantic HTML** — Sites without proper `<nav>`, `<header>`, `<footer>` tags will have everything classified as `body`
- **Query parameters stripped** — URLs are cleaned of `?` and `#` parameters. This may merge distinct pages that use query params for routing
- **Relative URL resolution** — Handles `/path` and `path` relative URLs but may struggle with unusual patterns like `//protocol-relative.com`
- **Link text extraction** — Strips inner HTML tags from anchors. Image-only links will have empty `link_text`
- **Deduplication** — Built-in per-entity dedup by URL, but cross-entity dedup happens in Step 2's url-dedup module

## What Happens Next

URLs discovered by this module enter the Step 1 working pool alongside results from Sitemap Parser and other discovery modules. The `source_location` field (nav/header/footer/body) carries through to Step 2, where the URL Relevance Filter can use it as a signal — a link found in `<nav>` with text "About Us" is more likely to be classified as KEEP than a `body` link with text "Learn More".

The original Content Creation Master emphasized that the goal of discovery is completeness, not precision: *"Don't drop teasers yet in Full v1; label them for policy learning."* This module follows that philosophy — it extracts everything and lets downstream validation decide what's worth keeping.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** crawling
- **Cost:** cheap
- **Data operation:** transform (＝) — independent results, merged into pool on approval
- **Requires:** `website` column in entity data
- **Input:** `input.entities[]` — each entity must have a `website` field
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `link_text`, `source_location`
- **Error handling:** Entities without a `website` field are skipped with a warning. HTTP errors per entity are logged but don't stop processing of other entities (partial success pattern)
- **Dependencies:** None (uses only `tools.http` and `tools.logger`)
- **Files:** `manifest.json`, `execute.js`

---

# RSS Feed Discovery

> Find RSS/Atom feeds by probing common feed paths and parsing HTML link tags.

**Module ID:** `rss-feeds` | **Step:** 1 (Discovery) | **Category:** news | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (＝)

---

## Background

### The Content Problem This Solves

OnlyiGaming's platform connects company directory listings with news articles, event coverage, and community discussions — all linked by a 335+ tag taxonomy. To build and maintain this, the platform needs to know which companies actively publish content. RSS/Atom feeds are the primary machine-readable channel for company news, blog posts, and press releases. Unlike scraping individual pages, feeds provide structured metadata (titles, dates, descriptions) and are designed to be consumed programmatically.

The original Content Creation Master prioritized the news site as a HIGH PRIORITY business need — "New content + continuous updates." RSS discovery is the foundation for that: once you know a company has a feed at `/feed` with 47 items, you can build continuous monitoring pipelines that automatically detect new content.

### How It Fits the Pipeline Architecture

This module is the only Step 1 module in the `news` category (the others are `crawling`). It serves a strategically different purpose: while Sitemap Parser and Page Links discover *pages*, RSS Feed Discovery discovers *content streams*. A feed URL is not just another page to scrape — it's a subscription endpoint for ongoing content.

The Raw Appendix's Step 2 included "RSS discovery: If a company site has `/news`|`/press`|`/blog`, capture RSS feed URL + latest items." This module implements that concept. It also tracks discovery provenance — the `found_via = rss` tag from the original vision — by nature: every URL it returns is a feed URL, immediately identifiable as RSS-sourced.

### Two-Strategy Discovery

The module uses two complementary strategies:

1. **HTML parsing** — reads the homepage for `<link rel="alternate">` tags that declare feeds. This finds feeds the company has explicitly registered in their HTML head — the "official" feeds
2. **Common path probing** — tries 9 well-known feed paths (`/feed`, `/rss`, `/feed.xml`, `/rss.xml`, `/atom.xml`, `/blog/feed`, `/news/feed`, `/feed/rss`, `/feed/atom`). This catches feeds that exist but aren't declared in HTML — common for WordPress sites and custom CMS setups

Together, these strategies find feeds that either method alone would miss.

## Strategy & Role

**Why this module exists:** RSS feeds are the primary machine-readable content channel for company news, blog posts, and press releases. They provide structured metadata and serve as subscription endpoints for ongoing content monitoring.

**Role in the pipeline:** Discovers *feed URLs* — not the articles within them. Its output tells you "this company has a blog feed at /feed with 47 items." The actual article content extraction happens in Step 3 (Scraping). Its primary value is for news-oriented pipelines and for company profiles that need press/blog coverage.

**Relationship to siblings:**
- **Sitemap Parser** and **Page Links** discover individual page URLs; RSS Feeds discovers *content streams*
- **Deep Links** could follow blog listing pages found by other modules, but RSS is more efficient for the same content
- This module is in the `news` category while the others are `crawling` — it serves a different strategic purpose

## When to Use

**Always use when:**
- Building a news-oriented pipeline
- You need to monitor company press releases or blog posts over time
- Assessing which companies have active content channels

**Skip when:**
- You only need static pages (about, team, products) for a company profile
- The company is known not to have a blog/news section
- Speed is critical and you've already found all the URLs you need

**Use alongside:**
- Sitemap Parser + Page Links (for comprehensive discovery that includes feeds)
- URL Relevance Filter in Step 2 (to classify feed URLs vs regular page URLs)

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `max_feeds` | 10 | Rarely needs changing. Most sites have 1-3 feeds. Lower to 1-2 if you only want the main feed | Limits feeds per site. Even the most feed-heavy sites rarely exceed 10 |
| `check_common_paths` | true | Disable if you only want feeds declared in HTML `<link>` tags (stricter, misses undeclared feeds) | When enabled, probes 9 common feed paths. Increases HTTP requests but finds hidden feeds |

## Recipes

### Standard Discovery
Find all available feeds:
```
max_feeds: 10
check_common_paths: true
```

### Quick Check (HTML-declared only)
Only find feeds the site explicitly declares:
```
max_feeds: 5
check_common_paths: false
```

### News Pipeline
Maximum feed discovery for news monitoring:
```
max_feeds: 50
check_common_paths: true
```

## Expected Output

**Healthy result:**
- Company with active blog: 1-3 feeds found
- News-heavy company: 3-10 feeds (main feed + category feeds)
- Company without blog: 0 feeds (not an error)

**Output fields per feed:**
- `url` — the feed URL
- `feed_type` — `rss`, `atom`, or `rdf`
- `title` — the feed's declared title (e.g., "Evolution Gaming Blog")
- `item_count` — number of items currently in the feed

**Red flags to watch for:**
- 0 feeds → company has no RSS/Atom presence. Not unusual for B2B companies
- Feed with 0 `item_count` → feed exists but is empty or couldn't be parsed
- `feed_type: unknown` → URL responded but content wasn't recognizable as a feed
- Many feeds with similar titles → site may be serving the same content in multiple formats

## Limitations & Edge Cases

- **No JavaScript rendering** — Feeds referenced only in JavaScript-built `<link>` tags won't be found via HTML parsing (common path probing may still find them)
- **Non-standard feed locations** — Only probes 9 common paths. Sites using custom paths like `/api/v1/feed` won't be found unless declared in HTML
- **Feed authentication** — Password-protected feeds will return errors during probing
- **Large feeds** — The module fetches full feed content to count items. Very large feeds (10,000+ items) may be slow
- **Redirected feeds** — If a feed URL redirects, the module follows the redirect but reports the original URL
- **WordPress prevalence** — WordPress sites almost always have `/feed` and are well-served. Non-WordPress CMSes may use non-standard paths

## What Happens Next

Feed URLs discovered by this module enter the Step 1 working pool. In the current pipeline, they flow through Step 2 (Validation) and Step 3 (Scraping) like any other URL. However, feed URLs have a special future role: the original vision included continuous monitoring pipelines where discovered feeds are periodically checked for new items, enabling OnlyiGaming's news section to stay current with company announcements automatically.

The Raw Appendix described this as capturing "RSS feed URL + latest items" — the `item_count` field in this module's output provides a baseline for detecting new content in future runs.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** news
- **Cost:** cheap
- **Data operation:** transform (＝) — independent results, merged into pool on approval
- **Requires:** `website` column in entity data
- **Input:** `input.entities[]` — each entity must have a `website` field
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `feed_type`, `title`, `item_count`
- **Probed paths:** `/feed`, `/rss`, `/feed.xml`, `/rss.xml`, `/atom.xml`, `/blog/feed`, `/news/feed`, `/feed/rss`, `/feed/atom`
- **Error handling:** Entities without a `website` field are skipped. Failed path probes are silently skipped (expected for most paths). Homepage fetch failures are warned but don't stop processing
- **Dependencies:** None (uses only `tools.http` and `tools.logger`)
- **Files:** `manifest.json`, `execute.js`

---

# Test Dummy

> Return fake data after a configurable delay -- for testing the execution pipeline without real HTTP requests.

**Module ID:** `test-dummy` | **Step:** 1 (Discovery) | **Category:** testing | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## Background

### The Content Problem This Solves

When developing or testing the pipeline infrastructure (BullMQ job execution, progress reporting, error handling, entity routing, working pool management), you need a module that behaves like a real Step 1 module but does not make any external HTTP requests or require API keys. The test-dummy fills this role: it accepts entities, simulates work with a configurable delay, generates fake URL data, and optionally simulates failures for specific entities.

### How It Fits the Pipeline Architecture

This is a Step 1 Discovery module that sits alongside real crawlers (sitemap-parser, page-links, browser-crawler) but produces synthetic data. It exercises the full module execution contract: receives `input.entities`, uses `tools.logger` and `tools.progress`, returns the standard `{ results[], summary }` response format with per-entity grouping and error handling.

The module is useful for testing:
- BullMQ job creation and processing
- Progress bar updates during execution
- Error handling when an entity fails
- Working pool population with fake items
- Multi-entity pipeline flow without network dependencies

## Strategy & Role

**Why this module exists:** Enable pipeline development and testing without external dependencies. Verify that the execution infrastructure works correctly before testing with real crawlers.

**Role in the pipeline:** Development/testing only. Never used in production pipeline runs.

**Relationship to other steps:**
- **No dependencies** -- completely self-contained
- **Produces fake data** -- output looks like Step 1 URL data but URLs point to .example.com domains
- **Supports error simulation** -- configure `fail_entity` to test error handling paths

## When to Use

**Always use when:**
- Testing pipeline execution infrastructure (BullMQ, workers, progress reporting)
- Verifying error handling with simulated failures
- Demonstrating pipeline flow to new team members without needing real websites

**Never use when:**
- Running production pipeline flows -- output is entirely fake
- Testing scraping or content extraction -- use real modules for that

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `delay_ms` | 1,000ms | Raise to 5-30s to simulate slow modules; lower to 100ms for fast testing | Pause per entity to simulate work. Useful for testing progress bar updates and timeout handling |
| `items_per_entity` | 3 | Raise to 10-50 to test large working pools; lower to 1 for minimal output | Number of fake URL items generated per entity. Each item gets a unique .example.com URL |
| `fail_entity` | `""` (empty) | Set to a company name substring to test error handling | If an entity name contains this string (case-insensitive), the module simulates a failure for that entity. Leave empty to succeed all |

## Recipes

### Quick Pipeline Test
Fast execution with minimal output:
```
delay_ms: 100
items_per_entity: 3
fail_entity: ""
```

### Slow Module Simulation
Simulate a module that takes a long time per entity:
```
delay_ms: 5000
items_per_entity: 3
fail_entity: ""
```

### Error Handling Test
Simulate a failure for a specific entity:
```
delay_ms: 1000
items_per_entity: 3
fail_entity: "CompanyX"
```

### Large Pool Test
Generate many items to stress-test working pool UI:
```
delay_ms: 500
items_per_entity: 50
fail_entity: ""
```

## Expected Output

**Healthy result:**
- N entities processed (one per input entity)
- `items_per_entity` fake URLs per successful entity
- Empty items array for failed entities

**Output fields per item:**
- `url` -- fake URL in format `https://{entity-name-slugified}.example.com/page-{n}`
- `title` -- `"{Entity Name} -- Page {n}"`
- `score` -- random integer between 0 and 100

**Meta fields per entity:**
- `simulated: true` -- always set to indicate this is test data
- `delay_ms` -- the delay that was applied (on successful entities)

**Summary fields:**
- `total_entities` -- number of entities processed
- `total_items` -- total fake items generated across all entities
- `errors` -- array of error messages for failed entities

## Limitations & Edge Cases

- **Output is entirely synthetic** -- URLs point to .example.com and will not resolve. Do not use output for any real processing
- **No requires_columns** -- accepts any entity shape, even empty objects (entity name defaults to "Entity N")
- **Error simulation is substring-based** -- `fail_entity: "test"` will fail any entity whose name contains "test" (case-insensitive), including "Testing Corp" or "Latest Results"
- **No HTTP requests** -- does not use `tools.http` or `tools.browser`. Cannot test network-related error paths
- **Score is random** -- the `score` field uses `Math.random()` and will produce different values on each run

## What Happens Next

Fake items enter the working pool just like real Step 1 output. They can flow through subsequent pipeline steps (Step 2 validation, Step 3 scraping, etc.) but will fail at any step that tries to fetch the .example.com URLs. The test-dummy is primarily useful for testing Step 1 execution and the skeleton infrastructure, not for end-to-end pipeline testing.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** testing
- **Cost:** cheap
- **Data operation:** transform (=) -- generates fake data for each entity
- **Requires columns:** none (accepts any entity)
- **Input:** `input.entities[]` with any fields (uses `entity.name` for output)
- **Output:** `{ results[], summary }` where each result has `entity_name`, `items[]` with `url`, `title`, `score`, and `meta` with `simulated: true`
- **Selectable:** false (standard table output)
- **Error handling:** configurable entity failure via `fail_entity` option. Failed entities return empty items array with error message
- **Dependencies:** none (no external packages, no tools.http)
- **Files:** `manifest.json`, `execute.js`

---

# Seed URL Builder

> Generate and validate candidate URLs from known high-value paths on a company's website.

**Module ID:** `seed-url-builder` | **Step:** 1 (Discovery) | **Category:** website | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## What This Module Does

Most company websites follow predictable URL conventions. An /about page, a /careers page, a /press or /newsroom section -- these are the pages that carry the highest-value content for building company profiles. Rather than waiting for a sitemap or crawling links, this module probes these paths directly: it appends 28 common high-value paths to the company's base URL, sends HEAD requests (falling back to GET if HEAD is blocked), and returns only the paths that actually exist.

This is a brute-force complement to the smarter discovery modules. Sitemap Parser relies on the site having a valid sitemap. Page Link Extractor relies on the homepage having parseable navigation HTML. Seed URL Builder skips both dependencies and goes straight to "does /about exist?" The trade-off is obvious -- it can only find paths you already know to look for -- but for the standard corporate pages that matter most for iGaming company profiles, this is fast, cheap, and reliable.

Each validated URL is tagged with a `path_type` (about, press, careers, compliance, etc.) that carries through the pipeline. Downstream modules like URL Relevance Filter can use this tag as a high-confidence classification signal -- a URL found at /responsible-gaming is almost certainly about responsible gaming.

## When to Use

**Always use when:**
- Running any company profile pipeline -- it catches pages that sitemaps and navigation extraction miss
- The company might not have a sitemap (small companies, startups)
- You want guaranteed coverage of standard corporate pages

**Skip when:**
- You already have comprehensive URL coverage from sitemap-parser and page-links combined
- The company uses non-English path conventions exclusively (use custom_paths instead)

**Tune when:**
- Working with non-English or unconventional sites -- add paths via custom_paths
- Sites are slow or behind CDNs that rate-limit -- lower max_concurrent, raise request_timeout

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `max_concurrent` | 5 | Raise to 10-20 for fast sites with no rate limiting. Lower to 1-2 for fragile or rate-limited servers | How many paths are checked in parallel per entity. Higher = faster but more aggressive |
| `request_timeout` | 5000 ms | Raise to 10000-15000 for slow servers or sites behind CDNs. Lower to 2000-3000 for known-fast sites | Maximum time to wait for each HEAD/GET response before giving up on that path |
| `custom_paths` | (empty) | Add paths for non-English sites (/uber-uns, /entreprise), industry-specific pages (/responsible-gaming/policy), or company-specific sections you know exist | Additional paths to check, one per line. Added to the 28 default paths. Lines starting with # are ignored |
| `include_redirects` | true | Disable if you only want pages that exist at the exact probed path with no redirect | Whether to keep URLs that returned 2xx after following redirects. Most sites redirect /about to /about-us or similar -- keeping redirects catches these |

## Recommended Configurations

### Standard (default)
Best for most company profile research. Checks all 28 default paths with moderate concurrency.
```
max_concurrent: 5
request_timeout: 5000
custom_paths: (empty)
include_redirects: true
```

### Conservative
For fragile servers, rate-limited APIs, or sites that block aggressive requests.
```
max_concurrent: 2
request_timeout: 10000
custom_paths: (empty)
include_redirects: true
```

### Aggressive
For large batches of well-known, fast-responding sites. Faster but risks rate limiting.
```
max_concurrent: 15
request_timeout: 3000
custom_paths: (empty)
include_redirects: true
```

### iGaming-Specific
Extended path list for iGaming operators and B2B suppliers.
```
max_concurrent: 5
request_timeout: 5000
custom_paths:
  /responsible-gaming/policy
  /responsible-gambling/tools
  /games
  /game-portfolio
  /live-casino
  /sportsbook
  /regulation
  /compliance
  /certifications
  /b2b
  /white-label
  /api
  /integration
  /demo
include_redirects: true
```

## What Good Output Looks Like

**Output fields per URL:**
- `url` -- the original candidate URL that was probed (e.g. `https://kindredgroup.com/about`)
- `final_url` -- the URL after redirect following (same as `url` if no redirect occurred)
- `path_type` -- category of the path: `about`, `products`, `press`, `news`, `partners`, `careers`, `contact`, `investors`, `resources`, `compliance`, or `custom`
- `status_code` -- HTTP status code (always 200-299)
- `found_via` -- whether the URL was validated via `head` or `get_fallback`

**Healthy result ranges:**
- Enterprise company: 8-15 valid paths (most standard pages exist)
- Mid-size company: 4-10 valid paths
- Small startup: 2-5 valid paths
- Minimal site: 0-2 valid paths (homepage only -- common for SPA sites)

**Warning signs:**
- 0 URLs for every entity -- the sites might be blocking all automated requests, or they are entirely JavaScript-rendered single-page apps
- All URLs have `found_via: get_fallback` -- the server blocks HEAD requests. Not a problem (GET fallback works), but indicates a more restrictive server configuration
- Very high hit rate (25+ of 28 paths) -- unusual; verify these are not all redirecting to the same page. A site that returns 200 for every path may have a catch-all route

## Limitations

- **No redirect-to-homepage detection** -- If a site redirects /careers to / (the homepage), this module cannot reliably detect that and will include it as a valid URL. The tools.http API follows redirects automatically but does not expose the final URL. Downstream deduplication in Step 2 mitigates this partially
- **English-biased default paths** -- The 28 default paths are English. Non-English sites need custom_paths for their equivalents (/uber-uns, /a-propos, /empresa, etc.)
- **No content validation** -- A 200 response does not guarantee the page has useful content. Some sites return 200 for custom 404 pages (soft 404s). Step 2 validation and Step 4 filtering handle this downstream
- **HEAD request blocking** -- Some servers (especially behind Cloudflare) return 403 or 405 for HEAD requests. The GET fallback handles this, but doubles the request time for those paths
- **Rate limiting** -- Aggressive concurrency (max_concurrent > 10) may trigger rate limiting on protected sites. The module does not implement retry-after handling

## What Happens Next

Validated URLs enter the Step 1 working pool alongside results from Sitemap Parser, Page Link Extractor, and other discovery modules. The `path_type` field carries through the pipeline -- Step 2's URL Relevance Filter can use it as a strong classification signal. A URL tagged `compliance` from the /responsible-gaming path is almost certainly relevant to a company profile's regulatory section.

Step 2 deduplication will merge any URLs found by both this module and sitemap-parser or page-links. The `found_via` field records how each URL was discovered, which helps operators understand which discovery methods are contributing the most.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** website
- **Cost:** cheap
- **Data operation:** add (+) -- URLs are added to the working pool on approval
- **Requires:** `website` column in entity data
- **Input:** `input.entities[]` -- each entity must have a `website` field
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `final_url`, `path_type`, `status_code`, `found_via`
- **Error handling:** Entities without a `website` field are skipped with a warning. Failed requests per path are silently skipped (partial success pattern). Entity-level errors are caught and reported without stopping other entities
- **Dependencies:** None (uses only `tools.http`, `tools.logger`, `tools.progress`)
- **Files:** `manifest.json`, `execute.js`, `README.md`, `CLAUDE.md`

### Default Path List

| Path | Type |
|------|------|
| /about, /about-us, /company, /who-we-are | about |
| /products, /solutions, /platform, /services | products |
| /press, /press-releases, /media, /newsroom | press |
| /news, /blog | news |
| /partners, /affiliates | partners |
| /careers, /jobs | careers |
| /contact, /contact-us | contact |
| /investors, /investor-relations | investors |
| /resources, /case-studies | resources |
| /responsible-gaming, /responsible-gambling, /licenses, /regulatory | compliance |

---

# Deep Link Crawler

> Follows pages found by earlier discovery modules and extracts the links on them -- discovering sub-pages one level deeper than sitemaps and homepage navigation reveal.

**Module ID:** `deep-links` | **Step:** 1 (Discovery) | **Category:** crawling | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

Company websites often hide their most valuable content one click deeper than the homepage. An "About" page links to "Leadership" and "History". A "Products" page links to individual solution pages. A "News" listing links to individual articles. Sitemaps and homepage navigation find the parent pages -- Deep Link Crawler follows those parent pages and extracts the links on them.

This is the only Step 1 module that reads the working pool from sibling modules. While Sitemap Parser, Page Links, and RSS Feeds all work independently from entity data alone, Deep Link Crawler operates on their *results*. It takes URLs already discovered by those modules, fetches the actual HTML of those pages, and extracts every `<a href>` link found on them.

```
Sitemap Parser → finds hundreds of URLs from sitemap.xml
Page Links     → finds key navigation URLs from the homepage
Deep Links     → visits those URLs and discovers the sub-pages linked from them
```

The module filters out junk URLs automatically -- images, CSS, JavaScript files, CDN paths, WordPress admin pages, and other non-content URLs are excluded before output.

## When to Use

**Always run when:**
- You want thorough URL coverage beyond what sitemaps provide
- Companies have deep site structures (enterprise sites with many sub-sections)
- You're looking for partnership, integration, case study, or team sub-pages
- At least one other Step 1 module has already been run and approved

**Skip when:**
- Speed is critical and first-pass discovery was sufficient
- The company has a small, flat website (< 50 pages total)
- You're in a news-only pipeline (RSS Feeds is more appropriate)
- No sibling modules have been approved yet (the working pool will be empty)

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `max_pages_per_entity` | 30 | Lower to 5-10 for quick runs; raise to 100-200 for maximum coverage on large sites | How many pool URLs to visit and extract links from. Each page = 1 HTTP request |
| `max_urls_per_page` | 50 | Raise to 100-200 if pages have many valuable links; lower to 20 to keep output focused | Caps how many links to extract from a single crawled page |
| `crawl_patterns` | *(empty)* | Add patterns like `/news\n/blog\n/press` to only crawl specific page types | When empty, crawls all pool URLs up to `max_pages_per_entity`. When set, only crawls URLs whose path contains one of these strings. Leave empty for best coverage -- Step 2 handles filtering |
| `same_domain_only` | false | Enable to restrict output to the company's own domain only | When disabled, captures links to partner sites, subsidiary domains, and external resources |
| `exclude_already_discovered` | false | Enable if you want to pre-filter duplicates (saves some output noise) | When disabled, lets Step 2's url-dedup handle deduplication -- which is more thorough |

**Most impactful options:** `max_pages_per_entity` directly controls how many HTTP requests are made. With 96 entities at 30 pages each, that's up to 2,880 requests -- which is why the module is classified as `expensive` (30 min timeout). The `crawl_patterns` option used to default to a narrow list (`/about`, `/company`, `/blog`, etc.) which caused most pool URLs to be skipped. It now defaults to empty, meaning all pool URLs are eligible for crawling.

## Recommended Configurations

### Standard (default)
Broad coverage for most pipeline runs:
```
max_pages_per_entity: 30
max_urls_per_page: 50
crawl_patterns:
same_domain_only: false
exclude_already_discovered: false
```

### Quick Pass
Fast second-pass when time is limited:
```
max_pages_per_entity: 5
max_urls_per_page: 30
crawl_patterns:
same_domain_only: true
exclude_already_discovered: true
```

### Maximum Coverage
For thorough enterprise-level discovery:
```
max_pages_per_entity: 100
max_urls_per_page: 100
crawl_patterns:
same_domain_only: false
exclude_already_discovered: false
```

### News & Press Focus
Only follow news/blog listing pages to find individual articles:
```
max_pages_per_entity: 20
max_urls_per_page: 100
crawl_patterns: /news
/blog
/press
/media
/articles
same_domain_only: true
exclude_already_discovered: false
```

## What Good Output Looks Like

**Healthy results:**
- Enterprise company: 50-300 new URLs discovered
- Mid-size company: 10-100 new URLs
- Small company: 0-20 new URLs
- Company with no pool items: 0 URLs (skipped -- not an error)

**Output fields:**
- `url` -- the newly discovered URL
- `found_on` -- which page this link was found on (provenance for downstream modules)
- `link_text` -- the anchor text of the link

**Warning signs:**
- 0 URLs with `skipped_reason: "no pool items"` → no sibling modules have been approved yet. Run Sitemap Parser or Page Links first
- `pages_crawled: 0` with pool items present → `crawl_patterns` is filtering out all URLs. Clear the patterns or add broader ones
- Many entities with 0-3 URLs despite pool items → `exclude_already_discovered` and/or `same_domain_only` are too restrictive
- Very high counts (500+) on a single entity → a listing/directory page is being crawled. The `max_urls_per_page` cap prevents this

## Limitations

- **Pool dependency** -- returns nothing if no sibling modules have been approved. Must run after at least one other discovery module
- **One level only** -- does not recursively follow links. By design -- deeper crawling is exponentially expensive
- **HTML-only link extraction** -- parses raw HTML `<a href>` tags. Links built by JavaScript frameworks won't be found (use browser-crawler for those)
- **No built-in delay** -- crawls sequentially using `tools.http`. Sites that rate-limit aggressively may block some requests
- **Junk filtering is path-based** -- filters images, CDN, and WordPress admin URLs by file extension and path pattern. Unusual junk URL formats may slip through

## What Happens Next

URLs flow into Step 2 where URL Deduplicator removes duplicates across all discovery sources, and URL Relevance scores each URL's value. The `found_on` field provides provenance -- downstream modules know these were second-level links, which can inform relevance scoring. A URL found on `/about` is likely corporate content; a URL found on `/blog` is likely editorial.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** crawling
- **Cost tier:** expensive -- up to 30 min timeout, suitable for large-scale crawling across many entities
- **Data operation:** transform (=) -- independent results, merged into pool on approval
- **Required input columns:** `website`
- **Depends on:** `sitemap-parser`, `page-links`, `browser-crawler` (needs pool items from at least one)
- **Input format:** `input.entities[]` with `website` field and `items[]` from working pool
- **Output format:** `results[]` grouped by `entity_name`, each with `items[]` containing `url`, `found_on`, `link_text`
- **Progressive save:** Pushes to `tools._partialItems` after each page crawl -- timeout preserves partial results
- **Junk filtering:** Excludes images (.png/.jpg/.gif/.svg/.webp/.ico), media (.mp4/.mp3), documents (.pdf/.zip), fonts (.woff/.ttf/.eot), code (.css/.js), and WordPress/CDN infrastructure paths
- **Error handling:** Missing pool items = skip (not error). Failed page fetches = warn and continue. Missing `website` = skip with error

---

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
```
max_urls: 500
include_nested_sitemaps: false
url_pattern: ""
```

### Deep Crawl (thorough, comprehensive)
```
max_urls: 50000
include_nested_sitemaps: true
url_pattern: ""
```

### Corporate Pages Only (targeted for company profiles)
```
max_urls: 1000
include_nested_sitemaps: true
url_pattern: /about|/company|/team|/partner|/career|/press|/investor|/leadership
```

### Affiliate Entity (drop B2C product pages)
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

## Limitations & Edge Cases

- **No sitemap.xml** — Many small/startup sites don't have one. The module returns 0 URLs (not an error). Use Page Links as fallback
- **JavaScript-rendered sitemaps** — Rare but exists. This module fetches raw XML only (no browser rendering)
- **Compressed sitemaps** (.gz) — Not currently supported
- **Non-standard sitemap locations** — Only checks `/sitemap.xml`
- **Rate limiting** — Large sitemap indexes with many child sitemaps make many HTTP requests
- **Sitemap index depth** — Recursion limited to one level

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** crawling
- **Cost:** medium
- **Data operation:** transform (＝) — independent results, merged into pool on approval
- **Requires:** `website` column in entity data
- **Dependencies:** None (uses only `tools.http` and `tools.logger`)
- **Files:** `manifest.json`, `execute.js`

---

# Browser Link Crawler

> Extract URLs from websites using a headless browser (Playwright) with Wayback Machine fallback for blocked or unreachable sites.

**Module ID:** `browser-crawler` | **Step:** 1 (Discovery) | **Category:** crawling | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

Many modern websites use Cloudflare protection, JavaScript rendering, or aggressive bot detection that prevents simple HTTP-based crawlers from extracting links. When the cheaper crawlers (page-links, deep-links) return 403 errors or empty results, the pipeline has a blind spot. This module is the browser-powered fallback that ensures even well-protected sites yield discoverable URLs.

This is the first **native per-entity module** in the pipeline. Unlike other modules that receive `input.entities` (an array), this module receives `input.entity` (a single entity) and returns results for just that entity.

The module also includes a **Wayback Machine fallback** and supports **Load More auto-detection** with 35+ Playwright selectors.

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `max_urls` | 300 | Lower to 50-100 for focused discovery; raise to 500-1000 for comprehensive crawls | Maximum URLs returned per entity |
| `max_depth_pages` | 5 | Set to 0 for homepage-only; raise to 10-20 for deep discovery | Number of key internal pages to follow from the homepage |
| `request_timeout` | 20,000ms | Raise to 30-60s for very slow sites | Per-page browser timeout |
| `same_domain_only` | true | Set to false for cross-domain links | Filters out links to external domains |
| `concurrency` | 2 | Lower to 1 on memory-constrained servers | How many internal pages to fetch in parallel |
| `auto_click_load_more` | false | Enable when target sites hide content behind "Load More" buttons | Auto-detects and clicks pagination buttons |
| `max_load_more_clicks` | 10 | Raise to 20-50 for sites with large paginated lists | How many times to click the button |
| `max_load_more_seconds` | 120 | Raise to 300+ for very slow-loading paginated content | Wall-time budget for clicking |

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** crawling
- **Cost:** expensive
- **Data operation:** transform (=)
- **Requires:** `website` field on input entity
- **Input:** `input.entity` (single entity -- native per-entity module)
- **Dependencies:** `tools.browser` (Playwright), `tools.http` (Wayback Machine fallback)
- **Files:** `manifest.json`, `execute.js`

---

# API Search

> Discovers items from multiple REST APIs using a single config-driven module. Supports keyword-search APIs and feed APIs.

**Module ID:** `api-search` | **Step:** 1 (Discovery) | **Category:** search | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

API Search queries REST APIs to discover items matching your search criteria. Instead of having a separate submodule for every API, this single module handles any REST API that returns JSON -- you just configure a provider object describing how to talk to that API.

The module supports two types of APIs:
- **Search mode** -- APIs that accept a keyword parameter and return filtered results
- **Feed mode** -- APIs that return all recent items with no server-side filtering

Supports entity production, configurable scoring rules, and multiple search input modes (`keywords`, `entity`, `entity_names`).

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** search
- **Cost:** cheap
- **Data operation:** transform (=)
- **Required input columns:** `name` (entity name)
- **Files:** `manifest.json`, `execute.js`

---

# CSV Discovery

> Imports items from CSV or XLSX files -- uploaded directly or read from a local directory. Maps columns to standard pipeline format.

**Module ID:** `csv-discovery` | **Step:** 1 (Discovery) | **Category:** search | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

CSV Discovery reads structured data files (CSV, XLSX, XLS) and converts them into pipeline items. It's the primary way to bring external data into the pipeline -- LinkedIn job exports, company lists, spreadsheets from colleagues, or output from external scripts.

Supports file upload and source directory input, auto-detects delimiter (comma vs semicolon), entity production, and column mapping.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** search
- **Cost:** cheap
- **Data operation:** transform (=)
- **Files:** `manifest.json`, `execute.js`

---

# STEP 2: VALIDATION

---

# URL Deduplicator

> Remove duplicate URLs across entities, normalize formats, and strip tracking parameters.

**Module ID:** `url-dedup` | **Step:** 2 (Validation) | **Category:** filtering | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** remove (➖)

---

## What This Module Does

First module in the Step 2 chain. Normalizes URLs (www, trailing slash, query params, fragments, case) before comparing them, catching duplicates that string comparison would miss. Operates across all entities to catch cross-entity duplicates.

## Options Guide

| Option | Default | Impact |
|--------|---------|--------|
| `normalize_www` | true | Treats `www.example.com` and `example.com` as same host |
| `normalize_trailing_slash` | true | Treats `/about` and `/about/` as same URL |
| `strip_query_params` | true | Removes `?utm_source=...` etc. |
| `strip_fragments` | true | Removes `#section` anchors |
| `case_insensitive` | true | Treats `/About` and `/about` as same URL |

## Technical Reference

- **Step:** 2 (Validation)
- **Category:** filtering
- **Cost:** cheap
- **Data operation:** remove (➖)
- **Dependencies:** None (pure computation)
- **Files:** `manifest.json`, `execute.js`

---

# URL Pattern Filter

> Filter URLs by include/exclude regex patterns and HTTP status code validation.

**Module ID:** `url-filter` | **Step:** 2 (Validation) | **Category:** filtering | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** remove (➖)

---

## What This Module Does

Second module in Step 2 chain. Removes junk URLs using deterministic regex patterns before the LLM-based relevance filter. Handles pagination, tag archives, legal pages, and other non-content URLs. Optional HTTP status code validation for dead link detection.

## Technical Reference

- **Step:** 2 (Validation)
- **Category:** filtering
- **Cost:** cheap (expensive if `check_status_codes` enabled)
- **Data operation:** remove (➖)
- **Files:** `manifest.json`, `execute.js`

---

# URL Canonicalizer

> Resolves redirect chains so every URL in the pool points to its real destination before scraping begins.

**Module ID:** `url-canonicalizer` | **Step:** 2 (Validation) | **Category:** normalization | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

Sends HEAD requests to each URL, checks whether the final destination differs from the original, and replaces the URL with the canonical version. Helps url-dedup catch duplicates that were invisible before redirect resolution.

## Technical Reference

- **Step:** 2 (Validation)
- **Category:** normalization
- **Cost tier:** cheap
- **Data operation:** transform (=)
- **Files:** `manifest.json`, `execute.js`

---

# URL Relevance Filter

> LLM-based URL relevance classification — KEEP, MAYBE, or DROP for content type relevance.

**Module ID:** `url-relevance` | **Step:** 2 (Validation) | **Category:** filtering | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** remove (➖)

---

## What This Module Does

Third and final module in Step 2 chain. Classifies URLs using LLM based on URL slug, link text, source location, and optional metadata. Batches up to 200 URLs per prompt. Supports configurable keep/drop criteria, multiple AI models and providers, and confidence thresholds.

## Technical Reference

- **Step:** 2 (Validation)
- **Category:** filtering
- **Cost:** cheap (LLM cost per batch is low with Haiku)
- **Data operation:** remove (➖)
- **Dependencies:** `tools.ai` (LLM completion)
- **Files:** `manifest.json`, `execute.js`

---

# STEP 3: SCRAPING

---

# Page Scraper

> Fetch HTML pages and extract readable text content from validated URLs.

**Module ID:** `page-scraper` | **Step:** 3 (Scraping) | **Category:** scraping | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** transform (＝)

---

## What This Module Does

Primary scraper using Mozilla Readability (Firefox Reader Mode algorithm) with regex fallback. Handles the majority of websites. Includes boilerplate detection, Cloudflare block page detection, and partial results on timeout.

## Technical Reference

- **Step:** 3 (Scraping)
- **Category:** scraping
- **Cost:** expensive
- **Data operation:** transform (＝)
- **Dependencies:** `@mozilla/readability`, `linkedom`, `tools.http`
- **Files:** `manifest.json`, `execute.js`

---

# Browser Scraper

> Re-scrape pages that failed text extraction using a real browser (Playwright Chromium) to render JavaScript-heavy content.

**Module ID:** `browser-scraper` | **Step:** 3 (Scraping) | **Category:** scraping | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

Second-pass scraper using Playwright with 3-tier fallback: Browser fetch → Wayback Machine → Error. Targets pages with no status, errors, low word count, boilerplate content, or block page detection. Post-scrape duplicate detection catches any bot blocker regardless of wording.

## Technical Reference

- **Step:** 3 (Scraping)
- **Category:** scraping
- **Cost:** expensive
- **Data operation:** transform (=)
- **Dependencies:** `@mozilla/readability`, `linkedom`, `tools.browser` (Playwright), `tools.http`
- **Files:** `manifest.json`, `execute.js`

---

# API Scraper (ScrapFly)

> Paid API fallback for pages that failed both page-scraper and browser-scraper. Uses ScrapFly's Anti-Scraping Protection.

**Module ID:** `api-scraper` | **Step:** 3 (Scraping) | **Category:** scraping | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

Third and final scraper. Uses ScrapFly API (~30 credits per request) with Wayback Machine fallback. Includes circuit breaker (3 consecutive 429s), global rate limiter, and duplicate text detection. Requires `SCRAPFLY_KEY` environment variable.

## Technical Reference

- **Step:** 3 (Scraping)
- **Category:** scraping
- **Cost:** expensive
- **Data operation:** transform (=)
- **Dependencies:** `@mozilla/readability`, `linkedom`, `tools.http`
- **Files:** `manifest.json`, `execute.js`

---

# LinkedIn Profile Scraper

> Scrape LinkedIn profiles (bio/company_people modes) or enrich pool items with full LinkedIn job descriptions (job_description mode) via the LinkedIn Profile API.

**Module ID:** `linkedin-profile-scraper` | **Step:** 3 (Scraping) | **Category:** linkedin | **Cost:** expensive
**Version:** 1.2.0 | **Data Operation:** add (+) for profiles, transform for job_description

---

## What This Module Does

Takes LinkedIn profile URLs and extracts complete professional data via the LinkedIn Profile API (localhost:3847). Includes health check, circuit breaker, completeness scoring, and ScrapeLinkedIn fallback ($0.01/profile).

## Technical Reference

- **Step:** 3 (Scraping)
- **Category:** linkedin
- **Cost:** expensive
- **Data operation:** add (+)
- **Required input columns:** `linkedin`
- **Files:** `manifest.json`, `execute.js`

---

## LinkedIn Post Scraper

> Fetch recent LinkedIn posts via the Profile API. Three modes: `posts` (Voyager), `post_engagers` (Voyager + commenter data), `feed_posts` (DOM scraping for company pages, groups, and personal feeds).

**Module ID:** `linkedin-post-scraper` | **Step:** 3 (Scraping) | **Category:** linkedin | **Cost:** medium
**Version:** 1.2.0 | **Data Operation:** add (+)

---

## What This Module Does

Takes LinkedIn profile slugs and fetches their recent posts with engagement metrics. Three modes: `posts` (Voyager API), `post_engagers` (Voyager + commenters), `feed_posts` (DOM scraping for company/group feeds). Includes health check, circuit breaker, rate limiting, and deduplication.

## Technical Reference

- **Step:** 3 (Scraping)
- **Category:** linkedin
- **Cost:** medium
- **Data operation:** add (+)
- **Item key:** `post_id`
- **Files:** `manifest.json`, `execute.js`

---

# STEP 4: FILTERING & ASSEMBLY

---

# Content Filter

> Filter out low-quality, too-short, non-English, or irrelevant scraped pages before content generation.

**Module ID:** `content-filter` | **Step:** 4 (Filtering & Assembly) | **Category:** filtering | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** remove (➖)

---

## What This Module Does

Applies five filters in sequence (cheapest-first): scrape status, word count, English detection, URL patterns, title keywords. First post-scrape quality gate. No API calls, no LLM costs.

## Technical Reference

- **Step:** 4 (Filtering & Assembly)
- **Category:** filtering
- **Cost:** cheap
- **Data operation:** remove (➖)
- **Dependencies:** `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

# Boilerplate Stripper

**Module ID:** `boilerplate-stripper` | **Step:** 4 (Filtering) | **Category:** filtering | **Cost:** cheap | **Data operation:** transform (same items, cleaned content)

---

## What This Module Does

Removes boilerplate using two strategies: cross-page fingerprinting (blocks appearing on 50%+ of pages) and known-pattern matching (cookie consent, GDPR, newsletter CTAs, etc.). Outputs same items with cleaned `text_content`, updated `word_count`, plus `stripped_chars`, `boilerplate_ratio`, `flagged`.

## Technical Reference

- **Input**: `entity.items[]` with `url`, `text_content`, `word_count` from Step 3
- **Hash function**: djb2 (simple, fast string hash)
- **Block splitting**: double newlines (`\n\n`)

---

# Intent Tagger

> Classify each scraped page by content type using LLM classification against user-defined intents.

**Module ID:** `intent-tagger` | **Step:** 4 (Filtering & Assembly) | **Category:** filtering | **Cost:** cheap
**Version:** 2.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

LLM-first classification of pages against user-configurable intent categories (news, product_info, press_release, review, faq, guide, opinion, media, statistics, event, regulation, interview, other). Processes in batches of 10. Respects upstream `relevance` field from Step 2.

## Technical Reference

- **Step:** 4 (Filtering & Assembly)
- **Category:** filtering
- **Cost:** cheap (Haiku-class LLM, batched 10 pages per call)
- **Data operation:** transform (=)
- **Dependencies:** `tools.logger`, `tools.progress`, `tools.ai`
- **Files:** `manifest.json`, `execute.js`, `README.md`, `CLAUDE.md`

---

# STEP 5: GENERATION

---

# SEO Planner

> Keyword distribution planner. Maps target keywords to predefined article sections, generates meta tags and FAQs.

**Module ID:** `seo-planner` | **Step:** 5 (Generation) | **Category:** planning | **Cost:** medium
**Version:** 1.3.0 | **Data Operation:** add (➕)

---

## What This Module Does

Second submodule in Step 5's chain. Takes analysis from content-analyzer and produces keyword distribution plan (NOT article structure). Maps keywords to predefined sections (overview, categories, tags, credentials, FAQ). Generates meta tags and FAQs.

## Technical Reference

- **Step:** 5 (Generation)
- **Category:** planning
- **Cost:** medium
- **Data operation:** add (➕)
- **Dependencies:** `tools.ai`, `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

# Job Ad Analyzer

Step 5 generation submodule for the Job Search template.

## What it does

Performs a 5-layer analysis of a job ad against pre-approved CV content. Selects the best CV variant, identifies which sections to emphasize, suggests specific improvements, identifies gaps in coverage, and produces a fit score (0-100).

## Technical Reference

- **Step:** 5 (Generation)
- **Options:** `ai_model` (sonnet), `cv_source_dir`, `temperature` (0.2)
- **Files:** `manifest.json`, `execute.js`

---

# CV Generator

Step 5 generation submodule for the Job Search template.

## What it does

Generates a tailored CV DOCX file from the job-analyzer's analysis output. Uses the pre-existing `generate_core_cvs.js` buildCV function with variant selection and content overrides. Also generates a suggestions DOCX.

## Technical Reference

- **Step:** 5 (Generation)
- **Options:** `cv_source_dir`, `output_dir` (/tmp/job-search-output)
- **Dependencies:** `docx` npm package, `generate_core_cvs.js`
- **Files:** `manifest.json`, `execute.js`

---

# Tone & SEO Editor

> Post-writing editing pass that refines content for B2B tone and SEO keyword integration.

**Module ID:** `tone-seo-editor` | **Step:** 5 (Generation) | **Category:** generation | **Cost:** medium
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## What This Module Does

Third submodule in Step 5's chain. Separate editing pass at lower temperature (0.3-0.5) for tone refinement and keyword integration. Supports three tone styles: b2b_authoritative, casual_informative, technical_precise.

## Technical Reference

- **Step:** 5 (Generation)
- **Category:** generation
- **Cost:** medium
- **Data operation:** add (+)
- **Dependencies:** `tools.ai`, `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`, `README.md`, `CLAUDE.md`

---

# Content Writer

> Write content using analysis data, optional SEO plan, and scraped source content.

**Module ID:** `content-writer` | **Step:** 5 (Generation) | **Category:** generation | **Cost:** expensive
**Version:** 1.4.0 | **Data Operation:** add (➕)

---

## What This Module Does

Final submodule in Step 5's chain. Takes analysis (required), SEO plan (optional since v1.4.0), and scraped source content to produce publishable company profiles in Markdown. Most expensive individual LLM call in the pipeline ($0.08-0.15 per company with Sonnet).

## Technical Reference

- **Step:** 5 (Generation)
- **Category:** generation
- **Cost:** expensive
- **Data operation:** add (➕)
- **Dependencies:** `tools.ai`, `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

# Content Analyzer

> Structural fact extraction from scraped content. Classifies into categories, assigns tags, extracts key facts, and maps source citations.

**Module ID:** `content-analyzer` | **Step:** 5 (Generation) | **Category:** analysis | **Cost:** expensive
**Version:** 1.4.0 | **Data Operation:** add (+)

---

## What This Module Does

First submodule in Step 5's chain. Reads all scraped pages for a company, sends them to an AI model, and gets back structured analysis JSON (categories, tags, key_facts, source_citations). Output is structured JSON only -- not prose. Categories from fixed taxonomy only. Tags can be suggested.

## Technical Reference

- **Step:** 5 (Generation)
- **Category:** analysis
- **Cost:** expensive
- **Data operation:** add (+)
- **Dependencies:** `tools.ai`, `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

# STEP 6: QA

---

# Meta Compliance Checker

Validates that generated meta titles and meta descriptions meet SEO length requirements and contain target keywords.

**Module ID:** `meta-compliance-checker` | **Step:** 6 (QA) | **Category:** qa | **Cost:** cheap | **Data operation:** transform

---

## What This Module Does

Runs seven automated checks: title length (max/min), description length range, keyword in title, keyword in description, no truncation indicators, no duplicates across entities. Pure deterministic rule-based checks -- no AI calls.

## Technical Reference

- **Step:** 6 (QA)
- **No external API calls**
- **No AI calls**
- **Pattern**: Data-shape routing

---

# Citation Coverage Checker

Verifies that every factual claim in generated content is backed by an inline citation referencing a valid source URL.

**Module ID:** `citation-coverage-checker` | **Step:** 6 (QA) | **Category:** qa | **Cost:** cheap | **Data operation:** transform

---

## What This Module Does

Parses content_markdown for inline `[#n]` references, cross-references against source_citations, and flags factual claims lacking citations. Produces citation_score (0-1) and pass/fail verdict. Optional URL verification via HEAD requests.

## Technical Reference

- **Step:** 6 (QA)
- **No AI calls**
- **Optional external calls**: HEAD requests when `verify_urls` is true

---

# Keyword Sufficiency Checker

Validates that generated content includes target SEO keywords at the right density and in the right positions.

**Module ID:** `keyword-sufficiency-checker` | **Step:** 6 (QA) | **Category:** qa | **Cost:** cheap | **Data operation:** transform

---

## What This Module Does

Checks four dimensions: head term placement and density (1-3%), mid-tail term coverage, entity keyword coverage, negative keyword absence. Composite keyword_score (0-1) with weighted categories (head 40%, mid-tail 25%, entity 15%, negatives 20%).

## Technical Reference

- **Step:** 6 (QA)
- **No external API calls**
- **No AI calls**
- **Pattern**: Data-shape routing

---

# Hallucination Detector

Compare generated content claims against original source material to flag statements that aren't supported by any source.

**Module ID:** `hallucination-detector` | **Step:** 6 (QA) | **Category:** qa | **Cost:** medium (LLM calls) | **Data operation:** add

---

## What This Module Does

Extracts factual claims from content_markdown using heuristic patterns, then sends batches to LLM with source text for verification. Each claim gets: supported, partially supported, or unsupported. Produces hallucination_score (0-1).

## Technical Reference

- **Step:** 6 (QA)
- **AI calls**: LLM via tools.ai.complete() -- batched claim verification
- **No external HTTP calls**
- **Pattern**: Data-shape routing

---

# Structural Compliance Checker

> Checks that generated content meets basic format requirements -- heading hierarchy, section count, FAQ presence, and word counts -- without using an LLM.

**Module ID:** `qa-structural` | **Step:** 6 (QA) | **Category:** qa | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## What This Module Does

Pure text parsing checks: heading levels, H2 section count, total word count, per-section word count, FAQ presence. Produces structural_score (0-1) and pass/fail verdict. Runs instantly, costs nothing. Catches structural problems before expensive LLM-based QA.

## Technical Reference

- **Step:** 6 (QA)
- **Category:** qa
- **Cost:** cheap -- pure text parsing, no API calls
- **Data operation:** add (+)
- **External dependencies:** None -- pure JavaScript text parsing
- **Files:** `manifest.json`, `execute.js`

---

# STEP 7: ROUTING

---

# Loop Router

Read QA verdicts from Step 6 submodules and route failed entities back to the appropriate earlier step for rework.

**Module ID:** `loop-router` | **Step:** 7 (Routing) | **Category:** routing | **Cost:** cheap | **Data operation:** add

---

## What This Module Does

Aggregates QA verdicts and applies priority-ordered routing table: approve, loop_discovery, loop_generation, loop_tone, or flag_manual. Produces routing recommendations only -- does NOT execute the loops. Includes max_loops guard and min_source_pages threshold.

## Routing Rules

| Priority | Condition | Decision |
|----------|-----------|----------|
| 1 | Entity looped >= max_loops | flag_manual |
| 2 | 2+ QA checks failed | flag_manual |
| 3 | Hallucination failed | loop_discovery |
| 4 | Citation failed | loop_discovery |
| 5 | Keyword failed | loop_tone |
| 6 | Meta compliance failed | loop_generation |
| 7 | All passed | approve |
| 8 | No QA results | configurable |

## Technical Reference

- **Step:** 7 (Routing)
- **No external API calls**
- **No AI calls**
- **Pattern**: Data-shape routing

---

# STEP 8: BUNDLING

---

# HTML Output

> Convert pipeline Markdown to HTML with optional schema.org Organization JSON-LD and CSS styling.

**Module ID:** `html-output` | **Step:** 8 (Bundling) | **Category:** formatting | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

Markdown to HTML conversion, inline citations to superscript anchor links with Sources section, schema.org Organization JSON-LD from analysis data, and optional CSS templates (none, basic, article). Always strips [Type Marker] heading prefixes.

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** formatting
- **Cost:** cheap
- **Dependencies:** `marked` (Markdown to HTML conversion)
- **Files:** `manifest.json`, `execute.js`

---

# JSON Output

> Assemble structured JSON per entity from all available pipeline data shapes (analysis, SEO plan, content).

**Module ID:** `json-output` | **Step:** 8 (Bundling) | **Category:** data | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

Assembles all pipeline data into a single structured JSON per entity. Supports `strapi` (CMS-optimized flat fields) and `flat` (raw nested objects) output formats. Works with any combination of data shapes.

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** data
- **Cost:** cheap
- **Dependencies:** `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

# Meta Output

> Generate validated SEO metadata (title, description, keywords, Open Graph, Twitter Card) from pipeline data.

**Module ID:** `meta-output` | **Step:** 8 (Bundling) | **Category:** seo | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

Validates and assembles SEO metadata from seo_plan_json and analysis_json. Checks title/description length constraints, assembles keywords from categories/tags/SEO targets, generates Open Graph and Twitter Card tags.

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** seo
- **Cost:** cheap
- **Dependencies:** `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

# Company Media

> Find company logos, OG images, team photos, product screenshots, and award badges by fetching key pages from company websites.

**Module ID:** `company-media` | **Step:** 8 (Bundling) | **Category:** media | **Cost:** medium
**Version:** 2.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

Automates visual asset discovery from company websites. Fetches homepage + key subpages, extracts images using HTML parsing and pattern-based classification. Scores logo candidates by format (SVG preferred), color variant (dark preferred), and orientation (horizontal preferred). Validates URLs via HEAD requests.

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** media
- **Cost:** medium
- **Dependencies:** `tools.http`, `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`

---

# Schema.org Injector

> Generate Schema.org structured data (JSON-LD) for company profiles — Organization, Product, FAQPage — for SEO rich snippets.

**Module ID:** `schema-org-injector` | **Step:** 8 (Bundling) | **Category:** bundling | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

Generates Organization, Product, and FAQPage Schema.org types. Uses @graph pattern for multiple types. Maps analysis_json and json-output data to Schema.org properties. Includes validation with warnings for missing recommended fields.

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** bundling
- **Cost:** cheap (pure data transformation)
- **Dependencies:** `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`, `README.md`, `CLAUDE.md`

---

# Markdown Output

> Transform pipeline content into clean, publishable Markdown with optional YAML frontmatter.

**Module ID:** `markdown-output` | **Step:** 8 (Bundling) | **Category:** formatting | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## What This Module Does

Converts internal pipeline Markdown into clean, publishable format. Strips [Type Marker] prefixes (configurable), converts citations to footnotes/inline/strip, adds YAML frontmatter with categories and tags from analysis. Prefers AI-written content over raw scraped content.

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** formatting
- **Cost:** cheap
- **Dependencies:** `js-yaml`, `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
