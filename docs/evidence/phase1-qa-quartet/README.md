# Phase 1 — QA Quartet (modules repo)

Branch: `qa-quartet-modules` off `main` @ `84cc362`.
Source handoff: `content-pipeline-v2/docs/handoff/PHASE1_QA_MODULES_HANDOFF.md` (skeleton trace, line-cited).

Five QA defects. Together they meant a green QA verdict proved nothing: a checker
that never read its input (H19/H20), graded the wrong text (H18b), or was absent
entirely (H23) still produced "pass" — and the router reported "All QA checks
passed." Order below is the fix order (false-green class first, coverage gap last).

Every defect has a `*-BEFORE.txt` (the current code returning a pass on something
that should fail — RED) and a `*-AFTER.txt` (the same test GREEN after the fix)
in this directory. Tests live next to the modules (repo convention: `test-*.js`,
plain Node, no deps). Run any with `node <path>`.

---

## H23 — loop-router: a MISSING checker read as a pass
`modules/step-7-routing/loop-router/execute.js`

**Root cause.** `aggregateQaResults` seeds every check to `'missing'` and the
failure set is built only from `'fail'`, never `'missing'`. The one absent-checker
guard fires only for the *all*-missing case (`checksRun === 0`). A **partial** set
— four checkers ran and passed, one produced nothing — has `failures=[]`,
`checksRun=4`, so it falls straight through to Rule 8 → `approve` /
"All QA checks passed."

**Pre-fix failing case** (`H23-loop-router-BEFORE.txt`): entity with hallucination
output removed, other four passing → `decision='approve', reason='All QA checks
passed.'`

**Fix.** New Rule 1.5: any *expected* checker that did not report → `flag_manual`
naming the absent checker(s). Expected set is the `expected_checks` option
(default all five: keyword, meta, citation, hallucination, structural); a template
that legitimately runs a subset narrows it to opt a checker out. Unknown names
never match a summary key, so a stray opt-in cannot manufacture a phantom failure.
This is the handoff's "static expected set" (design 2) — module-only, no skeleton
seam required.

**Post-fix** (`H23-loop-router-AFTER.txt`): missing-hallucination entity →
`flag_manual` "QA verdict incomplete … hallucination". Full set still approves.
Subset + matching `expected_checks` still approves. Existing
`test-structural-routing.js` unchanged (10/10). Test: `test-missing-checker.js`.

---

## H19 — keyword-sufficiency-checker: pass without reading content
`modules/step-6-qa/keyword-sufficiency-checker/execute.js`

**Root cause.** The "no `seo_plan_json` present" branch returned
`qa_pass:true, keyword_score:1` **before any content check**. So an entity with
NO content and NO plan was certified green — a pass over content the checker never
read (indeed, content that does not exist). The downstream no-content guard was
unreachable on that branch.

**Pre-fix failing case** (`H19-keyword-reads-content-BEFORE.txt`): entity with no
`content_markdown` and no `seo_plan_json` → `qa_pass=true, keyword_score=1`.

**Fix.** Read the subject first: a `content_markdown` presence check hoisted to the
top of the per-entity loop → fail closed when content is absent, regardless of plan
state (mirrors qa-structural / citation-coverage, which already guard content
first). The no-plan-**with-content** case keeps the *documented* soft-gate contract
(pass-with-warning) — whether an absent `seo_plan` should hard-fail is a
product-policy call the handoff explicitly reserves for Daniel (UNIT_50 Decision 4)
— but it is no longer a **clean** green: it now carries `needs_review:true`.

**Post-fix** (`H19-keyword-reads-content-AFTER.txt`): no-content-no-plan → fail
closed; no-plan-with-content → pass + `needs_review`; good input still passes.
Existing `test-empty-plan.js` unchanged (17/17). Test: `test-reads-content.js`.

**Deferred (Daniel product call):** should `no seo_plan at all` hard-fail rather
than soft-pass? Left as the documented contract + `needs_review`. Not decided here.

---

## H20 — hallucination-detector: pass with no sources to verify against
`modules/step-6-qa/hallucination-detector/execute.js`

**Root cause.** `sourceItems.length === 0` returned `qa_pass:true,
hallucination_score:1, skipped:true` — content asserting factual claims with
nothing to ground them against, certified with a perfect score. UNIT_50 Decision 1
calls this "THE SEVERE ONE."

**Pre-fix failing case** (`H20-hallucination-no-sources-BEFORE.txt`): claimful
content, zero sources → `qa_pass=true, score=1`.

**Fix.** Fail closed by default (`no_sources_behavior='fail'`): `qa_pass:false,
hallucination_score:0, needs_review:true`. Claims are now extracted **before** the
guard so the failure reports "N claim(s) unverifiable." Carve-outs:
`no_sources_behavior='flag'` (pass + needs_review) and `='pass'` (legacy
skip-with-pass).

**Post-fix** (`H20-hallucination-no-sources-AFTER.txt`): fail closed, score 0, no
LLM call, reports 1 unverifiable claim; `='pass'` opt-out restores skip. Existing
`test-fail-closed.js` (13/13), `test-verified-count.js` (13/13),
`test-prompt-codelock.js` (22/22) all unchanged. Test: `test-no-sources.js`.

---

## H18b — step-6 checkers grade CONCATENATED drafts
`hallucination-detector`, `keyword-sufficiency-checker`, `citation-coverage-checker`,
`qa-structural`

