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
| 7 | **Phase 3 routing cascade-delete is wrong by design** (skeleton repo) | **High — blocks Phase 3 validation** | 2026-05-25 |
| 8 | Quality signals don't propagate to Step 8 output (modules repo) | Medium | 2026-05-25 |
| 9 | Step 9 distribution gate doesn't exist in current template (skeleton + template config) | Medium | 2026-05-25 |

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
