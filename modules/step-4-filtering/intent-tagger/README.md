# Intent Tagger

> Classify each scraped page by content type using LLM classification against user-defined intents. Helps downstream steps prioritize and route content for creation.

**Module ID:** `intent-tagger` | **Step:** 4 (Filtering) | **Category:** filtering | **Cost:** medium
**Version:** 2.0.0 | **Data Operation:** transform (=)

---

## Background

After scraping, a pipeline has dozens of pages per entity -- but not all pages carry equal weight for content creation. A news article is more valuable than a cookie policy when writing industry updates. A product page matters more than a careers listing when writing reviews.

The Intent Tagger classifies every page so downstream steps (content-analyzer, content-writer) can prioritize the right sources for whatever content type you're creating.

### How It Fits the Pipeline

This module sits in Step 4 (Filtering) alongside the Content Filter and Boilerplate Stripper. While those modules remove bad content, the Intent Tagger enriches good content with classification metadata. It runs after filtering and before generation (Step 5 uses the intent labels).

### LLM-First Classification

V2 uses LLM classification for all pages. Intent categories are fully user-configurable, so hardcoded heuristic patterns aren't possible -- the LLM classifies each page against whatever categories you define.

Pages are processed in batches of 10 to minimize API calls. Uses Haiku-class models by default for fast, cheap classification.

### Upstream Relevance Awareness

The intent tagger respects the `relevance` field set by Step 2's url-relevance module. Only pages marked KEEP (or with no relevance field) are sent to the LLM for classification. Pages marked MAYBE are passed through as `page_intent: 'unclassified'` -- their content is preserved for downstream use but no LLM call is spent on them. This significantly reduces API costs for large entities where many URLs were borderline relevant.

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
| `intents` | 12 default categories (see above) | Edit to match your content creation goals. Remove irrelevant categories, add domain-specific ones. Never leave it blank -- an empty list fails the run loudly | Defines the classification taxonomy. Format: `name \| description` per line. Supports presets, so a tuned taxonomy can be saved and reused across runs |
| `priority_intents` | news, product_info, review | Change based on what content you're creating. For regulatory content: "regulation, news, opinion" | Controls output sort order -- priority intents appear first per entity |
| `ai_model` | `haiku` | Switch to a stronger model if classifications look wrong on nuanced pages | Model used for classification. Registry-driven select: the skeleton populates the dropdown from the shared LLM registry, with models scoped to the default provider |
| `ai_provider` | `anthropic` | Change to route classification through another provider | Provider for classification calls. Registry-driven select populated from the shared LLM registry (anthropic, openai, perplexity, gemini, openrouter) |

The `ai_model` and `ai_provider` dropdowns are not hardcoded lists -- their values come from the skeleton's shared LLM registry, so `haiku` is a registry alias, not a pinned model id. The most impactful option is `intents`: a taxonomy that doesn't match your sources produces a high `other` rate no matter which model you pick.

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
ai_model: haiku
ai_provider: anthropic
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
ai_model: haiku
ai_provider: anthropic
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
ai_model: haiku
ai_provider: anthropic
```

## Expected Output

**Output fields per page:**
- `url` -- the page URL (carried from input)
- `title` -- page title (carried from input)
- `text_content` -- full page text (carried through for downstream steps)
- `page_intent` -- classified intent (one of the user-defined categories, or `unclassified` for MAYBE pages)
- `intent_confidence` -- confidence score 0-1 (higher = more certain; 0 for unclassified)
- `intent_reasoning` -- brief LLM explanation of why this classification was chosen
- `entity_name` -- which entity this page belongs to

**Sort order:** Pages are sorted per entity with priority intents first (in the order specified), then remaining pages by confidence descending, then unclassified pages last.

**Summary line:** Shows classification breakdown, e.g.: "42 pages classified across 5 entities: 8 news, 12 product_info, 6 review, 4 guide, 3 faq, 2 opinion, 7 other | 5 LLM calls". If any batches failed, the line ends with "(N failed)".

**Red flags to watch for:**
- Very high "other" rate (>50%) -- your intent categories may not match the content being scraped. Edit the intents to better fit your sources. Note that failed batches also land in `other` (with confidence 0), so check the failure count first
- High "unclassified" count -- these are MAYBE pages from Step 2. If too many important pages are unclassified, tighten your url-relevance thresholds in Step 2 so more pages get KEEP status
- LLM failure rate above 10% -- check API key configuration or model availability

## Limitations & Edge Cases

- **Non-English content** -- Classification quality depends on the LLM's language capabilities. Haiku handles major languages well but may struggle with niche languages.
- **Multi-intent pages** -- Some pages serve multiple intents (e.g., an About page with job listings). The tagger assigns a single best-fit intent.
- **Content snippet is 400 characters** -- Only the first 400 characters of page content are sent to the LLM per page (in batches of 10). Pages where the intent signal is buried deep may be misclassified.
- **Empty intents option fails loudly** -- If the `intents` textarea is blank, the module throws "No intent categories defined" instead of silently classifying nothing.
- **Failed batches default to `other`** -- If an LLM call errors or its response can't be parsed as JSON, every page in that batch gets `page_intent: 'other'` with confidence 0 and reasoning "Classification failed". The failure is counted in the summary's `llm_failures`.
- **Model output is sanitized** -- Intent names not in your taxonomy are coerced to `other`, confidence is clamped to 0-1 (0.5 if missing), and reasoning is truncated to 200 characters.
- **Partial results on timeout** -- Classified pages are pushed to the skeleton's partial-results buffer after each successful batch, so a timeout mid-entity preserves the batches already classified.
- **No learning** -- The module does not learn from operator corrections. Presets on the `intents` option are the way to persist a taxonomy that works.

## What Happens Next

The pool flows into Step 5 (Generation) with every page carrying `page_intent`, `intent_confidence`, and `intent_reasoning`. Generation modules (content-analyzer, content-writer) can weight sources by intent -- e.g., lean on `news` and `press_release` pages for industry updates, or `product_info` and `review` pages for assessments. The per-entity sort order means priority-intent pages surface first wherever items are consumed in order.

## Technical Reference

- **Step:** 4 (Filtering)
- **Category:** filtering
- **Cost tier:** medium -- 5-minute per-entity timeout; bumped from cheap so large entities with many LLM batches don't time out
- **Data operation:** transform (=) -- same items in, same items out, with `page_intent`, `intent_confidence`, and `intent_reasoning` added
- **Pool precondition:** `requires_items` -- an entity with an empty pool is marked `skipped_no_input` rather than failed
- **Required input columns:** `text_content` (manifest `requires_columns`). At runtime, items with neither `text_content` nor `url` are skipped with a warning
- **Depends on:** page-scraper
- **Input:** `input.entities[]` with `items[]` from the working pool
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` (all original fields plus intent fields) and `meta` (`total`, `intent_breakdown`, `skipped_maybe`); top-level `summary` with `total_entities`, `total_items`, `intent_breakdown`, `llm_calls`, `llm_failures`, `description`
- **Selectable:** false -- classification is informational, not a keep/exclude decision
- **Error handling:** throws if no intents are defined; per-batch try/catch -- a failed call or unparseable response defaults that batch to `other` and increments `llm_failures` instead of failing the run; successful batches are pushed to `tools._partialItems` for timeout resilience
- **Dependencies:** `tools.logger`, `tools.progress`, `tools.ai` (required -- LLM-first, no heuristic fallback)
- **Files:** `manifest.json`, `execute.js`, `README.md`, `CLAUDE.md`
