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
