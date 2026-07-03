# Submodule Brief: Human Rewriter (revised)

**Step:** 5 — Generation
**Revised:** 2026-07-03 — pipeline-agnostic redesign (Rule 13). Original archived in `_originals-2026-07-03/`.
**Original goal (unchanged):** Rewrite SEO-optimized content to eliminate AI writing patterns and produce natural, human-reading prose as the final generation pass.
**Build status:** not built
**Design verdict:** **card/config of `tone-seo-editor`** (no new module; no new code in the primary path)

## Goal

Take `content_markdown` already produced (and SEO-edited) at Step 5 and run a stylistic rewrite pass that removes recognizable AI-writing patterns — formulaic transitions, monotonous sentence rhythm, parallel paragraph structure, generic qualifiers, mechanical list intros, predictable section openings, hedging phrases — while preserving headings/markers, `[#n]` citations, section count, and placed SEO keywords. Framed as **style/voice quality**, not "AI-detector evasion": no third-party "humanizer/detector-bypass" services are involved; the QA loop stays the existing Step 6 checkers + Step 10 human gate.

## Design (agnostic)

**Apply the module hierarchy hard:** (1) template config of an existing module? **Yes — stop there.** Everything the original brief specifies is already a configuration surface of `tone-seo-editor` (v1.2.x):

| Original brief requirement | Existing tone-seo-editor surface |
|---|---|
| LLM edit pass over existing `content_markdown` | That is the module's entire job (edits, does not generate) |
| Customizable humanization prompt | `prompt` textarea option (template `preset_map` override) |
| Temperature 0.6 (creative variance) | `temperature` number option (default 0.4 — override per template) |
| Sonnet/Gemini-class model, not haiku | `ai_model` / `ai_provider` select options |
| `rewrite_intensity` light/moderate/aggressive | Three prompt presets (intensity is prompt text, not code) |
| Preserve `## [Type]` markers + citations + section count | Already code-enforced: shared marker parser (`modules/_shared/marker-parser.js`, W1.5 gate) + citation preservation checks; Step 6 `citation-coverage-checker` re-verifies |
| `max_content_chars` truncation guard | Existing option (default 50000) |

**Rule 13 test:** "Can this be expressed as configuration a template uploads via the UI?" Yes — the humanization prompt, intensity, temperature, and model are all `preset_map` fields. Therefore nothing lives in code. A new `human-rewriter` module would duplicate tone-seo-editor's execute loop with a different default prompt — exactly the specialized-module anti-pattern that got cv-generator archived (2026-05-23 session).

**The original brief's "Why separate from tone-seo-editor?" argument** (opposing goals, different temperature) is an argument for a separate **pass/configuration**, not a separate **module**. Two deployment patterns:

- **Pattern A — combined pass (available today):** the template's tone-seo-editor prompt override does SEO placement first, then a humanization section ("after placing keywords, revise for natural rhythm: …"). One LLM call, one run. Accepts the brief's concern that combining degrades both — mitigate by ordering instructions and keeping temperature moderate (0.5).
- **Pattern B — two sequential passes (preferred by the original brief):** run tone-seo-editor twice at Step 5 with different presets (pass 1: SEO edit @0.4; pass 2: humanize @0.6). **Open question below:** the skeleton's `execution_plan.submodules_per_step` is keyed by submodule id — duplicate instances of the same submodule in one step are likely unsupported today. If confirmed unsupported, that is a *skeleton capability request* (module aliasing / instance ids), still not a new module.
- **Pattern C — write-it-right-first (cheapest, zero extra runs):** fold anti-AI-pattern style rules into the `content-writer` prompt override so the draft never acquires the tells. Recommended as baseline for all templates regardless of A/B.

**Step-boundary note:** pure Step 5 — transforms format-agnostic markdown in the pool. No files, no output formatting (Step 8 untouched).

## Module contract

Inherited from `tone-seo-editor` (nothing changes): `item_key: entity_name` · `data_operation_default: add` · `pool_precondition: requires_items` · `cost: medium` · `requires_columns: ["seo_plan_json"]` · pushes to `tools._partialItems` per entity (Rule 10, already in place). Uses `tools.ai` only — no new I/O surface.

