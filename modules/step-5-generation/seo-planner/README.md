# SEO Planner

> Keyword distribution planner with web-researched keyword data. Maps target keywords to predefined article sections, generates meta tags and FAQs.

**Module ID:** `seo-planner` | **Step:** 5 (Generation) | **Category:** planning | **Cost:** expensive
**Version:** 2.1.0 | **Data Operation:** add (➕)

---

## Background

### The Content Problem This Solves

Content-analyzer produced structured understanding - categories, tags, key facts. But structured data isn't a writing plan. Before writing 2,000 words, someone needs to decide: which keywords to target, where to place them, what questions to answer, and how to optimize the content for search engines.

Without an SEO plan, the content-writer has to make all these decisions simultaneously while also writing prose. That produces mediocre results - generic keyword usage, missed FAQ schema opportunities. Separating planning from writing lets each step focus on what it's best at.

The original Content Creation Master described this as Node 6b - Tone & SEO Plan:
- *"For each entity, produce: target keywords, slug suggestion, meta-title (<=60 chars), meta-description (150-160 chars)"*
- *"FAQ questions based on buyer intent and search patterns"*

### How It Fits the Pipeline Architecture

SEO Planner is the second submodule in Step 5's chain, sitting between analysis and writing:

```
content-analyzer (＝) -> seo-planner (➕) -> content-writer (➕)
```

It uses the **add (➕)** data operation - it chains from the working pool, finding content-analyzer output by the `source_submodule` field, and adds its own output alongside. After approval, the pool contains both analysis items and SEO plan items, distinguished by `source_submodule`.

This is the cheapest step in the chain. The input is just the analysis JSON (a few KB), not the full scraped text (50KB+). This makes it safe to re-run multiple times while iterating on keyword strategy without significant cost.

### v2.1.0: Prompt Coherence + Configurable Perplexity Model (2026-06-07)

v2.1.0 closes the half-migration left by v2.0.0. v2.0.0 swapped IN Perplexity keyword research but left the LLM prompt scaffolded as if a `keyword-summary.md` reference document were still the source. v2.1.0 makes the whole submodule coherent with the Perplexity-as-source design.

Changes:

1. **New `perplexity_model` option** — operators can choose between Perplexity's Sonar tiers without editing code:
   - `sonar` (default) — cheapest, fastest, basic search grounding
   - `sonar-pro` — better quality, more expensive
   - `sonar-reasoning` — chain-of-thought capable for complex queries
   - `sonar-reasoning-pro` — top-tier reasoning, highest cost
   
   Previously hardcoded to `sonar` in execute.js.

2. **Restructured `research_queries` default** — three queries are now explicitly labeled (Query 1 Core / Query 2 Competitor / Query 3 Real Questions) with B2B/audience inference, source URL requests, and a 3+3+3+3 forced split on Query 3 (definitional, comparison, operational, problem-framed). Previously: vague "include primary, long-tail, related" wording, asked Perplexity for "estimated search intent and competition level" (data Perplexity does not have — would be invented), allowed 8-12 questions (downstream uses exactly 5).

3. **Restructured main LLM prompt** — adds an upfront CRITICAL RULE section explicitly forbidding LLM training-data invention of keywords, with one defined exception (entity-name-prefixed long-tail constructions). Adds a section 7 CITATION rule that requires per-keyword provenance tags (Q1/Q2/Q3/analysis) for audit. Reinforces the FAQ rule to pick exactly 5 from Query 3's 12 verbatim, with a documented FAQ shortage warning if fewer are answerable.

4. **Added `keyword_sources` to the output schema** — alongside `target_keywords`, the LLM now records which query (Q1/Q2/Q3) each keyword came from. This lets us audit drift over time: if a keyword is tagged "analysis" or untagged, the LLM is falling back to its training data.

5. **Expanded warnings list** — added explicit categories: meta length problems, keyword gaps, FAQ shortage, research absence.

