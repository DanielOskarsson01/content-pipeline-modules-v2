# Markdown Output

> Transform pipeline content into clean, publishable Markdown with optional YAML frontmatter.

**Module ID:** `markdown-output` | **Step:** 8 (Bundling) | **Category:** formatting | **Cost:** cheap
**Version:** 1.2.0 | **Data Operation:** add (+)

> **v1.0.1 (W1.5):** the heading-marker regex is now sourced from the shared `modules/_shared/marker-parser.js` (single source of truth, also used by tone-seo-editor's marker-preservation gate). Strip behavior is byte-identical to v1.0.0 -- verified by an old-vs-new output diff.
>
> **v1.1.0 (M2):** the QA verdict travels with the content -- `qa_verdict` / `qa_flagged` / `qa_failed_checks` in the YAML frontmatter, plus a `qa_flagged` field on every item row that is emitted even when frontmatter is off. See "QA verdict propagation" below.
>
> **v1.2.0 (M1):** two publish-layer fixes. (1) `strip_markers` now removes the ENTIRE bracketed prefix and keeps the descriptive title -- `## [Tag: mobile] Mobile-First Slots Design` → `## Mobile-First Slots Design` (previously it prepended the marker word: `## Mobile Mobile-First Slots Design`). (2) With `include_meta_section: false`, only the `## [Meta]` section is removed (up to the next `## ` heading or EOF); a following `## [Sources]` section is now preserved (previously deleted along with everything after Meta).

---

## Background

### The Content Problem This Solves

The content-writer module produces raw Markdown with internal conventions: `[Type Marker]` prefixes on headings (e.g., `## [Overview]`, `## [Primary Category: online-casinos]`), inline `[#n]` citation references, and a `## [Meta]` section with structured metadata. These conventions are useful for pipeline processing but unsuitable for publishing. Before content can be imported into a CMS, shared with editors, or published as standalone files, it needs to be cleaned, reformatted, and optionally enriched with YAML frontmatter.

### How It Fits the Pipeline Architecture

This is a Step 8 Bundling module -- the final stage of the pipeline where processed content is formatted for output. It uses **data-shape routing**: it finds its input by checking which fields exist on pool items (`content_markdown`, `analysis_json`), never by checking `source_submodule`. This means any upstream module that produces a `content_markdown` field will automatically feed into this module.

When an entity carries several `content_markdown` items (re-runs, or the tone-seo-editor refinement chain adding on top of content-writer via the `add` data operation), the module uses the **latest** item -- a tone-seo-editor refinement automatically supersedes the original content-writer draft. The same latest-item rule applies to `analysis_json`.

## Strategy & Role

**Why this module exists:** Convert internal pipeline Markdown into clean, publishable Markdown files ready for CMS import or editorial review. Strip internal conventions, convert citations to standard formats, and add YAML frontmatter with categories and tags from the analysis phase.

**Role in the pipeline:** One of five Step 8 output modules. Produces the most portable format -- Markdown files work with virtually every CMS, static site generator, and content management system.

**Relationship to other steps:**
- **Depends on:** content-writer (produces `content_markdown`)
- **Optionally uses:** content-analyzer (provides `analysis_json` for frontmatter categories and tags)
- **Sibling modules:** html-output, json-output, meta-output, company-media

## When to Use

**Always use when:**
- You need clean Markdown files for CMS import (WordPress, Strapi, Hugo, Jekyll, etc.)
- Content needs to be reviewed by human editors in a readable format
- You want portable files that work across platforms

**Consider settings carefully when:**
- Your CMS expects specific frontmatter fields -- check that the generated YAML matches
- You need citations preserved -- choose between footnotes, inline, or stripped
- The `## [Meta]` section should be kept for debugging -- enable `include_meta_section`

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `heading_style` | `strip_markers` | Set to `keep_markers` if downstream tools need the `[Type Marker]` prefixes for machine parsing | `strip_markers` removes the whole bracketed prefix and keeps the descriptive title: `## [Overview] ELK Studios` → `## ELK Studios` |
| `citation_format` | `footnotes` | Set to `inline` to keep `[#n]` as-is; set to `strip` to remove all citations | `footnotes` converts `[#n]` to `[^n]` with a footnote definitions section at the bottom |
| `include_frontmatter` | `true` (boolean) | Disable if your CMS does not support YAML frontmatter or you want raw Markdown only | Adds `---` delimited YAML block with title, categories, and tags from analysis data, plus QA verdict fields when the pool carries QA shapes |
| `include_meta_section` | `false` (boolean) | Enable to keep the `## [Meta]` section for debugging or if meta-output is not being used | The Meta section contains structured metadata that is typically handled by meta-output instead |

## Recipes

### CMS Import (Standard)
Clean Markdown with frontmatter for Strapi, WordPress, or similar CMS:
```
heading_style: strip_markers
citation_format: footnotes
include_frontmatter: true
include_meta_section: false
```

### Editorial Review
Clean readable Markdown without frontmatter or citations:
```
heading_style: strip_markers
citation_format: strip
include_frontmatter: false
include_meta_section: false
```

### Machine-Parseable
Keep all internal markers for automated processing:
```
heading_style: keep_markers
citation_format: inline
include_frontmatter: true
include_meta_section: true
```

### Static Site Generator
Full frontmatter with footnote citations for Hugo/Jekyll:
```
heading_style: strip_markers
citation_format: footnotes
include_frontmatter: true
include_meta_section: false
```

## Expected Output

**Healthy result:**
- One Markdown file per entity
- 800-3,000 words per file (depending on content-writer output)
- 5-15 sections (h2/h3 headings) per file
- YAML frontmatter with title, categories, and tags

**Output fields per entity:**
- `entity_name` -- the company/entity name
- `final_markdown` -- the complete Markdown string (downloadable as .md file)
- `word_count` -- total words in the final output
- `section_count` -- number of h2/h3 headings
- `has_frontmatter` -- whether YAML frontmatter was included
- `qa_flagged` -- `"true"`/`"false"` when Step 6 QA shapes are present in the pool, empty string when no QA ran; surfaces flagged entities on the item row even with frontmatter off
- `content_preview` -- first 200 characters (newlines replaced with spaces)

**Detail view:** Each item has a detail view showing the full Markdown output as prose, with header badges for entity name, word count, section count, and frontmatter status.

**Red flags to watch for:**
- Missing frontmatter categories/tags -- analysis_json may not have been produced by content-analyzer
- Very short output (< 300 words) -- content-writer may have produced minimal content
- No entities processed -- check that content_markdown field exists in the working pool

## Limitations & Edge Cases

- **Requires content_markdown field** -- items without this field are skipped with a warning. Run content-writer first
- **Frontmatter depends on analysis_json** -- if content-analyzer did not run, frontmatter will only contain the title (no categories or tags)
- **Citation footnotes require source_citations** -- if analysis_json lacks `source_citations`, footnotes will show generic "Source N" labels
- **Only the latest markdown item is used** -- if an entity has multiple items with `content_markdown` (re-runs, tone-seo-editor refinements), only the most recent one is formatted; earlier drafts are ignored
- **Marker stripping keeps the title verbatim** -- `strip_markers` deletes the whole `[...]` prefix (including any slug) and leaves the descriptive heading text unchanged. It no longer title-cases slugs
- **Meta section removal is bounded** -- matches from `## [Meta]` or `## Meta` to just before the next `## ` heading (or EOF if none). Sections after `[Meta]`, such as `[Sources]`, are preserved

## What Happens Next

The Markdown output is a terminal artifact -- it is ready for use outside the pipeline. Typical destinations:

- **CMS import** -- upload the `.md` file to Strapi, WordPress, or any Markdown-supporting CMS
- **Static site generation** -- place in a Hugo/Jekyll/Gatsby content directory
- **Editorial workflow** -- send to editors for review and revision
- **Archive** -- store as the canonical content record for the entity

The other Step 8 modules (html-output, json-output, meta-output) can run in parallel on the same working pool to produce alternative output formats from the same source content.

## QA verdict propagation (v1.1.0, M2)

The QA verdict is collected from the pool on every run via the shared collector
`modules/_shared/qa-verdict.js` -- same semantics as json-output's `qa` block.
It surfaces in two places:

- **Frontmatter** -- when `include_frontmatter` is on and the pool carries QA
  shapes, the YAML gains `qa_verdict`, `qa_flagged`, and (when present)
  `qa_failed_checks`.
- **Item row** -- every output item carries a `qa_flagged` field (`"true"`/
  `"false"`, or empty string when no QA ran), emitted **regardless** of
  `include_frontmatter`. Without this, a markdown-only template with
  frontmatter off would ship flagged content with zero QA trace.

Additive metadata, never a gate -- flagged content still ships; QA-less
pipelines produce byte-identical files.

## Technical Reference

- **Step:** 8 (Bundling)
- **Category:** formatting
- **Cost:** cheap -- pure text transform, no network or LLM calls; short timeout tier
- **Data operation:** add (+) -- content reformatted for output as new pool items
- **Pool precondition:** `requires_items` -- entities with an empty pool are marked `skipped_no_input` before enqueue (not failed); the module never runs against an empty pool
- **Required input columns (manifest `requires_columns`):** `seo_plan_json`, `analysis_json` -- note that execution itself routes by field presence on pool items (`content_markdown`, `analysis_json`), never by `source_submodule`
- **Item key:** `entity_name`
- **Depends on:** content-writer
- **Input:** `input.entities[]` with `items[]` containing `content_markdown` and optionally `analysis_json`
- **Output:** `{ results[], summary }` where each result has `entity_name`, `items[]` with `final_markdown`, `word_count`, `section_count`, `has_frontmatter`, `qa_flagged`, `content_preview`
- **Selectable:** true -- operators can deselect individual entity outputs
- **Downloadable:** `final_markdown` field downloadable as `.md` file
- **Detail view:** header fields (entity_name, word_count, section_count, has_frontmatter badge) and prose section for final_markdown
- **Error handling:** per-entity try/catch -- an entity with no `content_markdown` items (or a thrown formatting error) produces an error result (`items: []`, `meta.errors: 1`) and is listed in `summary.errors`; other entities continue. Successful items are pushed to `tools._partialItems` so partial results survive a timeout. No retries -- the transform is deterministic
- **Dependencies:** `js-yaml` (frontmatter serialization), shared helpers `modules/_shared/marker-parser.js` (heading-marker regex) and `modules/_shared/qa-verdict.js` (QA verdict collector), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`
