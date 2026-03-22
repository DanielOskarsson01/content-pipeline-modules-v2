# Tone & SEO Editor

> Post-writing editing pass that refines content for B2B tone and SEO keyword integration.

**Module ID:** `tone-seo-editor` | **Step:** 5 (Generation) | **Category:** generation | **Cost:** medium
**Version:** 1.0.0 | **Data Operation:** transform

---

## Background

### The Content Problem This Solves

Content-writer produces complete company profiles, but the first draft often has uneven tone and imprecise keyword placement. The writer focuses on generating comprehensive, factual prose at a creative temperature (0.4-0.7). Tone refinement and keyword integration are different tasks that benefit from a separate pass at a lower temperature (0.3-0.5).

Without a dedicated editing step, improving tone or keyword density requires regenerating the entire article — an expensive operation that risks losing good content. By separating editing from writing, operators can iterate on tone and SEO without the cost of full regeneration.

### How It Fits the Pipeline Architecture

Tone & SEO Editor is the third submodule in Step 5's chain, running after content-writer:

```
content-analyzer (=) -> seo-planner (+) -> content-writer (+) -> tone-seo-editor (transform)
```

It uses the **transform** data operation — it takes the existing content_markdown and replaces it with a revised version. The content structure, citations, and heading markers are preserved; only tone, clarity, and keyword placement are improved.

### Why Separate From Content-Writer?

1. **Different LLM temperature** — Creative writing benefits from 0.4-0.7; editing works best at 0.3-0.5
2. **Retry without regeneration** — Can re-run the tone pass without regenerating the entire article
3. **Cheaper/faster model** — Editing is a structured task; haiku handles it well, saving cost compared to sonnet
4. **QA feedback loop** — If QA identifies "tone/SEO weak" issues, this step can be re-run in isolation
5. **Tone experimentation** — Try different tone styles (B2B, casual, technical) on the same content

## When to Use

**Always use when:**
- Content needs consistent B2B tone for client-facing profiles
- SEO keyword placement needs improvement after initial writing
- Content passes through QA and gets flagged for tone or keyword issues

**Consider settings carefully when:**
- Working with non-English content (tone rules assume English conventions)
- Content is already well-optimized (unnecessary passes add cost without value)

**Can skip when:**
- Content-writer prompt already includes detailed tone and keyword instructions
- Content will go through a human editing pass anyway
- Internal/draft content where tone consistency is not critical

## Options Guide

| Option | Default | When to Change | Impact |
|--------|---------|----------------|--------|
| `ai_model` | haiku | Sonnet for higher-quality editing; haiku for fast/cheap iteration | Editing is less sensitive to model quality than writing |
| `ai_provider` | anthropic | Switch for model comparison | Which API to call |
| `temperature` | 0.4 | Lower (0.3) for minimal changes; higher (0.5) for more aggressive rewrites | Controls how much the editor deviates from original |
| `tone_style` | b2b_authoritative | Switch based on audience and content type | Changes the tone instruction set sent to the LLM |
| `max_content_chars` | 50000 | Increase for very long profiles; decrease to save tokens | Content truncated beyond this limit |
| `prompt` | (editing template) | Customize for specific editorial guidelines or brand voice | Full LLM instruction with `{content_markdown}`, `{keyword_targets}`, `{tone_instructions}` placeholders |

### Tone Styles Explained

**b2b_authoritative** (default)
Professional, confident, benefit-first language. Targets decision-makers (CTOs, compliance officers, procurement leads). Active voice, strong verbs, no hedging. Industry terminology used without over-explanation. Sentences kept under 25 words.

**casual_informative**
Friendly, approachable tone. Uses contractions, occasional rhetorical questions, short paragraphs. Like explaining to a smart colleague. Simple words over complex ones. Good for blog-style content or introductory profiles.

**technical_precise**
Exact terminology, no marketing language. Specific numbers, version numbers, protocol names. Passive voice where the actor is irrelevant. Completeness over brevity. Good for technical product profiles or integration guides.

## Recipes

### Standard B2B Edit
Balanced tone and keyword optimization for production profiles:
```
ai_model: haiku
tone_style: b2b_authoritative
temperature: 0.4
```