6. **Manifest metadata updates** — description now mentions Perplexity grounding; reference_docs description demotes `keyword-summary.md` to "fallback when keyword_research disabled" rather than primary input.

7. **Agnosticism polish (post-CTO review)** — four additional refinements before commit:
   - `keyword_sources` schema uses `Q<n> | analysis` notation (n = 1-based query number) rather than hardcoded Q1/Q2/Q3, so templates with non-default query counts (1-5 queries supported) audit correctly.
   - `usage_notes` cost claim shows range (defaults ~$0.025 to max ~$0.25/entity), not a single number that misleads operators choosing expensive Sonar tiers.
   - Exception clause for entity-specific long-tail keyword construction now includes consumer/comparison/podcast/news examples alongside B2B, so the rule reads as audience-agnostic rather than B2B-only.
   - **New explicit fallback instruction in the INPUTS section** — when `{keyword_research}` arrives empty (Perplexity failed, timed out, or was disabled), the LLM is now instructed to emit a HIGH-PRIORITY warning to the output, tag all keywords as `analysis` in `keyword_sources`, and NOT silently produce a plan as if research succeeded. This makes silent Perplexity failures loud and operator-visible. Confirmed needed by the Pronet Gaming + Wazdan v2.0.0 baseline run (2026-06-07 run aa81daa2) which fell through to the empty-research fallback without any clear signal to operators that research had not actually fired.

### v2.0.0: Keyword Research Pre-Step via Perplexity Sonar

v2.0.0 adds a web research step that runs **before** the SEO planning LLM call. Instead of relying on general LLM knowledge to select keywords, the module now:

1. Runs 1–5 configurable search queries via the Perplexity Sonar API
2. Synthesizes the results into a structured keyword research block
3. Injects that block into the planning prompt as `{keyword_research}`

This replaces manually uploaded `keyword-summary.md` reference docs and eliminates the need for expensive tools like Ahrefs. The planning LLM now works from actual search data rather than guessing.

The three default queries cover: primary search demand, top-ranking competitor articles, and People Also Ask signals. All queries support `{entity_name}` and `{entity_context}` placeholders.

**Cost note:** Perplexity Sonar API charges per request (~$0.005 each). Three queries per entity = ~$0.015/entity. At 100 entities, that's $1.50 for keyword research. Toggle `keyword_research: false` to skip for batches where cost matters.

### v1.3.0: Keyword Distribution Only

In v1.3.0, the SEO planner's role was clarified: it produces a **keyword distribution plan** only. It does NOT define article structure - that is fixed in `format_spec.md`. The planner maps which keywords should appear in which predefined sections (overview, categories, tags, credentials, FAQ).

This prevents the problem of two competing structures - an outline from the planner vs a format spec for the writer - which caused the content-writer to produce inconsistent results.

### Why Planning Before Writing Matters

The split between planning and writing exists for three reasons:

1. **Human checkpoint** - An editor can review and adjust keywords and meta tags before the expensive writing step. Changing a keyword costs nothing; regenerating an article costs $0.10+
2. **SEO quality** - Keyword research requires different thinking than prose writing. An LLM given both tasks at once tends to sacrifice one for the other
3. **Reusability** - The same SEO plan can feed different content-writer configurations (different tones, different formats) without re-planning

### Reference Documents for SEO Planning

The doc_selector option is valuable here for keyword packs - CSV or markdown files listing target keywords, search volumes, and competition levels. With a keyword pack, the LLM selects from known high-value terms rather than guessing. Without one, keyword selection is based on the LLM's general SEO knowledge, which is decent but not data-driven.

Other useful reference docs: format_spec.md (defines the fixed section structure), tone_guide.md (voice rules), competitor keyword analyses.

## Strategy & Role

**Why this module exists:** Transform company analysis into an actionable SEO keyword plan. The plan bridges the gap between understanding a company (analysis) and writing about it (content-writer).

