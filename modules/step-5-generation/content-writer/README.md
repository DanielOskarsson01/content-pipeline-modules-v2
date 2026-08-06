# Content Writer

> Write content using analysis data, optional SEO plan, and scraped source content.

**Module ID:** `content-writer` | **Step:** 5 (Generation) | **Category:** generation | **Cost:** expensive
**Version:** 1.8.0 | **Data Operation:** add (+)

> **⚠ PROSE FLOOR -- minimum model for shipped prose: opus.** sonnet reads acceptably but writes poorly (per Daniel + three external reviews, 2026-07-14). haiku is drafts only; sonnet is acceptable for internal drafts and for the QA-retry mechanics, but NOT for published output. Any template shipping haiku or sonnet prose to publication is below the floor. `max_tokens` stays 32,768 (the manifest max) to cover the invisible adaptive-thinking tokens opus/sonnet spend before writing -- see the manifest `usage_notes`.

---

## Background

### The Content Problem This Solves

The pipeline now has structured understanding (content-analyzer) and a keyword plan (seo-planner). What's missing is the actual writing. Content-writer is the final production step -- it takes facts, keywords, and raw source material and produces a publishable company profile.

This is the most visible output of the entire pipeline. Everything upstream -- URL discovery, scraping, filtering, analysis, SEO planning -- exists to make this step produce good articles. A 2,000-word company profile that reads well, ranks well, cites sources, and doesn't hallucinate is the deliverable.

The original Content Creation Master described this as Node 6c -- Draft Creation:
- *"Produce full draft profile in Markdown with proper heading hierarchy"*
- *"Each factual claim must cite the source URL"*
- *"Follow the format spec section structure"*
- *"Tone: authoritative B2B, benefit-first, not promotional"*

### How It Fits the Pipeline Architecture

Content-writer is the third and final submodule in Step 5's chain:

```
content-analyzer (+) -> seo-planner (+) -> content-writer (+)
```

It uses the **add (+)** data operation -- it chains from the working pool, finding content-analyzer items (required) and seo-planner items (optional) by their `source_submodule` fields, plus the original scraped source content. The analysis provides structure, the SEO plan (when present) provides keywords, and the source content provides raw material for specific, detailed prose. If seo-planner has not run, the writer warns and proceeds without the SEO plan section.

This is the most expensive individual LLM call in the pipeline. The prompt includes the full analysis JSON, the full SEO plan, scraped source content, and potentially multiple reference documents (tone guide, format spec).

### v1.4.0: Optional SEO Plan

In v1.4.0, the seo-planner dependency was made optional. The writer accepts up to **three inputs**:

1. **Analysis** (from content-analyzer, required) -- tells the writer WHAT to write about
2. **SEO Plan** (from seo-planner, optional) -- tells the writer WHICH KEYWORDS to use in each section
3. **Source Content** (scraped pages from Step 4) -- gives the writer RAW MATERIAL for specific, detailed prose

When seo-planner has not run upstream, the writer logs a warning and omits the SEO plan section from the assembled content. The LLM receives only the analysis and source content. Templates that don't use seo-planner should customize the prompt to omit SEO-specific instructions.

### Why This Is the First "Prose" Output

Every previous submodule produced data -- URLs, scores, word counts, JSON. Content-writer produces *text meant to be read*. This matters for the UI: the detail modal renders `content_markdown` with `"display": "prose"` -- a scrollable, whitespace-preserving view where the user reads the actual article. The card shows only a 300-character preview; the full article is in the detail modal.

This is also the first output that might go directly to a CMS. The markdown output is designed to be copy-pasted or imported into WordPress, Ghost, or any CMS that accepts Markdown.

### Reference Documents for Writing

Reference docs matter most here. The doc_selector typically receives:

- **tone_guide.md** -- Brand voice rules, sentence/paragraph constraints, keyword placement, citation format. Without this, the LLM writes in generic "AI article" tone
- **format_spec.md** -- Section structure requirements, [Type Marker] prefixes, word counts per section, citation format, validation rules. Without this, formatting is inconsistent across articles
- **style_examples.md** -- One or two example articles showing desired quality level. Few-shot examples are the most effective way to steer LLM writing quality (optional)

The difference between content-writer with and without reference docs is the difference between generic AI content and content that matches your publication's voice.

### Critical Rules

**Output is markdown only.** The writer produces prose in markdown format. No JSON output. Structured data conversion is a downstream concern.

