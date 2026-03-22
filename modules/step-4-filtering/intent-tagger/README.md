# Intent Tagger

> Classify each scraped page by its intent (About, Products, Press, Partners, Careers, Contact, etc.) so downstream steps can prioritize and route content.

**Module ID:** `intent-tagger` | **Step:** 4 (Filtering & Assembly) | **Category:** filtering | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## Background

### The Content Problem This Solves

After scraping, a pipeline has dozens of pages per company -- but not all pages carry equal weight. An "About Us" page is far more valuable for a company profile than a cookie policy or a blog post about industry trends. The content-analyzer (Step 5) needs to know whether it is reading an About page, a Press Release, or a Careers listing so it can weight information correctly. The content-writer needs to prioritize authoritative sources (About, Products) over peripheral ones (blog posts, resources).

The original Content Creation Master described this need explicitly:

> *"Tag critical intents: About; Products/Solutions; Press (top 3 recent); Partners; Careers; Contact."*

Without intent classification, downstream steps treat all pages equally -- a 2,000-word blog post about industry trends gets the same weight as a 500-word About page that contains the company's founding story, mission, and team. Intent tagging fixes this by labeling every page before it reaches the LLM.

### How It Fits the Pipeline Architecture

This module sits in Step 4 (Filtering & Assembly) alongside the Content Filter and Boilerplate Stripper. While those modules remove bad content, the Intent Tagger enriches good content with classification metadata. It runs after filtering (no point classifying pages that will be excluded) and before generation (Step 5 uses the intent labels).

The classification also enables the adaptive page cap vision from the original spec:

> *"Base cap = 12 pages. Expand up to 25 if signals justify."*

A future cap module can use intent labels to ensure that at least one "about" page and one "products" page survive the cap, even when total pages are limited.

### The Two-Tier Classification Approach

**V1 -- Heuristic (default, no cost):** Three signal sources combined with scoring:
1. URL path matching: `/about` maps to `about`, `/careers` maps to `careers`, etc.
2. Title keyword matching: "About Us" maps to `about`, "Press Release" maps to `press`
3. Content keyword density: high density of job-related terms suggests `careers`

**V2 -- LLM fallback (opt-in, cheap):** For pages where heuristics produce low confidence (below `llm_threshold`), send the page title and first 500 characters to a fast, cheap LLM (Haiku) for classification. This catches pages with non-standard URLs and titles but clear content signals.

## Intent Categories

| Intent | Description | URL Signals | Title Signals |
|--------|-------------|-------------|---------------|
| `about` | Company overview, history, team, mission, values | /about, /about-us, /company, /team, /leadership | "About Us", "Our Story", "Meet the Team" |
| `products` | Products, solutions, services, platform features, pricing | /products, /solutions, /services, /pricing | "Products", "Solutions", "Platform" |
| `press` | Press releases, media coverage, newsroom | /press, /press-releases, /newsroom, /media | "Press Release", "Announces", "Newsroom" |
| `careers` | Job listings, company culture, hiring | /careers, /jobs, /openings, /join-us | "Careers", "We're Hiring", "Open Positions" |
| `contact` | Contact information, office locations, support | /contact, /contact-us, /support | "Contact Us", "Get in Touch" |
| `investors` | Investor relations, financial reports, SEC filings | /investors, /ir, /annual-report | "Investor Relations", "Annual Report" |
| `partners` | Partner programs, integrations, affiliates | /partners, /partnerships, /affiliates | "Partners", "Partner Program" |
| `resources` | Whitepapers, ebooks, guides, documentation | /resources, /whitepapers, /docs | "Whitepaper", "Guide", "Documentation" |
| `blog_post` | Blog articles, thought leadership, insights | /blog, /articles, /insights | "Blog", "Article", "Insight" |
| `news_article` | Industry news, market updates | /news | "News", "Industry Update" |
| `case_study` | Customer stories, success stories, testimonials | /case-studies, /success-stories | "Case Study", "Success Story" |
| `other` | Pages that do not match any known intent | (no match) | (no match) |

## When to Use

**Always use when:**
- The pipeline has scraped content from Step 3 and you want to classify pages before generation
- You need to prioritize certain page types (About, Products) for the content-analyzer
- You want to enable future adaptive page caps based on intent

**Consider LLM fallback when:**
- Target companies have non-standard URL structures (single-page apps, hash routing)
- Many pages are classified as "other" with low confidence
- Classification accuracy matters more than speed/cost

**Skip when:**
- You only have 1-2 pages per entity (classification adds little value)
- All pages are known to be the same type (e.g., a news-only crawl)

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `use_llm` | false | Enable when heuristic accuracy is insufficient -- many "other" classifications with low confidence | Sends low-confidence pages to LLM for classification. Costs tokens but improves accuracy for ambiguous pages |
| `llm_threshold` | 0.5 | Lower to 0.3 for fewer LLM calls (only very ambiguous pages); raise to 0.7 to classify more pages with LLM | Pages with heuristic confidence below this value trigger LLM fallback. Only applies when `use_llm` is true |
| `ai_model` | claude-haiku-4-5-20251001 | Switch to a different model if Haiku is unavailable or you want cheaper/faster alternatives | Model used for LLM fallback classification |
| `ai_provider` | anthropic | Change if using a non-Anthropic provider for cost or availability reasons | Provider for the LLM classification calls |
| `priority_intents` | about,products,press | Add intents that matter most for your content goal. For investor profiles: "about,investors,press". For hiring content: "about,careers,products" | Controls output sort order -- pages matching these intents appear first per entity |

