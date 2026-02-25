# SEO Planner

> Keyword distribution planner. Maps target keywords to predefined article sections, generates meta tags and FAQs.

**Module ID:** `seo-planner` | **Step:** 5 (Generation) | **Category:** planning | **Cost:** medium
**Version:** 1.3.0 | **Data Operation:** add (➕)

---

## Background

### The Content Problem This Solves

Content-analyzer produced structured understanding — categories, tags, key facts. But structured data isn't a writing plan. Before writing 2,000 words, someone needs to decide: which keywords to target, where to place them, what questions to answer, and how to optimize the content for search engines.

Without an SEO plan, the content-writer has to make all these decisions simultaneously while also writing prose. That produces mediocre results — generic keyword usage, missed FAQ schema opportunities. Separating planning from writing lets each step focus on what it's best at.

The original Content Creation Master described this as Node 6b — Tone & SEO Plan:
- *"For each entity, produce: target keywords, slug suggestion, meta-title (≤60 chars), meta-description (150-160 chars)"*
- *"FAQ questions based on buyer intent and search patterns"*

### How It Fits the Pipeline Architecture

SEO Planner is the second submodule in Step 5's chain, sitting between analysis and writing:

```
content-analyzer (＝) → seo-planner (➕) → content-writer (➕)
```

It uses the **add (➕)** data operation — it chains from the working pool, finding content-analyzer output by the `source_submodule` field, and adds its own output alongside. After approval, the pool contains both analysis items and SEO plan items, distinguished by `source_submodule`.

This is the cheapest step in the chain. The input is just the analysis JSON (a few KB), not the full scraped text (50KB+). This makes it safe to re-run multiple times while iterating on keyword strategy without significant cost.

### v1.3.0: Keyword Distribution Only

In v1.3.0, the SEO planner's role was clarified: it produces a **keyword distribution plan** only. It does NOT define article structure — that is fixed in `format_spec.md`. The planner maps which keywords should appear in which predefined sections (overview, categories, tags, credentials, FAQ).

This prevents the problem of two competing structures — an outline from the planner vs a format spec for the writer — which caused the content-writer to produce inconsistent results.

### Why Planning Before Writing Matters

The split between planning and writing exists for three reasons:

1. **Human checkpoint** — An editor can review and adjust keywords and meta tags before the expensive writing step. Changing a keyword costs nothing; regenerating an article costs $0.10+
2. **SEO quality** — Keyword research requires different thinking than prose writing. An LLM given both tasks at once tends to sacrifice one for the other
3. **Reusability** — The same SEO plan can feed different content-writer configurations (different tones, different formats) without re-planning

### Reference Documents for SEO Planning

The doc_selector option is valuable here for keyword packs — CSV or markdown files listing target keywords, search volumes, and competition levels. With a keyword pack, the LLM selects from known high-value terms rather than guessing. Without one, keyword selection is based on the LLM's general SEO knowledge, which is decent but not data-driven.

Other useful reference docs: format_spec.md (defines the fixed section structure), tone_guide.md (voice rules), competitor keyword analyses.

## Strategy & Role

**Why this module exists:** Transform company analysis into an actionable SEO keyword plan. The plan bridges the gap between understanding a company (analysis) and writing about it (content-writer).

**Role in the pipeline:** Second submodule in Step 5's chain. Receives analysis, produces keyword distribution that content-writer follows.

**Relationship to other submodules:**
- **Receives from content-analyzer:** analysis_json with categories, tags, key facts
- **Feeds into content-writer:** seo_plan_json with keywords per section, meta tags, FAQs
- **Does NOT access scraped text** — works purely from the structured analysis. This keeps it cheap and fast
- **Does NOT define article structure** — structure is fixed in format_spec.md

### Critical Rule: Keyword Distribution Must Follow Analyzer Categories

The SEO planner does NOT invent its own topical structure. The content-analyzer decides what categories and tags a company belongs to. The SEO planner's keyword distribution must include keywords for **every category** from the analysis (primary and secondary) plus keywords for major tags.

This prevents the problem of two competing structures — a topical outline from the planner vs category sections from the analyzer — which causes the content-writer to duplicate content and overshoot word targets.