**The manifest default prompt is pipeline-agnostic (v1.6.0).** The generic default produces well-cited prose from analyzer output; it knows nothing about company profiles, bracket headings, or any specific content type. Pipeline-specific structure (bracket-heading format, category sections, [Type Marker] prefixes, `[#n]` citations mapped to format-spec rules) comes from the template's prompt override and reference docs. Templates that DEPEND on that structure should set `requires_prompt_override: true` so a missing override fails loud instead of silently producing a generic article.

**Citations use [#n] format.** The default prompt instructs the model to cite every factual claim inline using `[#n]`, mapping to the source_citations from the analyzer output. The `has_citations` output flag checks for this pattern (plus legacy markdown-link and `(Source:` patterns).

**Closed slug vocabulary is template-configured.** When a template configures `allowed_slug_paths`, the writer prepends a per-entity `=== ALLOWED SLUGS FOR THIS ARTICLE ===` block extracted from `analysis_json`, and the prompt instructs the model to draw bracket-marker values exclusively from it.

## Strategy & Role

**Why this module exists:** Produce the final written deliverable -- a complete, SEO-optimized, factually cited article in Markdown. This is the end product of the entire content pipeline.

**Role in the pipeline:** Final submodule in Step 5's chain. Consumes all upstream work and produces publishable content.

**Relationship to other submodules:**
- **Receives from content-analyzer:** analysis_json -- facts, structure, citations to weave into the article (and slug vocabularies when `allowed_slug_paths` is configured)
- **Receives from seo-planner:** seo_plan_json -- keyword distribution per section, meta tags, FAQs to answer
- **Receives scraped source content:** Original pages from the pool with text_content -- raw material for specific details
- **Receives from reference docs:** tone guide, format spec, style examples
- **Feeds downstream:** Step 6 QA checkers read the article; meta-compliance-checker and Step 8 meta-output read the resolved `meta_title` / `meta_description`; Step 8 bundlers (markdown-output, html-output, json-output) consume `content_markdown`

## When to Use

**Always use when:**
- You need written content, not just data
- Analysis and SEO plan have been reviewed and approved

**Consider settings carefully when:**
- Model choice matters most here -- writing quality varies significantly between Haiku and Opus
- Reference docs dramatically affect quality -- always use tone guide and format spec if available
- Source content volume -- adjust max_source_chars if companies have many pages

**Without seo-planner:**
- Fully supported since v1.4.0. The writer warns and proceeds with analysis + source content only. For best results without an SEO plan, embed keyword guidance directly in the prompt.

**Don't use when:**
- You only need categorization (use content-analyzer alone)
- You only need a keyword plan/brief (use seo-planner alone)
- Content needs to be written by a human (use seo-planner output as a brief)

## Options Guide

`ai_model` and `ai_provider` are **registry-driven**: the manifest declares `values_from: registry.models` / `registry.providers` instead of a hardcoded list, and the skeleton populates the dropdowns from the shared LLM registry (providers: anthropic, openai, perplexity, gemini, openrouter; the model list is scoped to the selected/default provider). New models arrive via the registry, not manifest edits.

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `ai_model` | haiku *(manifest default -- below the prose floor)* | **Minimum for shipped prose: opus.** sonnet reads acceptably but writes poorly (Daniel + 3 external reviews, 2026-07-14); haiku is drafts only. haiku/sonnet are fine for internal drafts and the QA-retry mechanics, not for published output. A production template MUST set opus | Which model writes. Registry-driven values (see above). Model choice has the biggest quality impact of any option -- and below opus the prose is not publication-grade (see PROSE FLOOR) |
| `ai_provider` | anthropic | Switch for model comparison or preference | Which LLM provider to call. Registry-driven values (see above). Note: prompt caching and `disable_thinking` are Anthropic-only -- other providers get a plain uncached call with no thinking param |
| `reference_docs` | (none) | Always use tone_guide.md and format_spec.md if available. Add style examples for best results | Selected docs injected into the prompt at `{doc:filename}` placeholders. Most impactful option for quality. Docs placed BEFORE `{entity_content}` also join the cacheable prefix (see Prompt caching) |
| `temperature` | 0.4 | Raise toward 0.7-1.0 for more creative prose; lower toward 0-0.2 for maximum consistency across a batch | LLM temperature (0.0-1.0). Caveat: Claude-5 thinking models (sonnet-5, opus) reject an explicit `temperature` param, and the skeleton adapter drops it for those model families -- so on the models this module actually ships with, the value is inert |
| `max_tokens` | 32768 | Rarely -- 32,768 is already the manifest max. Lower (min 1,024) only for hard cost caps on haiku-only runs | Max LLM response length, covering BOTH visible markdown AND (on Claude-5 models -- opus for shipped prose, sonnet in QA-retry) invisible adaptive-thinking tokens. Sonnet retries think ~10-12k tokens before writing ~5-7k of text; 16,384 truncated 4/7 complete sonnet retries in the 2026-07-14 calibration, and truncation fails the run via the skeleton fail-closed guard. Streaming (verified in the skeleton) means the large cap does not risk an HTTP timeout (v1.6.2, was 16,384). Caveat: Sonnet 5 tokenizes ~30% higher than Haiku, so the token figures above (and any Haiku-vs-Sonnet comparison) are approximate, not same-unit -- the ~11k thinking headroom survives the correction |
| `disable_thinking` | false | Only for workbench A/B experiments on Anthropic Claude-5 models, until the prose question is settled | v1.8.0. When true, sends `thinking: {type:'disabled'}` on the model call -- Anthropic-gated in execute.js (never sent to other providers; setting it with a non-Anthropic provider just logs an info line). The skeleton adapter additionally gates by model family (`anthropicAcceptsThinking`), so models that reject an explicit thinking config (haiku, fable/mythos) never receive it. Default false = byte-identical request to v1.7.0. Why it exists: ~80% of the writer's output tokens on sonnet-5 are invisible adaptive thinking (measured 14,901 out for 1,792 words; 29,166 out for 1,877 words). The tone-seo-editor probe (run cb49ef80) cut output_tokens 24,592 -> 8,212 with visible text unchanged -- but an EDITING pass plausibly needs no thinking, while WRITING prose may. Settable per-call from workbench overrides so the A/B can actually run. **Coupled skeleton contract:** requires the skeleton `ai.complete` thinking pass-through (BACKLOG #53 surface), on skeleton main + deployed since 2026-08-01. On any OLDER skeleton the option is a silent no-op (old `ai.complete` destructuring drops unknown params without error) |
| `max_source_chars` | 100000 | Lower to 50k for cost control. Raise to 200-300k (max 300,000; min 10,000) for companies with many detailed pages | Truncates assembled scraped source text (with an explicit `[Source content truncated ...]` marker). Controls how much raw material the writer has to work with |
| `requires_prompt_override` | false | Set true on templates whose downstream steps depend on pipeline-specific output shape (company-profile bracket headings, news lede/quotes structure, podcast episode layout) | Per-template fail-loud flag. When true AND the runtime prompt still equals the manifest default (no override configured), the writer REFUSES the whole run early: every entity gets an error item with a clear message, and the summary reads "refused: template requires prompt override". Default false keeps the generic manifest prompt a valid run path |
| `allowed_slug_paths` | (empty) | Populate on templates whose prompt uses bracket headings like `[Category: <slug>]` -- anchors the model against inventing slug values | Optional closed vocabulary. One entry per line, `<BracketLabel>=<dot.notation.path>`; `field.sub[].leaf` walks arrays; repeated labels concatenate; `#` lines and blanks ignored (max 4,000 chars). When set, the writer extracts per-entity slug lists from `analysis_json` and prepends an `=== ALLOWED SLUGS FOR THIS ARTICLE ===` block to the entity content. Leave empty for content types without slug brackets (cover letters, news articles, podcast pages) -- behavior is then unchanged |
| `require_slug_paths` | false | Set true on templates whose output DEPENDS on the closed vocabulary, so a missing/empty analysis fails loud | Only relevant when `allowed_slug_paths` is configured. When false, zero resolved slugs for an entity logs a WARNING and proceeds without the closed-vocabulary block (the model may then emit invalid slugs). When true, that same condition HARD-FAILS the entity (status `error`). No effect when `allowed_slug_paths` is empty |
| `allow_missing_entity_content` | false | Set true ONLY for a deliberately source-free prompt (rare) | Prompt-input guard (BACKLOG #63). When false (default) and the prompt has no `{entity_content}` placeholder, the writer REFUSES the entity: the assembled analysis + SEO plan + scraped sources would be silently discarded and the model would write from instructions alone (the "green but empty" class). Set true to override. Independent of this flag, the three doc-related silent-drop conditions always WARN (see Prompt-input guard below) |
| `prompt` | (generic writing template) | Customize for different content types (bios vs profiles vs reviews), different section requirements, or different citation formats. Presets enabled | The full LLM writing instruction. Uses `{entity_content}` for the assembled analysis+plan+sources block and `{doc:filename}` for reference docs (unmatched `{doc:}` tokens are stripped). The default is deliberately pipeline-agnostic: it forbids topic/structure decisions (upstream owns those), demands `[#n]` citations, markdown-only output, no invented facts, and closed-vocabulary slug compliance when an ALLOWED SLUGS block is present |

The two highest-leverage options are `ai_model` (prose floor) and `reference_docs` (voice + structure). The most common mistake is lowering `max_tokens` to "save cost" -- on Claude-5 models the thinking tokens eat the budget invisibly and the fail-closed truncation guard turns the saving into a failed run.

## Recipes

`prompt` is omitted from the blocks below -- it is the manifest default unless the template configures an override (and `requires_prompt_override: true` forces one to exist).

### Standard Profile
Production-quality company profiles (opus is the prose floor for shipped output -- see PROSE FLOOR):
```
ai_provider: anthropic
ai_model: opus
temperature: 0.4
max_tokens: 32768
disable_thinking: false
max_source_chars: 100000
reference_docs: [tone_guide.md, format_spec.md]
requires_prompt_override: true   (template configures its prompt override)
allowed_slug_paths: (per template, e.g. "Primary Category=categories.primary[].slug")
require_slug_paths: false
```

### Flagship Content
Maximum quality for featured companies:
```
ai_provider: anthropic
ai_model: opus
temperature: 0.4
max_tokens: 32768
disable_thinking: false
max_source_chars: 200000
reference_docs: [tone_guide.md, format_spec.md, style_examples.md]
requires_prompt_override: true
allowed_slug_paths: (per template)
require_slug_paths: true
```

### Draft for Review
Quick drafts before human editing:
```
ai_provider: anthropic
ai_model: haiku
temperature: 0.4
max_tokens: 32768
disable_thinking: false
max_source_chars: 50000
reference_docs: [format_spec.md]
requires_prompt_override: false
allowed_slug_paths: (empty)
require_slug_paths: false
```

### A/B Comparison
Compare providers on the same input (model values come from the shared registry per provider):
```
Run 1: ai_provider: anthropic, ai_model: sonnet
Run 2: ai_provider: openai, ai_model: (a registry model for openai, e.g. gpt-4o)
(Same reference docs, same prompt, same temperature/max_tokens)
```
Note: on the openai run there is no prompt caching and no thinking control -- both are Anthropic-gated.

## Expected Output

**Healthy result:**
- One complete article per entity
- 1,800-2,200 words for default 2,000 target (+/-10% is normal)
- 4-8 H2 sections following the format spec structure
- One section per category from the analysis (when the template's format spec demands it)
- Source citations throughout using [#n] format
- Meta title and description matching the SEO plan
- FAQ section with schema-ready Q&A pairs (when the SEO plan carries FAQs)

**Output fields per entity:**
- `entity_name` -- company name
- `status` -- `written` or `error`
- `word_count` -- total words in the written article
- `section_count` -- number of H2/H3 sections
- `has_citations` -- boolean, whether [#n] references (or legacy markdown-link / `(Source:` patterns) were found
- `meta_title` -- resolved from the seo-planner output. Priority: `seo_plan_json.meta.title` (top-level, legacy), then `seo_plan_json.sections.meta.meta_title.candidate` (the planner's real length-validated output), then a flat `meta_title` field, then the entity name. Emitting the planned title lets meta-compliance-checker read it (priority-1) instead of falling back to the entity name. (Step 8 meta-output consumes these fields as of BACKLOG #52 -- meta-output v1.0.1, whose resolution chain is mirrored from meta-compliance-checker and invariant-tested -- so the delivered SEO metadata now carries the planned meta too.)
- `meta_description` -- resolved the same way (`meta.description`, then `sections.meta.meta_description.candidate`, then flat field). Empty when the plan carries no description (never invented).
- `content_preview` -- first 300 characters of the article (for card view)
- `content_markdown` -- the FULL article in Markdown (visible in detail modal only, rendered as prose)
- `error` -- error message on failed entities, empty string on success

**Detail modal:** This is where the article is actually read. The `content_markdown` field renders with `"display": "prose"` in a scrollable area. The card's `content_preview` shows only a teaser.

**Quality indicators:**
- `has_citations: true` -- confirms the article references sources using [#n], not inventing claims
- `section_count` matching the category count -- confirms the LLM followed the format spec
- `word_count` within +/-10% of target -- confirms the LLM respected length guidance

**Red flags to watch for:**
- `has_citations: false` -- the article may contain hallucinated facts. Check the full markdown for [#n] references
- Word count significantly under target -- LLM may have run out of material. Check if analysis had enough content
- Word count significantly over target -- LLM went off-script. Common with Opus. Not necessarily bad but review for bloat
- Generic opening paragraphs -- LLM fell back to template language instead of using specific facts from source content. Tone guide and source content help prevent this
- Missing FAQ section -- LLM may have deprioritized FAQs for main content. Check if seo_plan_json had FAQs
- Missing category sections -- compare H2 headings against analyzer categories. Every category must have a section
- Duplicate content across sections -- categories overlap and writer repeated the same information
- Whole run errored with "Template requires a content-writer prompt override" -- the template sets `requires_prompt_override: true` but no prompt override is configured. Upload the override or unset the flag

## Limitations & Edge Cases

- **Quality ceiling is the analysis + source content** -- Content-writer can only write about what content-analyzer found and what the scraped pages contain. If sources are thin, the article will be thin
- **No web research** -- The writer only uses information from the analysis, source content, and reference docs. It cannot look up additional information or verify facts against live websites
- **Citation accuracy** -- Citations reference the source_citations from the analysis using [#n], but the writer may slightly misattribute which source a fact came from. Source citations are directional, not legally precise
- **Tone consistency across entities** -- Each article is generated independently. Without a tone guide, tone may drift between articles. With a tone guide, consistency is much better but not perfect
- **Markdown rendering assumptions** -- Output assumes a standard Markdown renderer. Complex formatting (tables within articles, embedded media, custom HTML) is not supported
- **No revision cycle** -- The writer produces a single draft. There's no built-in "revise based on feedback" loop. To revise, re-run with a modified prompt or switch to a human editor
- **Long article fragility** -- For very long articles (5,000+ words), LLMs may lose coherence in later sections
- **Many categories stretch word budget** -- With 6+ categories at 150-300 words each, the article may exceed the word target
- **Source content truncation** -- max_source_chars truncates scraped content. If important details are on pages beyond the truncation point, they won't appear in the article
- **Allowed-slug-paths fidelity (v1.6.1)** -- when `allowed_slug_paths` is configured but no slugs resolve from `analysis_json` (e.g. content-analyzer produced none of the expected fields), the writer logs a WARNING and omits the closed-vocabulary block (the model may then emit invalid slug values). Set `require_slug_paths: true` to hard-fail the entity instead, so a missing/empty analysis surfaces loud. No effect when `allowed_slug_paths` is empty
- **Latest-item wins** -- when multiple content-analyzer or seo-planner items exist for an entity (e.g. after re-runs), the writer uses the most recent one (`findLast`)

## What Happens Next

After the user reviews and approves the written content, articles enter the working pool with `source_submodule: "content-writer"`. Step 6 QA checkers verify the article (citations, keywords, hallucination, structure); Step 8 bundlers (markdown-output, html-output, json-output) format `content_markdown` for delivery, and meta-output ships the resolved planned meta. The approved content_markdown is the deliverable -- copy it, import it, or let the Step 8/9 delivery chain package it.

## Prompt-input guard (v1.9.0, BACKLOG #63)

The `{entity_content}` + `{doc:filename}` assembly drops inputs *silently* in four
ways. Before the model call the writer runs a guard (shared with content-analyzer,
seo-planner and tone-seo-editor via `modules/_shared/prompt-input-guard.js`) that
surfaces each. Every log line is prefixed `[prompt-input-guard]` and names the
entity, so a later forensic can grep exactly which entity dropped which input:

| Condition | What is dropped | Behaviour |
|-----------|-----------------|-----------|
| **Missing `{entity_content}`** | The whole assembled analysis + SEO plan + scraped sources — the model writes from instructions alone (the "green but empty" class) | **Fails closed** (entity `error`, no LLM call) unless `allow_missing_entity_content: true` |
| **Unmatched `{doc:x}`** | A `{doc:x}` placeholder with no matching reference doc — stripped to empty; the model never sees `x` | **Warn**, names the placeholder |
| **Attached-but-uninjected doc** | A reference doc is attached but no `{doc:x}` placeholder injects it | **Warn**, names the doc |
| **Named-but-not-injected doc** | A doc filename appears in the prompt *prose* with no `{doc:x}` placeholder (heuristic — a prompt may legitimately mention a filename) | **Warn**, names the file |

This is the exact failure the 2026-07-27 `df68a5f0` variant hit: its prose named
`format_spec.md` and `tone_guide.md` as "binding and authoritative" but carried no
`{doc:}` placeholder, so the model wrote against a spec it never saw. A prompt that
injects every referenced doc and includes `{entity_content}` logs nothing new.

## Prompt caching (v1.7.0, BACKLOG #21)

The writer splits its assembled prompt at `{entity_content}`: the stable head
(instructions + any `{doc:}` reference docs placed before the entity content)
is sent as an Anthropic prompt-cache block (`cache_prefix`), the per-entity
tail stays uncached. `cachePrefix + prompt` is byte-identical to the old
single prompt -- caching changes billing only (a runtime self-check falls back
to the uncached single prompt on any divergence; the divergence and
multiple-placeholder fallbacks are logged). The split is **Anthropic-gated**:
any other provider gets the plain single prompt, byte-identical to pre-1.7.0
behavior, because the skeleton's non-Anthropic branches ignore `cache_prefix`
and would silently drop the stable head. The split also only happens when
`{entity_content}` occurs exactly once in the template -- multiple occurrences
fall back to the single prompt (logged); ZERO occurrences fall back SILENTLY
(no log line), and note that such a template also omits the entity content
from the model input entirely -- check your template if outputs read generic. A prefix below the model's cacheable minimum silently
won't cache -- the module logs when the prefix is under ~16,384 chars (~4096
tokens, the largest documented per-model minimum); `ai_usage` cache_write/read
tokens are the ground truth. **To actually benefit, the template must put its stable bulk (reference
docs, writing rules) BEFORE `{entity_content}`** -- a template whose head is a
short intro caches nothing.

## Technical Reference

- **Step:** 5 (Generation)
- **Category:** generation
- **Cost:** expensive -- LLM-heavy tier (longest timeout class, 30 min)
- **Data operation:** add (+) -- chains from working pool, finds content-analyzer items (required) and seo-planner items (optional) by source_submodule, plus scraped source content items
- **Pool precondition:** `requires_items` -- an entity with an empty pool is marked `skipped_no_input` (not failed) before enqueue
- **Requires columns:** `entity_name`, `text_content`, `analysis_json`, `seo_plan_json` (selective field loading)
- **Depends on:** content-analyzer (required); seo-planner (optional_depends_on)
- **Input:** Content-analyzer output, seo-planner output, and scraped source pages from working pool (found via `source_submodule` field; scraped items = anything not from the two Step 5 submodules that carries `text_content`)
- **Output:** `results[]` grouped by `entity_name`, one item per entity containing word_count, section_count, has_citations, meta_title, meta_description, content_preview, and content_markdown
- **Display type:** cards (not table) -- one card per entity with expandable detail modal showing full article as prose
- **Selectable:** true -- operators approve/reject entire entity article
- **Detail view:** `detail_schema` with header (entity_name, status as badge, word_count, meta_title) and sections (content_markdown as prose, meta_title + meta_description as text, error). The prose section is scrollable and is the primary way users read the article
- **Error handling:** Run-level refusal when `requires_prompt_override` is true and the prompt equals the manifest default (every entity errored, summary says "refused"). Per-entity: missing content-analyzer output errors that entity ("Missing upstream output: content-analyzer. Run content-analyzer first."); missing seo-planner logs a warning and proceeds; no scraped source pages logs a warning (writer relies on analysis/plan only); configured-but-unresolved `allowed_slug_paths` warns by default or hard-fails the entity when `require_slug_paths` is true (v1.6.1); LLM call failures error that entity and the loop continues. Partial results are pushed to `tools._partialItems` after every entity so a timeout does not destroy progress
- **Model/provider values:** resolved by the skeleton from the shared LLM registry (`values_from: registry.models` / `registry.providers`)
- **Dependencies:** `tools.ai` (LLM calls), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