**Role in the pipeline:** Second submodule in Step 5's chain. Receives analysis, produces keyword distribution that content-writer follows.

**Relationship to other submodules:**
- **Receives from content-analyzer:** analysis_json with categories, tags, key facts
- **Feeds into content-writer:** seo_plan_json with keywords per section, meta tags, FAQs
- **Does NOT access scraped text** - works purely from the structured analysis. This keeps it cheap and fast
- **Does NOT define article structure** - structure is fixed in format_spec.md

## When to Use

**Always use when:**
- Building SEO-optimized content of any kind
- You want human review of keywords/meta before expensive writing

**Consider settings carefully when:**
- Using keyword packs - ensures the LLM picks from your researched keywords rather than guessing
- FAQ questions matter for schema markup

**Can skip when:**
- Writing non-SEO content (internal reports, emails)
- Content-writer is given a very specific prompt that already includes keyword guidance

**Can use without content-writer for:**
- Generating content briefs for human writers
- Keyword planning for manual content creation
- SEO audits - compare planned vs actual keyword usage

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `keyword_research` | true | Set false to skip web research and reduce cost/latency | When true, runs Perplexity Sonar queries before the planning LLM call |
| `search_provider` | perplexity | Only `perplexity` supported in v2.0.0 | Controls which search API is used for keyword research |
| `research_queries` | (3 default queries) | Customize for specific industries, pipelines, or entity types | One query per line. Supports `{entity_name}` and `{entity_context}` placeholders. ≤5 queries recommended |
| `prompt` | (SEO planning template) | Customize when you need different keyword strategies or industry-specific SEO patterns | The full LLM instruction. Uses `{entity_content}` for analysis JSON, `{keyword_research}` for research results, and `{doc:filename}` for reference docs |
| `reference_docs` | (none) | Upload format spec, tone guide, or supplemental keyword data | Selected docs injected into prompt at `{doc:filename}` placeholders |
| `ai_model` | haiku | Haiku for quick planning iterations. Sonnet for production | Planning is less sensitive to model quality than analysis or writing |
| `ai_provider` | anthropic | Switch for model comparison | Which API to call |

## Recipes

### Standard SEO Plan (v2.0.0 default)
Web-researched keywords + AI planning:
```
keyword_research: true
search_provider: perplexity
ai_model: haiku
reference_docs: [tone_guide.md, format_spec.md]
```
Keyword packs (`keyword-summary.md`) are no longer needed — Perplexity replaces them.

### High-Quality Plan
More capable model + web research:
```
keyword_research: true
ai_model: sonnet
reference_docs: [tone_guide.md, format_spec.md]
```

### Fast/Cheap Plan (no web research)
Skip Perplexity for batch processing where cost matters:
```
keyword_research: false
ai_model: haiku
reference_docs: [keyword-summary.md, format_spec.md]
```
Upload a `keyword-summary.md` to compensate when `keyword_research` is off.

### Custom Research Queries
For review article pipelines (category-level research):
```
keyword_research: true
research_queries:
  What do iGaming operators search when comparing {entity_name} providers?
  What keywords do top-ranking {entity_context} comparison articles target?
  People Also Ask questions for '{entity_name}' in iGaming?
```

## Expected Output

**Healthy result:**
- One SEO plan per entity
- Primary keyword + 2-4 secondary + 3-5 long-tail keywords per entity
- Keyword distribution mapping keywords to predefined sections (overview, categories, tags, credentials, FAQ)
- Meta title <=60 characters, meta description 150-160 characters
- 5 FAQ questions that reflect buyer intent

**Output fields per entity:**
- `entity_name` - company name
- `status` - `planned` or `error`
- `primary_keyword` - the top target keyword
- `keyword_plan_preview` - summary of keyword distribution (e.g., "3 categories, 4 tags, 12 unique keywords")
- `meta_title` - proposed meta title
- `faq_count` - number of FAQs generated
- `seo_plan_json` - the full structured SEO plan (carried to pool for content-writer)

