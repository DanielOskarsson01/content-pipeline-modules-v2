# Content Analyzer

> Structural fact extraction from scraped content. Classifies into categories, assigns tags, extracts key facts, and maps source citations.

**Module ID:** `content-analyzer` | **Step:** 5 (Generation) | **Category:** analysis | **Cost:** expensive
**Version:** 1.3.0 | **Data Operation:** transform (＝)

---

## Background

### The Content Problem This Solves

After Steps 1-4, the pipeline has scraped, validated, and filtered pages - real text from real websites. But raw text is not structured knowledge. A company's About page, Products page, and Press page each contain fragments of information. No single page tells the full story. Before writing a profile, the system needs to *understand* the company: what it does, who it serves, how it positions itself, and what makes it different.

The original Content Creation Master described this as Node 6a - Analysis & Classification:
- *"Multi-source synthesis - cross-reference About, Products, Press, Partners pages"*
- *"Extract: primary/secondary categories, tags, USPs, founding year, HQ, employee count"*
- *"Every claim must cite which source URL it came from"*

This module is the first LLM-powered step in the pipeline. It reads all scraped pages for a company, sends them to an AI model, and gets back structured analysis JSON. This analysis becomes the foundation for everything downstream - SEO planning and content writing both depend on the quality of analysis here.

### How It Fits the Pipeline Architecture

This is the first shape change in the pipeline. Steps 1-4 all work with URL-shaped items (many items per entity). Content-analyzer collapses those into one analysis per entity - a fundamentally different output shape.

The Strategic Architecture describes this transition:
> *"Step 5 is where raw data becomes structured understanding. The input is many pages per company; the output is one structured profile per company."*

Content-analyzer uses the **transform (＝)** data operation - it reads from the Step 4 pool independently (not chaining from a previous Step 5 submodule) and produces fresh output. The user reviews the analysis before it feeds into seo-planner.

### Why Three Separate Submodules (Not One)

The analysis - planning - writing chain could be one monolithic step. Splitting it into three gives:

- **Human review at each stage** - catch wrong categories before they become wrong keywords before they become wrong articles
- **Reusability** - content-analyzer works alone for tagging projects (no writing needed), seo-planner + content-writer work without analyzer for topics where analysis comes from elsewhere
- **Cost control** - run the cheap planner multiple times to iterate on keyword strategy without re-running the expensive analyzer
- **Debugging** - when output is wrong, you know exactly which stage introduced the error

### The LLM Cost Reality

Content-analyzer is classified as **expensive** because it sends the full scraped text of every page to the LLM. For a company with 10 pages averaging 2,000 words each, that's 20,000 words of input per entity. With Sonnet, that's roughly $0.06-0.12 per company depending on output length.

The `max_content_chars` option exists specifically for cost control. At the default 200,000 characters (~33,000 words), even large companies fit comfortably. Companies with very long pages may need higher limits (up to 500,000), but the cost scales linearly. For cost-sensitive draft runs, lower to 30,000-50,000.

### Reference Documents

Content-analyzer supports **reference documents** via the doc_selector option. The most important reference docs are:

- **master_categories.md** - Defines the fixed taxonomy (~80 categories with slugs, names, and descriptions). The analyzer MUST only assign categories from this list.
- **master_tags.md** - Defines available tags (~300 tags with slugs). The analyzer assigns from this list but may also suggest new tags for USPs not covered.

Other useful reference docs: classification guidelines, industry glossaries. These are project-level assets - upload once, use across every run.

### Critical Rules

**Output is structured JSON only** - not prose, not an article, not markdown. The analyzer extracts and classifies. The SEO planner and content writer handle planning and writing respectively.

**No summaries, opinions, or marketing prose.** v1.3.0 made this explicit: the analyzer is a "classification and fact-extraction machine." It does not produce summaries, differentiators lists, or target audience descriptions. Those are editorial judgements that belong in the writing step.

**Categories are a fixed taxonomy.** The analyzer assigns only from master_categories.md. It does NOT suggest new categories.

**Tags can be suggested.** If the analyzer identifies a USP not covered by existing tags, it may suggest new tags flagged as `"suggested_new"` for editorial review.

## Strategy & Role

**Why this module exists:** Transform raw scraped text into structured company understanding. This is the bridge between having pages (Step 4) and having knowledge (Step 5+). Every downstream content step depends on the accuracy of analysis here.

