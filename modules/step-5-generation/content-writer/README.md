# Content Writer

> Write content using analysis data, optional SEO plan, and scraped source content.

**Module ID:** `content-writer` | **Step:** 5 (Generation) | **Category:** generation | **Cost:** expensive
**Version:** 1.6.2 | **Data Operation:** add (➕)

> **⚠ PROSE FLOOR — minimum model for shipped prose: opus.** sonnet reads acceptably but writes poorly (per Daniel + three external reviews, 2026-07-14). haiku is drafts only; sonnet is acceptable for internal drafts and for the QA-retry mechanics, but NOT for published output. Any template shipping haiku or sonnet prose to publication is below the floor. `max_tokens` stays 32,768 (the manifest max) to cover the invisible adaptive-thinking tokens opus/sonnet spend before writing — see the manifest `usage_notes`.

---

## Background

### The Content Problem This Solves

The pipeline now has structured understanding (content-analyzer) and a keyword plan (seo-planner). What's missing is the actual writing. Content-writer is the final production step - it takes facts, keywords, and raw source material and produces a publishable company profile.

This is the most visible output of the entire pipeline. Everything upstream - URL discovery, scraping, filtering, analysis, SEO planning - exists to make this step produce good articles. A 2,000-word company profile that reads well, ranks well, cites sources, and doesn't hallucinate is the deliverable.

The original Content Creation Master described this as Node 6c - Draft Creation:
- *"Produce full draft profile in Markdown with proper heading hierarchy"*
- *"Each factual claim must cite the source URL"*
- *"Follow the format spec section structure"*
- *"Tone: authoritative B2B, benefit-first, not promotional"*

### How It Fits the Pipeline Architecture

Content-writer is the third and final submodule in Step 5's chain:

```
content-analyzer (＝) -> seo-planner (➕) -> content-writer (➕)
```

It uses the **add (➕)** data operation - it chains from the working pool, finding content-analyzer items (required) and seo-planner items (optional) by their `source_submodule` fields, plus the original scraped source content. The analysis provides structure, the SEO plan (when present) provides keywords, and the source content provides raw material for specific, detailed prose. If seo-planner has not run, the writer warns and proceeds without the SEO plan section.

This is the most expensive individual LLM call in the pipeline. The prompt includes the full analysis JSON, the full SEO plan, scraped source content, and potentially multiple reference documents (tone guide, format spec). With Sonnet, expect $0.08-0.15 per company depending on article length and input size.

### v1.4.0: Optional SEO Plan

In v1.4.0, the seo-planner dependency was made optional. The writer accepts up to **three inputs**:

1. **Analysis** (from content-analyzer, required) - tells the writer WHAT to write about
2. **SEO Plan** (from seo-planner, optional) - tells the writer WHICH KEYWORDS to use in each section
3. **Source Content** (scraped pages from Step 4) - gives the writer RAW MATERIAL for specific, detailed prose

When seo-planner has not run upstream, the writer logs a warning and omits the SEO plan section from the assembled content. The LLM receives only the analysis and source content. Templates that don't use seo-planner should customize the prompt to omit SEO-specific instructions.

### Why This Is the First "Prose" Output

Every previous submodule produced data - URLs, scores, word counts, JSON. Content-writer produces *text meant to be read*. This matters for the UI: the detail modal renders `content_markdown` with `"display": "prose"` - a scrollable, whitespace-preserving view where the user reads the actual article. The card shows only a 300-character preview; the full article is in the detail modal.

This is also the first output that might go directly to a CMS. The markdown output is designed to be copy-pasted or imported into WordPress, Ghost, or any CMS that accepts Markdown.

### Reference Documents for Writing

Reference docs matter most here. The doc_selector typically receives:

- **tone_guide.md** - Brand voice rules, sentence/paragraph constraints, keyword placement, citation format. Without this, the LLM writes in generic "AI article" tone
- **format_spec.md** - Section structure requirements, [Type Marker] prefixes, word counts per section, citation format, validation rules. Without this, formatting is inconsistent across articles
- **style_examples.md** - One or two example articles showing desired quality level. Few-shot examples are the most effective way to steer LLM writing quality (optional)

The difference between content-writer with and without reference docs is the difference between generic AI content and content that matches your publication's voice.

### Critical Rules

**Output is markdown only.** The writer produces prose in markdown format. No JSON output. Structured data conversion is a downstream concern.

