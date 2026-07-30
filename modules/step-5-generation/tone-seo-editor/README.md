# Tone & SEO Editor

> Post-writing editing pass that refines content for tone and SEO keyword integration. Content-type-agnostic by default; vertical/brand framing is layered in via presets or template-level prompt overrides.

**Module ID:** `tone-seo-editor` | **Step:** 5 (Generation) | **Category:** generation | **Cost:** medium
**Version:** 1.2.0 | **Data Operation:** add (+)

## Changelog

- **1.2.1** — Added a post-edit **marker-preservation gate** (W1.5). Every heading bracket marker the Step 8 bundlers can parse in the input (e.g. `[Primary Category: slug]`, `[Tag: slug]`) MUST still be parseable in the revised output, or the entity hard-fails with an error naming the dropped markers. The gate reuses the bundlers' own parser (`modules/_shared/marker-parser.js`), so it can never drift from what the bundlers actually accept. Pipeline-agnostic: input with no markers passes trivially. Behaviour is otherwise unchanged.
- **1.2.0** — Module-level default genericised per the "small generic modules, not specialized ones" architectural commitment. Removed iGaming-vertical and B2B framing, removed hardcoded `{doc:tone_guide.md}` placeholder, removed company-profile-specific `[Overview]` / `[Primary Category: ...]` literal examples (rule kept generically). Generic SEO/structural/citation/FAQ rules retained. `{doc:<filename>}` mechanism still supported — operator chooses the filename in their preset or override. See **Configuring per content type** below for the preset + template-override pattern.
  - **Upgrade note:** existing templates with a customized stored prompt do NOT auto-pick-up the new default. Templates that previously customized around the v1.0.0/v1.1.0 iGaming framing or `{doc:tone_guide.md}` placeholder continue to work unchanged. To adopt the v1.2.0 genericised default + preset architecture on an existing template, load the new default into the prompt textarea, then layer the OnlyiGaming voice preset on top.
- **1.1.0** — (committed, not pushed) Added `{doc:tone_guide.md}` hardcoded placeholder and "leave good sections alone" license. Lock-ins reverted in v1.2.0; license retained.
- **1.0.0** — Initial release.

---

## Background

### The Content Problem This Solves

Content-writer produces complete company profiles, but the first draft often has uneven tone and imprecise keyword placement. The writer focuses on generating comprehensive, factual prose at a creative temperature (0.4-0.7). Tone refinement and keyword integration are different tasks that benefit from a separate pass at a lower temperature (0.3-0.5).

Without a dedicated editing step, improving tone or keyword density requires regenerating the entire article — an expensive operation that risks losing good content. By separating editing from writing, operators can iterate on tone and SEO without the cost of full regeneration.

### How It Fits the Pipeline Architecture

Tone & SEO Editor is the third submodule in Step 5's chain, running after content-writer:

```
content-analyzer (+) -> seo-planner (+) -> content-writer (+) -> tone-seo-editor (+)
```

It uses the **add** data operation — it produces a revised version of the content as new pool items. The content structure, citations, and heading markers are preserved; only tone, clarity, and keyword placement are improved.

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
| `prompt` | (editing template) | Customize for specific editorial guidelines or brand voice | Full LLM instruction with `{content_markdown}`, `{keyword_targets}`, `{tone_instructions}`, and `{doc:<filename>}` placeholders |
| `reference_docs` | (none) | Attach any reference doc your prompt references via a `{doc:<filename>}` placeholder (e.g. a voice guide, style sheet, brand brief). | Files selected here are injected into the prompt wherever a matching `{doc:<filename>}` placeholder appears. Unmatched placeholders are silently stripped. The module default uses NO `{doc:...}` placeholders — add one in your preset or template-level override and tick the matching file. |

### Tone Styles Explained

**b2b_authoritative** (default)
Professional, confident, benefit-first language. Targets decision-makers (CTOs, compliance officers, procurement leads). Active voice, strong verbs, no hedging. Industry terminology used without over-explanation. Sentences kept under 25 words.

**casual_informative**
Friendly, approachable tone. Uses contractions, occasional rhetorical questions, short paragraphs. Like explaining to a smart colleague. Simple words over complex ones. Good for blog-style content or introductory profiles.

**technical_precise**
Exact terminology, no marketing language. Specific numbers, version numbers, protocol names. Passive voice where the actor is irrelevant. Completeness over brevity. Good for technical product profiles or integration guides.

## Configuring per content type

The module default prompt is intentionally content-type-agnostic (no vertical lock, no hardcoded reference-doc filename, no content-type-specific output markers). Per the project's architectural commitment ("small generic modules, not specialized ones"), vertical/brand/content-type specifics layer on via two mechanisms:

### Preset — for specifics reused across multiple templates

Presets are operator-authored and stored in the skeleton's `option_presets` Supabase table. They are not files in this repo — there is nothing to commit. Author flow:

