# Company Media

> Find company logos, OG images, team photos, product screenshots, and award badges by fetching key pages from company websites.

**Module ID:** `company-media` | **Step:** 8 (Bundling) | **Category:** media | **Cost:** medium
**Version:** 2.0.0 | **Data Operation:** add (+)

---

## Background

### The Content Problem This Solves

A company profile without visual assets is incomplete. Editorial teams need logos for directory listings, team photos for leadership sections, product screenshots for review articles, and award badges for credibility. Manually visiting each company's website, navigating to the right pages, and downloading the right images is time-consuming and inconsistent.

This module automates visual asset discovery: it fetches the homepage and key internal pages (about, team, products, awards), extracts images using HTML parsing and pattern-based classification, scores logo candidates for quality (preferring horizontal/dark variants suitable for light backgrounds), and validates every discovered URL via HEAD requests.

### How It Fits the Pipeline Architecture

This is a Step 8 Bundling module -- but unlike the other five Step 8 modules, it does not primarily consume `content_markdown`. Instead, it uses **data-shape routing** to find `analysis_json` (for deriving the homepage URL from source citations; the most recent analysis item in the pool is used) and the `website` field on the entity itself. It independently fetches pages from the company's website using `tools.http`.

The module is classified as **medium** cost -- the only Step 8 module that is not cheap. This reflects the HTTP requests required to fetch homepage + up to 7 subpages and validate all discovered image URLs.

Important limitation: this module only searches the company's own website. It does not search Google Images, LinkedIn, or external sources. A future multi-source image pipeline would extend this to external sources.

## Strategy & Role

**Why this module exists:** Automate visual asset discovery from company websites. Find logos, team photos, product screenshots, and award badges without manual browsing. Score and rank logo candidates to prefer usable variants (dark, horizontal, SVG).

**Role in the pipeline:** One of six Step 8 modules. The only one that makes fresh HTTP requests to discover content not already in the pipeline. All other Step 8 modules work from existing pool data.

**Relationship to other steps:**
- **No hard dependencies** -- can run with or without prior pipeline steps
- **Optionally uses:** analysis_json source_citations to derive homepage URL when `website` field is missing
- **Sibling modules:** markdown-output, html-output, json-output, meta-output, schema-org-injector

## When to Use

**Always use when:**
- You need visual assets for company profiles, directory listings, or editorial content
- Logo images are needed for a light-background layout

**Consider settings carefully when:**
- Entities are small companies with simple websites -- lower `max_pages_per_entity` to avoid wasted requests
- You do not need all media types -- disable `find_team_photos`, `find_product_screenshots`, or `find_awards` to reduce page fetches
- URL validation is slowing down processing -- disable `validate_urls` for faster but less reliable results

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `find_logo` | true | Disable if logos are sourced from elsewhere | Searches all fetched pages for images with logo/brand signals. Scores candidates by format (SVG preferred), color variant (dark preferred), and orientation (horizontal preferred) |
| `find_team_photos` | true | Disable if team/people photos are not needed | Fetches /about, /team, /leadership pages and extracts images classified as person photos by alt text, class names, or name patterns |
| `find_product_screenshots` | true | Disable if product images are not needed | Fetches /products, /solutions, /platform pages and extracts large images classified as product/software screenshots |
| `find_awards` | true | Disable if award badges are not needed | Looks for award/certification/compliance images on both award pages and the homepage |
| `validate_urls` | true | Disable for faster processing (skip HEAD request verification) | Sends HEAD requests to every discovered image URL. Removes broken links from output. Processes in batches of 5 |
| `max_pages_per_entity` | 8 | Lower to 1 for a homepage-only logo scan; lower to 3-4 for quick scans; 9 is the effective ceiling | Total pages fetched per entity (homepage + subpages). Manifest allows up to 20, but subpage discovery is capped per category (3 team + 3 products + 2 awards), so values above 9 fetch nothing extra |

The most impactful option is `max_pages_per_entity`: at the default 8, one candidate subpage is dropped when all three categories are enabled and fully populated; set 9 for full coverage. Disabling a `find_*` toggle removes that category's subpages from the fetch list entirely, so the remaining categories get their pages sooner. Disabling `validate_urls` is the main speed lever but risks broken image links in the output.

## Recipes

### Full Media Discovery (Standard)
All media types with validation:
```
find_logo: true
find_team_photos: true
find_product_screenshots: true
find_awards: true
validate_urls: true
max_pages_per_entity: 8
```

### Logo Only (Quick)
Just find the company logo:
```
find_logo: true
find_team_photos: false
find_product_screenshots: false
find_awards: false
validate_urls: true
max_pages_per_entity: 1
```

### Deep Scan (Large Sites)
Maximum coverage for comprehensive media libraries (9 is the effective maximum -- homepage + 3 team + 3 products + 2 awards pages):
```
find_logo: true
find_team_photos: true
find_product_screenshots: true
find_awards: true
validate_urls: true
max_pages_per_entity: 9
```

### Fast Scan (No Validation)
Quick discovery without URL verification:
```
find_logo: true
find_team_photos: true
find_product_screenshots: true
find_awards: true
validate_urls: false
max_pages_per_entity: 5
```

