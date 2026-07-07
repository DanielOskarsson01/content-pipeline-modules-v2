# Human Rewriter — a CARD of `tone-seo-editor`

**Step 5 — Generation** · **config card, NOT a module** · v1.0.0

A final **humanization edit pass**: takes already-written, SEO-edited `content_markdown` and rewrites it to remove recognizable AI-writing patterns — formulaic transitions, monotonous sentence rhythm, parallel paragraph structure, generic qualifiers, mechanical list intros, predictable section openings, hedging — while **preserving** `[Type]` heading markers, `[#n]` citations, section count, and placed SEO keywords (canonical brief: `docs/submodule-briefs-rev-2026-07-03/step5-human-rewriter.md`).

**This is not a new module.** Everything the humanization pass needs is already a configuration surface of `tone-seo-editor` (v1.2.x): the `prompt`, `temperature`, `ai_model`/`ai_provider`, and `max_content_chars` options, plus the code-enforced marker-preservation gate (`modules/_shared/marker-parser.js`, W1.5). A separate `human-rewriter` module would just duplicate tone-seo-editor's execute loop with a different default prompt — the specialized-per-content-type anti-pattern that got `cv-generator` archived. So the card is **preset config only** (`preset.json`), applied via a template's `preset_map`. Nothing lives in code.

**Framing:** style/voice **quality**, not "AI-detector evasion." No third-party humanizer/detector-bypass services (they degrade factual precision, which the Step 6 citation/hallucination checkers then flag). The QA loop stays the existing Step 6 checkers + Step 10 human gate.

## Presets (`preset.json`)

| Preset | Intensity | temp | model | Use for |
|---|---|---|---|---|
| `light` | ~10–20% of sentences; obvious tells only | 0.5 | sonnet | conservative polish; lowest keyword-erosion risk |
| `moderate` | ~40–60% of sentences noticeably different | 0.6 | sonnet | the default humanization pass |
| `aggressive` | deep rewrite; only headings/markers/citations locked | 0.65 | sonnet | draft reads very "AI"; needs a strong human voice |
| `cover_letter_voice` | first-person voice, banned-cliché list | 0.7 | sonnet | marker-free content (e.g. job-search cover letters) |

Every field in every preset is an existing `tone-seo-editor` option — the card adds **zero** new module options (verified by the test suite).

## How to wire it into a template

The card is a set of `preset_map['tone-seo-editor'].fallback_values`. Three deployment patterns (from the brief):

- **Pattern A — combined pass (one run):** the template's tone-seo-editor prompt does SEO placement first, then a humanization tail-section. One LLM call. Mitigate quality trade-off with moderate temperature.
- **Pattern B — two sequential passes (preferred):** run tone-seo-editor twice at Step 5 — pass 1 SEO-edit @0.4, pass 2 humanize with one of these presets @0.5–0.65. **Caveat:** the skeleton's `execution_plan.submodules_per_step` is keyed by submodule id, so two tone-seo-editor instances in one step may need a skeleton capability (module aliasing / instance ids) — a *skeleton* request, still not a new module. Until then, use Pattern A or C.
- **Pattern C — write-it-right-first (cheapest):** fold the anti-AI-pattern rules into the `content-writer` prompt override so the draft never acquires the tells. Recommended baseline for all templates regardless of A/B.

Example `preset_map` fragment (Pattern A/B, moderate):

```jsonc
{
  "tone-seo-editor": {
    "fallback_values": {
      "prompt": "<preset.json presets.moderate.prompt>",
      "temperature": 0.6,
      "ai_model": "sonnet",
      "max_content_chars": 50000
    }
  }
}
```

## The preservation contract (what the gate enforces)

The humanization prompts instruct the model to preserve `[Type]` markers, `[#n]` citations, section count, FAQ/Meta lines, and placed keywords. Enforcement layers:

- **`[Type]` heading markers** — code-enforced by tone-seo-editor's marker gate: a dropped/renamed marker makes the run **fail loud** (`status: error`), because the Step 8 bundlers parse those markers verbatim.
- **`[#n]` citations** — the prompt preserves them; **Step 6 `citation-coverage-checker`** re-verifies (string-level reattachment to a different claim can't be caught here — `hallucination-detector` + Step 10 human gate are the backstop).
- **Placed SEO keywords** — the prompt preserves them; **Step 6 `keyword-sufficiency-checker`** (loud-fail) catches erosion. Aggressive intensity has the highest erosion risk — prefer light/moderate for keyword-dense articles.
- **Marker-free content** (cover letters) — the gate passes trivially (zero markers in, zero required out).

## Testing

- `node modules/step-5-generation/card-human-rewriter/test-human-rewriter-card.js` — 50 assertions, `tone-seo-editor`'s `ai.complete` mocked, no credentials, no network. Proves: the card is config-only (every key is an existing tone-seo-editor option); each preset is valid (temperature in range, model allowed, prompt carries `{content_markdown}` + the PRESERVE contract); and running the presets **through the real tone-seo-editor** accepts a compliant rewrite (markers preserved), rejects a rewrite that drops a `[Type]` marker (gate error), and passes marker-free cover-letter content.
- **Live-verified 2026-07-07** — one small Sonnet run through tone-seo-editor with the `light` preset on a marked+cited article: the real model returned a humanized rewrite with all `[Type]` markers and `[#n]` citations preserved (`status: edited`). See CLAUDE.md.

## Inert by default

The card is a config folder with **no `manifest.json` and no `execute.js`** — the module loader skips it (a benign "no manifest — skipped" log, exactly like the `pipeline-*` config folders). It changes nothing about `tone-seo-editor` (whose default prompt/behavior is untouched) and does nothing until a template's `preset_map` references a preset. Zero production effect on merge.

## Edge cases & limitations (from the brief)

- **Keyword erosion** under aggressive rewriting → Step 6 `keyword-sufficiency-checker` catches it; light/moderate keep risk low.
- **Citation reattachment** (kept but moved to a different claim) → not detectable by string checks; `hallucination-detector` + Step 10 human gate are the backstop.
- **Long articles** truncated at `max_content_chars` → keep the limit ≥ article length or split upstream (truncation mid-rewrite drops content).
- **Humanize-without-SEO templates:** tone-seo-editor tolerates a missing `seo_plan_json` (warns, edits tone-only), so the card runs for marker-free content types; a template that wants humanization with *no* seo-planner at all can use Pattern C, or file the small generic change to make `seo_plan_json` optional in tone-seo-editor's `requires_columns` (the only code change this brief could motivate — generic, not humanizer-specific).
