# H23 handoff — loop-router: a MISSING step-6 checker must not read as a pass

**Status:** deferred out of the shippable QA-quartet branch. The four sibling fixes
(H18b, H19, H20, H21) ship on `qa-quartet-modules-shippable`; the full five-fix work
(including the module-only H23 attempt) is preserved on `qa-quartet-modules`. This
document is the spec for the *correct* H23 fix, which needs a skeleton seam.

**Repos.** Module: `content-pipeline-modules-v2` (this repo). Skeleton:
`content-pipeline-v2`. The fix spans both: a small module read + a skeleton inject.

---

## 1. The defect (unchanged, still real)

`modules/step-7-routing/loop-router/execute.js` builds its failure set only from
checks marked `'fail'`, never `'missing'`. `aggregateQaResults` seeds every check to
`'missing'`; the sole absent-checker guard fires only for the **all**-missing case
(`checksRun === 0`). A **partial** verdict set — four checkers ran and passed, one
produced no item — has `failures=[]`, `checksRun=4`, and falls straight through to
Rule 8 → `approve` / "All QA checks passed." A green verdict over an incomplete QA
set is unsound: the router approves content one configured checker never judged.

## 2. Why the shipped (module-only) attempt was wrong

The attempt on `qa-quartet-modules` added Rule 1.5: any checker in an `expected_checks`
option that reported `'missing'` → `flag_manual`. The option **defaults to all five**
checkers (`keyword, meta, citation, hallucination, structural`).

**That default is the bug.** Five checkers is the *exception*, not the norm — only
**4 of 36** templates schedule all five step-6 checkers; 9 of 13 loop-router templates
run fewer, **including the live production template.** A checker that a template never
scheduled reports `'missing'` for the ordinary reason that it was never meant to run —
indistinguishable, to the module, from a scheduled checker that silently produced
nothing. With an all-five default, Rule 1.5 fires on the *absence of unscheduled
checkers* and flags entities that are actually fine.

### Measured proof (prod `fevxvwqjhndetktujeuu`, read-only, 2026-07-14→27)

The entire persisted history is 2 pipeline runs, 9 entities, one template.

- `keyword-sufficiency-checker`: **0 runs, ever.** The production template's step-6
  set is `meta`, `citation`, `structural`, `hallucination` — a **four-checker subset,
  keyword excluded.**
- **All 16** executed loop-router decisions carry `qa_summary` "Keyword Sufficiency:
  **NOT RUN**". Under the all-five default every one of those 16 entities would hit
  Rule 1.5 (`keyword` missing) → `flag_manual` `qa_incomplete`, overriding the 4
  `loop_generation` routes that were the *actionable* remediations. The merge would
  convert correct routing into a manual-review pile-up for the whole template.

The escape hatch the attempt offered — "narrow `expected_checks` per template" — pushes
a hand-maintained list onto every operator and silently rots the moment a template's
step-6 composition changes. The number was hand-set; it should be **derived**.

## 3. The correct fix — derive the expected set from the execution plan

The expected checker set is not a constant and not an operator's chore: it is exactly
**which step-6 checkers the template scheduled.** The skeleton already knows this — it
is `submodules_per_step['6']` on the template's execution plan
(`templates.execution_plan`, snapshotted per-run as
`pipeline_runs.execution_plan_snapshot`). Map each scheduled step-6 submodule id to
the loop-router summary key and pass *that* set as `expected_checks`:

| step-6 submodule id            | loop-router summary key |
|--------------------------------|-------------------------|
| `keyword-sufficiency-checker`  | `keyword`               |
| `meta-compliance-checker`      | `meta`                  |
| `citation-coverage-checker`    | `citation`              |
| `hallucination-detector`       | `hallucination`         |
| `qa-structural`                | `structural`            |

(These are loop-router's own `depends_on`, mapped 1:1 to the keys `aggregateQaResults`
already emits.) Then Rule 1.5 fires **only** when a checker the template *actually
scheduled* produced no verdict — the true "silent checker" case — and never on a
checker that was legitimately never in the plan. No per-template hand-tuning, no
staleness. The module-side Rule 1.5 logic can stay exactly as written; only the
*source* of `expected_checks` changes from a hand-set default to a derived value.

### Why this needs a skeleton seam (Task 1 finding, evidence-backed)

loop-router's `execute(input, options, tools)` receives, at invocation, **nothing that
names which step-6 checkers were configured:**

- **Production path** — `content-pipeline-v2/server/workers/stageWorker.js`
  `handleEntityJob` (≈L504–505): `input = entityRun.input_data`,
  `options = manifest.options_defaults ⊕ entityRun.options`. `input_data` is
  `{ entity, run_id, step_index, submodule_id }`; `options` is loop-router's own
  config row. Job payload is `{ entity_submodule_run_id, entity_name, submodule_id,
  step_index, batch_id }`. Neither carries a sibling-submodule list.
- **The pool** (`entity.items`) shows only which checkers *produced items* — which is
  precisely the ambiguity H23 is about (it cannot distinguish "not scheduled" from
  "scheduled but silent").