**Role in the pipeline:** First submodule in Step 5's three-part chain. Produces the foundational analysis that seo-planner and content-writer build upon.

**Relationship to other submodules:**
- **Receives from Step 4 pool:** Filtered scraped pages with text_content, title, word_count, url
- **Feeds into seo-planner:** Structured analysis_json (categories, tags, key facts, source citations)
- **Feeds into content-writer:** Same analysis_json (alongside seo-planner output and scraped source content)
- **Quality here determines quality everywhere downstream:** Wrong categories -> wrong keywords -> wrong article structure

## When to Use

**Always use when:**
- Building company profiles from scraped content
- You need structured categorization and fact extraction before writing

**Consider settings carefully when:**
- Companies have many pages (15+) - may exceed max_content_chars, prioritize About/Products pages
- Using reference docs - ensure master_categories.md matches your taxonomy
- Cost-sensitive runs - use Haiku for drafts, Sonnet/Opus for final analysis

**Can use standalone (without seo-planner/content-writer) for:**
- Bulk categorization of companies
- Tag assignment and taxonomy mapping
- Fact extraction for databases

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `prompt` | (analysis template) | Customize when your taxonomy differs from default, or when you need different output fields | The full LLM instruction. Uses `{entity_content}` for scraped pages and `{doc:filename}` for reference docs |
| `reference_docs` | (none) | Always upload master_categories.md at minimum. Add master_tags.md, classification guidelines as needed | Selected docs are injected into the prompt where `{doc:filename}` placeholders appear |
| `ai_model` | haiku | Haiku is fast and cheap for structured extraction. Use Sonnet for higher accuracy on complex companies. Opus rarely needed for extraction | Quality vs cost tradeoff. Haiku is the recommended default for structured extraction |
| `ai_provider` | anthropic | Switch to openai if you prefer GPT models or want to compare outputs | Which API to call |
| `max_content_chars` | 200,000 | Lower to 30-50k for cost control on simple companies. Raise to 300-500k for companies with many long pages | Truncates assembled source text. 200k ~ 33,000 words, enough for most companies |

## Recipes

### Standard Analysis
Balanced for most companies:
```
ai_model: haiku
ai_provider: anthropic
max_content_chars: 200000
reference_docs: [master_categories.md, master_tags.md]
```

### Quick Draft Analysis
Fast iteration, check categories before committing:
```
ai_model: haiku
ai_provider: anthropic
max_content_chars: 50000
reference_docs: [master_categories.md, master_tags.md]
```

### Deep Analysis (complex companies)
For companies with many products/brands/subsidiaries:
```
ai_model: sonnet
ai_provider: anthropic
max_content_chars: 300000
reference_docs: [master_categories.md, master_tags.md]
```

### Categorization Only
When you only need categories, not full analysis:
```
ai_model: haiku
ai_provider: anthropic
max_content_chars: 50000
prompt: (modified to only return categories section)
reference_docs: [master_categories.md]
```

## Expected Output

**Healthy result:**
- One analysis item per entity (company)
- All fields populated - categories, tags, key_facts
- Source citations mapping claims to source URLs/titles
- Primary category assigned for 95%+ of entities
- All categories from master list only - no invented categories
- Output is valid JSON - not prose, not markdown, not an article

**Output fields per entity:**
- `entity_name` - company name (carried from input)
- `status` - `analyzed` or `error`
- `primary_category` - comma-joined primary category slugs
- `tags_preview` - comma-joined tag slugs (first 5, with count of remaining)
- `facts_preview` - human-readable key facts summary (e.g., "Est. 2015 . Malta . ~200 employees")
- `word_count` - total source words analyzed
- `model_used` - which AI model was used (e.g., "anthropic/haiku")
- `analysis_json` - the full structured analysis object (carried to pool for downstream submodules)

**Detail view sections:** categories (text), tags (text), key facts (prose), source citations (text)

