# Post-deploy watch list — step-6 QA quartet (deploy `4a9c0b5`, 2026-08-15)

Shipped: four fail-closed / correctness fixes in step-6 QA modules, plus a version
bump so the registry can tell pre-fix from post-fix behaviour in prod.

| Fix | Module(s) | Version | What changed |
|-----|-----------|---------|--------------|
| H18b | `citation-coverage-checker`, `qa-structural` | 1.0.1, 1.1.1 | Grade only the **latest** `content_markdown` draft (`.at(-1)`), not all drafts concatenated |
| H19  | `keyword-sufficiency-checker` | 1.0.2 | Actually **reads** `content_markdown` before grading (was a false-green: graded without reading) |
| H20  | `hallucination-detector` | 1.1.0 | **No sources → fail closed** (`no_sources_behavior: "fail"`); unverifiable ≠ verified |
| H21  | `hallucination-detector` | 1.1.0 | **Substantial content with zero extractable claims → fail closed** (`flag_zero_claims_over_chars: 500`) |

**These guards are fail-closed and have never fired in the 16 step-6 pools of
persisted prod history** (2 runs, 9 entities, 2026-07-14..27: 0 keyword runs,
0/16 zero-source, 0/16 zero-claims, 0/16 two-draft). They *will* fire eventually,
and that is intended. This document is how to read the first firings — a correct
halt vs an over-firing guard — **not** a mandate to tune anything. **Do not
pre-emptively tune any threshold.**

## Where to watch (prod, read-only `fevxvwqjhndetktujeuu`)

- `entity_submodule_runs` — `status` (`failed`/`approved`), `error`, `output_data`
  (the checker's per-entity item: `qa_pass`, `summary_text`, `meta`).
- `entity_stage_pool.pool_items` — the step-6 pool the checker reads; count how many
  items carry `content_markdown` and their `source_submodule`.
- loop-router routing at step 7 — a `qa_pass:false` verdict routes/`flag_manual`s the
  entity; that is the visible downstream effect of any guard firing.

---

## H20 — hallucination-detector: no sources → fail closed

- **Module / knob:** `hallucination-detector` 1.1.0, `no_sources_behavior` (default `"fail"`).
- **Failure signature:** entity gets `qa_pass:false`, `meta.error:"no_content"` or a
  summary like *"...no claims could be verified. Failing closed (unverifiable is not
  verified)."* Fires when the entity reaches step 6 with **no `text_content`** (no
  scraped source) to verify claims against.
- **Correct halt:** the entity genuinely had zero scraped source text. Publishing
  content that cannot be checked against any source is exactly what this blocks.
- **Over-firing signature:** the entity **did** have source text upstream but it did
  not reach the step-6 pool (wiring / `requires_columns` / pool-merge gap). Distinguish
  by inspecting `entity_stage_pool.pool_items` for that entity at step 6: if
  `text_content` is present in the pool but the checker reports "no sources", it is a
  **wiring bug**, not a real halt. A real halt shows an empty/absent `text_content` in
  the pool too.
- **Softening exists, don't reach for it first:** `no_sources_behavior` can be set to
  the legacy skip-with-pass per-template — only for a pipeline that *legitimately* has
  no sources. Diagnose wiring first.

## H21 — hallucination-detector: zero claims over 500 chars → fail closed

- **Module / knob:** `hallucination-detector` 1.1.0, `flag_zero_claims_over_chars` (default **500**).
- **Failure signature:** content longer than 500 chars from which the regex claim
  extractor pulls **zero** verifiable claims → fails closed ("padding-blind" signature).
- **⚠ The 500-char threshold is UNVALIDATED. There is no production data behind it**
  — 0 of 16 persisted pools hit this path, so the number is a heuristic guess, not a
  calibrated value. Treat the first firings as data *about the threshold*, not just
  about the content.
- **Correct halt:** the content really is padding/fluff — long but with no verifiable
  factual claims.
