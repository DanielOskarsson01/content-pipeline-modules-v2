# Content Pipeline Modules — Backlog

Tasks not yet scheduled for implementation.

---

## Index

| # | Task | Priority | Added |
|---|------|----------|-------|
| 1 | Second LinkedIn account support in linkedin-post-scraper and profile-api | — | 2026-05-22 |
| 2 | Content-analyzer + content-writer flexibility for multi-content-type support | Medium-high (active) | 2026-05-23 |
| 3 | Loader fail-closed behavior when MODULES_PATH unset (skeleton repo) | Low | 2026-05-24 |
| 4 | Local client build broken — Rollup darwin-arm64 optional-dep bug (skeleton repo) | Medium | 2026-05-25 |
| 5 | Docs/tooling commits not deployed to production (skeleton + modules) | Low | 2026-05-25 |
| 6 | `deploy.sh` hardcodes client build as prerequisite for any deploy (skeleton repo) | Low-medium | 2026-05-25 |
| 7 | **Phase 3 routing cascade-delete is wrong by design** (skeleton repo) — **spec validated 2026-05-26, awaiting adoption decision** | **High — blocks Phase 3 validation** | 2026-05-25 |
| 8 | Quality signals don't propagate to Step 8 output (modules repo) | Medium | 2026-05-25 |
| 9 | Step 9 distribution gate doesn't exist in current template (skeleton + template config) | Medium | 2026-05-25 |
| 10 | Pending-spec tracking: prevent indefinite "pending sign-off" state and implementation drift | Low-medium (process) | 2026-05-26 |
| 11 | Template card definitions cleanup — aspirational vs functional v2 cards in 30-april template | Medium (Sub-plan 1 day-1 task) | 2026-05-29 |
| 12 | Pre-flight overshoot process rule — pre-flight produces shape; surface decision before inlining implementation-ready spec sections | Low-medium (process) | 2026-06-01 |
| 13 | UUID_REGEX false-positive risk on submodule_ids (executionPlanUtils) — defensive manifest-loader rejection of UUID-format submodule_ids | Low (negligible in practice; defensive only) | 2026-06-02 |
| 14 | Sub-plan 1 ship-gate is single-run happy-path + Wazdan-shape — post-ship stress validation (concurrency, malformed data, network errors) needed for true Pattern H criterion 3 | Medium (post-ship validation, not sub-plan 1 blocker) | 2026-06-02 |
| 15 | Add `DUPLICATE_INSTRUCTION` to `SKIP_REASONS` vocabulary (skeleton repo) — replace placeholder `QA_PASSED_ON_RECHECK` reuse in `cardGroups.expandCardGroups` duplicate-handling path | Low (defensive; well-formed state never hits it post Brutal-critic Fix #1) | 2026-06-02 |
| 16 | Pre-flight cross-section dependency mapping — Section A pre-flight didn't capture route handler + migration as in-scope prerequisites for autoExecutor to function (caught by independent code-review 2026-06-03; same shape as item 12 pre-flight overshoot) | Low-medium (process) | 2026-06-03 |
| 20 | tone-seo-editor: `tone_style` dropdown is redundant with prompt textarea + reference_docs mechanism | Low (cleanup) | 2026-06-07 |
| 21 | Anthropic prompt caching not enabled in skeleton `ai.complete` — large reference docs paid for per call instead of cached | Medium (cost) | 2026-06-07 |
| 22 | New Step 1 submodule: `sonar-deep-research` for LLM-grounded entity discovery (complements scraping) | Medium (new module) | 2026-06-07 |
| 23 | Template creator dropdown + preset map should order submodules by pipeline-execution sequence (skeleton) | Low (UX) | 2026-06-07 |
| 24 | Template editor — drag-and-drop reorder for submodules within a step (skeleton) | Medium (UX, ordering matters) | 2026-06-07 |
| 25 | Per-entity submodule errors masked as `approved` — run reports "N completed, 0 failed" even when a submodule returns error items for some entities (skeleton repo) | **Largely resolved by `874c436` (2026-06-14)** — residual in #26 | 2026-06-14 |
| 26 | Pool status is last-writer-wins across submodules at a step — `pipeline_stages` counts (from `entity_stage_pool`) can still disagree with `evaluateStepResult` (any-submodule-failed) in multi-submodule steps (skeleton repo) | Low (residual of #25) | 2026-06-14 |
| 27 | Off-site crawl: `follow_external=true` lets discovery wander entirely onto a linked domain when a seed has no own content (`example.com` → crawled all of `iana.org`). content-analyzer is NOT fabricating — it cited real scraped pages. Edge-case scope note + fixture lesson | Low (config-driven, expected; degenerate-seed edge case) | 2026-06-15 |
| 28 | **Backward routing never re-executes the target step** — auto-executor resume-safety (`autoExecutor.js:160-167`) skips Steps ≥ earliest_step because the backward path doesn't reset their `pipeline_stages.status` to `active`. Round 2 never runs (skeleton repo) | **RESOLVED `4c06d3f` (2026-06-18) — deployed; STAYS deployed (trunk prerequisite, dormant until routing live)** | 2026-06-15 |
| 29 | Resumed auto-execute clamps `config.steps` to `[resumePoint..10]` — a backward route to a step BEFORE the resume point is never iterated, so Round 2 there cannot run (skeleton repo). Surfaced by pause-before-7 ship-gate run-control; does NOT affect non-paused production runs | **PARKED `079f7d1` (tag `parked-not-deployed`) — fix implemented + tested, NOT deployed (unreachable until sub-plan 4)** | 2026-06-16 |
| 30 | Sub-plan-1 ship-gate PARKED — four acceptance conditions carried forward to sub-plan 4 (real escalation card + `routing_rules` on a genuine template). Park-and-pivot decision record. **+ CTO audit 2026-06-20: corrected diagnosis, deterministic citation:fail recipe, scope lock** | Carried forward (sub-plan 4 acceptance bar) | 2026-06-18 |
| 31 | **`deploy.sh` footgun (skeleton repo) — whole-tree rsync ships parked code.** Next full `./deploy.sh` rsyncs the working tree (incl. parked `#29`) to prod with no exclusion, silently breaking the park. Gate: abort if `parked-not-deployed` is an ancestor of HEAD (`DEPLOY_ALLOW_PARKED=1` override) | **RESOLVED `250fe6a` (2026-06-22) — implemented, /code-review PASS, active locally; gate itself not yet deployed** | 2026-06-20 |
| 32 | **Sub-plan-4 deferred card: PSE-v2** (V5 item 27) — Step-1 curated-search card, broader curated list + different query template. Carry-forward AFTER the content-writer-v2 vertical slice; gated by the entry gate + one-shot harness | Carry-forward (sub-plan-4 scope; NOT optional) | 2026-06-20 |
| 33 | **Sub-plan-4 deferred card: SEO-writer-v2** (V5 item 30) — Step-5 card, stricter meta requirements (e.g. meta_title 50–60 chars + primary keyword). Carry-forward AFTER the content-writer-v2 vertical slice; gated by the entry gate + one-shot harness | Carry-forward (sub-plan-4 scope; NOT optional) | 2026-06-20 |
| 34 | **DB hygiene: stale/zombie `pipeline_runs` rows** (pipeline DB) — zombie `36d34311` + 5 other stale `running` rows all killed (→`abandoned`); baseline clean (0 `running`). Split out of #30 | **RESOLVED 2026-06-22** | 2026-06-20 |

---

## Item 1 — Second LinkedIn account support in linkedin-post-scraper and profile-api

**Added:** 2026-05-22

New LinkedIn account being activated w/c 2026-05-26 (connections being built to warm up trust signals). Plan: run profile-api as two separate PM2 processes on ports 3847 (existing, profiles-only) and 3848 (new account, posts/jobs/feed_posts). `linkedin-post-scraper` gets a new `api_url` option so operators can target either instance. Existing account stays exclusively on `linkedin-profile-scraper` (bio, company_people modes). New account handles `linkedin-post-scraper` (posts, post_engagers, feed_posts modes) and job scraping. See `News-Section/ROADMAP.md` Backlog for broader context.

---

## Item 2 — Content-analyzer + content-writer flexibility for multi-content-type support

**Added:** 2026-05-23
**Priority:** Medium-high (active work)
**Touches:** Phase 4 (humanizer adds card pattern), Phase 8 (News content type), Phase 9 (Podcasts content type), future Job Search revival (uses cards of generic modules, not specialized modules)

### Architectural commitment

One `content-analyzer` module, one `content-writer` module — both configurable via cards (prompts, reference docs, analysis dimensions). **NOT specialized modules per content type.** The module catalog stays small as the content-type catalog grows.

### Step boundary discipline

- **Step 5 (Generation)** produces format-agnostic content: markdown, JSON, structured fields.
- **Step 8 (Bundle)** handles output format: DOCX, PDF, HTML via templates.

Modules that violate this boundary get refactored or replaced.

### Required flexibility in `content-writer`

- Reference doc loading (configurable source files per card)
- Variant / template selection within the writing process
- Structured output sections configurable per card

### Required flexibility in `content-analyzer`

- Configurable analysis dimensions per card (fit-scoring, structural analysis, comparison-based analysis, etc.)
- Reference doc integration for content types that require source comparison

### For Step 8 (separate concern)

- DOCX templates for CV-style outputs
- Other format-specific templates as content types require
- Likely cards of existing Step 8 bundle modules, not new modules

### Archived modules status

- **`cv-generator`** did both Step 5 (writing) AND Step 8 (DOCX bundling) work — violates step boundaries.
- **`job-analyzer`** is comparison/fit analysis — should become a `content-analyzer` card when the comparison dimension is configurable.
- Both get **permanently deleted from `modules/_archive/`** when this flexibility work matures.

---

## Item 3 — Loader fail-closed behavior when MODULES_PATH unset (skeleton repo)

**Added:** 2026-05-24
**Priority:** Low (rarely happens in practice, but principled fix)
**Touches:** `content-pipeline-v2/server/services/moduleLoader.js`

### Issue

The manifest loader's behavior when the `MODULES_PATH` env var is not set is itself a **fail-open path** — it silently returns OK without loading any modules:

```js
// server/services/moduleLoader.js lines 86-90
const modulesPath = process.env.MODULES_PATH;
if (!modulesPath) {
  console.warn('[moduleLoader] MODULES_PATH not set — no submodules loaded');
  return;
}
```

This contradicts the fail-closed principle established in Task 8 of the empty-pool bug fix (where every manifest must declare `pool_precondition` or startup fails). It also creates a verification trap: tests that import the loader without setting `MODULES_PATH` will report "OK" without actually validating anything — caught during this PR (2026-05-24) and re-run with the var set to get the real verification.

### Proposed fix

Throw at startup if `MODULES_PATH` is not set when `loadModules()` is invoked. A clear error message guides operators to the missing env var:

```js
if (!modulesPath) {
  throw new Error(
    '[moduleLoader] MODULES_PATH env var is required but not set. ' +
    'Point it at the parent directory of the modules folder ' +
    '(e.g. /opt/content-pipeline-modules-v2).'
  );
}
```

Same fail-closed pattern as the per-manifest validation. Server refuses to start without proper module path configuration; operator has to fix the config to bring it up.

### Not blocking

Production deploy script (`deploy.sh`) sets `MODULES_PATH` correctly. The fail-open behavior only bites in test/dev contexts where someone invokes the loader without the env var. Low actual production risk, but worth a small fix for principled consistency.

---

## Item 4 — Local client build broken (Rollup darwin-arm64 optional-dep bug)

**Added:** 2026-05-25
**Priority:** Medium (blocks `deploy.sh` standard path)
**Touches:** `content-pipeline-v2/client/`

### Update 2026-06-15 — ARCH correction + Path-B deploy confirmed

The missing optional dep is **architecture-dependent**, and the title's `darwin-arm64` is misleading on this machine. `node` at `/usr/local/bin/node` is an **x64** build (Rosetta on Apple Silicon) → `process.arch === 'x64'` → Rollup needs **`@rollup/rollup-darwin-x64`**, NOT `-darwin-arm64`. A 2026-06-15 deploy attempt pre-checked for `@rollup/rollup-darwin-arm64` (present) and wrongly concluded the build would work; `vite build` then crashed needing `@rollup/rollup-darwin-x64` (absent) and `deploy.sh` aborted at step 1 (set -e), leaving production untouched.

**So any pre-deploy build check MUST match the running node's arch, not a hardcoded one:**
```bash
ls client/node_modules/@rollup/rollup-$(node -p "process.platform+'-'+process.arch")  # the dep that must exist
```
Root fix unchanged (`cd client && rm -rf node_modules package-lock.json && npm install` installs the optional dep for the running node's arch; or run the build under an arm64 node from `/opt/homebrew`).

**Confirmed 2026-06-15:** the skeleton `routingHandler` fix (`be07509`, server-only) shipped via **Path B** — `rsync server/` (no `--delete`, `client/dist` untouched) + `pm2 restart all` (fork preserved) — bypassing the broken client build entirely. shasum-verified on Hetzner + PM2 4/4 fork. Reconfirms: **the client build is irrelevant to server-only deploys**, so Item 6 (split `deploy.sh` so server-only deploys don't require a client build) would have avoided this entirely.

### Issue

`./deploy.sh` fails at step 1 (`vite build`) because Rollup cannot find `@rollup/rollup-darwin-arm64`:

```
Error: Cannot find module @rollup/rollup-darwin-arm64. npm has a bug
related to optional dependencies. Please try `npm i` again after removing
both package-lock.json and node_modules directory.
```

This is a known npm bug ([npm/cli#4828](https://github.com/npm/cli/issues/4828)) where platform-specific optional dependencies don't always get installed correctly. Worked around on 2026-05-25 by deploying server-only via `ssh hetzner 'pm2 restart all'` (production code already at HEAD; no client changes in that PR).

### Fix

```bash
cd /Users/danieloskarsson/Library/CloudStorage/Dropbox/Projects/OnlyiGaming/content-pipeline-v2/client
rm -rf node_modules package-lock.json
npm install
```

Mechanical but invasive (full reinstall). Verify the build works after:

```bash
npm run build
```

### Blocks

Future deploys that include client changes. `deploy.sh` will fail at step 1 until this is fixed. See also Item 6 (deploy.sh hardcodes client build).

---

## Item 5 — Docs/tooling commits not deployed to production

**Added:** 2026-05-25
**Priority:** Low (no runtime impact)
**Touches:** `content-pipeline-v2/` + `content-pipeline-modules-v2/`

### State

The following commits exist locally + on origin but are NOT on Hetzner's filesystem at `/opt/content-pipeline-v2/` and `/opt/content-pipeline-modules-v2/`:

| Repo | Commit | Description |
|------|--------|-------------|
| skeleton | `abeb8ac` | tooling: pre-deploy script with rollback recipe |
| skeleton | `c2c8e2d` | docs: commit empty-pool-fix plan + superseded discover plan |
| modules | `ddd6858` | docs: rule 12 — orthogonal data_operation + pool_precondition |
| modules | `d39a530` | docs: BACKLOG item 3 — loader fail-closed when MODULES_PATH unset |
| modules | `7b34b45` | docs: session log — empty-pool-fix executed + external-deploy forensic |

### Why deferred

These are documentation and tooling files. No runtime impact. Path B of Task 12 (just `pm2 restart all`) didn't rsync them. They'll naturally make it to production on the next deploy when client build is fixed (see Item 4).

### Not blocking

Production code is at local HEAD. The docs/tooling absence on prod only matters for:
- Future operators reading docs from the Hetzner filesystem (unlikely — docs are usually read via git locally)
- Running `pre-deploy-empty-pool-fix.sh` from prod (also unlikely — it lives in skeleton/scripts/ which is a deploy-time artifact)

---

## Item 6 — `deploy.sh` hardcodes client build as prerequisite for any deploy

**Added:** 2026-05-25
**Priority:** Low-medium (process improvement)
**Touches:** `content-pipeline-v2/deploy.sh`

### Issue

`deploy.sh` step 1 unconditionally builds the React client. If the client build fails (e.g., the Rollup bug from Item 4), the entire deploy aborts — even when the change is server-only.

### Proposed fix

Split into two scripts or add a flag:

**Option A — split scripts:**
- `deploy-server.sh` — rsync server/ + `pm2 restart`. No client touch.
- `deploy-client.sh` — build + rsync client/dist/. No PM2 restart needed.
- `deploy.sh` — calls both (current behavior).

**Option B — add flag:**
- `./deploy.sh --skip-client` to skip step 1 when only server changes need deploying.

Either option lets server hotfixes ship without a working client build. Pairs naturally with Item 4 — until rollup is fixed, server-only deploys still work.

### Not blocking

Workaround documented (Path B from 2026-05-25 deploy: `ssh hetzner 'pm2 restart all'` after a rsync-less code match check). But papering over the deploy.sh limitation by hand is a recurring tax until this is fixed.

---

## Item 7 — Phase 3 routing cascade-delete is wrong by design

**Added:** 2026-05-25
**Priority:** High — blocks Phase 3 multi-card validation. Needed before Batch 8a/8b can proceed.
**Touches:** `content-pipeline-v2/server/services/routingHandler.js` (primary), schema (verify), `apply_entity_routing` RPC

### Issue

When `loop-router` produces a routing decision for an entity that needs to retry an earlier step, `routingHandler.js:297-340` **deletes** `entity_submodule_runs` (per entity) and `submodule_runs` (per stage, cross-entity) for steps from `target_step` onward. This contradicts the schema's intent and destroys the "last good state" of Round 1 work.

Surfaced during empty-pool fix smoke test (2026-05-25) — Wazdan had 2 QA failures (citation + hallucination), was routed back to Step 1, the cascade-delete fired, the pool restoration RPC then failed ("no data at step 0"), and the system was left in a partial-delete state with Wazdan flagged terminal but no recovery path.

### What the schema implies vs what the code does

The `entity_submodule_runs` table has a `loop_iteration` column (production-verified). This column exists specifically to track which iteration produced which row — meaning the system was designed to keep multiple iterations across loops. The cascade-delete code contradicts this design.

| What schema implies | What code does |
|--------------------|----------------|
| Round 1: rows with `loop_iteration=0`, preserved | Round 1: rows created, then DELETED on routing |
| Round 2: append rows with `loop_iteration=1` | Round 2 (if it runs): fresh rows, no history |
| Both rounds visible for comparison | Only the latest round visible (or nothing if routing fails) |

### Correct behavior

- Round 1 rows preserved with `loop_iteration=0`
- Routing creates Round 2 attempt with `loop_iteration=1`
- Both rounds visible in tracking
- Comparison possible between rounds
- **Failed routing leaves Round 1 intact as last-good-state**

### Additional issues stacked on the same root cause

1. **Cross-entity collateral damage**: the per-entity delete is scoped to one entity, but the parallel `submodule_runs` delete affects ALL entities' batch parents at those stages. In the smoke test, Pronet Gaming's Step 1-7 entity rows became orphans (no parent submodule_runs) because Wazdan was routed and the broader delete swept Pronet's parents too.

2. **No transaction wrapper**: the cascade-delete fires BEFORE the `apply_entity_routing` RPC. If the RPC fails, the deletes are not rolled back. The system ends in a partial-delete state with no clean recovery.

3. **Pool restoration RPC fails when `target_step` routes to step 0**: in the smoke test, Wazdan's failure_detail said `"Pool restoration failed: no data at step 0"`. Either the target_step calculation is wrong (sending entity to step 0 when it should be step 1 or 5), or step 0 doesn't have pool restoration capability and the design assumes it does.

### Suggested approach (not prescriptive — for design discussion)

- Replace cascade-delete with iterative append using `loop_iteration`
- Wrap routing in a transaction that includes the RPC; rollback deletes on RPC failure
- Investigate `target_step=0` case — is this a bug in target step calculation, or should step 0 support pool restoration?

### Blocks

Phase 3 validation cannot proceed safely until this is fixed. Any multi-entity run where some entities have QA failures will hit this bug.

### Validation 2026-05-26 — PHASE_3B spec located and validated

**Reference:** [`Content-Pipeline/specs/PHASE_3B_PER_ENTITY_INSTRUCTIONS_SPEC.md`](../../Content-Pipeline/specs/PHASE_3B_PER_ENTITY_INSTRUCTIONS_SPEC.md) — 1088 lines, dated 2026-04-30, status updated to "REVIEWED v4 — validated 2026-05-26, awaiting adoption decision."

**The spec resolves all four issues listed above** (one-to-one mapping verified):
- **Cascade-delete itself** → §3.1 `entity_run_meta.card_instructions JSONB` append-only array; §3.5 explicit "Never clear. History preserved permanently for analytics."
- **Cross-entity collateral damage** → eliminated by design (instructions live per-entity on `entity_run_meta`)
- **No transaction wrapper** → §5.2 / §5.3 atomic RPCs using `SELECT ... FOR UPDATE` row-level locking + JSONB concatenation
- **`target_step=0` pool restoration fails** → eliminated; new model has no pool restoration (entities flow through pipeline from earliest target step, submodules check pending instructions and branch — pool accumulates naturally per V5 §225-229)

**Implementation history:** The cascade-delete code in `routingHandler.js` was written on **2026-04-22** (commits `f2dd7b9`, `e2f8682`, `a23c1ae`, then `21ab357` and `c4e9819` later). The spec was written **2026-04-30** — 8 days AFTER the broken implementation. **The spec is the intended replacement** for the Phase 2 cascade-delete approach, but the migration work was never scheduled despite 4 review rounds.

**Current production state vs spec:** ZERO of the spec's schema changes exist:
- `entity_run_meta.card_instructions JSONB` — not in prod
- `submodule_runs.card_id TEXT` + new partial unique index — not in prod
- `entity_submodule_runs.card_id TEXT` + rebuilt unique index — not in prod
- `run_submodule_config.card_id TEXT` — not in prod
- `pipeline_runs.execution_plan_snapshot JSONB` — not in prod
- 3 new RPCs (`append_card_instruction`, `mark_card_instruction_consumed`, `mark_card_instruction_skipped`) — not on production Supabase
- 5 QA manifest `qa_outputs` updates — not deployed

ZERO of the spec's new code files exist: `server/services/executionPlanUtils.js` and `server/services/cardInstructions.js` — neither file present.

### Four implementation gaps to address during planning (not spec rework)

1. **Snapshot fallback for legacy runs** — §6.5 says `pipeline_runs.execution_plan_snapshot` is populated when auto-execute starts. NULL is possible for runs that existed before this column was added. Plan needs explicit fallback strategy (e.g., fall back to live template, log deprecation).
2. **`getConsumedRoundsForRun` call frequency** — §5.5 documents as batched (1 query per run). Implementation should call ONCE per routing event and cache the result for the duration of that event; not once per entity. Plan should make this explicit.
3. **Migration path for templates with old `cards` format** — the `30 april` template already has `cards: {pse-v2, writer-v2, ...}` (string keys, not UUID). Spec expects `card_definitions: {<UUID>: {...}}`. Plan needs migration approach: ad-hoc script, auto-convert on first load, or manual migration required before spec rollout.
4. **Index migration safety** — index rebuilds on `submodule_runs` and `entity_submodule_runs` require DROP then CREATE. Concurrent writes during the window could create duplicates. Plan should use `CREATE INDEX CONCURRENTLY` where possible OR a brief maintenance window with `pm2 stop pipeline-api`.

### Adoption status

- ✅ Spec located and read end-to-end (1088 lines)
- ✅ Spec validated against current production state
- ✅ Spec confirmed to resolve all four BACKLOG #7 issues
- ✅ Implementation gaps identified for plan to address
- ⏸ **Adoption decision deferred to fresh session** — current session is closing out, decision requires fresh judgment
- ⏸ Implementation plan not drafted (waits on adoption decision)

### Compatibility check

- ✅ Empty-pool fix (shipped 2026-05-25): orthogonal, no conflicts. Spec's `pool_precondition` does not interact with `card_instructions`.
- ❌ BACKLOG #8 (Step 8 quality propagation): not addressed by spec, separate concern
- ❌ BACKLOG #9 (Step 9 distribution gate): not addressed by spec, separate concern

---

## Item 8 — Quality signals don't propagate to Step 8 output

**Added:** 2026-05-25
**Priority:** Medium — quality signals exist in `entity_run_meta` but don't reach deliverables
**Touches:** Each Step 8 module (`markdown-output`, `html-output`, `json-output`, `meta-output`, `schema-org-injector`, `company-media`)
**Couples to:** Item 9 (Step 9 distribution gate uses these signals)

### Issue

Step 8 bundle modules produce artifacts that are quality-blind. Surfaced during empty-pool fix smoke test (2026-05-25): `wazdan.md` and `pronet-gaming.md` are indistinguishable in format despite Wazdan having `terminal_state='flagged'` with citation + hallucination QA failures.

The terminal_state and QA scores live in `entity_run_meta` but Step 8 modules don't read them. A human picking up the .md file from disk has no signal that the entity was flagged. A downstream automated consumer (future Step 9 distribution) has no easy way to gate publication.

### Right behavior

Step 8 outputs include quality metadata so artifacts self-describe their quality status:

For markdown-output YAML frontmatter:
```yaml
---
title: Wazdan
terminal_state: flagged
qa_failures: [citation, hallucination]
needs_review: true
last_qa_scores: {meta: pass, keyword: pass, citation: fail, structural: pass, hallucination: fail}
---
```

For json-output, equivalent JSON fields. For html-output, meta tags or hidden divs. For meta-output, SEO-safe fields.

### Implementation

Each Step 8 module reads `entity_run_meta` for the entity and adds quality fields to its output schema/template. Lightweight per module — same pattern applied 6 times.

Coordinate with Item 9: the Step 9 distribution gate should be the primary consumer of these signals.

### Severity

Medium. Quality signals exist in the database but don't reach the deliverable. Currently mitigated by the fact that no auto-distribution exists (Step 9 not configured), so flagged content isn't being silently published. Becomes high-severity the moment auto-distribution comes online.

---

## Item 9 — Step 9 distribution gate doesn't exist in current template

**Added:** 2026-05-25
**Priority:** Medium — needed when distribution automation comes online
**Touches:** `content-pipeline-v2/` (Step 9 module slot + skeleton handling), template config (add Step 9 modules), `content-pipeline-modules-v2/` (build Step 9 distribution modules)
**Couples to:** Item 8 (relies on quality signals propagated to Step 8 output)

### Issue

Current `30 april` template has Step 9 stage `status='skipped'`. No automated gating exists between Step 8 bundle output and any external distribution.

The architectural intent (confirmed during empty-pool fix smoke test 2026-05-25):
- Step 8 bundles EVERYTHING (including flagged entities) — correct, working today
- Step 9 reads `entity_run_meta.terminal_state` and gates auto-distribution — **missing**
- Step 10 surfaces flagged entities for human review/triage — **missing**

### Right behavior

Step 9 distribution modules:
- Read `entity_run_meta.terminal_state` per entity
- For `terminal_state='approved'` entities: proceed with auto-distribution (publish to CMS, upload to Drive, send to API endpoint, etc.)
- For `terminal_state='flagged'` entities: skip auto-distribution, mark for human review
- For other terminal states (failed, etc.): skip and log

Step 10 (Human Review):
- Surface flagged entities in UI queue
- Human decides per entity: publish / scrap / sideline / loop-back-for-improvement
- Records decision back to `entity_run_meta` for audit

### Severity

Medium. Currently not actively damaging because:
- No auto-distribution exists yet
- Bundle outputs sit on disk waiting for human pickup anyway
- No flagged content is silently being published

Becomes high-severity the moment any auto-distribution is wired up without this gate in place.

### Couples to Item 8

Step 9 needs the quality signals from `entity_run_meta` (which it can read directly) OR from Step 8 output metadata (which requires Item 8). Decision: gate from `entity_run_meta` directly for Phase 1 of Item 9 (no Item 8 dependency); Item 8 still useful for human inspection of artifacts on disk.

### Open decision (2026-06-14 audit) — generation-failures vs the review queue

The 2026-06-14 carry-forward audit (`874c436` / Item 26) surfaced a gap this gate must own. A **generation-failed** entity (content-writer / seo-planner returns an error result at Step 5) is now marked `failed` in `entity_stage_pool` and **dropped at the Step-5 approve boundary** (`approve_step_v2` forwards only `status='approved'`), so it never reaches Step 9/10. Meanwhile a **QA-flagged** entity (`qa_pass:false`) stays `completed`, forwards, and *does* reach the review queue. Two kinds of "this entity has no good deliverable," treated oppositely.

Worse for this gate specifically: `terminal_state` (which Items 8/9 key off) is set **only by routing** (`apply_entity_routing`, Step 7). A Step-5 drop never reaches routing, so its `terminal_state` stays NULL — it won't appear in the flagged queue even if Step 10 reads `entity_run_meta`.

**Proposed direction (decide here — this is where the review queue gets built):** set `entity_run_meta.terminal_state='failed'` (or a dedicated `'generation_failed'`) at the point a generation failure is detected, so the existing #8/#9/#10 machinery surfaces it for free and the routing-style `entity_run_meta` forwarding can carry it. This is a product call: "failed entities flow forward as flagged for human review" vs the current "failed entities drop, audited only at the step they failed." The current behavior is internally consistent (matches the throw-path) but inconsistent with how QA-flags are handled.

---

## Item 10 — Pending-spec tracking: prevent indefinite "pending sign-off" state and implementation drift

**Added:** 2026-05-26
**Priority:** Low-medium (process improvement)
**Touches:** Process / tooling (CLAUDE.md rules, possibly a pre-commit hook or quarterly review cadence)

### Issue

PHASE_3B_PER_ENTITY_INSTRUCTIONS_SPEC.md sat in "REVIEWED v4 — pending final sign-off" state from 2026-04-30 until 2026-05-26 (~26 days). During that window:

- The cascade-delete code in `routingHandler.js` (written 2026-04-22, 8 days before the spec) remained in production unchanged
- The spec — written specifically as the intended replacement — was never adopted or implemented
- The implementation drifted further from the spec (Phase 3 multi-card UI work, escalation gates, template config) without referencing the spec as the source of truth
- The cascade-delete bug surfaced during 2026-05-25 empty-pool-fix smoke testing, requiring investigation that re-derived ~50% of what the spec already said

**Discovery gap:** The spec was a 1088-line file in `Content-Pipeline/specs/` that no active work referenced. Brainstorming session today started designing a replacement architecture from scratch before the user prompted "check for prior decisions" — at which point the spec was located in ~30 seconds.

### Risk pattern

Architectural specs in "pending sign-off" state can persist indefinitely while implementations drift. The drift is silent — no error, no warning, no broken test. Just two parallel realities: the spec describing the right architecture, and the code doing something else.

### Proposed approaches

1. **Pre-commit hook**: when modifying code in areas with a known pending spec, warn (not block) and require the operator to either reference the spec in the commit message or explicitly mark "diverges-from-spec: [reason]". Implementation: small shell hook that grep's a `SPEC_OWNERSHIP.md` mapping file.

2. **Quarterly pending-spec review**: standing recurring task to enumerate all specs in `Content-Pipeline/specs/` with `Status:` containing "pending" or "draft", review each for adoption/rejection/update. Calendar-based, not code-based.

3. **Spec status badge in PROJECT_STATUS.md**: surface pending specs at the project status level (currently they live in a folder no one reads). Make them part of the "active state" snapshot.

4. **Naming convention**: rename `PHASE_*_SPEC.md` files to include status suffix (`_DRAFT`, `_PENDING_ADOPTION`, `_ADOPTED`, `_SUPERSEDED`). Filesystem listing immediately surfaces status.

### Not blocking

This is a process improvement, not a code bug. Lowest priority of items 7-10. Worth keeping on the list because the underlying pattern (pending specs creating drift) is likely to recur — multiple `PHASE_*_SPEC.md` files exist in the specs folder; some may also be pending. Worth one focused review pass to enumerate the inventory.

---

## Item 11 — Template card definitions cleanup: aspirational vs functional v2 cards

**Added 2026-05-29** during Sub-plan 1 pre-flight (V5 Phase 3 architecture plan v5 / file `~/.claude/plans/noble-wandering-graham.md`).

### Discovery

30-april template (`templates.id = 3442873e-921d-4c97-9f0f-39395c676b35`) has 4 card definitions in `execution_plan.cards` JSONB:
- `pse-v2` (Step 1, submodule_id=browser-crawler, options: depth=3, max_pages=30, follow_external=true)
- `writer-v2` (Step 5, submodule_id=content-writer, options: temperature=0.2, require_citations=true, system_prompt_suffix with citation enforcement)
- `seo-writer-v2` (Step 5, submodule_id=tone-seo-editor, options: temperature=0.3, keyword_emphasis=aggressive)
- `scraper-deluxe-v2` (Step 3, submodule_id=browser-scraper, options: use_unlocker=true, timeout=30000)

Plus 5 `routing_rules` referencing these card names.

Plus `escalation_rules` for steps 2 and 4 (different shape than V5 Phase 3 plan v5 specifies).

### The problem

**Card definitions can be added to template JSONB without the Multi-Card Pattern mechanism existing.** These cards are aspirational planning notes from prior planning conversations — they describe what the cards SHOULD eventually do, not what they currently do. The Multi-Card Pattern code that would actually CONSUME these definitions does not exist.

The current legacy cascade-delete code (`routingHandler.js:42-81`) reads `executionPlan?.cards` and routes against the string-keyed names, but the routing produces broken behavior (cascade-delete bug + pool restoration bug + cross-entity collateral damage per BACKLOG #7). It's not "cards work" — it's "buggy legacy code reads config and routes incorrectly."

This creates a discoverability hazard during Sub-plan 1 implementation: someone reading the template might assume these cards are functional Phase 3 work that's "already done," and miss that Sub-plan 1 is BUILDING the mechanism that makes them functional.

### Cleanup task (Sub-plan 1 day-1)

When Sub-plan 1 starts, the implementer must:
1. **Inventory all card definitions in 30-april template.** Document each card's current state: aspirational placeholder vs starting reference for Phase 3 design.
2. **Decide retention per card:**
   - Keep as starting reference for sub-plan 4 design work (e.g., writer-v2's citation prompt is a useful starting point).
   - Delete if too speculative or contradicts plan v5 scope (e.g., scraper-deluxe-v2 references deferred-to-Phase-4+ work; keep as note but mark `_status: "deferred_phase4"` to prevent activation).
3. **Distinguish from FUNCTIONAL cards once Sub-plan 1 ships.** After Multi-Card Pattern code lands, post-Sub-plan-1 cards exist in `card_definitions` (UUID-keyed) and ARE consumed by code. Pre-Sub-plan-1 `cards` (string-keyed) are migrated to `card_definitions` only if validated as part of sub-plan 4 design work.
4. **Add `_status` or `_source` annotation to each card definition** during cleanup so future readers immediately see whether a card is functional vs planning-note. Example: `"_status": "planning_note_2026-05-29"` or `"_status": "validated_sub-plan-4"`.

### Why backlog (not blocker)

Sub-plan 1 will encounter these as deliverable (d) discrepancies and surface them naturally. The cleanup task itself is small (~1-2 hours at sub-plan 1 day 1) but matters for prevention of future false-discovery cycles. Same pattern likely applies to other templates that may have similar planning-note artifacts.

### Process implication

Captures a specific Pattern H failure mode: pre-flight may verify CONFIG exists (`template.execution_plan.cards != null`) without verifying CAPABILITY (does the code that consumes this config produce correct behavior?). See Pattern H extension proposal in skeleton CLAUDE.md (separate session) — for "card exists" / "submodule exists" claims, verify all 3: (1) code exists, (2) code does what name implies, (3) production runs exercised it end-to-end. Without all 3, claim is "config/code exists," not "feature is built."

---

## Item 12 — Pre-flight overshoot: pre-flight produced implementation, not skeletons

**Added 2026-06-01** during V5 Phase 3 Sub-plan 1 pre-flight (architecture plan v5 + pre-flight at `~/.claude/plans/sub-plan-1-preflight.md` + skeleton files at `~/.claude/plans/sub-plan-1-skeletons/`).

### What happened

Pre-flight per plan v5 was scoped to produce SHAPE (signatures, structure, JSDoc, RPC wrappers with logic outlined but not finalized). Deliverables (b) SQL migration + (c) JS files were intended to be skeleton-level.

Pre-flight instead produced near-complete implementations:
- `migration_multi_card_pattern.sql` (~280 lines): full PL/pgSQL RPC bodies with SELECT FOR UPDATE locking, nested JSONB iteration, jsonb_set calls. Production-ready SQL.
- `cardInstructions.js` (~270 lines): all 6 functions with full bodies including DB queries, RPC calls, iteration logic, error throws, SKIP_REASONS validation.
- `executionPlanUtils.js` (~125 lines): all 3 functions with full bodies including UUID corruption detection.
- `autoExecutor-additions.js` (~200 lines): mixed — some functions full-body, processStep block remained pseudocode.

Total: ~875 lines of mostly production-quality code drafted during what should have been shape-level pre-flight.

### Cause (Pattern A.2)

PHASE_3B spec §5.2-§5.4 provides concrete PL/pgSQL RPC bodies + concrete JS function bodies (markConsumed, markSkipped, getPendingInstructions, writeInstructions, append_card_instruction, mark_card_instruction_consumed). Implementer treated these as implementation-ready and copied/adapted them directly rather than writing stubs that would later be filled in from the same source.

Pattern A.2 ("read affected code in full before planning") inverted: reading implementation-ready spec sections as license to implement, rather than as license to STUB from spec when implementation time arrives.

### Why tolerable this one time

Path B accepted (2026-06-01): not rolling back. Reasoning:
1. Code mirrors validated PHASE_3B spec (REVIEWED v4) — copying validated spec is not creating new design risk
2. Untested — no DB touched, no JS executed, no production exposure
3. Cheap to change before tests run
4. Rolling back to stubs + re-deriving from same spec is process theater, not value

### Going-forward rule (process)

Pre-flight produces SHAPE. Implementation happens AFTER execution-plan review (CTO + brutal-critic minimum; Gemini for code paths per plan v5 cadence).

EXCEPTION CASE: if a spec section is implementation-ready (concrete code in spec, copy-paste-and-deploy quality) AND copying it is genuinely more efficient than stubbing, the implementer must SURFACE THE DECISION explicitly: "Spec §X is ready to inline. Draft it now (skipping the stub step + skipping the review-then-implement sequence) or stub it?"

The decision belongs to Daniel + reviewer cadence, not the implementer's default. Without explicit surfacing, default is STUB.

### Compounding risk

If the code review on the drafted implementation finds a deep problem (architectural mismatch, subtle bug in RPC body edge cases, JS error handling cascade incorrect), that's the cost of the overshoot — reviews now happen retrospectively on coded work, with less leverage to prevent wasted effort. Tolerable risk in this instance per the 4 reasons above, but the risk is real.

### Detection

How would this have been caught earlier:
- Daniel asked the A-or-B question at session end (2026-06-01) — that's the catch mechanism that worked.
- Pre-flight document itself described (b)/(c) as "production-ready" + "full bodies" — language drift from "skeleton" should have been a flag.
- Pattern H criterion 3 self-check ("production runs exercised end-to-end") at the moment of writing each file would have surfaced the gap ("I'm writing implementation, not just shape").

### Resolution path

- BACKLOG #12 (this entry) — codify the going-forward rule
- Execution plan for sub-plan 1 frames drafted code as DRAFTED-UNTESTED per Pattern H criterion 3
- 3-reviewer code review (CTO + brutal-critic + Gemini) happens on the drafted code BEFORE any test runs or deploy
- If review finds problems, fixes go to the drafted code; not framed as "rework" but as "first code review"

### Pattern B.5 model-independence: confirmed real value (2026-06-02)

The 3-reviewer cycle (CTO Round 1 + Brutal-critic Round 2 + Gemini Round 3) was justified per Pattern B.5 ("model-independent verification"). Concrete validation: Gemini Round 3 independently arrived at the "move dedup into RPC" conclusion that Brutal-critic Round 2 Fix #1 had already made. Two reviewers with different framings + different model providers reached the same conclusion on the TOCTOU race — that's not redundant, that's strong confirmation the fix was correct. Without Gemini, Fix #1 would have been "one reviewer asserted; we trusted." With Gemini, it's "two independent reviewers from different model families converged."

Gemini also found 1 NEW real bug (backup transaction-split safety) + 1 upgrade-recommendation (terminal-state-on-failure mandatory) + 1 rejected-with-rationale (ULID per instruction — over-engineering vs spec §5.3 FIFO).

**Net Pattern B.5 value:** 1 new bug + 1 upgrade + 1 strong confirmation + 1 rejected with documented rationale. Not theater. Worth the round. Recommend continuing the cadence for code with similar fresh-bug risk profiles (new logic added in response to prior reviewer rounds).

### Risk B rejection rationale (Gemini Round 3 2026-06-02)

Gemini Round 3 recommended assigning ULID/timestamp+random hash to each card instruction object to enable stable targeting (vs spec §5.3 FIFO-by-array-position). **REJECTED** with the following rationale:

- Spec §5.3 explicitly mandates FIFO. The drafted code follows spec.
- FIFO-by-position safety rests on ALL `card_instructions` mutation going through the 3 RPCs under row lock (read-and-mutate atomic within single transaction; no app-memory index drift). Inspected the drafted code paths — only `append_card_instruction`, `mark_card_instruction_consumed`, `mark_card_instruction_skipped` mutate the array, all use SELECT FOR UPDATE or atomic UPDATE-with-WHERE.
- No real use case demands ULID-based targeting that FIFO doesn't already serve.
- ULID introduction would be a spec deviation with no demonstrated benefit.

**Shared-invariant note for future maintainers:** FIFO-by-position safety AND the markSkipped FIFO decision (Brutal-critic Round 2 Fix #3) share the same dependency: "ALL card_instructions mutation goes through the 3 RPCs under row lock." If any future code path mutates the array in app memory (read JSONB, modify in JS, write back), revisit BOTH this rejection (which may need ULID-style targeting) AND the markSkipped FIFO alignment (which may need explicit loop_iteration filter to disambiguate). Two decisions, one invariant. Surface the dependency rather than hide it in two separate places. — UUID_REGEX false-positive risk on submodule_ids

**Added 2026-06-02** during V5 Phase 3 Sub-plan 1 Brutal-critic Round 2 review.

### Discovery

`executionPlanUtils.js:28` defines `UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` to detect corruption (entry that LOOKS like a card_id UUID but is missing from card_definitions). Pattern requires lowercase hex with dashes at fixed positions.

Real submodule_ids in current modules repo are kebab-case ASCII (`sitemap-parser`, `qa-structural`, `keyword-sufficiency-checker`). None match the regex.

### Risk

A developer could in principle name a future submodule with a string matching UUID format (e.g., `abcdef12-3456-7890-cdef-123456789012`). The regex would treat such a submodule_id as a corrupt card reference, logging a warning and returning `submodule_id: null`. The submodule would fail to trigger.

### Why low priority

- Negligible likelihood: kebab-case is the established convention; no one accidentally names a submodule a hex UUID.
- Operator-error path only: requires a developer to choose UUID-shaped name AND have it accepted by manifest validation.
- Detection path: corruption-detection branch logs clearly; misdiagnosis is unlikely.

### Optional defense

Manifest-loader rejection of UUID-format submodule_ids at module registration time. ~5 lines of code in `moduleLoader.js`. Adds belt-and-suspenders if anyone in the future doesn't know about the constraint. Not blocking sub-plan 1.

---

## Item 14 — Sub-plan 1 ship-gate is single-run; post-ship stress validation needed

**Added 2026-06-02** during V5 Phase 3 Sub-plan 1 Brutal-critic Round 2 review.

### Discovery

Sub-plan 1 ship-gate test (per execution plan section iv): single 5-entity 30-april template run on production with one Wazdan-shape entity. Verifies happy path + one routing failure mode.

Pattern H criterion 3 ("production runs exercised it end-to-end") implies robustness to production STRESS conditions, not just a single test pass:
- Concurrent runs: two pipelines routing the same template simultaneously
- Intermittent network errors: Supabase request failures mid-routing
- Malformed data: card_definitions corrupted by template editor mid-run
- High entity count: 100+ entities, batch performance
- Adversarial inputs: invalid card_id strings, malformed routing_rules

### Why not sub-plan 1 blocker

Sub-plan 1 is foundational infrastructure. Single-run validation is appropriate for the FIRST shipping milestone. Stress validation requires the infrastructure to be working first (you can't stress-test what doesn't exist).

### Post-ship validation scope

After sub-plan 1 ships:
1. **Concurrency test:** trigger 3-5 simultaneous runs of 30-april template; verify no cross-run data corruption; verify SELECT FOR UPDATE serialization works under load
2. **Failure injection:** Supabase MCP `apply_migration` with invalid SQL to crash mid-routing; verify partial-state recovery
3. **Malformed data:** intentionally corrupt card_definitions in a test template; verify executionPlanUtils corruption detection produces clean failure (no silent garbage)
4. **Scale:** 100-entity run, measure per-entity routing latency, batch performance, DB query patterns
5. **Adversarial:** invalid card_id strings, malformed routing_rules; verify validateCards rejects at template-save time

Each is a small ad-hoc validation task (~0.5-1 day). Run incrementally during Phase 3 calibration window after sub-plan 1 ships.

### Why important

Pattern H extension (capability verification) commit 6fe686b: "code drafted, untested" is not "feature built." Sub-plan 1 ship-gate verifies happy path. Stress validation closes the gap to "feature built." Without it, sub-plan 1 ships in a known partially-validated state — acceptable for first milestone, but the gap should be tracked and closed before later sub-plans depend on Multi-Card Pattern stability assumptions.

---

## Item 15 — Add `DUPLICATE_INSTRUCTION` to SKIP_REASONS (skeleton repo)

**Added 2026-06-02** during Sub-plan 1 Section A code review (independent reviewer flagged).

### What

`cardGroups.expandCardGroups` (server/services/cardGroups.js, commit `ee402a1`) has a defensive duplicate-handling branch: if an entity has 2+ pending instructions for the same (step, submodule), the first wins (FIFO by array position) and the rest get `markSkipped`'d. Today this skip reuses `SKIP_REASONS.QA_PASSED_ON_RECHECK` as a placeholder, with a `console.warn` flagging the misuse.

### Why placeholder is wrong

`SKIP_REASONS.QA_PASSED_ON_RECHECK` (defined in `server/services/cardInstructions.js`) means *"a routing-handler check found the entity's QA passed on recheck and therefore the queued instruction is no longer needed."* Semantically distinct from *"this is a duplicate instruction that violates the Brutal-critic Fix #1 atomic-dedup invariant."* Reusing the wrong enum:
- Pollutes downstream analytics (skip-reason histograms count duplicates as QA-passed-on-recheck events)
- Hides the invariant violation behind a benign-looking reason
- Makes log-based diagnosis harder (the `console.warn` is the only signal that the path fired)

### Why low priority

Brutal-critic Round 2 Fix #1 added atomic target-level dedup to the `append_card_instruction` RPC (`WHERE NOT EXISTS` on matching pending). In well-formed state, `matching.length > 1` cannot occur — the duplicate branch is unreachable. It exists only as a defensive cleanup for pre-Fix-#1 data states.

### Scope of fix

1. Add `DUPLICATE_INSTRUCTION: 'duplicate_instruction'` to `SKIP_REASONS` enum in `server/services/cardInstructions.js`
2. Update `mark_card_instruction_skipped` RPC validation (SQL) to accept the new reason in its allowlist
3. Update `cardGroups.expandCardGroups` line ~100 to use `SKIP_REASONS.DUPLICATE_INSTRUCTION` instead of `QA_PASSED_ON_RECHECK`
4. Update `cardGroups.test.mjs` test 7 assertion (currently expects `qa_passed_on_recheck`)
5. Mention in any analytics/observability docs that this 6th reason exists

`SKIP_REASONS` vocabulary is something Gemini code-path verification + brutal-critic Round 2 both touched. Don't let this gap silently persist.

---

## Item 16 — Pre-flight cross-section dependency mapping

**Added 2026-06-03** during Sub-plan 1 Section A integration commit, surfaced by independent code-review.

### Discovery

Section A pre-flight (`/Users/danieloskarsson/.claude/plans/sub-plan-1-execution-plan.md`) scoped Section A as "autoExecutor integration: processStep restructure + 5 leaf helpers + currentIteration derivation" — 5.25 days. Section B/C/migration were named as separate sections but their interdependency with A was not surfaced in A's pre-flight checklist.

Independent code-review during Section A integration session caught that A is non-functional end-to-end without (a) schema migration adding `submodule_runs.card_id` + `submodule_runs.loop_iteration`, (b) `/run` route handler parsing `req.query.card_id` and stamping on INSERT, (c) body-entities batch scoping. These three are explicitly Section B/C + migration work but they are PREREQUISITES for the autoExecutor wiring to function — they're not "downstream sections", they're sibling-dependencies.

Section A committed as foundation-on-branch on `sub-plan-1-multi-card` (commit `a93d239`) with explicit NOT MERGEABLE documentation in commit body + handoff note. Branch isolation prevented production impact; reviewer caught the gap before merge.

### Why this is process-shape, not a one-off

Same pattern as modules-v2 BACKLOG #12 (pre-flight overshoot — pre-flight produced implementation instead of skeletons). In both cases, the issue is the pre-flight not fully mapping the work boundaries. Item 12 was about VERTICAL scope (pre-flight inlined too much); item 16 is about HORIZONTAL scope (pre-flight underscoped by not mapping cross-section dependencies).

### Proposed fix

For multi-section plans like sub-plan 1, each section's pre-flight checklist should include an explicit "cross-section dependencies" subsection that maps:

1. **Upstream prereqs:** what must land BEFORE this section can be tested end-to-end
2. **Downstream consumers:** what depends on this section's exports/interfaces
3. **Sibling-dependencies:** sections that don't strictly come before or after but whose interfaces must align (the case here — Section A's autoExecutor changes assume route handler + schema that Section B/migration are responsible for)

Without this, A/B/C end up "correct but uncommittable as standalone units" and surprising the implementer at code-review time. With it, the implementer knows up front whether they're building a standalone shippable change or a layer of a coordinated branch.

### Scope of fix

Process-level update to `superpowers:writing-plans` skill or equivalent. Not blocking sub-plan 1 (Section A foundation-on-branch is acceptable per Daniel decision 2026-06-03). Worth applying to future sub-plans' execution plans before drafting.

---

## Item 17 — schema.sql bootstrap not in Supabase migrations history blocks branch dry-runs

**Filed:** 2026-06-03
**Source:** sub-plan 1 multi-card pattern migration DDL dry-run, content-pipeline-v2 repo
**Priority:** Medium — recurring tax on every future migration that wants branch-level validation

### Discovery

When creating a Supabase development branch for DDL dry-run of `sql/migration_multi_card_pattern.sql`, the branch ended in `MIGRATIONS_FAILED` status with an empty schema. Investigation via `get_logs` revealed the cause: the very first tracked migration (`entity_routing_phase1`) tries `CREATE TABLE entity_run_meta ... REFERENCES pipeline_runs(id)`, but `pipeline_runs` doesn't exist on the fresh branch.

**Root cause:** Production was bootstrapped by applying `sql/schema.sql` directly (raw `psql` or equivalent), NOT through `apply_migration`. Supabase's `supabase_migrations.schema_migrations` table only tracks the 15 migrations applied since (via `apply_migration`). When a branch is created, Supabase replays only the tracked migrations to provision the branch DB — so the foundational tables defined in `schema.sql` are absent, and every subsequent migration that FK-references them fails.

### Effect on dry-run discipline

Every future migration that wants branch-level DDL validation will hit this same wall. The workaround used for sub-plan 1 was a manual minimal-bootstrap migration applied to the branch first (6 tables from real `schema.sql` definitions + the apply_entity_routing 3-arg stub) before applying the real migration. That worked but is yak-shaving the engineer should not have to redo each time.

### Proposed fix (long-term)

Retroactively register `schema.sql` as a tracked migration via `apply_migration` with a backfilled version timestamp predating the existing tracked ones. Steps:

1. Pick a version number that sorts BEFORE the earliest tracked migration (currently `20260421202908_entity_routing_phase1`). Use `20260101000000_initial_schema` or similar.
2. Call `apply_migration` with that name + the `schema.sql` content wrapped in `CREATE ... IF NOT EXISTS` (safe — prod state already matches). The `supabase_migrations.schema_migrations` table records the registration without re-applying anything destructive.
3. Verify by creating a throwaway branch — the replay should now succeed past `entity_routing_phase1` because `pipeline_runs` exists.
4. After verification, document in CLAUDE.md that branch dry-runs are now first-class supported.

### Workaround (short-term)

Continue the manual-bootstrap dance for each new migration that wants a branch dry-run. Each bootstrap touches only the tables that migration modifies, so the overhead scales with migration scope, not total schema size.

### Why not blocking

Sub-plan 1's DDL dry-run worked with the manual bootstrap. The cost was ~5 minutes of extra setup. But every future migration pays the same tax until this is fixed retroactively. Worth doing once and never again.

---

## Item 18 — Section C: routingHandler.js rewrite (load-bearing for any Step 7 advancement)

**Filed:** 2026-06-03
**Source:** sub-plan 1 multi-card pattern migration, content-pipeline-v2 repo
**Priority:** **HIGH** — production tripwire fires (loud error) if any run reaches Step 7 until this is done

### Discovery

After applying `sql/migration_multi_card_pattern.sql` to prod (2026-06-03), the deployed `server/services/routingHandler.js:343` still calls `db.rpc('apply_entity_routing', ...)`. The migration dropped that RPC. Without mitigation, any run advancing through Step 7 (loop-router) and producing routing decisions would crash with cryptic "function does not exist".

Mitigation applied 2026-06-03: `sql/restore_apply_entity_routing_stub.sql` installs a RAISE EXCEPTION stub at the same signature. The stub binds correctly (PostgREST resolves 3-arg call) and raises P0001 with a clear retirement message naming the replacement RPCs (`append_card_instruction` + `mark_card_instruction_*`) and pointing at Section C.

### Scope of fix (Section C)

Rewrite `server/services/routingHandler.js` to:

1. Replace the `apply_entity_routing` RPC call (line 343) with calls to `append_card_instruction` per the per-entity routing decision (see PHASE_3B_SPEC §5.2).
2. Remove the cascade-delete loop (the BACKLOG #7 bug) — the new design preserves history permanently per spec §3.5.
3. Use `mark_card_instruction_consumed` when a routed retry completes (spec §5.3) and `mark_card_instruction_skipped` for rounds_exhausted / card_deleted / qa_passed_on_recheck / pool_precondition_not_met / max_loops_backstop (spec §5.4).
4. Wire `execution_plan_snapshot` reads so routing decisions are made against the frozen plan, not the live template (spec §3.5 + new column from migration §5).

This is the **load-bearing** routing rewrite. It needs its own dry-run + review discipline (matching sub-plan 1 migration). Closes BACKLOG #7 cascade-delete bug as a side effect.

### Operational constraint until Section C deploys

The tripwire stub enforces it loudly, but please respect operationally:

- **DO NOT resume the 2 paused runs that would advance toward Step 7** — `5075e460-f588-...` and `0f5edae6-c291-...`, both currently at step 5
- **DO NOT start new runs that will reach Step 7**
- Letting a run hit Step 7 just to see the stub fire is wasted work plus a halted run to clean up

### Dependencies

- Section B (route handler `/run` card-awareness, currently in todos for future session) must land first or concurrently — Section C reads pending instructions that Section B's route handler is responsible for writing card_id stamps for during execution.
- Once both Section B + Section C ship and deploy, full Multi-Card Pattern is functional end-to-end and the tripwire stub can be removed (no caller left).

### Why not blocking sub-plan 1 conclusion

The tripwire makes the broken state self-enforcing — any accidental Step 7 advancement halts with a clear actionable error. The 4 currently-active runs are dead in practice (0 loop-router output, 5-28 days idle, 2 paused / 2 abandoned). Zero exposure as long as the operational constraint is respected.

---

## Item 19 — meal-api recovery decision (own session, own scope; decoupled from content-pipeline deploys)

**Filed:** 2026-06-04
**Reframed:** 2026-06-04 (later) — decoupled from sub-plan 1 deploy gate
**Source:** Hetzner 2026-06-02 (later) incident log — meal-api source missing from prod disk
**Priority:** Low — entirely unrelated to content-pipeline deploys; own session whenever the meal-api recovery is prioritized

### Discovery

The 2026-06-02 (later) Hetzner incident log (modules-v2 CLAUDE.md) recorded that `meal-api` ("Pantry API on port 3002") was running for 5 days at the time of the PM2 alignment incident but its source code is missing from the Hetzner disk — searched `/opt`, `/root`, `/home`. Only PM2 log files remain (`/root/.pm2/logs/meal-api-*.log`). meal-api source was later located at `/var/www/meals-api/index.js` per a post-incident note in HETZNER_SERVICES.md history; if that location was correct, it may still be retrievable from disk depending on subsequent state.

### Why this is its own session, not coupled to content-pipeline deploys

meal-api is an entirely different application — separate codebase, separate purpose (weekly meal planner / Pantry API on port 3002), no runtime relationship to the content-pipeline. It happens to share the Hetzner host.

Initially this item was filed during sub-plan 1's Section C deploy gate because commit `566c387` had folded all 5 PM2 apps on the host (including meal-api) into one `ecosystem.config.cjs` framed as "global source of truth." That bundling pulled meal-api's broken state into the content-pipeline deploy as a fail-loop-at-`pm2 start` problem, which it wasn't.

On 2026-06-04 the bundling was reversed (skeleton commit `6170d79` on `sub-plan-1-multi-card`): meal-api removed from `ecosystem.config.cjs` and from `docs/HETZNER_SERVICES.md`. The Hetzner host may run other PM2 apps; the content-pipeline config does not claim global source-of-truth. **meal-api is now genuinely decoupled.**

Note: profile-api is NOT subject to this reframing. profile-api IS a content-pipeline runtime dependency (hardcoded `http://localhost:3847` calls in `modules/step-3-scraping/linkedin-profile-scraper/execute.js` and `linkedin-post-scraper/execute.js`; both manifest.json files declare it as required). profile-api stays in `ecosystem.config.cjs` and in scope for content-pipeline deploys.

### The decision needed (when meal-api recovery is prioritized)

Two paths, exactly one of which should be taken:

**Path A — restore:** locate meal-api source code (try `/var/www/meals-api/` on Hetzner first, then backups / Dropbox / git history). If recoverable, deploy it back to `/var/www/meals-api/` and start it under PM2 as a standalone app (`pm2 start /var/www/meals-api/index.js --name meal-api && pm2 save`). Document where the canonical source repo lives, since the content-pipeline `ecosystem.config.cjs` no longer covers it.

**Path B — retire:** decide the service is no longer wanted. Remove `/var/www/meals-api/` from disk, remove `/root/.pm2/logs/meal-api-*.log`. No further action required (already absent from `ecosystem.config.cjs`).

The decision depends on whether the Pantry API service is still wanted. Not Claude's call.

### Why not blocking anything

meal-api is no longer in any deploy path. Content-pipeline deploys ignore it. The Hetzner host can run meal-api or not; nothing in the content-pipeline cares.

---

## Item 20 — tone-seo-editor: `tone_style` dropdown is redundant with prompt textarea + reference_docs mechanism

**Added:** 2026-06-07
**Updated:** 2026-06-09 — re-prioritized after Rule 13 codification (CLAUDE.md). Was "Low (cleanup)" pre-rule; now a Rule 13 violation by the operational test ("Can this change be made by editing a template in the UI?") — adding a new tone (`playful_consumer_brand`, `journalistic`, etc.) requires editing `TONE_STYLES` in execute.js + the manifest enum + a deploy, which the rule prohibits.
**Priority:** Medium (formal Rule 13 violation as of 2026-06-09)
**Scope:** modules repo — `modules/step-5-generation/tone-seo-editor/{manifest.json, execute.js, README.md}`
**Related:** Item 2 (Step 5 content-type flexibility); tone-seo-editor v1.2.0 commit `a24464b`; CLAUDE.md Rule 13 (added 2026-06-09 in the content-writer v1.6.0 / agnosticism session)

### Issue

The `tone_style` option is a `select` field with 3 hardcoded values (`b2b_authoritative`, `casual_informative`, `technical_precise`) and a `TONE_STYLES` constant in [execute.js:16-46](modules/step-5-generation/tone-seo-editor/execute.js#L16-L46) that maps each value to ~7 lines of tone instructions. The instructions are injected into the prompt via the `{tone_instructions}` placeholder.

This was designed before the `{doc:<filename>}` + `reference_docs` mechanism existed. Now that mechanism does exist, the dropdown overlaps with what operators already control via the prompt textarea + uploaded tone docs (e.g. `tone_guide.md`, future `humorous_voice.md`, etc.).

The redundancy causes three small problems:

1. **Adding a 4th tone (relaxed/humorous, journalistic, narrative-personal, etc.) requires a code change** — edit `TONE_STYLES` in execute.js, add a value to the enum in manifest.json, deploy, PM2 restart. The whole point of pushing config out of code is to avoid this.
2. **Conflict risk** — if the operator picks `casual_informative` from the dropdown but their custom prompt + uploaded voice doc say something different, the prompt now contains two competing tone blocks.
3. **UI promise mismatch** — the dropdown looks like the primary way to control tone, but the actual mechanism is the prompt textarea + reference_docs. Confusing for new operators.

### Why not addressed earlier

Discovered while clarifying the v1.2.0 architectural pattern. The dropdown is not a v1.2.0 regression — it pre-dates v1.0.0. Out of scope for the v1.2.0 commit, which targeted vertical/brand lock-ins in the prompt default. The dropdown is a separate cleanup.

~~Critically: **the dropdown is NOT a hard architectural violation.** Operators can already ignore it and control tone entirely via the prompt textarea + reference_docs. New tones can ship today via prompt-as-preset (Option 3 in the 2026-06-07 discussion) without a code change. This item is about removing a redundant piece of UI, not unblocking anything.~~

**Updated 2026-06-09:** With Rule 13 codified ("If a change cannot be made by editing a template in the UI, it lives in code, and code must be 100% pipeline-agnostic"), the dropdown IS now a formal architectural violation. The three hardcoded `TONE_STYLES` blocks (`b2b_authoritative` even mentions "CTOs, compliance officers, procurement leads" — light B2B framing baked into code) fail the operational test outright. Operators can still work around it today by ignoring the dropdown, but the violation is on the books now and remediation is no longer "low priority cleanup" — it's "remove the rule violation."

### Proposed fix

Drop the dropdown, drop `TONE_STYLES` in execute.js, drop the `{tone_instructions}` placeholder. Tone instructions live 100% in `reference_docs` (uploaded `tone_guide.md`-style files referenced via `{doc:<filename>}`) and in the prompt textarea. Same pattern as v1.2.0 used for vertical/brand framing.

### Migration concern

Removing the `tone_style` manifest option will break existing templates that depend on it. Coordination needed:

- Identify templates with non-default `tone_style` values
- For each, append the corresponding `TONE_STYLES` block content into the template's stored prompt (or attach the matching reference doc)
- Then remove the option from manifest.json + execute.js

Migration plan should be drafted alongside the code change.

### Not blocking

- Your new company-profile template (2026-06-07) works fine with the current dropdown — pick `b2b_authoritative`, attach `tone_guide.md` via reference_docs, customize the prompt textarea if needed
- A future humorous/relaxed pipeline can ship today via Option 3 (humorous voice instructions inline in the prompt textarea, saved as a preset) — no need to wait for this cleanup

---

## Item 21 — Anthropic prompt caching not enabled in skeleton `ai.complete` — large reference docs paid for per call instead of cached

**Added:** 2026-06-07
**Priority:** Medium (cost — meaningful at production scale)
**Scope:** skeleton repo — `content-pipeline-v2/server/workers/stageWorker.js` (the `ai.complete` tool the modules use)
**Related:** content-analyzer cost analysis on 2026-06-07; Item 2 (Step 5 flexibility)

### Issue

The skeleton's `ai.complete` tool ([stageWorker.js:146-198](../content-pipeline-v2/server/workers/stageWorker.js#L146-L198)) sends every Anthropic API call as a single `{role: 'user', content: prompt}` message with **no `cache_control` markers**. Every entity in a batch pays full input cost for the same large reference docs (`master_categories.md` ~17K tokens, `master_tags.md` ~3K tokens, `format_spec.md`, `tone_guide.md`, etc.) on top of any inline closed-vocabulary lookup tables operators add to their prompts.

For a 100-entity content-analyzer run with default reference docs, the cached-vs-uncached cost difference is ~$13-130 (model-dependent) — the static prefix gets re-charged 100 times instead of once.

### What prompt caching does

Anthropic's `cache_control: {type: 'ephemeral'}` markers on stable prompt prefixes cause the API to cache that portion for ~5 minutes. Subsequent calls within the window read from cache at ~10% of normal input cost.

### Per-module impact estimate

| Module | Static prefix | Typical batch | Savings on 100 entities (Sonnet) |
|---|---|---|---|
| content-analyzer | ~20K tokens (master_categories + master_tags) | 2-100 entities | ~$56 input → ~$6 |
| content-writer | ~15K tokens (format_spec + tone_guide + analysis context) | same | ~$42 input → ~$5 |
| seo-planner | ~8K tokens (format_spec + tone_guide + research) | same | ~$22 input → ~$3 |
| tone-seo-editor | ~5K tokens (tone_guide) | same | ~$14 input → ~$2 |

Caching kicks in only when ≥2 entities run within the 5-minute window — which is normal for batch processing.

### Implementation sketch

1. Refactor `ai.complete` signature to accept a structured input separating cached prefix from variable suffix:
   ```js
   ai.complete({
     cached_prefix: '<reference docs + slug lists + static instructions>',
     content: '<{entity_content} + entity-specific bits>',
     model, provider, temperature, max_tokens
   })
   ```
2. Build the Anthropic API request as:
   ```js
   messages: [{
     role: 'user',
     content: [
       { type: 'text', text: cached_prefix, cache_control: { type: 'ephemeral' } },
       { type: 'text', text: content }
     ]
   }]
   ```
3. Update modules incrementally — most already structure prompts as `<reference docs> <instructions> {entity_content} <output schema>`, so the split point is natural.
4. Verify cost reduction by reading `cache_creation_input_tokens` and `cache_read_input_tokens` from API response usage data.

### Not blocking

- Module behavior unchanged — caching is a pure cost optimization.
- Single-entity runs and runs >5 min apart don't benefit but aren't penalized.
- Can be rolled out one module at a time — content-analyzer first (biggest savings), others later.

### Why not addressed today (2026-06-07)

Surfaced during cost analysis but out of scope for tonight's new-template setup. The right place to fix is the skeleton, not the modules repo. Requires API-shape refactor + per-module update + production verification — a separate session.

---

## Item 22 — New Step 1 submodule: `sonar-deep-research` for LLM-grounded entity discovery

**Added:** 2026-06-07
**Priority:** Medium (new module — meaningful quality lift on entities with thin websites)
**Scope:** modules repo — new submodule `modules/step-1-discovery/sonar-deep-research/`
**Related:** Item 21 (Perplexity caching); seo-planner v2.1.0 (existing Perplexity integration in Step 5)

### Issue

Step 1 currently has 9 discovery modules, all scraping-based: sitemap-parser, page-links, browser-crawler, deep-links, rss-feeds, seed-url-builder, csv-discovery, api-search, test-dummy. **No LLM-grounded entity research exists at the discovery stage.**

Perplexity is wired into the pipeline at exactly one place: seo-planner's `keyword_research` integration. That's a narrow tactical use — keyword discovery serving one downstream task. It is NOT a knowledge-base build for the whole pipeline.

Consequence: when an entity has a thin website (single landing page, minimal text, JS-rendered content the scrapers struggle with), the entire downstream chain (content-analyzer → seo-planner → content-writer) is starved of input. The cite-or-omit rule we added to content-writer makes this worse — the writer will correctly omit specifics it can't cite, producing thin profiles for thin-website entities. The fix is more input at the source, not more discipline downstream.

### The proposed module

**Module:** `sonar-deep-research`
**Step:** 1 (Discovery)
**Cost:** medium (one Perplexity sonar-deep-research call per entity)
**Data operation:** `add` (produces a `deep_research_json` field on the entity)
**Pool precondition:** `empty_ok` (Step 1 module, doesn't require upstream items)

**Input:** entity name + optional context string (e.g. "Pronet Gaming" + "B2B iGaming platform provider")

**Output (per entity):** a single pool item with a `deep_research_json` field containing structured research:

```json
{
  "deep_research_json": {
    "entity_overview": "1-paragraph synthesis",
    "key_facts": {
      "founded": "year + source",
      "headquarters": "location + source",
      "employees": "range + source",
      "key_people": [{"name": "...", "role": "...", "source": "URL"}],
      "ownership": "...",
      "key_partners": ["..."],
      "key_clients": ["..."]
    },
    "market_position": {
      "primary_offerings": ["..."],
      "target_audiences": ["..."],
      "geographic_focus": ["..."],
      "competitive_differentiators": ["..."]
    },
    "recent_news": [
      {"date": "...", "headline": "...", "summary": "...", "source": "URL"}
    ],
    "regulatory_context": {
      "licenses_held": ["..."],
      "jurisdictions": ["..."],
      "compliance_certifications": ["..."]
    },
    "ecosystem_position": {
      "industry_terminology": ["topical-authority terms from this entity's space"],
      "adjacent_companies": ["competitors / partners worth mentioning"]
    },
    "source_citations": [{"index": 1, "url": "...", "title": "..."}]
  }
}
```

### Why Step 1 (not Step 5)

The research is **discovery-stage** because it informs every later step:

- **content-analyzer** can cross-reference deep-research facts against scraped content (e.g. "Source page says founded in 2015, but deep research found founded in 1996 with rebranding in 2015 — flag this discrepancy")
- **seo-planner** can use ecosystem_position.industry_terminology as additional topical signals
- **content-writer** can cite deep-research facts when scraped content is thin (graceful fallback)
- **QA modules** can use deep-research as ground-truth for fact-checking

Putting this in Step 5 would couple it to one downstream consumer (likely seo-planner or content-writer) and prevent earlier steps from using it.

### Why not bake into seo-planner

The seo-planner's Perplexity integration is for KEYWORD discovery. Entity research is a different concern. Conflating them would:
- Force every pipeline that wants entity research to also want SEO planning
- Prevent reuse across content types (a news pipeline might want entity research without keyword distribution)
- Violate the architectural principle of small modules with single concerns

### Module specifics

- `provider`: perplexity (model: `sonar-deep-research` or `sonar-pro` depending on depth needs — operator chooses)
- `prompt`: a structured prompt that asks for the JSON schema above, with cite-or-null discipline matching content-analyzer
- `reference_docs`: optional — operator can attach domain-specific guides (e.g. for iGaming, attach a brief on what counts as a "license" vs "certification" vs "registration")
- `temperature`: low (0.1-0.2) — research should be factual
- `max_tokens`: 8192 (deep research outputs can be substantial)

### Downstream integration

content-analyzer's execute.js already accepts arbitrary fields from pool items. To consume deep research:
1. Add a `{deep_research}` placeholder to the content-analyzer prompt template
2. Update content-analyzer's `buildPrompt` to inject `deep_research_json` content into that placeholder if present, empty string if absent
3. content-analyzer prompt instructs the model to use deep_research as a SECONDARY source (scraped content is primary), and to flag discrepancies between the two

No breaking changes to existing pipelines that don't use the new module — the `{deep_research}` placeholder is silently empty when absent.

### Cost estimate

Perplexity sonar-deep-research pricing as of June 2026: ~$3 per 1000 calls + token costs. Per entity: ~$0.05-0.15 depending on depth. For 100 entities: ~$5-15.

The quality lift on thin-website entities justifies this many times over. For rich-website entities, the marginal value is smaller but the cross-validation against scraped content still catches scraper failures and stale data.

### Not blocking

- Existing pipelines work without it.
- Tonight's company-profile template setup proceeds without it.
- Adding it is purely additive — no module needs to change to start producing useful output, and downstream integration is opt-in via the `{deep_research}` placeholder.

### Why not addressed today (2026-06-07)

New module creation is a from-scratch design + manifest + execute.js + README + tests + production verification. Cleanly out of scope for tonight's template-tuning session. Architectural shape is clear; execution needs a dedicated session.

---

## Item 23 — Template creator dropdown + preset map should order submodules by pipeline-execution sequence

**Added:** 2026-06-07
**Priority:** Low (UX cleanup)
**Scope:** skeleton repo — `content-pipeline-v2/server/services/moduleLoader.js` (`getSubmodulesGroupedByCategory`), client-side preset map renderer
**Related:** moduleOrder.js (CATEGORY_ORDER constant), 2026-06-07 company-profile template setup that triggered the diagnosis

### Issue

When the operator opens the template creator's "add submodule" dropdown for a step, the modules appear in an order that doesn't reflect their pipeline-execution sequence. Same for the preset map showing presets across all modules.

Concrete failure mode: while setting up a company-profile template on 2026-06-07, the operator added `deep-links` as the first Step 1 submodule because it appeared first in the dropdown — but `deep-links` has `pool_precondition: requires_items` and needs a prior submodule (sitemap-parser, page-links, browser-crawler, etc.) to populate the pool first. The misconfiguration only surfaced at runtime when Step 1 halted with "At least one submodule must be approved before approving the step" (because deep-links was correctly skipped with `skipped_no_input` per the empty-pool-fix work).

If the dropdown had shown sitemap-parser, page-links, browser-crawler, csv-discovery, etc. BEFORE deep-links (matching CATEGORY_ORDER: website → crawling → search → news → ...), the operator would naturally pick a discovery-producing module first and add deep-links as a second step for depth.

### Root cause

`getSubmodulesGroupedByCategory` in [moduleLoader.js:154-186](../content-pipeline-v2/server/services/moduleLoader.js#L154-L186) sorts submodules WITHIN each category by `sort_order` but does NOT sort the categories themselves. The returned object's keys iterate in JavaScript insertion order — roughly the order categories are encountered during module-file iteration, which is filesystem-order, not pipeline-order.

The canonical category order already exists in [moduleOrder.js:11-15](../content-pipeline-v2/server/services/moduleOrder.js#L11-L15):

```js
export const CATEGORY_ORDER = {
  website: 1, crawling: 2, search: 3, news: 4, filtering: 5, scraping: 6, analysis: 7,
  planning: 8, generation: 9, seo: 10, review: 11, qa: 12,
  formatting: 13, bundling: 14, media: 15, data: 16, testing: 17,
};
```

`sortSubmoduleIds` already applies this when sorting submodule IDs for execution order. The grouping function just doesn't use it.

### Proposed fix

Two small changes in [moduleLoader.js:154-186](../content-pipeline-v2/server/services/moduleLoader.js#L154-L186):

1. Import `CATEGORY_ORDER` from moduleOrder.js (currently only imports from itself)
2. Before returning, rebuild the `groups` object with keys inserted in CATEGORY_ORDER sequence:

```js
const orderedGroups = {};
const sortedCategories = Object.keys(groups).sort((a, b) => {
  const orderA = CATEGORY_ORDER[a] ?? 99;
  const orderB = CATEGORY_ORDER[b] ?? 99;
  return orderA - orderB;
});
for (const cat of sortedCategories) {
  orderedGroups[cat] = groups[cat];
}
return orderedGroups;
```

JS preserves insertion order for non-integer keys (ES2015+), so `Object.keys(orderedGroups)` will iterate in CATEGORY_ORDER sequence for any consumer. No API contract break.

Also apply the same ordering to the preset map — wherever presets are grouped/displayed by module, ensure modules appear in CATEGORY_ORDER + sort_order sequence (use the existing `sortSubmoduleIds` from moduleOrder.js).

### Not blocking

- Operators can still configure templates correctly — the misordering doesn't prevent valid configurations, just makes them less obvious.
- Manifest validation + runtime checks (empty-pool-fix from 2026-05-24) catch misconfigurations gracefully — the error message at step-approval time is correct.
- Workaround: operators who know the pipeline pick the right submodule regardless of dropdown order.

### Why this matters

It's a small change with big leverage on operator error rate. The category-order data already exists; the UI just isn't consuming it consistently. Same shape of bug as the cv-generator field-name mismatch fixed 2026-05-31 — a contract that exists on one side but isn't honored on the other.

---

## Item 24 — Template editor needs drag-and-drop reorder for submodules within a step

**Added:** 2026-06-07
**Priority:** Medium (UX, ordering matters in most steps)
**Scope:** skeleton repo — `content-pipeline-v2/client/src/components/pages/TemplateEditor.tsx` (frontend-only — backend already supports custom order)
**Related:** Item 23 (dropdown initial-ordering); 2026-06-07 launch-endpoint bug-fix session (3f290b4 + 157c430)

### Issue

The Template Editor's per-step submodule list exposes only **add** and **remove** actions — no way to reorder submodules after adding them. The execution order is fixed at the moment of first save (existing entries preserved, new entries appended via `sortSubmoduleIds`). To change order, the operator must delete-all-and-re-add in the desired sequence — painful and error-prone.

Surfaced 2026-06-07 immediately after the launch-endpoint fixes (`3f290b4` + `157c430`) unblocked the pipeline. Operator observed submodules executing in template-add order and asked why they can't reorder via the UI.

### Why ordering matters

Most pipeline steps have real ordering dependencies:

- **Step 1 (Discovery):** `deep-links` has `pool_precondition: requires_items` — must run AFTER `sitemap-parser` / `page-links` / `browser-crawler` / similar `empty_ok` modules that populate the pool. Wrong order = halt with `skipped_no_input` cascade (already a friction point that hit during the 2026-06-07 session).
- **Step 2 (Validation):** `url-canonicalizer` should typically run BEFORE `url-dedup` so dedup sees normalized URLs.
- **Step 5 (Generation):** `content-analyzer` → `seo-planner` → `content-writer` → `tone-seo-editor` is the canonical sequence; reordering breaks the data dependency chain.
- **Step 7 (Routing):** `loop-router` must typically be last so it sees all QA results.
- **Step 8 (Bundling):** Bundling order matters for combined-output formats.

### Backend status: order already supported

The fix is frontend-only. Verified by reading the skeleton:

- `submodules_per_step` in `templates.execution_plan` is an **ordered JSON array** per step (e.g. `{"1": ["sitemap-parser", "page-links", "deep-links"], ...}`)
- The save endpoint at [`templates.js:432-437`](../content-pipeline-v2/server/routes/templates.js#L432-L437) preserves existing array order verbatim and only runs `sortSubmoduleIds` on genuinely-NEW entries (B046 fix from earlier)
- The auto-executor reads the array in order — `submodules_per_step[stepIndex].forEach(...)` style
- So a UI that lets the operator drag-reorder and saves the new array order Just Works against the existing backend

### Proposed fix

Frontend-only change in `client/src/components/pages/TemplateEditor.tsx`:

1. Wrap the per-step submodule chip list in a drag-and-drop context (use `@dnd-kit` — modern, accessible, MIT-licensed, ~30KB; or `react-beautiful-dnd` if already pulled in elsewhere)
2. Each submodule chip becomes a `SortableItem` with a drag handle (small grip icon at left edge)
3. On drop, reorder the local `submodulesPerStep[stepIdx]` array and call `onSave({ ...plan, submodules_per_step: updated })`
4. Visual feedback during drag: ghost outline of the dragged chip, blue highlight on the drop zone

### Alternatives rejected

- **Up/down arrow buttons** — workable fallback if drag-drop is too much scope, but less discoverable and clunkier UX
- **Number-input field per submodule** — awkward, doesn't communicate the order visually
- **Auto-sort by category+sort_order at execution time** — REJECTED, breaks operator intent (some orderings vary by content type per template)
- **Force delete-and-readd workflow** — current painful workaround, bit during 2026-06-07 setup

### Not blocking

- Operators can still configure templates correctly by delete-and-readd or by being careful about initial add order
- Pipeline runs work as expected once the order is correct
- The architectural constraints (deep-links being `requires_items`) are caught at runtime, not silently broken

### Why this matters more than #23

#23 is about WHICH ORDER modules appear in the dropdown (the initial signal). This item is about LETTING OPERATORS CHANGE THE ORDER after the fact (the override mechanism). #23 makes the right choice easier; #24 makes wrong choices recoverable without delete-and-readd. Both are needed; #24 is the higher-leverage one because it covers all the cases #23 doesn't (custom orderings the operator wants for content-type-specific reasons).

---

## Item 25 — Per-entity submodule errors are masked as `approved` (skeleton repo)

**Added:** 2026-06-14 | **Priority:** Low-medium (annoyance, NOT a root cause)

**Problem:** When a Step-5+ submodule *completes* (does not throw) but returns result items with `status: 'error'` / `meta.status: 'error'` for *some* entities, auto-execute / batchWorker still marks those entities `approved` and the run summary reports "N completed, 0 failed." A genuine per-entity failure is hidden behind a green checkmark, so an operator cannot tell a clean run from one where an entity produced nothing.

**Confirmed instances (2026-06-13/14 E2E runs, "7th june 17.15" template, Pronet Gaming + Wazdan):**
- seo-planner returned markdown instead of JSON → error item → shown `approved` (before the v2.2.1 prompt-restore + retry fix).
- content-analyzer pre-flight refused (missing reference docs) → error items → shown `approved` (run `7271e3a8`).
- content-writer `fetch failed` (LLM timeout, ~908s) for Wazdan → error item, no `content_markdown` → shown `approved` (run `5999aa8e`); tone-seo-editor then correctly reported "No content_markdown found," also shown `approved`.

**Fix sketch (skeleton, auto-executor / batchWorker per-entity status decision):** treat a submodule result whose item has `status === 'error'` (or `meta.status === 'error'`) as a per-entity `failed`, not `approved`; reflect it in `failed_count` and the run summary; optionally halt per the auto-execute failure threshold. This is the auto-execute/batchWorker layer — **distinct from Item 7** (Step-7 routing cascade-delete) and from Item 8 (Step-8 quality-signal propagation).

**Explicitly NOT this item — the real priority:** the actual Step-5 product failures (content-writer / seo-planner LLM calls failing to produce the deliverable) are the core problem. This item only makes such failures *visible*; it does not make Step 5 reliable. The content-writer LLM-robustness work (e.g. the `fetch failed` timeout on large-input entities) is tracked/handled separately and matters far more — a visible failure is still a failed product.

**Resolution (`874c436`, 2026-06-14):** `stageWorker.handleEntityJob` now derives the per-entity status via `deriveEntityRunStatus(result)` (`server/utils/entityRunStatus.js`) and writes that same value to BOTH `entity_submodule_runs.status` AND `entity_stage_pool.status` (success-path mirror). A result with `meta.status === 'error'` or all-items-`status:'error'` is now `failed`, so it counts in `failed_count` and toward the auto-execute halt threshold; QA verdicts (`qa_pass:false`) remain `completed`. Regression tests: `content-pipeline-v2/server/utils/entityRunStatus.test.js` (18 cases incl. a structural guard that the pool mirror uses `entityStatus`, not a literal). This resolves the **single-submodule-per-entity** case (the three confirmed instances above are all single-submodule failures). The **multi-submodule** residual is split out as Item 26.

---

## Item 26 — Pool status is last-writer-wins across submodules at a step

**Added:** 2026-06-14 | **Priority:** Low (residual of #25) | **Touches:** `content-pipeline-v2/server/workers/stageWorker.js`, `server/workers/batchWorker.js`, `server/services/autoExecutor.js` (`evaluateStepResult`)

**Problem:** `entity_stage_pool` has ONE `status` column per `(run, step, entity)`. When a step runs multiple submodules (e.g. Step 5: content-analyzer → content-writer → seo-planner → tone-seo-editor), each submodule's `stageWorker` write overwrites that single column — so the pool status reflects the **last** submodule to run for the entity, not "did any submodule fail." `874c436` (Item 25) made the per-submodule write correct, but the aggregation across submodules is still last-writer-wins.

**Consequence — two surfaces can disagree in multi-submodule steps:**
- `batchWorker` derives `pipeline_stages.completed_count/failed_count` from `entity_stage_pool.status` ([batchWorker.js:88-106](../content-pipeline-v2/server/workers/batchWorker.js#L88)) → reflects the last submodule.
- `autoExecutor.evaluateStepResult` reads `entity_submodule_runs.status` and marks an entity failed if **ANY** submodule failed ([autoExecutor.js:820-837](../content-pipeline-v2/server/services/autoExecutor.js#L820)) → reflects any-failure.

So if content-writer fails but a later seo-planner/tone-seo-editor succeeds for the same entity, the pool status ends `completed` (forwarded at approve) while `evaluateStepResult` still counts the entity failed. The halt threshold (which reads `entity_submodule_runs`) is correct; the headline pool count can under-report. Same shape pre-dates `874c436` for thrown errors — not introduced by it; `874c436` fixes the common single-submodule and last-submodule cases.

**Cross-step note:** because approve forwards only non-`failed` pools (`approve_step_v2` forwards `status='approved'` only — [runs.js:390-397](../content-pipeline-v2/server/routes/runs.js#L390), [migration_move_routing_to_step7.sql:80-94](../content-pipeline-v2/sql/migration_move_routing_to_step7.sql#L80)), last-writer-wins also decides whether a partially-failed entity is carried forward. An entity whose final submodule succeeded is carried forward even if an earlier submodule failed; one whose final submodule failed is dropped. Audited 2026-06-14 — this is consistent with the established throw-path behavior, but the determinant being "last submodule" rather than "any submodule" is the surprising part.

**Fix sketch (not scoped yet):** options include (a) a dedicated per-step aggregation that sets pool status from the worst per-submodule outcome (read `entity_submodule_runs` for the step before approve), or (b) a distinct `flagged`/`partial` pool status that batchWorker counts as failed but approve still forwards (overlaps with Item 8 quality propagation). Decide alongside Item 8 — both are about a single status column carrying more meaning than it can. See also **Item 9 → "Open decision (2026-06-14 audit)"** for the related product call on whether generation-failures should flow forward as `flagged` rather than drop.

**Why low priority:** the halt threshold (the safety-critical surface) reads `entity_submodule_runs` and is already correct. Single-submodule steps (Steps 1-4, 6-10 typically) are unaffected. Only multi-submodule generation steps with a *non-final* submodule failure under-report in the headline count.

---

## Item 27 — Off-site crawl wanders onto linked domains for content-less seeds (NOT analyzer fabrication)

**Added:** 2026-06-15 | **Priority:** Low (config-driven, expected behavior; surfaced by a degenerate fixture seed) | **Touches:** discovery config (`follow_external`), `modules/step-1-discovery/{browser-crawler,deep-links}`

### What happened (ship-gate fixture build, run `3e27ba01`)

A synthetic entity seeded with **`https://example.com`** (intended as a thin, no-citable-facts seed to force `citation:fail` at Step 6) instead produced a **full IANA company profile** with 8 citations and PASSED citation coverage. Investigation (Step 1-5 pool trace, DB-verified):

- `example.com`'s ~30-word page links to `iana.org/domains/example`. **browser-crawler** (`follow_external=true`, per the 30-april `pse-v2` card) followed it; **deep-links** extracted **23 `iana.org`/`icann.org` URLs**.
- Step 2-3 canonicalized, kept, and **scraped all 23** — `iana.org/news` (3214 words), `/protocols` (5316), `/about` (393), `/about/excellence` (217), `/time-zones` (168), `pti.icann.org`, `icann.org`, … Real content, thousands of words.
- content-analyzer's **9 `source_citations` are exactly those actually-scraped pages**; the key_facts (Paul Eggert = real tz coordinator; "EFQM Committed to Excellence, August 2013" = on the scraped `iana.org/about/excellence`) came from real scraped content.

### Classification — IMPORTANT

**content-analyzer did NOT invent sources.** It cited real, scraped pages. The earlier suspicion ("analyzer fabricates 9 citations from a 30-word page") was wrong: the page wasn't the only input — the crawler had pulled in 23 real `iana.org` pages first. This is **not** a hallucinated-sources correctness bug.

The real mechanism is **off-site crawl**: `follow_external=true` lets discovery leave the seed domain and crawl whatever it links to. For a normal company (its own site has the content), on-site content dominates and this is fine/intended. For a **degenerate seed with no own content** (`example.com` = a placeholder page whose only substance is an off-site link), the crawl goes *entirely* off-target.

### Why low priority

- The behavior is **config-driven** (`follow_external=true`) and **expected** for real entities. No code is misbehaving.
- It only fully derails on a content-less seed — not a real-run shape.

### Worth a glance for real runs

For a real company whose site links heavily to partners/registries/social, `follow_external=true` could pull a meaningful fraction of off-target content into the analysis. Not investigated here; flagging that the off-site scope is wider than one might assume. A future option: cap external-domain crawling (e.g. depth 1 off-site, or domain allow-list) when precision matters.

### Fixture lesson (for the ship-gate)

A thin/real-URL seed does **not** deterministically yield `citation:fail` — either the crawler finds real off-site content (this case), or (for a truly empty page) the LLM still produces *some* citations. A reproducible `citation:fail` needs the citation outcome decided by **code, not by scrape+LLM** — i.e. inject content with zero `[#n]` directly at the Step-6 QA boundary (see the ship-gate fixture mechanism).

---

## Item 28 — Backward routing never re-executes the target step (Section-C stage-reset gap)

**Added:** 2026-06-15 | **Priority:** HIGH — blocks the entire backward-routing / Round-2 retry mechanism (the core of Multi-Card / sub-plan 1). The sub-plan-1 ship-gate cannot pass until this is fixed. | **Touches:** `content-pipeline-v2/server/services/autoExecutor.js` (resume-safety check + loop-continuation), `server/routes/runs.js` (routing branch), possibly the routing RPCs.

### The bug

When `loop-router` routes an entity backward (e.g. `citation:fail` → step-5 card), the auto-executor's loop-continuation (`autoExecutor.js:415-456`) does `routingLoops++`, cleans **in-memory** state (`state.steps_completed`, `state.per_step_results`) for steps ≥ `earliest_step`, and re-enters the do-while → inner for-loop from step 0.

But on re-entry, the **resume-safety check** (`autoExecutor.js:160-167`) skips any step whose **DB `pipeline_stages.status`** is `completed`/`approved`/`skipped`:
```js
const stageStatus = await getStageStatus(runId, stepIndex);
if (stageStatus === 'completed' || stageStatus === 'skipped' || stageStatus === 'approved') {
  // ... continue;  // SKIP
}
```
**Nothing resets the target steps' `pipeline_stages.status` to `active`/`pending` on the backward path.** The only stage→`active` resets in the codebase are the **forward** `all_terminal` branch (`runs.js:515-516`), the **skip** endpoint (`runs.js:678`), and the **manual reopen** endpoint (`runs.js:818-822`). The backward-routing branch (`runs.js`, not-all_terminal) returns `earliest_step` but resets no stage; the routing RPCs reset none either. The loop-continuation cleans only in-memory state, **not** the DB stage status the resume-safety check reads.

**Result:** on re-entry, Steps ≥ `earliest_step` (which are `approved`/`completed`/`skipped` from Round 1) are all silently skipped. **Round 2 never executes.** The run then runs the first not-yet-done forward step and proceeds/halts.

### Evidence (ship-gate run `61c8a8c4`, 2026-06-15)

`routingHandler` wrote a correct card instruction (`citation:fail` → `{step:5, card_id:a8f4…0001, card_round:2, loop_iteration:1}`), `loop_count` 0→1, `routingLoops` fired. But DB after routing: Step 5 `skipped`, Step 6 `completed`, Step 7 `completed` (**none reset to active**). Re-entry skipped 5/6/7; only Step 8 (`pending`) ran → `meta-output` `skipped_no_input` + a 120s timeout → run `halted`. `entity_submodule_runs`: **zero `loop_iteration=1` rows.** Orphan check clean (7 Round-1 rows, 0 orphaned — no cascade-delete), but no Round-2 rows appended.

### NOT a fixture issue (corrects the brief's framing)

The ship-gate brief hypothesized the failure was "Step 5 was skipped, so the route had nowhere to land," and proposed "make Step 5 runnable." That is **insufficient**: a normally-executed Step 5 is `approved` after Round 1, and `autoExecutor.js:162` skips `approved` exactly like `skipped`. **Steps 6 and 7 (`completed`) would also be skipped on re-entry.** So no choice of injection boundary fixes this — it is a code bug, independent of the fixture.

### Same class as the `routingHandler` schema drift (`be07509`) — Pattern I

Section C removed the pre-2026-06-04 cascade-delete (which deleted `entity_submodule_runs`/`submodule_runs` for steps ≥ target and effectively forced re-execution) but **did not add the stage-reset that the new append-only model needs.** The end-to-end Round-2 cycle was never run after the Section C rewrite (the ship-gate is the first attempt), so both this and the schema-drift bug lurked unexercised. The ship-gate is surfacing them one at a time.

### Fix options (for a reviewed code change — Rule 2)

1. **Reset target stages on backward routing.** When routing returns `earliest_step`, set `pipeline_stages.status='active'` (+ re-seed `entity_stage_pool` at the target step, and reset its downstream stages to `pending`) for steps ≥ `earliest_step`, mirroring what the `reopen` endpoint (`runs.js:818-859`) already does for a manual reopen. Then the resume-safety check won't skip them and the card-group re-execution runs.
2. **Make the resume-safety check loop-aware.** Don't skip a step at line 162 if the entity has a *pending card instruction* for that step in the current loop iteration (a Round-2 pass). Narrower, but must be careful not to defeat genuine resume safety.

Either needs its own dry-run + review discipline (this is the load-bearing retry path, same risk class as routingHandler). Closes the gap that blocks the sub-plan-1 ship-gate.

### Resolution — FIXED + deployed (2026-06-18)

Fixed by `4c06d3f` (skeleton, branch `sub-plan-1-multi-card`) via fix option 1: the backward-routing branch reopens the loop body — resets the re-entered stages' `pipeline_stages.status` to `active`, clears their stage columns, reopens `entity_stage_pool` at the target — **without deleting any rows** (append-only; no #7 cascade-delete). Reviewed (Gemini + code-review agent), tested, deployed Path B, verified. **STAYS deployed:** it is a trunk prerequisite for any backward routing to work, and is dormant/harmless until routing goes live — no real template carries `routing_rules` + `card_definitions` yet (`30 april`'s card is the `writer-v2-placeholder`; the real card is sub-plan 4). See Item 30 and the 2026-06-18 session log. **Do NOT revert.**

---

## Item 29 — Resumed auto-execute clamps config.steps, blocking backward routes before the resume point

**Added:** 2026-06-16 | **Priority:** Low-medium (only bites a paused run that routes backward before the pause point; non-paused production runs are unaffected) | **Touches:** `content-pipeline-v2/server/routes/runs.js` (auto-execute/resume), `server/services/autoExecutor.js` (do-while re-entry over `config.steps`)

### What happened (ship-gate full-cycle run 48c0e3f4, with the #28 fix deployed)

The #28 fix correctly reopened the loop body on a backward route (Step 5 `skipped`→`active`, Step 6/7 `pending`, pool s5 `pending`). But the run had been **paused before Step 7** (ship-gate run-control) and **resumed**. The resume built the auto-execute config with `steps: [7,8,9,10]` (from the resume point onward), logged verbatim:
`[auto-execute] Starting run … — steps: 7,8,9,10, skip:`

The auto-executor's backward-route re-entry (autoExecutor.js:415-456) re-iterates the SAME `config.steps`. So when routing reopened **Step 5** (`earliest_step=5 < 7`), the re-entry loop — iterating only `[7..10]` — never reached Step 5. Step 5 stayed `active` but unrun; loop-router re-fired at Step 7 (`iter=0`, decision `flag_manual`), and the run halted waiting on a phantom `loop-router iter=1`. **No `loop_iteration=1` rows; Round 2 never executed.**

### Why it is NOT #28 and NOT a production bug

A NON-paused auto-execute builds `steps: [0..10]`, so the backward-route re-entry reaches Step 5 normally. The clamp only happens on **resume after a pause**. The 30-april template has no pause in production — I added `pause_before_steps:[7]` transiently for ship-gate run-control. So this is a pause × backward-routing interaction exposed by the test harness, not a defect in the #28 fix or in normal routing.

### The deeper conflict it exposes (ship-gate fixture design)

The deterministic citation:fail fixture needs Step 5 **skipped on the forward pass** (to inject zero-`[#n]` content) but **runnable on the backward pass** (so Round 2's content-writer card executes). The only way to flip `skip_steps` mid-run is pause→revert→resume — but the resume ALSO clamps `config.steps`. So the deterministic-skip fixture + pause/resume cannot currently complete the full cycle.

### Options for a green full cycle

1. **Fix the resume/backward-route step range** (cleanest, real fix): on a backward route the re-entry must iterate from `earliest_step` even if `earliest_step < resumePoint`. Either widen the resumed `config.steps` to `[0..10]`, or have the backward-route handler extend the iterated range down to `earliest_step`. Then the deterministic skip-1-5 + pause/resume path completes. Reviewed change (Rule 2).
2. **Step-5-runnable fixture, NO pause** (skip 1-4, seed content with empty `source_citations` + no source text so content-writer emits zero `[#n]`): a non-paused full auto-execute has `steps:[0..10]`, so the backward route reaches Step 5. Avoids the clamp entirely. Risk: Step-5 Round-1 determinism is shakier (LLM), per the earlier brief — may trip the failure-point gate; report separately if so.

### Status

#28 itself is validated (the reopen works). The full-cycle green run is blocked by this clamp; the gate is not yet green.

### Resolution — fix implemented, PARKED not deployed (2026-06-18)

Fix option 1 implemented: `widenStepRange()` (new pure helper `server/utils/stepRange.js`) widens the resumed `config.steps` down to `earliest_step` when a backward route targets a step below the clamped range; called in the autoExecutor routing branch **before** the `per_step_results` cleanup so the cleanup covers the widened range. No-op (same reference) when the target is already in range, and a non-paused run builds `config.steps=[0..10]` (min 0) → **production no-op today**. Reviewed + tested (10/10 unit tests, incl. a structural guard that autoExecutor imports + calls the helper in the routing branch). Committed as `079f7d1` on `sub-plan-1-multi-card`, tagged **`parked-not-deployed`**. **NOT deployed, NOT merged.** The triggering path (pause + resume + backward route below the resume point) is unreachable until `routing_rules` + `card_definitions` are wired onto a real template (sub-plan 4). Resurrect when that path goes live — this commit is the pointer.

---

## Item 30 — Sub-plan-1 ship-gate PARKED; four conditions carried forward to sub-plan 4

**Added:** 2026-06-18 | **Priority:** Carried forward (acceptance bar for sub-plan 4) | **Touches:** sub-plan 4 (real escalation card + `routing_rules` on a genuine template)

### Decision (park-and-pivot)

The sub-plan-1 ship-gate kept surfacing bugs (#28, #29) that live in the skip/pause/resume **test scaffolding**, not in routing itself. Root realization: **routing is not wired into any real template.** `30 april` (`3442873e`) is the only template with `routing_rules` + `card_definitions`, and its card is a placeholder (`writer-v2-placeholder`, marked `sub-plan-1-ship-gate`). The real escalation card + real routing config are **sub-plan 4** work. So the gate has been testing a fixture-shaped version of a feature that isn't built yet.

- **#28** — leave deployed. Trunk prerequisite for any routing; dormant/harmless until routing goes live. Do NOT revert.
- **#29** — reviewed/tested, PARKED (`079f7d1`, tag `parked-not-deployed`), NOT deployed. Side-branch; only bites pause + resume + backward-route below the resume point — unreachable until routing config exists. Resurrect when the path is live.
- **Ship-gate** — parked. Not pushed to green against scaffolding (doing so is what manufactured the #29-class entangled bug).

### Four conditions — carry forward as sub-plan 4's acceptance bar

Run on the production path (straight-through 0..10, **no** skip/pause), with a real card + real trigger:

1. **Routing fired** — a backward route is emitted on the QA-fail.
2. **Round 2 executes with marker** — the re-executed step shows the Round-2 card (`loop_iteration=1` / `card_round:2` rows present).
3. **Terminal state** — `approved` on QA pass, or `failed` at `max_loops`.
4. **Orphan check clean** — no cascade-delete; Round-1 rows preserved, Round-2 rows appended.

### Principle

Pre-fix trunk prerequisites (#28), defer side-branch bugs (#29), don't push a scaffolded gate to green. The gate becomes meaningful in sub-plan 4 (real card, real trigger, real path), where condition 2 + the orphan check finally prove the product, not the scaffolding.

### CTO audit (2026-06-20) — empirical ship-gate reality + corrected diagnosis

A CTO verification pass queried the live pipeline DB (`fevxvwqjhndetktujeuu`) directly (the bookkeeping audits hadn't). Findings, all DB-verified:

- **The synthetic ship-gate entity DID fail QA correctly — it did NOT "pass and skip routing".** On the latest ship-gate run `48c0e3f4` (entity `ship-gate-citation-fail`), `citation-coverage-checker` emitted `qa_pass:false`, `citation_score:0`, *"Content contains no inline citations [#n]. Automatic fail."* (An interim adversarial agent claimed the entity passed QA by reading the run-`status='approved'`; that conflates step-approval status with the `output_data.qa_pass` verdict. Corrected here.)
- **The real blocker is loop-router deciding `flag_manual` instead of routing backward.** loop-router saw `qa_citation:"fail"` but emitted `decision:"flag_manual"`, no `routing_log` row, no `loop_iteration=1`, no `card_id`. This is the **#29 pause/resume clamp** (run `48c0e3f4` was paused-before-7 then resumed → `config.steps` clamped to `[7..10]` → backward route to step 5 unreachable → flag-manual). So "the gate isn't green" is a **resume-clamp** artifact, not a trigger problem.
- **Phantom state:** `entity_run_meta.loop_count=1` with empty `routing_log`, NULL `terminal_state`/`routing_applied_at`/`last_qa_scores`. A counter advanced without the corresponding re-execution — **root-cause this in sub-plan 4 before building on it.**
- **DB hygiene surfaced by this audit (zombie kill + 5 untriaged `running` rows) → split out to [[Item 34]]** (2026-06-20), so this item stays scoped to the ship-gate. That cleanup is `pipeline_runs` table hygiene, not ship-gate-specific.
- **Evidence note (2026-06-24) — the forensic specimen is GONE; reproduce fresh.** The run the diagnosis above was read from, `48c0e3f4` (+ sibling `61c8a8c4`), has since been **deleted** by live `pipeline_runs` churn (17→10 rows over 06-20→06-22). Only `3e27ba01` (project `ship-gate-2026-06-15`, single synthetic entity `ship-gate-citation-fail`, paused at step 7) survives, and it carries no routing artifacts. **DB-wide, the backward-routing mechanism has executed ZERO times ever:** 0 `entity_routing_log` rows, 0 `entity_submodule_runs.loop_iteration>0`, 0 `card_id` populated, 0 `entity_run_meta.terminal_state`. The diagnosis stands (recorded while the specimen existed), but **sub-plan-4 task 2 must reproduce the citation-fail scenario fresh — do NOT go hunting for `48c0e3f4`.** This also reframes #28 + the whole routing product as *deployed-but-never-once-exercised* code: sub-plan 4 is its first real execution.

### Deterministic citation:fail recipe (verified — corrects "citation:fail is hard")

**Do not inherit the "deterministic citation:fail is hard" framing.** That was over-stated. BACKLOG #27 (off-site crawl producing real citations) is specific to the **`example.com`-link seed** approach, NOT seeding in general. The **zero-`[#n]`-content seed already produces a deterministic auto-fail** — proven on run `48c0e3f4`: content with no inline citations → `citation-coverage-checker` returns `qa_pass:false` ("Automatic fail"), regardless of LLM nondeterminism (the checker counts `[#n]` markers; zero sources → zero markers → fail).

**Sub-plan-4 ship-gate recipe (cheapest validated path):** seed an entity at Step 5 with no source text so content-writer emits zero `[#n]`, and **run straight-through (no pause)**. Straight-through keeps `config.steps=[0..10]`, so the #29 clamp never applies and the backward route reaches Step 5 for Round 2. This dodges **both** #27 (don't use the off-site seed) **and** #29 (don't pause). A code-decided QA-verdict toggle is a *fallback only* if seeding proves flaky — no injection infrastructure needed up front.

### Scope lock (2026-06-20)

**Canonical sub-plan-4 scope = THREE v2 cards** (PSE-v2, content-writer-v2, SEO-writer-v2) on the **company_profile** template, with the **entry gate + one-shot harness built first**. The earlier handoff's "one real escalation card" framing is **narrower than canonical** and is confirmed as **reduced-slice-first, NOT a permanent cut**: build **content-writer-v2 as a vertical slice** to prove the v2-card mechanism end-to-end on the real path (the four conditions above), **then** PSE-v2 + SEO-writer-v2 follow. File the remaining two cards as explicit named carry-forward (not vague debt) so the slice can't quietly become "sub-plan 4 = one card, done."

---

## Item 31 — `deploy.sh` footgun: whole-tree rsync silently ships parked code (skeleton repo)

**Added:** 2026-06-20 | **Priority:** HIGH — silent production hazard | **Touches:** `content-pipeline-v2/deploy.sh`

### The hazard

`deploy.sh` (lines 28-33) deploys the skeleton via `rsync -azP --delete` of the **entire working tree**, excluding only `node_modules`/`.env`/`.git`/`.DS_Store`. The parked **#29** files (`server/utils/stepRange.js`, `stepRange.test.js`) physically exist on disk at branch HEAD, and working-tree `autoExecutor.js` carries `widenStepRange`. **The next full `./deploy.sh` ships parked #29 to production with no gate**, silently breaking the "do not deploy #29" park decision. The park is currently protected *only* by nobody running `deploy.sh` — and the #28 deploy was actually done by a **manual single-file rsync** (mtime forensics: prod `runs.js` mtime Jun 16, prod `autoExecutor.js` mtime Jun 3), not by `deploy.sh`. The two deploy paths have opposite footgun profiles.

### Gating decision (decided — implement before any skeleton deploy)

Options considered:
- **(A) `--exclude` the parked files in the rsync** — REJECTED as structurally insufficient. It can exclude the two new files, but it **cannot** handle a parked commit that *modifies an existing deployed file* (`autoExecutor.js` carries both real history AND the parked `widenStepRange` hunk; excluding the whole file would break the deploy). Per-filename excludes also rot.
- **(C) Loud pre-deploy warning only** — REJECTED as primary. Warnings get routed around (the Pattern B.1 credibility argument); fails open.
- **(B) Abort-gate keyed off the `parked-not-deployed` tag** — **CHOSEN.** Fails closed, robust to modified-file parks, can't rot per-filename, and forces a conscious override. Add near the top of `deploy.sh`:

```bash
# Guard: never deploy a parked commit (BACKLOG #31).
PARKED_TAG="parked-not-deployed"
if git -C "$LOCAL_APP" rev-parse -q --verify "refs/tags/$PARKED_TAG" >/dev/null 2>&1; then
  PARKED_COMMIT="$(git -C "$LOCAL_APP" rev-list -n1 "$PARKED_TAG")"
  if git -C "$LOCAL_APP" merge-base --is-ancestor "$PARKED_COMMIT" HEAD 2>/dev/null; then
    if [ "${DEPLOY_ALLOW_PARKED:-0}" != "1" ]; then
      echo "❌ ABORT: HEAD contains parked commit $PARKED_COMMIT (tag $PARKED_TAG)."
      echo "   A whole-tree rsync would ship parked code to prod, breaking the park."
      echo "   Resolve the park, or set DEPLOY_ALLOW_PARKED=1 to override deliberately."
      exit 1
    fi
    echo "⚠️  DEPLOY_ALLOW_PARKED=1 — shipping parked commit $PARKED_COMMIT consciously."
  fi
fi
```

Lifecycle: the gate fires on every skeleton deploy while `079f7d1` is an ancestor of HEAD (the desired behavior — forces the #29 resurrection decision at first sub-plan-4 deploy). When #29 is deliberately unparked, delete the `parked-not-deployed` tag and the gate stops firing.

**IMPLEMENTED 2026-06-22** — skeleton commit `250fe6a` on `sub-plan-1-multi-card` (pushed, backup). Added as a `[0/6]` pre-flight guard in `deploy.sh`, matching the decided design above. Independent `/code-review` = PASS (0 critical/0 warning; `set -e` interaction confirmed safe, both branches functionally tested, annotated-tag dereferences to the commit). **Active locally** the moment it's in the checkout (deploy.sh runs locally), so the footgun is closed for any deploy from this repo. **Not yet deployed to prod** — the guard ships on the next conscious deploy (which it will itself gate: deploying from the parked HEAD needs `DEPLOY_ALLOW_PARKED=1`, the intended forcing function for the #29 resurrection decision).

---

## Item 32 — Sub-plan-4 deferred card: PSE-v2 (V5 item 27)

**Added:** 2026-06-20 | **Priority:** Carry-forward (sub-plan-4 canonical scope; **NOT optional**) | **Touches:** Step-1 discovery card on the `company_profile` template; gated by the sub-plan-4 entry gate + one-shot harness

Named carry-forward so the reduced-slice-first start (content-writer-v2 only) **cannot close as "sub-plan 4 done at one card."** PSE-v2 = a Step-1 `google-pse-curated-search` card with a broader curated source list + a different query template than v1. Sequencing: follows the content-writer-v2 vertical slice once the mechanism is proven green; subject to the same entry gate (draft prompt/query-template → validate it beats v1 on 3 reference entities via the one-shot harness, **before** coding). Cross-ref: canonical scope = 3 cards (this + content-writer-v2 + [[Item 33]] SEO-writer-v2) per `noble-wandering-graham.md` §Sub-plan 4 and BACKLOG #30 "Scope lock". **Numbering caution:** this is BACKLOG Item 32; the plan calls it "item 27" (V5 ITERATION_PLAN numbering) — different axis from BACKLOG #27 (off-site crawl).

---

## Item 33 — Sub-plan-4 deferred card: SEO-writer-v2 (V5 item 30)

**Added:** 2026-06-20 | **Priority:** Carry-forward (sub-plan-4 canonical scope; **NOT optional**) | **Touches:** Step-5 generation card on the `company_profile` template; gated by the sub-plan-4 entry gate + one-shot harness

Named carry-forward (companion to Item 32) so neither deferred card silently vanishes when the content-writer-v2 slice ships. SEO-writer-v2 = a Step-5 card with stricter meta requirements (e.g. `meta_title` 50–60 chars AND contains the primary keyword from keyword-research output). Sequencing: follows the content-writer-v2 vertical slice; same entry gate (draft stricter-meta prompt → validate v2 beats v1 on 3 reference entities via the harness, before coding). Cross-ref: canonical 3-card scope per `noble-wandering-graham.md` §Sub-plan 4 + BACKLOG #30 "Scope lock"; companion [[Item 32]] PSE-v2. **Numbering caution:** BACKLOG Item 33 = the plan's "item 30" (V5 numbering) — different axis from BACKLOG #30 (ship-gate park record).

---

## Item 34 — DB hygiene: stale/zombie `pipeline_runs` rows (pipeline DB)

**Added:** 2026-06-20 | **Priority:** Low-medium (state-clarity; do before any sub-plan-4 validation run) | **Touches:** pipeline DB `fevxvwqjhndetktujeuu`, `pipeline_runs`

Split out of [[Item 30]] (2026-06-20) so the ship-gate carry-forward record isn't conflated with DB cleanup — different concern.

- **Done:** run `36d34311` had been `status='running'` for 13 days at step 7 (a zombie; BullMQ worker long dead) — killed 2026-06-20 (set `status='abandoned'`, `completed_at`) so state-checks aren't ambiguous.
- **TRIAGED 2026-06-22 → all 5 set `abandoned`:** the 5 other stale `running` rows (13–29 days, all zombies) — `23a6267d` (step 4, the pre-Section-C run), `1e834cb6` (step 3), `99b8f268` (step 1), `7dcc4794` (step 2), `aa81daa2` (step 6, the Jun-7 baseline run) — set to `abandoned` with `completed_at`. **Baseline now clean: 0 `running` rows.** (Observed in passing: the `pipeline_runs` table shrank from 17 → 10 rows between 2026-06-20 and 2026-06-22 — external live churn / cleanup, not from this triage; noted for awareness, not acted on.)