**The analysis_json structure:**
```json
{
  "categories": {
    "primary": [
      {"slug": "fraud-prevention", "why": "Core product is a fraud detection platform", "source": "https://example.com/about"}
    ],
    "secondary": [
      {"slug": "kyc-services", "why": "Location verification contributes to KYC workflows", "source": "https://example.com/products"}
    ]
  },
  "tags": {
    "existing": [
      {"slug": "ai-powered", "why": "Shortlisted in AI Solutions category"},
      {"slug": "gdpr-compliant", "why": "Privacy policy confirms GDPR compliance"}
    ],
    "suggested_new": [
      {"label": "clone-app-detection", "why": "Unique USP not covered by existing tags", "evidence": ["https://example.com/gatekeeper"]}
    ]
  },
  "key_facts": {
    "founded": null,
    "headquarters": "Athens, Greece",
    "employees": null,
    "key_people": [
      {"name": "Spiros Tassis", "role": "Data Protection Officer", "source": "https://example.com/privacy"}
    ],
    "licenses": [
      {"detail": "GLI Control Assessment — Blueprint and Gatekeeper solutions", "source": "https://example.com/press/gli"}
    ],
    "awards": [
      {"detail": "EGR B2B Awards 2025 — AI Solutions Supplier (shortlisted)", "source": "https://egr.global/awards"}
    ],
    "partnerships": [
      {"detail": "Gaming Laboratories International (GLI) — certification partner", "source": "https://example.com/press/gli"}
    ],
    "offices": ["Athens, Greece"],
    "contact": {
      "email": "info@example.com",
      "phone": null,
      "website": "https://example.com"
    }
  },
  "source_citations": [
    {"index": 1, "url": "https://example.com/about", "title": "About Us"},
    {"index": 2, "url": "https://example.com/press/gli", "title": "GLI Certification Announcement"}
  ]
}
```

**Red flags to watch for:**
- Empty categories - reference doc may not have been selected, or company pages lack clear positioning
- No source citations - LLM may be hallucinating facts. Check analysis_json against scraped content
- Categories not in master list - prompt is wrong, LLM ignored the fixed taxonomy constraint
- Many suggested_new tags - company may have niche offerings. Review for taxonomy gaps
- Output is prose instead of JSON - prompt is wrong, LLM wrote an article instead of analyzing

## Limitations & Edge Cases

- **Token limits** - Very large companies with 20+ long pages may exceed model context. max_content_chars prevents crashes but means some pages are truncated
- **Hallucination risk** - LLMs can infer facts not present in source text (e.g., guessing founding year from domain age). Source citations help catch this, but human review is essential
- **Category quality depends on reference doc** - Without master_categories.md, the LLM invents its own taxonomy. Garbage taxonomy in -> garbage categories out
- **Fixed taxonomy means missed companies** - If a company's core business doesn't match any of the ~80 categories, it will only get secondary assignments or no categories at all. Expand the taxonomy manually rather than letting the AI create one-off categories
- **Single-language assumption** - The default prompt is in English and expects English-language source text. Non-English companies may need a modified prompt
- **No cross-entity intelligence** - Each company is analyzed independently. The model doesn't know what categories other companies received, so consistency depends on the reference doc
- **JSON parse fragility** - LLMs occasionally return malformed JSON. The module handles markdown code fence wrapping but deeply malformed responses fail with raw_response included for debugging

## What Happens Next

After the user reviews and approves the analysis, items enter the working pool with `source_submodule: "content-analyzer"`. These are picked up by **seo-planner**, which uses the analysis_json to plan keyword distribution, meta tags, and FAQs. The user reviews the SEO plan, then **content-writer** uses the analysis, SEO plan, and the original scraped source content to write the full company profile.

The analysis_json is the single source of truth for downstream submodules. If a category is wrong here, it propagates through the entire chain. This is why human review at this stage is critical - it's cheaper to fix a category assignment than to regenerate an entire article.

## Technical Reference

- **Step:** 5 (Generation)
- **Category:** analysis
- **Cost:** expensive
- **Data operation:** transform (＝) - reads Step 4 pool independently, produces analysis per entity
- **Requires:** `text_content`, `entity_name` fields in input items
- **Input:** `input.entities[]` with `items[]` from Step 4 working pool (scraped pages grouped by entity)
- **Output:** `results[]` grouped by `entity_name`, one item per entity containing flattened display fields + `analysis_json` object
- **Display type:** cards (not table) - one card per entity with expandable detail modal
- **Selectable:** true - operators approve/reject entire entity analysis
- **Detail view:** `detail_schema` with header (entity_name, status as badge, primary_category, model_used) and sections (categories_text, tags_text, key_facts_text as prose, source_citations_text, error)
- **Error handling:** LLM failures, JSON parse errors, and missing input are handled per-entity (partial success pattern). Failed entities include error message and raw LLM response
- **Dependencies:** `tools.ai` (LLM calls), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