- **Workbench path** — `server/services/submoduleHarness.js` `runSubmoduleOnce`
  builds the same `{ entity, entities, run_id, step_index, submodule_id }` input.

So no read inside the module can recover the scheduled set. The skeleton must inject it.

### Injection point (name + function)

**File:** `content-pipeline-v2/server/routes/submoduleRuns.js`
**Handler:** `executeRouter.post('/run', …)` — the single-submodule enqueue route.
**Where:** the `entityRunRows = executableEntities.map(ep => …)` builder that writes
`input_data` (≈L699–704) and resolves per-row `options`/`entityOptions` (≈L659–696).

This one handler is the correct seam because **both** run paths funnel through it:
manual runs, and full auto-execute — `server/services/autoExecutor.js` iterates
`submodules_per_step` (≈L185) and enqueues each submodule via
`POST /api/runs/:runId/steps/:stepIndex/submodules/:submoduleId/run` (≈L725/L754),
i.e. this same route. The handler **already loads** `execution_plan_snapshot` in scope
(≈L310, for card definitions), so `submodules_per_step` is one property away.

**Inject:** when `submoduleId === 'loop-router'` (or, more generally, for step-7
routing submodules), read `submodules_per_step['6']` from the run's
`execution_plan_snapshot` (fall back to the template's `execution_plan`; if a snapshot
is genuinely absent, fall back to loop-router's current all-five default so behavior
never becomes *less* safe), map ids → summary keys via the table above, and set
`entityOptions.expected_checks` to that derived list. loop-router then routes on the
template's real checker set with no module change.

**Sanity checks for the implementer:**
- Derive from the **snapshot**, not the live template, so a mid-run template edit can't
  poison an in-flight run (the route already prefers the snapshot for card defs — same
  reasoning).
- An id in `submodules_per_step['6']` with no mapping entry (a future step-6 submodule
  that emits no loop-router key) must be **dropped**, not passed through — an unknown
  name in `expected_checks` can never match a summary key and would be inert, but
  dropping it keeps the list honest.
- Keep loop-router's "unknown names never match, subset opt-out still works" property:
  the derived list is a subset of the five keys, so Rule 1.5 stays correct by
  construction.

## 4. Verification the fix must produce

- On the production template (4-checker subset, no keyword): the 16 historical entities
  route as they did **before** the H23 attempt — the 4 `loop_generation` and the
  `flag_manual` decisions stand; **none** become `qa_incomplete` for a missing
  `keyword` checker.
- Inject a genuinely silent scheduled checker (e.g. drop `hallucination-detector`'s
  output while it *is* in `submodules_per_step['6']`) → loop-router returns
  `flag_manual` / `qa_incomplete` naming `hallucination`. This is the case the existing
  (excluded) `modules/step-7-routing/loop-router/test-missing-checker.js` covers; port
  it once the derived-set seam exists, driving `expected_checks` from a stubbed plan
  rather than a hand-set option.
- A full five-checker template still approves a clean five-checker entity.

## 5. Carry-forward note — `no_sources_behavior` now occupies UNIT_50's collision surface

H20 (shipped in this quartet) added `no_sources_behavior` (values `fail|flag|pass`,
default `fail`) **and** H21 added `flag_zero_claims_over_chars` (default `500`) to
`hallucination-detector`'s `execute.js` options-destructure **and** `manifest.json`
options. Per `content-pipeline-specs/specs/UNIT_50_QA_HARDENING_DESIGN.md` (Decision 5,
≈L258–289), that is the **exact two-file collision surface** UNIT_50 #50 reserved:
#50 planned to add `no_sources_behavior` to that same destructure block
(`execute.js:237-246`) and the same `manifest.json`, rebasing onto W2.3 (which removes
the `prompt` option and inlines a const in the *same* block).

**Consequence for whoever lands UNIT_50 #50 / W2.3 next:** the knob is **already in the
tree**. #50 must **not re-add** `no_sources_behavior` (treat as present; reconcile,
don't duplicate), and W2.3's manifest/`prompt`-removal surgery now shares
`hallucination-detector/manifest.json` and its execute.js destructure with a shipped
`no_sources_behavior` (+ `flag_zero_claims_over_chars`). The design's "#50 rebases onto
W2.3's post-inline version" sequencing still holds — but its starting point moved: the
option it was going to introduce is done.

---

### Source pointers
- Module defect + attempt: `modules/step-7-routing/loop-router/execute.js` Rule 1.5
  (on `qa-quartet-modules`); evidence `docs/evidence/phase1-qa-quartet/` (H23 files on
  `qa-quartet-modules`).
- Skeleton seam: `content-pipeline-v2/server/routes/submoduleRuns.js`
  `executeRouter.post('/run')`; plan source `execution_plan_snapshot.submodules_per_step`;
  auto-execute driver `server/services/autoExecutor.js`.
- Original design: `content-pipeline-specs/specs/UNIT_50_QA_HARDENING_DESIGN.md`
  (Decision 6 / Items 8/9/47 flag the skeleton-side "all configured checkers produced
  output" net as a separate deferred concern — "do not build without a Daniel decision
  on placement").
