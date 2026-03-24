# Intent Tagger

> Classify each scraped page by content type using LLM classification against user-defined intents. Helps downstream steps prioritize and route content for creation.

**Module ID:** `intent-tagger` | **Step:** 4 (Filtering & Assembly) | **Category:** filtering | **Cost:** cheap
**Version:** 2.0.0 | **Data Operation:** transform (=)

---

## Background

After scraping, a pipeline has dozens of pages per entity — but not all pages carry equal weight for content creation. A news article is more valuable than a cookie policy when writing industry updates. A product page matters more than a careers listing when writing reviews.

The Intent Tagger classifies every page so downstream steps (content-analyzer, content-writer) can prioritize the right sources for whatever content type you're creating.

### How It Fits the Pipeline

This module sits in Step 4 (Filtering & Assembly) alongside the Content Filter and Boilerplate Stripper. While those modules remove bad content, the Intent Tagger enriches good content with classification metadata. It runs after filtering and before generation (Step 5 uses the intent labels).

### LLM-First Classification

V2 uses LLM classification for all pages. Intent categories are fully user-configurable, so hardcoded heuristic patterns aren't possible — the LLM classifies each page against whatever categories you define.

Pages are processed in batches of 10 to minimize API calls. Uses Haiku-class models by default for fast, cheap classification.

### Upstream Relevance Awareness

The intent tagger respects the `relevance` field set by Step 2's url-relevance module. Only pages marked KEEP (or with no relevance field) are sent to the LLM for classification. Pages marked MAYBE are passed through as `page_intent: 'unclassified'` — their content is preserved for downstream use but no LLM call is spent on them. This significantly reduces API costs for large entities where many URLs were borderline relevant.

## Default Intent Categories

These defaults are a starting point for iGaming content creation. Edit them freely in the options:

| Intent | Description |
|--------|-------------|
| `news` | Breaking news, announcements, industry updates, regulatory changes |
| `product_info` | Product pages, feature descriptions, specifications, platform details |
| `press_release` | Official company press releases and media statements |
| `review` | Reviews, comparisons, ratings, player feedback, operator assessments |
| `faq` | Frequently asked questions, help pages, knowledge base articles |
| `guide` | How-to guides, tutorials, educational content, strategy articles |
| `opinion` | Opinion pieces, editorials, analysis, commentary, thought leadership |
| `media` | Image galleries, videos, infographics, podcasts, visual content |
| `statistics` | Data, research, reports, market analysis, rankings, surveys |
| `event` | Conference coverage, trade show news, event recaps, webinar summaries |
| `regulation` | Legal updates, licensing, compliance, responsible gambling policies |
| `interview` | Interviews, Q&A sessions, executive profiles, panel discussions |
| `other` | Does not fit any of the above categories (always auto-appended) |

## When to Use

**Always use when:**
- You have scraped content from Step 3 and want to classify pages before generation
- You need to prioritize certain content types for your output goals
- You're creating multiple types of content (news + reviews + guides) from the same source pool

**Skip when:**
- You only have 1-2 pages per entity (classification adds little value)
- All pages are known to be the same type (e.g., a news-only crawl)

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `intents` | 12 default categories (see above) | Edit to match your content creation goals. Remove irrelevant categories, add domain-specific ones | Defines the classification taxonomy. Format: `name \| description` per line |
| `priority_intents` | news, product_info, review | Change based on what content you're creating. For regulatory content: "regulation, news, opinion" | Controls output sort order — priority intents appear first per entity |
| `ai_model` | claude-haiku-4-5-20251001 | Switch if Haiku is unavailable or you want a different model | Model used for classification |
| `ai_provider` | anthropic | Change if using a non-Anthropic provider | Provider for classification calls |

## Recipes

### News & Reviews Focus
```
intents:
  news | Breaking news, announcements, industry updates
  product_info | Product pages, feature descriptions, platform details
  review | Reviews, comparisons, ratings, assessments
  press_release | Official press releases and media statements
  opinion | Editorials, analysis, commentary
  other | Does not fit above categories
priority_intents: news, review, product_info
```

### Regulatory & Compliance Focus
```
intents:
  regulation | Legal updates, licensing, compliance, responsible gambling
  news | Industry news, regulatory announcements
  statistics | Market data, research, reports
  opinion | Legal analysis, expert commentary
  other | Does not fit above categories
priority_intents: regulation, news, statistics
```

### Company Profile Focus
```
intents:
  company_info | About pages, company overview, history, mission, team
  product_info | Products, solutions, platform features, pricing
  press_release | Press releases, media statements
  interview | Executive interviews, Q&A, profiles
  event | Conference appearances, trade show presence
  other | Does not fit above categories
priority_intents: company_info, product_info, press_release
```

## Expected Output

**Output fields per page:**
- `url` — the page URL (carried from input)
- `title` — page title (carried from input)
- `text_content` — full page text (carried through for downstream steps)
- `page_intent` — classified intent (one of the user-defined categories, or `unclassified` for MAYBE pages)
- `intent_confidence` — confidence score 0-1 (higher = more certain; 0 for unclassified)
- `intent_reasoning` — brief LLM explanation of why this classification was chosen
- `entity_name` — which entity this page belongs to

**Sort order:** Pages are sorted per entity with priority intents first (in the order specified), then remaining pages by confidence descending, then unclassified pages last.

**Summary line:** Shows classification breakdown, e.g.: "42 pages classified across 5 entities: 8 news, 12 product_info, 6 review, 4 guide, 3 faq, 2 opinion, 7 other | 5 LLM calls"

**Red flags to watch for:**
- Very high "other" rate (>50%) — your intent categories may not match the content being scraped. Edit the intents to better fit your sources.
- High "unclassified" count — these are MAYBE pages from Step 2. If too many important pages are unclassified, tighten your url-relevance thresholds in Step 2 so more pages get KEEP status.
- LLM failure rate above 10% — check API key configuration or model availability

## Limitations & Edge Cases

- **Non-English content** — Classification quality depends on the LLM's language capabilities. Haiku handles major languages well but may struggle with niche languages.
- **Multi-intent pages** — Some pages serve multiple intents (e.g., an About page with job listings). The tagger assigns a single best-fit intent.
- **Content snippet is 400 characters** — Only the first 400 characters of page content are sent to the LLM per page (in batches of 10). Pages where the intent signal is buried deep may be misclassified.
- **No learning** — The module does not learn from operator corrections or accumulate data over time. (Future: B012 presets will allow saving good configurations.)

## Technical Reference

- **Step:** 4 (Filtering & Assembly)
- **Category:** filtering
- **Cost:** cheap (Haiku-class LLM, batched 10 pages per call)
- **Data operation:** transform (=) — same items in, same items out, with `page_intent`, `intent_confidence`, and `intent_reasoning` added
- **Requires:** items with `text_content` or `url` fields
- **Input:** `input.entities[]` with `items[]` from the working pool
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing all original fields plus intent classification fields
- **Selectable:** false — classification is informational, not a keep/exclude decision
- **Dependencies:** `tools.logger`, `tools.progress`, `tools.ai` (required — LLM-first)
- **Files:** `manifest.json`, `execute.js`, `README.md`, `CLAUDE.md`