**Note:** `requires_columns: ["seo_plan_json"]` + `depends_on: [content-writer, seo-planner]` means a template that wants humanization *without* SEO planning cannot run tone-seo-editor today. For those templates use Pattern C, or file a small generic change making `seo_plan_json` optional in tone-seo-editor (mirroring content-writer v1.4.0's optional seo-planner). That relaxation is the only code change this brief could motivate — and it is generic, not humanizer-specific.

## Options (manifest sketch)

No new manifest options in the primary path. The "options" are template `preset_map.tone-seo-editor.fallback_values`:

```jsonc
{
  "prompt": "<humanization prompt — see Example template configurations>",
  "temperature": 0.6,
  "ai_model": "sonnet",
  "max_content_chars": 50000
}
```

Cost guard: this is an LLM pass (~$0.02–0.10/entity on Sonnet-class at 2–3K words); the existing `max_content_chars` bounds input, and per-run entity count is bounded by the pipeline itself. No per-provider spend beyond `tools.ai` — no new cost-guard options needed.

## Providers (researched 2026-07-03)

No new external providers. The pass runs on providers already wired into the skeleton's `tools.ai.complete` (verified in `content-pipeline-v2/server/workers/stageWorker.js`): `anthropic` (ANTHROPIC_API_KEY), `openai` (OPENAI_API_KEY), `perplexity` (PERPLEXITY_API_KEY — not relevant here). Gemini (the original brief's alternative) is **not** currently a `tools.ai` provider; adding it is a skeleton change, out of scope. Do **not** integrate commercial "humanizer"/"AI-detector-bypass" APIs (Undetectable.ai etc.) — policy call: quality editing, not detector evasion, and detector arms-race outputs routinely degrade factual precision, which Step 6 hallucination/citation checkers would then flag.

## Example template configurations

**Company profiles (OnlyiGaming) — humanization prompt override (Pattern A tail-section or Pattern B pass 2):**

```text
You are a line editor. Revise the article below for natural, human rhythm. Do NOT add or remove facts.
Fix these patterns wherever they appear:
1. Formulaic transitions ("Furthermore", "Moreover", "Additionally") → content-specific transitions.
2. Monotonous rhythm → vary sentence length (5–30 words) and openers.
3. Parallel paragraph structure → lead some paragraphs with a detail, end some with a question.
4. Generic qualifiers ("comprehensive suite of", "wide range of") → specific counts/details already in the text.
5. Mechanical list intros → weave some list items into prose.
6. Predictable section openings → not every section starts "{Company} offers/provides".
7. Hedging ("It is important to note") → state facts directly.
PRESERVE EXACTLY: every ## / ### heading incl. [Type] markers; every [#n] citation on its claim; section count;
FAQ **Q:** format; **Meta Title:** / **Meta Description:** lines; all SEO keywords already placed.
Intensity: moderate — 40–60% of sentences noticeably different. Output revised markdown only.
```

Intensity presets = same prompt with the last-but-one line swapped (light: "10–20% of sentences, fix only obvious tells"; aggressive: "deep rewrite; only headings and citations are locked").

**Second content type — job-search cover letters:** template overrides the same module with a voice-preset prompt ("first person, concrete verbs, no 'passionate/excited/leveraged/spearheaded'…" — mirrors the banned-cliché list already proven in `pipeline-job-search/cover_letter_prompt.md`), temperature 0.7, no [Type] markers to preserve (marker gate passes trivially on marker-free content — verify, see Open questions).

## Credentials & testing

- **Env vars:** none new. ANTHROPIC_API_KEY and OPENAI_API_KEY **exist in the skeleton `.env` today and are approved for reuse** — the pass is live-testable now on either provider via `tools.ai`.
- **Unit tests (credential-free):** mocked `tools.ai.complete` returning a canned rewrite; assert marker/citation preservation validation catches (a) a dropped `[#7]`, (b) a renamed `## [Overview]` heading, (c) section-count change — these tests already exist for tone-seo-editor's gate; add the humanization-prompt fixtures alongside.
- **Cheapest live test:** one entity, `ai_model: haiku`, `max_content_chars: 5000`, light intensity — single call ≈ $0.005. Then one Sonnet run on a locked reference article (Casino Platforms baseline) diffed against input for a human read.
- **E2E:** run inside an existing company-profile template with the preset override; confirm Step 6 checkers (citation-coverage, keyword-sufficiency) still pass post-rewrite — that is the regression contract.

## Edge cases & failure modes

- **Keyword erosion:** aggressive rewriting can paraphrase away placed keywords → `keyword-sufficiency-checker` (W1.1, loud-fail) catches it at Step 6; light/moderate presets keep risk low.
- **Citation drift:** citation kept but moved to a different claim — string-level validation can't detect reattachment; `hallucination-detector` + Step 10 human gate are the backstop.
- **Marker-free content types:** confirm the marker gate treats zero-marker input as pass, not fail.
- **LLM returns commentary/fences instead of pure markdown:** tone-seo-editor's existing output handling applies; validation failure → warn, keep original.
- **Long articles truncated at `max_content_chars`:** truncation mid-rewrite would drop content — module already guards; keep limit ≥ article length or split upstream.

## Open questions

1. **Same-module-twice-per-step (Pattern B):** does `execution_plan.submodules_per_step` support two tone-seo-editor instances with different presets? Skeleton capability audit needed; if not, decide combined-pass (A) vs skeleton aliasing work.
2. **Optional `seo_plan_json`:** relax tone-seo-editor's `requires_columns`/`depends_on` so humanize-only templates (no seo-planner) can run it? Small generic change, needs its own review.
3. **Measuring success:** no automated "sounds human" metric exists in Step 6. Is a lightweight QA checker (e.g., transition-word density, sentence-length variance — pure code, cheap) worth adding, or is Step 10 human review sufficient? Default: Step 10 suffices; revisit only if reviewers report AI-pattern regressions at volume.
