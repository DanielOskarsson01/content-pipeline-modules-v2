# HARDENING_SCOPE.md — Program A triage

**Date:** 2026-07-19 · **Repo:** content-pipeline-modules-v2 @ `5fbc828` (branch `hardening-scope`) · **Mode:** READ-ONLY triage, no code changed.
**Seeds:** the 2026-07-19 diagnosis of run `d9c21199` (candidate BACKLOG #61/#62, recorded in this repo's `CLAUDE.md`). Treated as authoritative; this document builds on it.

---

## TL;DR — the number, front and centre

**3 CRITICAL · 5 MODERATE · ~12 COSMETIC.**

The two seeds were not the tip of a ten-headed iceberg. **The pattern is deep in exactly ONE load-bearing place — the skeleton's run-status computation — and that one place explains every symptom.** The module surface around it is small (4 more instances), and the team is already hardening it (keyword-sufficiency-checker was patched for this exact class — the "W1.1" comment in its code). So the honest answer to "how deep does it go":

> **One systemic root cause (skeleton), plus a handful of module-level source/gate leaks — most already partly mitigated. Not scattered; concentrated.**

The single fact that unifies all of it, quoted from the skeleton's own code comment (`content-pipeline-v2/server/utils/entityRunStatus.js:12-17`):

> *"a submodule failure is NOT a QA verdict. A checker that returns `qa_pass:false` produced a VALID result… This helper flags ONLY `meta.status==='error'`… as 'failed'. **QA verdicts, skips, and partial results stay 'completed'.**"*

A `qa_pass:false` becomes a **green** run *by design*. Everything else follows from that.

| # | Severity | Finding | Owner repo | Ships broken output *today*? |
|---|----------|---------|-----------|------------------------------|
| C1 | CRITICAL | QA verdicts & routing decisions never gate publication success | **skeleton** | **Yes** (prod `d9c21199`) |
| C2 | CRITICAL | seo-planner ships a hollow plan as `status:'success'` | modules | **Yes** (prod `d9c21199`) |
| C3 | CRITICAL (latent) | loop-router silently **approves** a structural-only QA failure | modules | Masked by C1; landmine under the C1 fix |
| M1 | MODERATE | hallucination-detector fails **open** (`qa_pass:true`) on empty content | modules | No (fails silently green, but siblings fail-closed) |
| M2 | MODERATE | content-analyzer validates JSON *shape* not *content* | modules | Unproven at runtime |
| M3 | MODERATE | keyword-sufficiency passes when the SEO plan item is entirely absent | modules | No |
| M4 | MODERATE | url-relevance salvages an LLM failure to all-`MAYBE` | modules | No (surfaced + kept-for-review) |
| M5 | MODERATE (mitigated) | tone-seo-editor can drop Step-8 markers | modules | No (v1.2.1 gate already fails loud) |

---

## The class we hunted

> **"Silent salvage that looks green":** a module catches/absorbs a failure and substitutes a default/empty/partial result that flows downstream as if successful, **OR** a genuine failure never propagates to run status.

### What was searched (so "we looked hard" is evidenced)

- **All 42 live `execute.js`** (44 incl. 2 archived) inventoried.
- `JSON.parse` sites — 48 hits, every LLM-output parser read.
- Every `completeWithJsonRetry` / retry / salvage / `fallback` hit (100+; the great majority are *designed* network fallbacks — Wayback, HEAD→GET, `field_map` arrays — not the class).
- Every `catch` block in `execute.js` that returns a value (30) — checked return-fallback vs rethrow vs error-status.
- Every `status:'success'|'completed'|'passed'` assignment (14).
- Every `qa_pass:true` literal (10 code sites) and every QA checker's empty-input polarity.
- Required-field placeholder salvage (`|| 'Not specified'|'unknown'|…`, 35 hits) — only **one** is load-bearing (`seo-planner:208`).
- **Skeleton** (`content-pipeline-v2`, read-only): `entityRunStatus.js`, `stageWorker.js`, `routingHandler.js`, `autoExecutor.js` for how a module result becomes a run status.

**Result: no class instance exists beyond the 8 listed here.** The sweep converged — the same handful of files kept coming back.

### Code-visible vs needs-a-running-pipeline

| Finding | Mechanism | Blast radius |
|---------|-----------|--------------|
| C1 | **code-certain** (skeleton comment + code) | per-run depends on template `routing_rules` config → needs runtime/workbench |
| C2 | **code-certain + prod-evidenced** | — |
| C3 | **code-certain** | whether `qa-structural` is in a template → config |
| M1, M3, M4 | code-certain | — |
| M2 | code-certain mechanism | whether it produces hollow-but-valid analysis in prod → needs runtime |

---

## CRITICAL

### C1 — QA verdicts & routing decisions never gate publication success — *skeleton-owned*

**This is the load-bearing finding and the reason the two seeds look like separate bugs — they are one.**

**Evidence (three interlocking, all read this session):**
1. `content-pipeline-v2/server/utils/entityRunStatus.js:22-34` — `deriveEntityRunStatus` returns `'completed'` unless `meta.status==='error'` **or every item** has `status==='error'`. Its own docstring (12-17) states `qa_pass:false` is *deliberately* `'completed'`.
2. `content-pipeline-v2/server/services/routingHandler.js:598` — an entity that can't be routed to a card gets `terminal_state='flagged'`, and the comment says it **"CONTINUES to steps 8/9."** `'approve'→'approved'` also forwards (616-624). Only `'failed'` is non-publishable.
3. A `qa_pass:false` maps to `decision='failed'` **only** via the max-loops backstop (`routingHandler.js:549-558`) or dead-site (`loop-router.js:159-166`) — **never directly** from a quality verdict.

**Root cause:** run/entity status is derived from *module-execution* success (did it throw / emit all-error items), not from the *semantic* verdict (`qa_pass`) or the routing *decision*. QA verdicts gate **retries**, not **publication**. If a template has no `routing_rules` for the failing check, or the decision resolves to `approve`/`flagged`, the content ships and the run is green — which is exactly what run `d9c21199` did.

**Owner:** **skeleton (`content-pipeline-v2`)**, not this repo. Run status is skeleton-owned. Architectural — triggers that repo's brutal-critic + CTO review gate.
**One-line fix approach:** bridge verdict→status — e.g. gate the Step-8 forward on `terminal_state==='approved'` only (make `'flagged'` non-forwarding), **or** add a `completed_with_qa_failures` terminal that the auto-executor and UI treat as not-green. Design decision, not a patch.
**Program A cannot fix this** (different repo) — except at the source, via C2/M2 below.

---

### C2 — seo-planner ships a hollow plan as `status:'success'` — *module-owned (BACKLOG #61)*

**Evidence:** prod run `d9c21199`; `seo-planner/execute.js:208` (`const primaryKeyword = keywords.primary || 'Not specified'`), `:686` (`meta:{status:'success'}`).
**Root cause — precise correction to the seed:** `completeWithJsonRetry` is **fail-loud** — it throws on the 2nd parse failure (`:167-171`), it does *not* salvage. The hollow plan is a **valid-but-empty JSON object**: seo-planner validates JSON **shape** but never **content**, flattens the empties to `"Not specified"`, and emits `status:'success'`. The `|| 'Not specified'` on a required field is the tell.
**Owner:** this repo — `seo-planner`.
**One-line fix approach:** after parse, assert non-empty `target_keywords` **and** (`meta` **or** `faqs`); on emptiness emit `meta.status:'error'` (a *generation* failure, not a QA verdict). **The skeleton already honours `meta.status:'error'` → entity `'failed'`** (`entityRunStatus.js:23`), so this flips the entity red at the source **with no skeleton change** — a genuine partial mitigation of C1.
**Why not critical-but-deferred:** it is the confirmed source of the only prod incident and the cheapest lever against the whole class.

---

### C3 — loop-router silently **approves** a structural-only QA failure — *module-owned (latent)*

**Evidence:** `loop-router/execute.js:149-154` builds `failures[]` from keyword/meta/citation/hallucination **only — `structural` is omitted**; there is **no rule** for `summary.structural==='fail'`; so a structural-only failure reaches `:244` `if (failures.length === 0) return { decision:'approve' }`. `qa-structural` correctly emits `qa_pass:false` (`qa-structural/execute.js:133,238`) — loop-router drops that verdict on the floor.
**Trigger (named):** any run where `qa-structural` fails and every other check passes/is-absent → `decision:'approve'` → ships.
**Honest caveat:** **masked by C1 today** (nothing gates on the decision anyway). It becomes load-bearing the moment routing is honored — i.e. **the most natural C1 fix ("only publish when `decision==approve`") would be silently defeated by this bug.** That is exactly why it belongs in Program A: fix it *with* C1, not after.
**Owner:** this repo — `loop-router`.
**One-line fix approach:** add `structural` to `failures[]` and a routing rule (`structural:fail → loop_generation` / `flag_manual`).

---

## MODERATE — backlog

- **M1 — hallucination-detector fails open on empty content.** `execute.js:309,331,358` return `qa_pass:true` for `no_content` / `no_sources` / `no_claims`. Its *check-failure* paths are fail-**closed** (unparseable/LLM-error → claims `unsupported`, score drops — `:407-458`), so this is narrow. But it is the **only** QA checker that passes empty input (meta-compliance, citation, qa-structural all fail-closed), and `no_content→pass` is wrong. Fix: mirror keyword-sufficiency's W1.1 — `no_content` fails closed with an `allow_empty_content` opt-out.
- **M2 — content-analyzer validates JSON shape, not content.** Same class as C2, less evidence. It fail-closes on *parse* errors (`execute.js:509-520,555-563`) but a valid-but-hollow `analysis_json` emits `status:'success'` and cascades into seo-planner. Fix: same hollow-content assertion as C2. Bundle with C2 if cheap.
- **M3 — keyword-sufficiency passes when the plan item is entirely absent.** `execute.js:484-506` → `qa_pass:true, skip_reason:'no_seo_plan'`. Documented "works without seo-planner" contract, but a fail-open path if seo-planner *silently produced nothing*. (The stronger case — plan present but empty — is **already hardened** to fail-closed, `:508-560`.) Fix: gate the skip behind an explicit option, or fail-closed when a plan was expected.
- **M4 — url-relevance salvages an LLM failure to all-`MAYBE`.** `execute.js:191-213`. Loud-ish (populates `errors[]`, `meta.errors:1`, description says "N entity error(s)") and low-harm (it's a `remove` op; MAYBE items are *kept* for operator review, nothing is lost). By-design, but the error can still ride a green run (C1). Leave as-is or downgrade to warning-only.
- **M5 — tone-seo-editor can drop Step-8 bracket markers (#3, already mitigated).** v1.2.1 added a marker-preservation gate (`execute.js:418-444`) that emits `status:'error'` on drop — and because it's the entity's sole item, the skeleton's all-items-error path (`entityRunStatus.js:25`) flips the entity to `'failed'`. **It already fails loud and the skeleton already honors it.** Residual: the prompt still doesn't *prevent* the drop (gate is reactive). Fix (optional): strengthen the prompt's marker-preservation instruction. Verify-only, not urgent.

---

## COSMETIC — seen, **not** recommended for Program A

Grouped, one line each. No runtime consequence.

- **~15× `entity.name || 'unknown'`** across scrapers/validators — defensive name coercion. Harmless, though it technically violates the skeleton's "modules must never defensively handle missing names" contract (the skeleton guarantees `name`). Delete-on-touch, not a task.
- **Display/metadata defaults:** `post_type||'unknown'`, `feed_type||'unknown'`, `extraction_method||'unknown'`, `title||'Untitled'`, `renderValue → 'Not available'`. Presentation only.
- **~40 designed network fallbacks:** Wayback Machine, HEAD→GET, ScrapeLinkedIn, `field_map` fallback arrays, regex-extraction tiers. These are *resilience*, surfaced in output — the opposite of silent salvage.
- **`toNumber(val, fallback)` numeric-coercion helpers** (api-fetcher, ai-discovery-scout, search-discovery, url-heuristics) — guard `NaN`, benign.
- **`loop-router.js:251`** — `// Fallback (should not be reached, but defensive)` dead branch. Harmless; could delete.
- **Scraper per-item `status:'success'`** — real success, not salvage.

---

## PROGRAM A — the plan

Modules-repo work only. Each unit is independently shippable, independently testable, ≤1 day. Ordered by trust-damage.

| Unit | Finding | Repo | Est. | Test (leave one runnable check) |
|------|---------|------|------|--------------------------------|
| **A1** | C2 — seo-planner hard-fail on hollow plan | modules | ~1 day | unit: hollow plan → `meta.status:'error'`; happy plan → `success` |
| **A2** | C3 — loop-router route structural | modules | ~0.5 day | unit: `route({structural:'fail'})` sole → not `approve` |
| **A3** | M1 — hallucination-detector `no_content` fail-closed + opt-out | modules | ~0.5 day | unit: empty content → `qa_pass:false` unless `allow_empty_content` |
| **A4** *(opt)* | M2 — content-analyzer hollow-content assert | modules | ~0.5 day | unit: hollow analysis → `meta.status:'error'` |

**Honest total: ~2–2.5 engineer-days** in this repo (A1+A2+A3; A4 optional, bundle with A1).

**The load-bearing win is A1+A2 together:** A1 flips the confirmed prod failure red *at the source* using machinery the skeleton already honors; A2 removes the landmine that would otherwise defeat the skeleton's C1 fix. Neither needs a skeleton deploy. Ship them behind this repo's Rule 8 (commit+push) and Rule 9 (`/code-review`) as usual.

**Sequencing note (repo Rule: order by failure cost):** A1/A2/A3 are pure module logic with unit tests — no irreversible step. Land them first and independently. C1 (skeleton) is the larger, review-gated change; it should *follow* A1/A2 so that when routing is finally honored, the module verdicts feeding it are already correct.

---

## What Program A CANNOT fix → hand to Program B (workbench)

1. **C1 proper — the verdict→status bridge.** Skeleton-owned (`content-pipeline-v2`: `entityRunStatus.js` + `routingHandler.js` + `runs.js:494` Step-8 filter). Different repo, architectural, review-gated. **Its own unit.** Program A only mitigates it at the source (A1/A4).
2. **Which prod templates actually ship green-empty.** C1's blast radius is per-template (`routing_rules` presence/gaps). Static review cannot enumerate live template configs — needs the workbench to run pipelines and read `terminal_state` per entity.
3. **Whether M1/M2 fire in production.** Confirming hallucination-detector's fail-open or content-analyzer's hollow path actually trigger needs runs with the triggering inputs — a running pipeline, not a grep.
4. **The general "does any `qa_pass:false` ever reach a gate?" question per template** — runtime-only. This is precisely the "silent salvage that only a running pipeline reveals" residue; it is the workbench's reason to exist.

---

## Appendix — files read this session

Modules: `loop-router`, `meta-compliance-checker`, `qa-structural`, `citation-coverage-checker`, `hallucination-detector`, `keyword-sufficiency-checker`, `seo-planner` (`execute.js` + `CLAUDE.md`), `content-analyzer`, `url-relevance`, `ai-discovery-scout`, `tone-seo-editor`.
Skeleton (read-only): `server/utils/entityRunStatus.js`, `server/workers/stageWorker.js` (status-derivation line), `server/services/routingHandler.js`, grep of `autoExecutor.js`.
Seed: this repo's `CLAUDE.md` 2026-07-19 diagnosis (#61/#62, run `d9c21199`).