### SEO Focus
Emphasize keyword placement with minimal tone changes:
```
ai_model: haiku
tone_style: b2b_authoritative
temperature: 0.3
```
Tip: Lower temperature makes the editor more conservative, focusing on keyword insertions over stylistic changes.

### Light Touch
Minimal editing — fix only obvious issues:
```
ai_model: haiku
tone_style: b2b_authoritative
temperature: 0.3
max_content_chars: 50000
```

### Technical Product Profile
Precise, no-marketing-fluff editing for technical products:
```
ai_model: sonnet
tone_style: technical_precise
temperature: 0.3
```

## Expected Output

**Healthy result:**
- Revised content_markdown with improved tone and keyword placement
- Line change count indicating editing scope (typically 20-40% of lines)
- Keyword placement analysis showing where target keywords appear
- Word count roughly similar to original (within 10%)

**Output fields per entity:**
- `entity_name` — company name
- `status` — `edited` or `error`
- `word_count` — word count of revised content
- `tone_changes_count` — number of lines that differ from original
- `keywords_placed` — number of target keywords found in revised content
- `revision_summary` — one-line summary of changes made
- `content_markdown` — the revised content (replaces original)
- `keyword_placements` — array of `{ keyword, locations[] }` objects
- `keyword_placements_text` — human-readable keyword placement report

**Detail view sections:** Revised Content (prose), Revision Summary (text), Keyword Placements (prose), Error (text)

**Example revision summary:**
```
42 lines changed | 8/10 target keywords placed | keyword occurrences: 12 -> 23 | word count: 1850 -> 1920 (+70) | tone style: b2b_authoritative
```

**Red flags to watch for:**
- `tone_changes_count` is 0 or very low — the LLM may have returned the original unchanged
- `tone_changes_count` exceeds 80% of total lines — the LLM rewrote instead of editing
- Word count dropped significantly — the LLM may have removed content
- Keyword placements is 0 when keywords were provided — check if the prompt is working correctly

## Limitations & Edge Cases

- **No factual verification** — The editor cannot verify that its changes preserve factual accuracy. It is instructed not to add or remove claims, but LLMs occasionally do so
- **Citation preservation** — The prompt instructs preservation of `[#n]` citations, but aggressive edits may occasionally relocate or drop them
- **Heading marker fidelity** — Type markers like `[Overview]` and `[Primary Category: ...]` should be preserved, but verify after editing
- **Keyword stuffing risk** — If too many keywords are targeted, the LLM may over-insert them. Keep target lists under 15 total keywords
- **Language limitations** — Tone instructions assume English. Other languages may not benefit from the same editing patterns
- **Content length** — Very long content (40,000+ chars) may be truncated, causing partial editing. Monitor the `max_content_chars` setting

## What Happens Next

After the operator reviews and approves the edited content, items enter the working pool with the revised `content_markdown`. This replaces the content-writer's original draft.

Downstream Step 8 bundling submodules (markdown-output, html-output, json-output) will pick up the revised content via data-shape routing — they look for `content_markdown` on items regardless of which submodule produced it.

If the editing quality is insufficient, the operator can re-run tone-seo-editor with different settings (different tone style, different temperature) without re-running content-writer.

## Technical Reference

- **Step:** 5 (Generation)
- **Category:** generation
- **Cost:** medium
- **Data operation:** transform — replaces content_markdown on existing items
- **Requires:** `content_markdown` from content-writer (via data-shape routing); optionally `seo_plan_json` from seo-planner
- **Input:** Content items found by field presence (`item.content_markdown`), SEO items found by field presence (`item.seo_plan_json`)
- **Output:** `results[]` grouped by `entity_name`, one item per entity with revised content_markdown and editing metrics
- **Display type:** cards (not table) — one card per entity with expandable detail modal
- **Selectable:** true — operators approve/reject the edited version
- **Detail view:** `detail_schema` with header (entity_name, status as badge, word_count, tone_changes_count, keywords_placed) and sections (content_markdown as prose, revision_summary as text, keyword_placements_text as prose, error as text)
- **Error handling:** Missing content_markdown, LLM failures handled per-entity. Entities without content get clear error message
- **Dependencies:** `tools.ai` (LLM calls), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`, `README.md`, `CLAUDE.md`