**Detail view sections:** target keywords (text), keyword distribution (prose), meta tags (text), FAQs (prose), tone notes (text), warnings (text)

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
- Maps keywords to predefined sections from format_spec.md
- Does NOT define article structure or headings
- `category_slug` and `category_tier` link back to the analyzer's classification
- Primary categories appear first, then secondary
- Each FAQ includes a `target_keyword` for long-tail SEO

**Validation warnings (non-fatal):**
- Meta title > 60 characters - will be truncated in search results. Flagged in output but doesn't fail
- Meta description outside 150-160 range - suboptimal for SERP display. Flagged but doesn't fail
- These warnings appear in the detail view's Warnings section so the operator can adjust before approving

**Red flags to watch for:**
- Generic keywords (e.g., "online gaming") - LLM didn't have enough specificity from analysis
- FAQ questions that are too broad - may not capture buyer intent. Keyword pack helps here
- Missing keyword distribution for important categories - planner may have skipped them

## Limitations & Edge Cases

- **No search volume data** - Perplexity Sonar returns qualitative keyword research (PAA questions, competitor coverage) but not numeric search volume or competition scores. For volume data, supplement with an Ahrefs/SEMrush reference doc
- **Research query failures don't fail the module** - Individual query failures are caught and logged. If all queries fail, the module falls back to `keyword-summary.md` (if uploaded) or proceeds with no keyword data. Check logs if results look generic
- **≤5 queries recommended** - More queries are allowed but multiply cost linearly. The module logs a warning if >5 queries are configured
- **Meta length validation is soft** - The module warns about meta title/description lengths but doesn't force compliance. Some LLMs consistently produce titles slightly over 60 characters
- **Language-specific SEO** - Default prompt assumes English SEO conventions. Other languages have different title length norms, keyword patterns, and FAQ structures
- **No duplicate keyword detection** - If multiple companies in the same run target the same keywords, the planner doesn't coordinate. Each entity is planned independently

## What Happens Next

After the user reviews and approves the SEO plan, items enter the working pool with `source_submodule: "seo-planner"`. The pool now contains both content-analyzer items and seo-planner items for each entity.

**Content-writer** picks up both, plus the original scraped source content. The analysis provides facts, the SEO plan provides keywords, and the source content provides raw material for detailed prose. Content-writer places the specified keywords in the specified sections, writes to the format spec, and answers the FAQs.

The user can re-run seo-planner with different settings (different keyword pack) without re-running the analyzer. This is the cheapest step in the chain, so iteration here costs very little.

## Technical Reference

- **Step:** 5 (Generation)
- **Category:** planning
- **Cost:** expensive (30 min timeout — includes Perplexity research calls + planning LLM call per entity)
- **Data operation:** add (➕) - chains from working pool, finds content-analyzer items by source_submodule
- **Requires:** `entity_name` in input items; `analysis_json` from content-analyzer
- **Input:** Content-analyzer output from working pool (found via `source_submodule === 'content-analyzer'`)
- **Output:** `results[]` grouped by `entity_name`, one item per entity containing flattened display fields + `seo_plan_json` object
- **Display type:** cards (not table) - one card per entity with expandable detail modal
- **Selectable:** true - operators approve/reject entire entity SEO plan
- **Detail view:** `detail_schema` with header (entity_name, status as badge, primary_keyword, faq_count) and sections (keywords_text, keyword_distribution_text as prose, meta_text, faqs_text as prose, tone_notes, warnings, error)
- **Error handling:** Missing analysis input, LLM failures, JSON parse errors handled per-entity. Entities without content-analyzer items get clear error: "No content-analyzer output found. Run content-analyzer first."
- **Dependencies:** `tools.ai` (LLM calls + Perplexity Sonar for keyword research), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