## When to Use

**Always use when:**
- Building SEO-optimized content of any kind
- You want human review of keywords/meta before expensive writing

**Consider settings carefully when:**
- Using keyword packs — ensures the LLM picks from your researched keywords rather than guessing
- FAQ questions matter for schema markup

**Can skip when:**
- Writing non-SEO content (internal reports, emails)
- Content-writer is given a very specific prompt that already includes keyword guidance

**Can use without content-writer for:**
- Generating content briefs for human writers
- Keyword planning for manual content creation
- SEO audits — compare planned vs actual keyword usage

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `prompt` | (SEO planning template) | Customize when you need different keyword strategies or industry-specific SEO patterns | The full LLM instruction. Uses `{entity_content}` for analysis JSON and `{doc:filename}` for reference docs |
| `reference_docs` | (none) | Upload keyword packs, format spec, tone guide. Keyword packs are most impactful here | Selected docs injected into prompt at `{doc:filename}` placeholders |
| `ai_model` | haiku | Haiku for quick planning iterations. Sonnet for production. Opus rarely needed for planning | Planning is less sensitive to model quality than analysis or writing |
| `ai_provider` | anthropic | Switch for model comparison | Which API to call |

## Recipes

### Standard SEO Plan
Balanced for typical company profiles:
```
ai_model: haiku
reference_docs: [keyword-summary.md, tone_guide.md, format_spec.md]
```

### Quick Brief for Human Writers
Generate keywords + meta for handoff:
```
ai_model: haiku
reference_docs: [keyword-summary.md, format_spec.md]
```

### High-Quality Plan
Maximum keyword research quality:
```
ai_model: sonnet
reference_docs: [keyword-summary.md, tone_guide.md, format_spec.md]
```

## Expected Output

**Healthy result:**
- One SEO plan per entity
- Primary keyword + 2–4 secondary + 3–5 long-tail keywords per entity
- Keyword distribution mapping keywords to predefined sections (overview, categories, tags, credentials, FAQ)
- Meta title ≤60 characters, meta description 150–160 characters
- 5 FAQ questions that reflect buyer intent

**Output fields per entity:**
- `entity_name` — company name
- `status` — `planned` or `error`
- `primary_keyword` — the top target keyword
- `keyword_plan_preview` — summary of keyword distribution (e.g., "3 categories, 4 tags, 12 unique keywords")
- `meta_title` — proposed meta title with character count
- `faq_count` — number of FAQs generated
- `seo_plan_json` — the full structured SEO plan (carried to pool for content-writer)

**The seo_plan_json structure:**
```json
{
  "target_keywords": {
    "primary": "geolocation verification for iGaming",
    "secondary": ["GPS spoofing detection", "clone app fraud prevention", "GLI certified geolocation"],
    "long_tail": ["geolocation compliance for sports betting operators", "GLI certified location verification solutions"]
  },
  "keyword_distribution": {
    "overview": {
      "headline_keywords": ["geolocation verification for iGaming"],
      "body_keywords": ["iGaming geolocation provider", "location intelligence"]
    },
    "categories": [
      {
        "category_slug": "fraud-prevention",
        "category_tier": "primary",
        "heading_keywords": ["fraud prevention solutions"],
        "body_keywords": ["clone app fraud prevention", "GPS spoofing detection"]
      },
      {
        "category_slug": "kyc-services",
        "category_tier": "secondary",
        "heading_keywords": ["KYC services"],
        "body_keywords": ["geolocation KYC compliance"]
      }
    ],
    "tags": [
      {
        "tag_slug": "gli-certified",
        "keywords": ["GLI certified geolocation", "GLI control assessment"]
      }
    ],
    "credentials": {
      "keywords": ["GLI certified", "independently validated"]
    },
    "faq": {
      "keywords": ["geolocation compliance for sports betting operators"]
    }
  },
  "meta": {
    "title": "Bespot: GLI-Certified Geolocation & Fraud Prevention",
    "title_chars": 52,
    "description": "Athens-based geolocation provider offering GLI-certified verification, clone app detection, and GPS spoofing prevention for iGaming operators.",
    "description_chars": 148
  },
  "faqs": [
    {
      "question": "What is GLI certification and why does it matter for geolocation verification?",
      "answer_brief": "Explain GLI assessment, what it validates, why operators need it for licensing",
      "target_keyword": "GLI certified geolocation"
    },
    {
      "question": "How does Bespot detect clone app fraud in iGaming?",
      "answer_brief": "Cover Gatekeeper's detection methods: app signatures, device fingerprinting, behavioral analysis",
      "target_keyword": "clone app fraud prevention"
    }
  ],
  "tone_notes": "Authoritative B2B tone for compliance professionals. Emphasize technical capabilities and regulatory validation. Avoid marketing hype.",
  "warnings": []
}
```