## Expected Output

**Healthy result:**
- One media profile per entity
- Logo found for 60-80% of entities
- OG image found for 50-70% of entities
- 0-10 team photos, 0-10 screenshots, 0-5 award images per entity

**Output fields per entity:**
- `entity_name` -- the company/entity name
- `logo_url` -- best logo candidate URL (or empty string)
- `og_image_url` -- Open Graph image URL (or empty string)
- `team_photo_count` -- number of validated team/people photos
- `screenshot_count` -- number of validated product screenshots
- `award_count` -- number of validated award badge images
- `team_photos_json` -- JSON array of team photo URLs
- `screenshots_json` -- JSON array of screenshot URLs
- `awards_json` -- JSON array of award image URLs
- `all_logos_json` -- JSON array of all logo variant URLs (up to 5)
- `media_summary` -- human-readable text summary of what was found
- `status` -- `ok` (logo found), `partial` (some media but no logo), or `no_media` (nothing found)

**Logo scoring system:**
- +10: `logo` in URL/alt/class/id
- +5: `brand` in attributes; SVG format; dark/black/primary/colored in URL
- +3: horizontal/wide/full in URL
- +2: width > 100px
- -5: white/light/reversed/inverted in URL; favicon.ico
- -3: icon without logo; width < 32px

If the top-scored logo fails HEAD validation, the next validated variant is promoted (or `logo_url` is left empty if none validate). The favicon/apple-touch-icon fallback applies only when no logo-signal images were found at all.

**Subpage categories searched:**
- Team: /about, /team, /leadership, /people, /management, /our-team, /staff, /executives, /founders, /who-we-are
- Products: /products, /solutions, /platform, /services, /software, /features, /demo, /tools, /technology
- Awards: /awards, /certifications, /recognition, /achievements, /accreditations, /partners

**Red flags to watch for:**
- `status: no_media` -- homepage may have failed to fetch, or site uses JavaScript-only rendering
- Logo URL points to a light/white variant -- scoring system penalizes these but may still select one if no dark variant exists
- Very high screenshot count -- may include non-product images misclassified as screenshots

## Limitations & Edge Cases

- **Company website only** -- does not search Google Images, LinkedIn, Unsplash, or external sources. A dark-themed site may only have light logos (unusable on a light background). Multi-source pipeline planned for the future
- **HTTP fetch only** -- does not use Playwright/browser rendering. JavaScript-rendered images and lazy-loaded images will be missed
- **Image classification is heuristic** -- based on alt text, CSS classes, IDs, and URL patterns. Misclassification is common for sites with non-standard naming
- **No image download** -- all images stored as external URLs. URLs may break if the company redesigns their website
- **Logo scoring favors dark variants** -- by design, for use on light backgrounds. If your platform uses a dark background, the scoring is inverted from what you need
- **Favicon as fallback** -- if no logo images are found, the apple-touch-icon or favicon is used as a last resort. These are typically small (16-180px) and low quality
- **Team photo detection relies on patterns** -- looks for names in alt text (two+ capitalized words) and team-related CSS classes. Photos without descriptive alt text will be missed
- **Homepage URL derivation** -- if the entity has no `website` field, the module attempts to derive the homepage from source_citations in the most recent `analysis_json` pool item by counting the most common origin domain

## What Happens Next

The media output provides visual assets for editorial use. Typical destinations:

- **Directory listings** -- use `logo_url` for company logo display
- **Profile pages** -- use team photos for leadership sections, screenshots for product galleries
- **CMS import** -- download images from the validated URLs and upload to CMS media library
- **Editorial review** -- use the image grid views in the detail panel to visually assess quality

The detail view provides image grids for each media type (team photos, screenshots, awards, logo variants), making it easy for operators to review discovered assets and select the best ones.

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** media
- **Cost:** medium
- **Data operation:** add (+) -- adds one media-profile item per entity, keyed by `entity_name`; re-runs replace this module's own prior output without touching other modules' items
- **Pool precondition:** `requires_items` -- entities with an empty pool are marked `skipped_no_input` (not failed) before execution; other entities proceed normally
- **Requires columns:** none (reads from pool items and entity fields)
- **Depends on:** none (can run independently)
- **Input:** `input.entities[]` with `website` field and/or `items[]` containing `analysis_json`
- **Output:** `{ results[], summary }` where each result has `entity_name`, `items[]` with media URLs, counts, and status
- **Error handling:** page fetches fail soft (an unreachable page yields no images, run continues); a thrown error for an entity records `error` on that entity's result with empty items while other entities proceed; each successfully-completed entity's items are pushed to `tools._partialItems` so a timeout/abort preserves already-processed entities (the error path does not push)
- **Selectable:** true -- operators can deselect individual entity outputs
- **Flagged when:** `status` is `no_media` (highlighted in the table)
- **Detail view:** header fields (entity_name, status badge, logo_url image, counts) and image/image_grid sections for each media type plus prose summary
- **Dependencies:** `tools.http` (page fetching and URL validation), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