**Categories come from a fixed taxonomy.** The analysis contains primary and secondary categories from the master list. The writer writes a section for each - it does not invent, skip, or reorder categories.

**Section headings use [Type Marker] prefixes.** Every section heading MUST start with the correct marker as defined in format_spec.md (e.g., `[Overview]`, `[Category]`, `[Tag]`, `[Credentials]`, `[FAQ]`, `[Contact]`).

**Citations use [#n] format.** Every factual claim must reference the source_citations from the analysis using inline `[#n]` notation.

## Strategy & Role

**Why this module exists:** Produce the final written deliverable - a complete, SEO-optimized, factually cited company profile in Markdown. This is the end product of the entire content pipeline.

**Role in the pipeline:** Final submodule in Step 5's chain. Consumes all upstream work and produces publishable content.

**Relationship to other submodules:**
- **Receives from content-analyzer:** analysis_json - facts, categories (primary + secondary), tags (existing + suggested_new), citations to weave into the article
- **Receives from seo-planner:** seo_plan_json - keyword distribution per section, meta tags, FAQs to answer
- **Receives scraped source content:** Original pages from the pool with text_content - raw material for specific details
- **Receives from reference docs:** tone guide, format spec, style examples
- **Nothing downstream (currently)** - this is the pipeline's terminal output

## When to Use

**Always use when:**
- You need written content, not just data
- Analysis and SEO plan have been reviewed and approved

**Consider settings carefully when:**
- Model choice matters most here - writing quality varies significantly between Haiku and Opus
- Reference docs dramatically affect quality - always use tone guide and format spec if available
- Source content volume - adjust max_source_chars if companies have many pages

**Without seo-planner:**
- Fully supported since v1.4.0. The writer warns and proceeds with analysis + source content only. For best results without an SEO plan, embed keyword guidance directly in the prompt.

**Don't use when:**
- You only need categorization (use content-analyzer alone)
- You only need a keyword plan/brief (use seo-planner alone)
- Content needs to be written by a human (use seo-planner output as a brief)

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `prompt` | (writing template) | Customize for different content types (bios vs profiles vs reviews), different section requirements, or different citation formats | The full LLM writing instruction. Uses `{entity_content}` for analysis+plan+sources data and `{doc:filename}` for reference docs |
| `reference_docs` | (none) | Always use tone_guide.md and format_spec.md if available. Add style examples for best results | Selected docs injected into prompt. Most impactful option for quality |
| `ai_model` | haiku *(manifest default — below the prose floor)* | **Minimum for shipped prose: opus.** sonnet reads acceptably but writes poorly (Daniel + 3 external reviews, 2026-07-14); haiku is drafts only. haiku/sonnet are fine for internal drafts and the QA-retry mechanics, not for published output. A production template MUST set opus | Model choice has the biggest quality impact of any option — and below opus the prose is not publication-grade (see PROSE FLOOR) |
| `ai_provider` | anthropic | Switch for model comparison or preference | Which API to call |
| `max_source_chars` | 100,000 | Lower to 50k for cost control. Raise to 200-300k for companies with many detailed pages | Truncates assembled scraped source text. Controls how much raw material the writer has to work with |
| `max_tokens` | 32,768 | Rarely — 32,768 is already the manifest max. Lower only for hard cost caps on haiku-only runs | Max LLM response length, covering BOTH visible markdown AND (on Claude-5 models — opus for shipped prose, sonnet in QA-retry) invisible adaptive-thinking tokens. Sonnet retries think ~10-12k tokens before writing ~5-7k of text; 16,384 truncated 4/7 complete sonnet retries in the 2026-07-14 calibration, and truncation fails the run via the skeleton fail-closed guard. Streaming (verified in the skeleton) means the large cap does not risk an HTTP timeout (v1.6.2, was 16,384). Caveat: Sonnet 5 tokenizes ~30% higher than Haiku, so the token figures above (and any Haiku↔Sonnet comparison) are approximate, not same-unit — the ~11k thinking headroom survives the correction |
| `disable_thinking` | false | Only for workbench A/B experiments on Anthropic Claude-5 models, until the prose question is settled | v1.8.0. When true, sends `thinking: {type:'disabled'}` on the model call — Anthropic-gated (never sent to other providers; the skeleton adapter additionally gates by model family, so haiku/fable never receive it). Default false is byte-identical to v1.7.0. Why it exists: ~80% of the writer's output tokens on sonnet-5 are invisible adaptive thinking (measured 14,901 out → 1,792 words; 29,166 out → 1,877 words). The tone-seo-editor probe (run cb49ef80) cut output_tokens 24,592 → 8,212 with visible text unchanged — but an EDITING pass plausibly needs no thinking, while WRITING prose may. Settable per-call from workbench overrides so the A/B can actually run. **Coupled skeleton contract:** requires the skeleton `ai.complete` thinking pass-through (BACKLOG #53 surface). As of 2026-07-31 that pass-through is DEPLOYED on the box (workbench-usable @ 9ee6079) but NOT on skeleton `main` — a main-based skeleton deploy would silently turn this option into a no-op (old `ai.complete` destructuring drops unknown params without error). Land the skeleton pass-through on main before/with merging this |

## Recipes

### Standard Profile
Production-quality company profiles (opus is the prose floor for shipped output — see PROSE FLOOR):
```
ai_model: opus
max_source_chars: 100000
reference_docs: [tone_guide.md, format_spec.md]
```

### Flagship Content
Maximum quality for featured companies:
```
ai_model: opus
max_source_chars: 200000
reference_docs: [tone_guide.md, format_spec.md, style_examples.md]
```

### Draft for Review
Quick drafts before human editing:
```
ai_model: haiku
max_source_chars: 50000
reference_docs: [format_spec.md]
```

### A/B Comparison
Compare providers on same input:
```
Run 1: ai_model: sonnet, ai_provider: anthropic
Run 2: ai_model: gpt-4o, ai_provider: openai
(Same reference docs, same prompt)
```

## Expected Output

**Healthy result:**
- One complete article per entity
- 1,800-2,200 words for default 2,000 target (+/-10% is normal)
- 4-8 H2 sections following the format spec structure
- One section per category from the analysis (primary and secondary)
- Source citations throughout using [#n] format
- Meta title and description matching the SEO plan
- FAQ section with schema-ready Q&A pairs

**Output fields per entity:**
- `entity_name` - company name
- `status` - `written` or `error`
- `word_count` - total words in the written profile
- `section_count` - number of H2/H3 sections
- `has_citations` - boolean, whether [#n] references were found
- `meta_title` - resolved from the SEO plan's validated candidate (v1.6.2: reads `seo_plan_json.sections.meta.meta_title.candidate`, then legacy `.meta.title`, then a flat field, then the entity name). Emitting the planned title lets meta-compliance-checker read it (priority-1) instead of falling back to the entity name. (Step 8 meta-output consumes these fields as of BACKLOG #52 — meta-output v1.0.1, whose resolution chain is mirrored from meta-compliance-checker and invariant-tested — so the delivered SEO metadata now carries the planned meta too.)
- `meta_description` - resolved the same way from the plan's `sections.meta.meta_description.candidate` (v1.6.2, new field). Empty when the plan carries no description (never invented).
- `content_preview` - first 300 characters of the article (for card view)
- `content_markdown` - the FULL article in Markdown (visible in detail modal only, rendered as prose)

**Detail modal:** This is where the article is actually read. The `content_markdown` field renders with `"display": "prose"` in a scrollable area. The card's `content_preview` shows only a teaser.

**Quality indicators:**
- `has_citations: true` - confirms the article references sources using [#n], not inventing claims
- `section_count` matching the category count - confirms the LLM followed the format spec
- `word_count` within +/-10% of target - confirms the LLM respected length guidance

**Red flags to watch for:**
- `has_citations: false` - the article may contain hallucinated facts. Check the full markdown for [#n] references
- Word count significantly under target - LLM may have run out of material. Check if analysis had enough content
- Word count significantly over target - LLM went off-script. Common with Opus. Not necessarily bad but review for bloat
- Generic opening paragraphs - LLM fell back to template language instead of using specific facts from source content. Tone guide and source content help prevent this
- Missing FAQ section - LLM may have deprioritized FAQs for main content. Check if seo_plan_json had FAQs
- Missing category sections - compare H2 headings against analyzer categories. Every category must have a section
- Duplicate content across sections - categories overlap and writer repeated the same information

## Limitations & Edge Cases

- **Quality ceiling is the analysis + source content** - Content-writer can only write about what content-analyzer found and what the scraped pages contain. If sources are thin, the article will be thin
- **No web research** - The writer only uses information from the analysis, source content, and reference docs. It cannot look up additional information or verify facts against live websites
- **Citation accuracy** - Citations reference the source_citations from the analysis using [#n], but the writer may slightly misattribute which source a fact came from. Source citations are directional, not legally precise
- **Tone consistency across entities** - Each article is generated independently. Without a tone guide, tone may drift between articles. With a tone guide, consistency is much better but not perfect
- **Markdown rendering assumptions** - Output assumes a standard Markdown renderer. Complex formatting (tables within articles, embedded media, custom HTML) is not supported
- **No revision cycle** - The writer produces a single draft. There's no built-in "revise based on feedback" loop. To revise, re-run with a modified prompt or switch to a human editor
- **Long article fragility** - For very long articles (5,000+ words), LLMs may lose coherence in later sections
- **Many categories stretch word budget** - With 6+ categories at 150-300 words each, the article may exceed the word target
- **Source content truncation** - max_source_chars truncates scraped content. If important details are on pages beyond the truncation point, they won't appear in the article
- **Allowed-slug-paths fidelity (v1.6.1)** - when `allowed_slug_paths` is configured but no slugs resolve from `analysis_json` (e.g. content-analyzer produced none of the expected fields), the writer logs a WARNING and omits the closed-vocabulary block (the model may then emit invalid slug values). Set the new `require_slug_paths` option to `true` to hard-fail the entity instead, so a missing/empty analysis surfaces loud. No effect when `allowed_slug_paths` is empty.

## What Happens Next

After the user reviews and approves the written content, articles enter the working pool with `source_submodule: "content-writer"`. Currently, this is the terminal output - articles can be exported or copied to a CMS.

**Future pipeline extensions could include:**
- **Step 6: Media Enrichment** - automatically finding/generating images, screenshots, logos to accompany articles
- **Step 7: Quality Review** - automated checks for readability score, keyword density, factual consistency
- **Step 8: Publishing** - CMS integration to push articles directly to WordPress, Ghost, or custom CMS

For now, the approved content_markdown is the deliverable. Copy it, import it, or build a CMS connector for it.

## Prompt caching (v1.7.0, BACKLOG #21)

The writer splits its assembled prompt at `{entity_content}`: the stable head
(instructions + any `{doc:}` reference docs placed before the entity content)
is sent as an Anthropic prompt-cache block (`cache_prefix`), the per-entity
tail stays uncached. `cachePrefix + prompt` is byte-identical to the old
single prompt — caching changes billing only (a runtime self-check falls back
to the uncached single prompt on any divergence). A prefix below the model's
cacheable minimum (~1024–4096 tokens depending on model) silently won't
cache; the module logs when that happens. **To actually benefit, the template
must put its stable bulk (reference docs, writing rules) BEFORE
`{entity_content}`** — a template whose head is a short intro caches nothing.

## Technical Reference

- **Step:** 5 (Generation)
- **Category:** generation
- **Cost:** expensive
- **Data operation:** add (➕) - chains from working pool, finds content-analyzer items (required) and seo-planner items (optional) by source_submodule, plus scraped source content items
- **Requires:** `entity_name`, `text_content` in input items; `analysis_json` from content-analyzer. Optional: `seo_plan_json` from seo-planner
- **Input:** Content-analyzer output, seo-planner output, and scraped source pages from working pool (found via `source_submodule` field)
- **Output:** `results[]` grouped by `entity_name`, one item per entity containing word_count, section_count, has_citations, content_preview, and content_markdown
- **Display type:** cards (not table) - one card per entity with expandable detail modal showing full article as prose
- **Selectable:** true - operators approve/reject entire entity article
- **Detail view:** `detail_schema` with header (entity_name, status as badge, word_count, meta_title) and sections (content_markdown as prose, meta_title as text, error). The prose section is scrollable and is the primary way users read the article
- **Error handling:** Missing analysis input and LLM failures handled per-entity. Entities missing content-analyzer get clear error: "Missing upstream output: content-analyzer. Run content-analyzer first." Missing seo-planner logs a warning and proceeds. Warns (doesn't fail) if no scraped source pages are found. When `allowed_slug_paths` is configured but resolves to zero slugs, warns by default or hard-fails the entity when `require_slug_paths` is true (v1.6.1).
- **Dependencies:** `tools.ai` (LLM calls), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
