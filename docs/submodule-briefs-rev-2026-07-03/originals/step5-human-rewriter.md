# Submodule Research Brief: Human Rewriter

**Step:** 5 — Generation
**One-line purpose:** Rewrite SEO-optimized content to eliminate AI writing patterns and produce natural, human-readable prose as the final generation pass.

---

### What goes in?

Entity with items from tone-seo-editor (content_markdown) and seo-planner (seo_plan_json with keywords_used). This runs AFTER tone-seo-editor as the last Step 5 submodule.

### What comes out?

Revised content_markdown with natural flow and eliminated AI patterns. Items: entity_name, content_markdown (revised), revision_summary, lines_changed, citations_preserved (boolean), headings_preserved (boolean), validation_warnings, rewrite_intensity.

### Approach

1. Load tone-seo-editor's markdown and seo-planner's keyword targets (for awareness, not modification)
2. LLM editing pass with specific instructions targeting 7 AI writing patterns:
   - **Formulaic transitions** — eliminate "Furthermore," "Moreover," "Additionally," etc. Use content-specific transitions instead
   - **Monotonous sentence rhythm** — vary sentence length (5-30 words), vary sentence openers (subject, prepositional phrase, dependent clause)
   - **Parallel paragraph structure** — break the topic→support→support→conclusion pattern. Lead some paragraphs with a detail, end some with a question
   - **Generic qualifiers** — replace "comprehensive suite of" / "wide range of" with specific counts or details from the content
   - **Mechanical list introductions** — weave some list items into prose instead of always using "Key features include:" + bullets
   - **Predictable section openings** — not every section should start with "{Company} offers/provides". Start with market context, a specific achievement, or a customer benefit
   - **Hedging phrases** — remove "It is important to note," "It should be mentioned that." State facts directly
3. LLM returns revised markdown only (no JSON, no code fences)
4. Post-LLM structural validation:
   - Verify all `## [Type Marker]` headings preserved exactly
   - Verify all `[#n]` citations present (none dropped)
   - Verify section count unchanged
5. Diff original vs revised to count changed lines
6. Emit validation warnings if any structural check fails (non-blocking)

### Preservation Rules (in prompt)

These elements MUST appear identically in the output:
- Every `##` and `###` heading including [Type Markers]
- Every `[#n]` citation reference, attached to the same factual claim
- Same number of `##` sections (no merge/split/add/remove)
- FAQ `**Q: {question}**` format
- `**Meta Title:**` and `**Meta Description:**` values
- SEO keywords already placed by tone-seo-editor

### External Dependencies

- LLM API: Sonnet (default) or Gemini as provider option. Humanization is a creative rewriting task — benefits from higher model capability than haiku
- Temperature: 0.6 (higher than tone-seo-editor's 0.4 — more stylistic variance is desired, factual ground truth is already in the input)

### Options

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| ai_model | select | sonnet | Sonnet/Gemini recommended; haiku may produce formulaic rewrites |
| ai_provider | select | anthropic | Gemini available as alternative provider |
| temperature | number | 0.6 | Range 0.3-0.8. Higher = more creative variance |
| rewrite_intensity | select | moderate | light (~10-20% change), moderate (~40-60%), aggressive (deep rewrite) |
| prompt | textarea | (humanization prompt) | Customizable with {content_markdown} and {rewrite_instructions} placeholders |
| max_content_chars | number | 50000 | Truncation safety for very long articles |

### Rewrite Intensity Levels

- **Light:** Fix only obvious AI tells. Preserve ~90% of original phrasing. Swap formulaic transitions, fix the worst hedging phrases. Target: 10-20% of sentences change.
- **Moderate:** Rewrite for natural flow. Vary sentence length, replace generic qualifiers with specifics, restructure repetitive paragraphs. Target: 40-60% of sentences noticeably different.
- **Aggressive:** Deep rewrite. Only heading structure and citations are locked. Rethink paragraph organization, introduce rhetorical variety (questions, contrasts, narrative). Target: reads as if written by a different (human) writer.

### Why Separate From Tone-SEO-Editor?

- **Different goal:** Tone-SEO-editor optimizes FOR keywords and tone. Human-rewriter optimizes AGAINST AI patterns. These are opposing forces — combining them in one prompt degrades both.
- **Different temperature:** Creative rewriting at 0.6 would be dangerous during keyword placement. But rewriting existing correct content at 0.6 is safe because the factual ground truth is in front of the LLM.
- **Iterability:** If humanization is too aggressive, re-run at `light` without touching any upstream modules. If SEO keywords need adjustment, re-run tone-seo-editor without re-humanizing.
- **Model flexibility:** Can use Gemini or a different provider for this pass since it's purely stylistic — no domain-specific reasoning required.

### Example Output

```javascript
{
  entity_name: "Betsson",
  items: [{
    entity_name: "Betsson",
    status: "humanized",
    content_markdown: "## [Overview] Betsson — Where Nordic Precision Meets Global Ambition\n\nFew operators have managed to...",
    revision_summary: "47 lines changed | intensity: moderate | headings: OK | citations: OK | sections: OK | words: 2145 -> 2098 (-47)",
    lines_changed: 47,
    rewrite_intensity: "moderate",
    citations_preserved: true,
    headings_preserved: true,
    validation_warnings: "",
    content_preview: "## [Overview] Betsson — Where Nordic Precision Meets Global Ambition\n\nFew operators have managed to...",
    word_count: 2098,
    error: "",
  }],
  meta: { status: "success", lines_changed: 47, word_count: 2098, citations_preserved: true, headings_preserved: true }
}
```
