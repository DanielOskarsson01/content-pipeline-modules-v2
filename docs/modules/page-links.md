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