- **Over-firing signature:** the content has real claims, but they are phrased
  **qualitatively** and the regex extractor cannot see them. The extractor matches
  quantitative patterns (e.g. "USD 500", "500 employees", "over 500 games", dates,
  percentages); qualitative claims slip through. This is a **known coverage gap**
  (UNIT_50 / #51). If a halt fires on an article a human reads as claim-rich, it is
  the extractor's limitation surfacing, not bad content.
- **How to tell them apart:** read the graded `content_markdown` for the halted entity.
  Genuinely thin → correct. Substantive but qualitatively-worded → over-firing driven
  by the extractor blind spot. **Do not tune 500 on a single data point** — record
  each firing (entity, char count, human claim-richness verdict) and let a pattern form.

## H19 — keyword-sufficiency-checker: reads content before grading

- **Module:** `keyword-sufficiency-checker` 1.0.2.
- **Reachability caveat:** this checker is **not on the current production template's
  step-6 subset** (that subset runs hallucination-detector, citation-coverage-checker,
  meta-compliance-checker, qa-structural — keyword NOT run; 0 keyword runs in prod
  history). H19 cannot fire until keyword-sufficiency-checker is added to a template.
- **Failure signature (once scheduled):** `qa_pass:false` because target SEO keywords
  are genuinely absent/underused in the `content_markdown` it now actually reads.
- **Correct halt:** keywords truly missing from the article.
- **Over-firing signature:** keywords are present but in a form the checker doesn't
  match (casing/stemming), or the `seo_plan_json` keyword targets are malformed/empty.
  Check the seo_plan the entity carries before trusting the halt.

## H18b — citation-coverage-checker & qa-structural: grade the published draft

- **Modules:** `citation-coverage-checker` 1.0.1 and `qa-structural` 1.1.1 — both now
  grade `contentItems.at(-1).content_markdown` (the last draft) instead of all drafts
  joined with `\n\n`.
- **First live exercise — watch the next clean run.** The live production template
  `3a284997` ("PRODUCTION — iGaming Company Profile v1") schedules **`tone-seo-editor`
  at step 5** alongside `content-writer`. Both emit inline `content_markdown` under
  `add`, and the pool keys `add` by composite `(entity_name, source_submodule)`
  (`applyDataOperation.js`), stamping distinct `source_submodule` values
  (`submoduleRuns.js`). So on the **next clean run, a step-6 pool will hold two
  `content_markdown` drafts for the same entity for the first time** — the first real
  exercise of the H18b fix. (It never fired in history: the only 2-emitter run,
  cb49ef80, was hand-rewritten afterwards so only the content-writer draft persisted.)
- **What a CORRECT H18b outcome looks like on that run:**
  1. `entity_stage_pool.pool_items` at step 6 shows **two** rows with `content_markdown`
     — `source_submodule: content-writer` and `source_submodule: tone-seo-editor`.
  2. citation-coverage-checker and qa-structural grade **only the tone-seo-editor
     draft** (the last one), i.e. the exact draft the step-8 output modules publish
     (`markdown-output` / `html-output` / `json-output` all take `.at(-1)`).
  3. **The verdict matches what step 8 publishes** — the citation score / structural
     verdict reflects the tone-seo-editor draft, and the published article is that same
     draft. Grader and publisher agree on which text was judged.
- **Wrong / regression signature:** the checker grades the content-writer draft or the
  concatenation of both (verdict computed over ~2× the length, citation density skewed),
  or its verdict diverges from the draft step 8 actually publishes.

---

## Recorded defect (NOT fixed here) — deploy.yml co-tenancy

- **Defect:** [`.github/workflows/deploy.yml:75`](../../.github/workflows/deploy.yml#L75)
  runs `pm2 delete all` against **root's shared PM2** before starting
  content-pipeline-v2's 4-app ecosystem. Any co-tenant service under the same PM2 is
  deleted and never restarted. On this deploy it took down **`meal-api`**
  (`/var/www/meals-api`, port 3002), started 2026-08-14; it was manually restored
  (`cd /var/www/meals-api && pm2 start index.js --name meal-api && pm2 save`) and the
  dump now holds all five processes. (Separately noted: meal-api runs without its
  `ANTHROPIC_API_KEY` loaded — a pre-existing defect in its own setup, not this deploy.)
- **The fix (for a future, separate PR):** delete/restart **only the four named
  pipeline apps** — `pipeline-api`, `stage-worker`, `batch-worker`, `profile-api` —
  instead of `pm2 delete all`; do not touch processes the ecosystem file does not own.
- **Verification requirement:** this must be verified on **its own deploy** (a no-op
  content change), with a co-tenant process (e.g. meal-api) running before and confirmed
  still-online after — **not bundled with a content change**, so the PM2-lifecycle
  behaviour change is isolated and observable.