1. In the UI, open any template's Tone & SEO Editor step.
2. Paste the full customized prompt (e.g. add the vertical framing, append `{doc:tone_guide.md}` under a "### BRAND TONE GUIDE" section) into the `prompt` textarea.
3. Click **Save as preset**, name it (e.g. `OnlyiGaming B2B iGaming Voice`), choose **Global** so all projects see it.
4. Other templates select it from the **— Presets —** dropdown above the prompt field; the full prompt loads.

**Stacking is NOT supported.** The preset dropdown REPLACES the field value — picking a preset clobbers whatever is there, picking a second preset clobbers the first. One preset per option per template.

### Template-level override — for one-off specifics

Anything specific to a single template (e.g. company-profile output markers like `[Overview]` or `[Primary Category: ...]`) belongs in the template's stored prompt, not the preset. Workflow:

1. Select the relevant preset from the dropdown to load its prompt as a starting point.
2. Edit the prompt textarea directly to append/insert the template-specific rules.
3. Save the template. The customized prompt is stored against that template only.

The OnlyiGaming company-profile template, for example, loads the `OnlyiGaming B2B iGaming Voice` preset and then appends a rule: *"Do NOT change or remove these heading/type markers: [Overview], [Primary Category: ...]."*

### `{doc:<filename>}` placeholder mechanism

Any text inside the prompt of the form `{doc:somefile.md}` is replaced at execution time with the contents of `somefile.md`, IF the operator ticks `somefile.md` in `reference_docs`. If the file is not attached, the placeholder is silently stripped. The filename is arbitrary — pick whatever the operator will upload (`tone_guide.md`, `voice_brief.md`, `style_guide.md`, etc.). The module makes no assumptions about which filenames exist.

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
- **Heading marker fidelity** — Type markers like `[Overview]` and `[Primary Category: ...]` are now ENFORCED (v1.2.1): if the LLM drops or mangles any marker present in the input, the entity hard-fails instead of silently passing garbled output downstream. The check uses the Step 8 bundlers' own parser. (Markers lost to `max_content_chars` truncation are not counted — only markers in the text actually sent to the model.)
- **Keyword stuffing risk** — If too many keywords are targeted, the LLM may over-insert them. Keep target lists under 15 total keywords
- **Language limitations** — Tone instructions assume English. Other languages may not benefit from the same editing patterns
- **Content length** — Very long content (40,000+ chars) may be truncated, causing partial editing. Monitor the `max_content_chars` setting

## What Happens Next

After the operator reviews and approves the edited content, items enter the working pool with the revised `content_markdown`. This replaces the content-writer's original draft.

Downstream Step 8 bundling submodules (markdown-output, html-output, json-output) will pick up the revised content via data-shape routing — they look for `content_markdown` on items regardless of which submodule produced it.

If the editing quality is insufficient, the operator can re-run tone-seo-editor with different settings (different tone style, different temperature) without re-running content-writer.

## Prompt caching + $-sequence fix (v1.3.0, BACKLOG #21)

`buildPrompt` now inserts the article, keyword targets, tone instructions and
`{doc:}` content with function-form replacement, so `$`-sequences (`$$`,
`$&`, `` $` ``, `$'`, `$n`) are inserted literally instead of being
interpreted as replacement patterns (same fix class as c5b0ef6; previously
the edited article was silently mangled around money amounts). The editor
also splits its prompt before the first per-entity placeholder
(`{content_markdown}`/`{keyword_targets}`) and sends the stable head as an
Anthropic `cache_prefix` — byte-identical reassembly guarded at runtime. The
current template's head is ~170 chars, far below the cacheable minimum, so
caching stays inert (and logged) until the template moves stable bulk ahead
of the article.

## Technical Reference

- **Step:** 5 (Generation)
- **Category:** generation
- **Cost:** medium
- **Data operation:** add (+) — produces revised content_markdown as new pool items
- **Requires:** `content_markdown` from content-writer (via data-shape routing); optionally `seo_plan_json` from seo-planner
- **Input:** Content items found by field presence (`item.content_markdown`), SEO items found by field presence (`item.seo_plan_json`)
- **Output:** `results[]` grouped by `entity_name`, one item per entity with revised content_markdown and editing metrics
- **Display type:** cards (not table) — one card per entity with expandable detail modal
- **Selectable:** true — operators approve/reject the edited version
- **Detail view:** `detail_schema` with header (entity_name, status as badge, word_count, tone_changes_count, keywords_placed) and sections (content_markdown as prose, revision_summary as text, keyword_placements_text as prose, error as text)
- **Error handling:** Missing content_markdown, LLM failures handled per-entity. Entities without content get clear error message
- **Dependencies:** `tools.ai` (LLM calls), `tools.logger`, `tools.progress`
- **Files:** `manifest.json`, `execute.js`, `README.md`, `CLAUDE.md`