## Recipes

### Heuristic Only (default -- no cost)
Fast classification with no API calls. Good for well-structured corporate websites:
```
use_llm: false
priority_intents: about,products,press
```

### With LLM Fallback
Better accuracy for sites with non-standard URLs or single-page applications:
```
use_llm: true
llm_threshold: 0.5
ai_model: claude-haiku-4-5-20251001
ai_provider: anthropic
priority_intents: about,products,press
```

### Aggressive LLM Classification
When accuracy matters most and you want LLM to classify most pages:
```
use_llm: true
llm_threshold: 0.8
ai_model: claude-haiku-4-5-20251001
ai_provider: anthropic
priority_intents: about,products,press
```

### Investor Profile Focus
Prioritize investor-relevant content:
```
use_llm: false
priority_intents: about,investors,press,products
```

### Hiring & Culture Focus
Prioritize careers and culture content:
```
use_llm: false
priority_intents: about,careers,products,partners
```

## Expected Output

**Healthy result:**
- 60-80% of pages classified with confidence above 0.5
- 20-40% may be "other" or low-confidence (especially for sites with unusual URL structures)
- With LLM fallback enabled, "other" rate typically drops to 5-15%

**Output fields per page:**
- `url` -- the page URL (carried from input)
- `title` -- page title (carried from input)
- `text_content` -- full page text (carried through for downstream steps)
- `word_count` -- word count (carried from input if present)
- `page_intent` -- classified intent (one of the 12 categories above)
- `intent_confidence` -- confidence score 0-1 (higher = more certain)
- `intent_signals` -- array of strings explaining why this classification was chosen. Examples: `"url_path:about (/about-us)"`, `"title:press ("Press Release: Company Announces...")"`, `"content:careers (apply now, job description, requirements)"`, `"llm_override:products (was other @ 0.2)"`
- `entity_name` -- which company this page belongs to

**Sort order:** Pages are sorted per entity with priority intents first (in the order specified by `priority_intents`), then remaining pages by confidence descending.

**Summary line:** Shows classification breakdown, e.g.: "42 pages classified across 5 entities: 8 about, 12 products, 6 press, 4 blog_post, 3 careers, 2 contact, 7 other"

**Red flags to watch for:**
- Very high "other" rate (>50%) -- URL structures are non-standard; consider enabling LLM fallback
- Many pages with confidence below 0.3 -- heuristic signals are weak for these sites
- LLM failure rate above 10% -- check API key configuration or model availability

## Limitations & Edge Cases

- **Single-page applications** -- SPAs with hash-based routing (e.g., `example.com/#/about`) will not match URL patterns because the hash fragment is not sent to servers and may not appear in the scraped URL. Enable LLM fallback for these sites.
- **Non-English content** -- URL path patterns are English-only. A German site with `/ueber-uns/` will not match the `about` pattern. Content keyword density also uses English keywords. LLM fallback handles multilingual content better.
- **Multi-intent pages** -- Some pages serve multiple intents (e.g., an About page that includes job listings). The tagger assigns the single highest-scoring intent. The `intent_signals` array shows all detected signals so operators can review.
- **Heuristic confidence is relative** -- A confidence of 0.7 from URL+title matching is quite reliable. A confidence of 0.3 from content density alone is a weak signal. The signals array explains where confidence comes from.
- **LLM fallback uses only 500 characters** -- To keep costs low, only the first 500 characters of page content are sent to the LLM. Pages where the intent signal is buried deep in the content may still be misclassified.
- **No learning or feedback** -- The heuristic patterns are static. The module does not learn from operator corrections or accumulate data over time.

## What Happens Next

Tagged content enters the working pool with `page_intent`, `intent_confidence`, and `intent_signals` fields. These are consumed by:
- **content-analyzer (Step 5):** Weights information differently based on intent -- facts from About pages are more authoritative than mentions in blog posts
- **Adaptive page cap (future Step 4):** Ensures at least one page per critical intent survives the cap
- **content-writer (Step 5):** Can prioritize sources by intent when assembling the final profile

## Technical Reference

- **Step:** 4 (Filtering & Assembly)
- **Category:** filtering
- **Cost:** cheap (heuristic-first; LLM fallback opt-in and uses Haiku-class models)
- **Data operation:** transform (=) -- same items in, same items out, with `page_intent`, `intent_confidence`, and `intent_signals` added
- **Requires:** items with `text_content` or `url` fields
- **Input:** `input.entities[]` with `items[]` from the working pool
- **Output:** `results[]` grouped by `entity_name`, each with `items[]` containing all original fields plus intent classification fields
- **Selectable:** false -- classification is informational, not a keep/exclude decision
- **Dependencies:** `tools.logger`, `tools.progress` (always); `tools.ai` (only when `use_llm` is true)
- **Files:** `manifest.json`, `execute.js`, `README.md`, `CLAUDE.md`