**Key points about the keyword distribution:**
- Maps keywords to predefined sections from format_spec.md — does NOT define article structure
- `category_slug` and `category_tier` link back to the analyzer's classification
- Primary categories appear first, then secondary
- Each FAQ includes `answer_brief` (direction for writer) and `target_keyword` (long-tail SEO)

**Validation warnings (non-fatal):**
- Meta title > 60 characters → will be truncated in search results. Flag in output but don't fail
- Meta description outside 150–160 range → suboptimal for SERP display. Flag but don't fail
- These warnings appear in the output so the operator can adjust before approving

**Red flags to watch for:**
- Generic keywords (e.g., "online gaming") → LLM didn't have enough specificity from analysis. Check if analysis has sufficient detail
- FAQ questions that are too broad → may not capture buyer intent. Keyword pack helps here
- Missing keyword distribution for important categories → planner may have skipped them
- Duplicate keywords across sections → keyword cannibalization risk

## Limitations & Edge Cases

- **No real keyword data** — The LLM selects keywords based on general SEO knowledge, not actual search volume data. Keyword packs as reference docs partially solve this, but the module doesn't query Google Search Console or Ahrefs
- **Meta length validation is soft** — The module warns about meta title/description lengths but doesn't force compliance. Some LLMs consistently produce titles slightly over 60 characters
- **FAQ quality varies** — Without keyword pack context, FAQs may be generic. With keyword pack, they're more targeted but still may not match actual search queries
- **Language-specific SEO** — Default prompt assumes English SEO conventions. Other languages have different title length norms, keyword patterns, and FAQ structures
- **No duplicate keyword detection** — If multiple companies in the same run target the same keywords, the planner doesn't coordinate. Each entity is planned independently
- **Category coverage** — With many categories (6+), keyword distribution may become thin for each section. Review keyword counts per category

## What Happens Next

After the user reviews and approves the SEO plan, items enter the working pool with `source_submodule: "seo-planner"`. The pool now contains both content-analyzer items and seo-planner items for each entity.

**Content-writer** picks up both, plus the original scraped source content. The analysis provides facts, the SEO plan provides keywords, and the source content provides raw material for detailed prose. Content-writer places the specified keywords in the specified sections, writes to the format spec, and answers the FAQs.

The user can re-run seo-planner with different settings (different keyword pack) without re-running the analyzer. This is the cheapest step in the chain, so iteration here costs very little.

## Technical Reference

- **Step:** 5 (Generation)
- **Category:** planning
- **Cost:** medium
- **Data operation:** add (➕) — chains from working pool, finds content-analyzer items by source_submodule
- **Requires:** `entity_name` fields in input items
- **Input:** Content-analyzer output from working pool (found via `source_submodule === 'content-analyzer'`)
- **Output:** `results[]` grouped by `entity_name`, one item per entity containing flattened display fields + `seo_plan_json` object
- **Selectable:** true — operators approve/reject entire entity SEO plan
- **Detail view:** `detail_schema` with header (entity_name, status as badge, primary_keyword, faq_count) and sections (keywords_text, keyword_distribution_text as prose, meta_text, faqs_text as prose, tone_notes, warnings, error)
- **Error handling:** Missing analysis input, LLM failures, JSON parse errors handled per-entity. Entities without content-analyzer items get clear error: "No content-analyzer output found. Run content-analyzer first."
- **Dependencies:** `tools.ai` (LLM calls), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