**Root cause.** content-writer and tone-seo-editor both emit inline
`content_markdown` under `data_operation:add` with different `source_submodule`, so
BOTH drafts survive the pool (composite key `(item_key, source_submodule)`). The
step-8 output modules publish only the latest —
`markdown-output:189` / `html-output:182` / `json-output:151` all do
`.filter(i => i.content_markdown).at(-1)`. The step-6 checkers instead
`.map().join()` and grade **both drafts concatenated**, so the verdict is about
text that was never published. (The skeleton `completed_at` tiebreaker fixed the
*hydrated* enrichment fields — text_content, seo_plan_json — but NOT the inline
drafts. This is that unfixed half.)

**Pre-fix failing case** (`H18b-latest-draft-BEFORE.txt`): a two-draft entity —
OLD (content-writer) = three cited claims (would PASS citation), NEW
(tone-seo-editor) = one uncited claim, zero citations (would FAIL). Concatenated:
`qa_pass=true, score=0.75` (the OLD draft's citations rescue it). NEW-only:
`qa_pass=false`. The checker passes text that step-8 does not publish. hallucination
sends BOTH drafts' claims to the LLM; qa-structural grades the concatenation
(0.5 vs NEW-only 0.33).

**Fix.** Each content-consuming checker selects `contentItems.at(-1)
.content_markdown` — the exact draft step-8 publishes — before grading.

**Post-fix** (`H18b-latest-draft-AFTER.txt`): two-draft citation now FAILS ==
NEW-only == step-8's published draft; hallucination sends only NEW's claim;
qa-structural two-draft == NEW-only (0.33); keyword parity holds; single-draft
entity unaffected (PASS). Test: `citation-coverage-checker/test-latest-draft.js`.

**Scoped out — `meta-compliance-checker`.** It does NOT concatenate; it resolves
meta via a tuned first-match priority chain (fixed in run `cb49ef80` to prefer
generated over scraped items). It reads the *first* draft's meta, which is a
different, subtler selection question that depends on whether tone-seo-editor
re-emits meta fields. Forcing `.at(-1)` there risks regressing that chain. Left
unchanged; recorded as a follow-up.

**Caveat (documented, not a bug here).** `.at(-1)` relies on pool insertion order
(tone-seo-editor appended after content-writer). A content-writer *re-run* under
`add` re-appends its own item, which would make `.at(-1)` the re-run draft. We
chose `.at(-1)` deliberately: the mandate is "grade the same draft step-8
publishes," and step-8 uses `.at(-1)`. So checker == published is guaranteed
regardless. If the "latest" rule is ever wrong it is wrong for BOTH step-6 and
step-8 and must be settled once for both (a shared selection-semantics question,
out of scope here).

---

## H21 — hallucination-detector: qualitative claims auto-pass (coverage gap)
`modules/step-6-qa/hallucination-detector/execute.js`

**Root cause.** Extraction keeps a sentence only if it matches an enumerated
numeric/date/currency/company regex (`FACTUAL_CLAIM_PATTERNS`). A qualitative claim
("offers an excellent user experience") matches nothing → never sent to the LLM →
cannot lower the score. Content with zero structured claims → automatic
`qa_pass:true, hallucination_score:1`. A long article of unverifiable qualitative
claims is certified perfect.

**Pre-fix failing case** (`H21-hallucination-zero-claims-BEFORE.txt`): 1710 chars of
purely qualitative content → `qa_pass=true, score=1, needs_review=undefined`, no
LLM call.

**Fix (the SOUND part only).** Zero extracted claims is no longer a clean green:
- Substantial content (> `flag_zero_claims_over_chars`, default 500) with zero
  claims → **fail closed** (`qa_pass:false, needs_review:true`) — the padding-blind
  signature.
- Short no-claim content → **low-confidence pass** (`needs_review:true`), not a
  confident `score:1`.

**Post-fix** (`H21-hallucination-zero-claims-AFTER.txt`): 1710-char qualitative →
fail closed + needs_review; tiny snippet → low-confidence pass + needs_review.
Test: `test-zero-claims.js`.

### Remainder — NOT done this session (recorded precisely)
The actual coverage fix is **UNIT_50 #51** (architectural, requires brutal-critic +
CTO review, gated **after W2.3**, coordinated with the W2.3 truth-metric prompt lock):

1. Replace/augment regex extraction with an **LLM faithfulness pass** (or
   broadened-pattern + LLM-judge hybrid) so qualitative claims are actually checked.
2. **De-duplicate** the near-identical `FACTUAL_CLAIM_PATTERNS` /
   `GENERAL_KNOWLEDGE_PATTERNS` copied (and silently drifted) between
   `hallucination-detector` and `citation-coverage-checker` — fixing one copy alone
   deepens the drift.
3. Absorb UNIT_50 #35.

**Explicitly NOT attempted:** a "quick regex broadening." UNIT_50 Open-question 7
warns it manufactures false confidence (looks like coverage, isn't). This session's
change *removes* a false green; it does not claim to close the coverage gap.

---

## Not changed (recommended follow-ups, unverifiable from this repo)

- **`requires_columns` defense-in-depth.** keyword/hallucination/citation declare a
  *secondary* input (`seo_plan_json`/`text_content`/`analysis_json`) but not
  `content_markdown` (their primary subject). Only `qa-structural` declares it.
  Adding `content_markdown` to each would make the *skeleton* input gate refuse to
  run a content checker with no content — a cheap complement to the module-side
  fail-closed guards above. NOT applied here: its effect is skeleton-side and could
  not be exercised as an artifact from the modules repo. The module-side guards
  (verified above) already fail closed on absent content; this would be
  belt-and-suspenders. Mirror `qa-structural`'s working manifest when applying.
- **Skeleton defense-in-depth net for H23.** `routingHandler.js` trusts loop-router's
  `approve`; a skeleton-side check that all configured step-6 checkers produced
  output is a separate, deferred concern (UNIT_50 Decision 6 / Items 8/9/47 — "do
  not build without a Daniel decision on placement"). Not built.
