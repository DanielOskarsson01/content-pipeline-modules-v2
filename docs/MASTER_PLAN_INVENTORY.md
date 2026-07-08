# Master-Plan Inventory — Content Pipeline → Usable Content-Creation Tool

**Date:** 2026-07-05
**Purpose:** Grounded, honest inventory feeding a full product plan ("finish the content pipeline into a usable content-creation tool"). This document is the **foundation for a master plan that will be adversarially reviewed**, so wrong claims cost more than gaps. Every claim is grounded in a file/commit actually read; unconfirmable claims are marked **UNVERIFIED**.

**How gathered:** 7 parallel read-only research agents (one per section), each instructed to ground every claim and flag uncertainty. No code was built or edited during inventory. Repos referenced:
- **modules** = `content-pipeline-modules-v2` (CI-deploys on push to `main`)
- **skeleton** = `content-pipeline-v2` (deploys manually; currently a "Path-B frankenstein" — see §7)
- **specs** = `OnlyiGaming/Content-Pipeline/` (specs + archive; **lives outside git** — see §8 / BACKLOG #41)

**Two honesty flags carried at the top (do not lose these):**
1. **The "per-round variant card model" decision + its ~2–3 week structural-rework sizing is a 2026-07-04/05 session conclusion NOT YET WRITTEN TO DISK.** A grounded search of both `plans/` dirs, both repos, and `/Downloads` found no artifact. The nearest on-disk item is **BACKLOG #43** (parks "move card/routing authoring into the template editor"). Treat the per-round-variant rework as a **recorded-here-first** decision, UNVERIFIED against any prior disk artifact. This doc is its first written record.
2. **B052 deploy status is CONFLICTING.** The conversation/session record states B052's runtime fix was Path-B deployed + proven (`persisted_ok: true`) in an earlier session; git shows the recording commit `320529a` is **branch-only, not on `main`**. Both can be true (Path-B applies to prod filesystem without touching git main — the frankenstein pattern). **Reconcile by shasum at deploy time.** Marked UNVERIFIED-against-prod-now.

---

## §1 — Founding Strategy

**Finding: TWO evolutionary strategy versions exist (not contradictory — the specific became the first use case of the general).** The current governing doc is `Content-Pipeline/specs/STRATEGIC_ARCHITECTURE.md` (Feb 7 2026), self-labeled "the governing strategic document."

### Version A — founding, company-profile-specific (oldest: Dec 11 2025)
`Content-Pipeline/archive/Raw_Appendix_Content_Creation_Master.md`:
- L7 (verbatim): *"The goal of this workflow is to build a scalable, modular, and SEO-optimized pipeline for generating high-quality company profiles. Each step is designed to balance automation with human quality control, ensuring profiles are fact-checked, structured, and continuously enriched with new content sources."*
- L23–29 **Aim** (verbatim): *"Deliver 1,400+ evergreen company pages initially and later for new companies, even as a feature at registration. Consolidate content (profiles, news, reviews, updates, media) directly on company pages… Keep the system adaptable for future expansion into additional verticals, languages, and content types."*
- Describes a **13-step** skeleton, 4 MVP variants, original orchestration **n8n + Supabase**.

### Version B — governing, universal tool (Jan 29–Feb 7 2026)
`Content-Pipeline/specs/STRATEGIC_ARCHITECTURE.md`:
- L24–26 (verbatim): *"This is not a pipeline in the factory sense — it's a tool that a human operator uses to create content intelligently. The operator decides what to make, which sources to use, what quality threshold to accept, and when to publish. The tool handles the tedious parts…"*
- L44 (the pivot, verbatim): *"Company profiles are the first use case, not the only one. The architecture is designed so that the same skeleton supports any content type — present and future."*
- L83: skeleton "doesn't know about company profiles, sitemaps, or Strapi… the same tool could theoretically handle content creation for any industry, any platform, any content type — by swapping modules."
- Now **11 steps (0–10)**; Express + BullMQ + Redis + Supabase; two-repo skeleton/modules.

### Intended users
Primary = **a single human operator** (internal team), human-in-the-loop. `STRATEGIC_ARCHITECTURE.md` L308: *"In v1, the user IS the router."* Secondary = **module developer/freelancer** (L147: build a submodule without knowing Supabase/Redis/BullMQ). Deferred public path: registration self-service (`ROADMAP.md` L100–103, Not Started).

### What "done" meant
- **v1 (ship first):** human reviews everything, every decision logged (L200). *"This logging is not optional. It's the foundation everything else builds on."*
- **End-game:** self-improving calibration (L182–205) — cheaper per run, quality climbs, routing intelligence, new LLMs back-tested.
- **Skeleton "done" = built once and frozen** (L362).
- **Concrete metric (Version A):** "1,400+ evergreen company pages."
- **Achieved milestone** (`ROADMAP.md` L134–141): Company-profile MVP — *"11 entities, 0% failure, 75 min."* Multi-content-type: Not started.

### Conflicts / tension (explicit)
- Version A (company-profile, 13-step, 1,400 pages, n8n) vs Version B (universal tool, 11-step, "any content type", Express/BullMQ). **Reconciled, not accidental** — the "first use case, not the only one" line appears in `STRATEGIC_ARCHITECTURE.md` L44, `AGENTS.md` L13, `Content-Pipeline/CLAUDE.md` L9.
- **Priority tension:** `Content-Pipeline/CLAUDE.md` L110–116 lists **News as HIGH priority #1**, company profiles #3 — but the executed strategy made company profiles the proven first type and **News is Not Started** (`ROADMAP.md` L77–87). Stated priority ≠ executed order.

**UNVERIFIED:** No dedicated VISION/STRATEGY/GOALS/README exists in either v2 repo (confirmed via `find`); founding strategy lives entirely in `Content-Pipeline/specs/` + `archive/`. Not every archive file was read (e.g. `SKELETON_SPEC_v1.2`, `ITERATION_PLAN_V2–V5`); an even-earlier goal statement, if it exists there, is unconfirmed.

---

## §2 — BACKLOG Inventory (both repos, complete)

**Files:** modules `BACKLOG.md` (1785 lines, 43 items, index + bodies — all read). **Skeleton has NO BACKLOG file** (confirmed via repo-wide `find`); all skeleton-side items are tagged "skeleton repo" inside the modules BACKLOG. This is the single source.

Status legend: **OPEN** · **PARTIAL** · **RESOLVED** · **SUPERSEDED** · **PARKED** (built, deliberately undeployed).

| # | Description | Status | Grounding / load-bearing-for |
|---|---|---|---|
| 1 | 2nd LinkedIn account (post-scraper + profile-api dual PM2) | OPEN | Future plan; w/c 2026-05-26 activation **UNVERIFIED**. Not core pipeline |
| 2 | Generic content-analyzer + content-writer via cards (kill specialized-per-type) | OPEN (active) | "Medium-high (active)". Foundation for new content types; gates Item 36; blocks `_archive` deletion |
| 3 | Loader fail-closed when MODULES_PATH unset (skeleton) | OPEN (low) | "Not blocking" — prod sets it |
| 4 | Local client build broken — Rollup arch optional-dep (skeleton) | OPEN (workaround) | **Blocks any deploy incl. client** (card-write UI, #23/#24/#43). Path-B bypasses |
| 5 | Docs/tooling commits not on prod filesystem | OPEN (stale, low) | No runtime impact |
| 6 | deploy.sh hardcodes client build for any deploy (skeleton) | OPEN | Server-only hotfix ergonomics; pairs with #4 |
| 7 | Phase-3 routing cascade-delete wrong-by-design (skeleton) | **RESOLVED/SUPERSEDED** | "verified in deployed code 2026-06-24"; Section C removed it; orphan-check retained as #30 guard |
| 8 | Quality signals (terminal_state/QA) don't reach Step 8 output | OPEN | "High-severity the moment auto-distribution comes online". Couples #9 |
| 9 | Step 9 distribution gate + Step 10 review queue don't exist | OPEN | **Biggest functional "usable product" gap** — cannot safely publish |
| 10 | Pending-spec tracking process | OPEN (process, low) | Overlaps #41 |
| 11 | Template card-def cleanup (aspirational vs functional v2 cards) | PARTIAL/SUPERSEDED | Absorbed into sub-plan-4 (#30/#32/#33). Formal `_status` cleanup **UNVERIFIED** |
| 12 | Pre-flight overshoot process rule | RESOLVED (codified) | Process lesson recorded |
| 13 | UUID_REGEX false-positive on submodule_ids | OPEN (negligible) | Defensive only |
| 14 | Sub-plan-1 ship-gate stress validation (concurrency/scale) | OPEN | Confidence before later sub-plans lean on Multi-Card |
| 15 | Add DUPLICATE_INSTRUCTION to SKIP_REASONS | OPEN (unreachable) | Analytics cleanliness only |
| 16 | Pre-flight cross-section dependency mapping (process) | RESOLVED (codified) | — |
| 17 | schema.sql not in Supabase migrations history (skeleton) | OPEN (medium) | **Blocks branch dry-run for the card-write migration**; recurring migration tax |
| 18 | Section C routingHandler rewrite + apply_entity_routing tripwire | **RESOLVED** | "rewrite SHIPPED `be07509`, deployed"; tripwire dropped. **Body header STALE** — trust index |
| 19 | meal-api recovery decision (Hetzner) | OPEN (decoupled, low) | Nothing for content pipeline |
| 20 | tone-seo-editor tone_style dropdown = Rule 13 violation | OPEN (medium) | Rule 13 compliance; touches #37 classification |
| 21 | Anthropic prompt caching in skeleton ai.complete | **RESOLVED** | "DEPLOYED + savings PROVEN 2026-06-26" (`cache_WRITE=49,050`/`cache_READ=49,050`). Follow-up: cherry-pick `bef48ec`→skeleton main |
| 22 | sonar-deep-research Step-1 module | **SUPERSEDED** by #36 | Still unbuilt; subsumed |
| 23 | Template dropdown order by pipeline sequence (UX) | OPEN (low) | Operator-error reduction |
| 24 | Template editor drag-drop submodule reorder (UX) | OPEN (medium) | Backend ready; frontend needs client build (#4) |
| 25 | Per-entity errors masked as approved (skeleton) | **RESOLVED** (single-submodule) | `874c436`; multi-submodule residual = #26 |
| 26 | Pool status last-writer-wins across submodules (skeleton) | OPEN (low) | Decide with #8. Safety-critical halt path already correct |
| 27 | Off-site crawl (follow_external) wanders onto linked domains | OPEN (config, expected) | Real-run precision; ship-gate fixture design |
| 28 | Backward routing never re-executes target step (skeleton) | **RESOLVED (deployed, dormant)** | `4c06d3f`; "STAYS deployed… Do NOT revert". Core of Multi-Card retry |
| 29 | Resumed auto-execute clamps steps, blocks backward routes | **PARKED** | `079f7d1`, tag `parked-not-deployed`, NOT deployed/merged. Sub-plan-4 ship-gate |
| 30 | Sub-plan-1 ship-gate PARKED — 4 acceptance conditions → sub-plan 4 | **PARKED/carry-forward** | "backward-routing mechanism has executed ZERO times ever". IS sub-plan-4's acceptance bar |
| 31 | deploy.sh footgun ships parked code (skeleton) | **RESOLVED (impl, local-only)** | `250fe6a` "active locally; not yet deployed" — ships on next conscious deploy |
| 32 | Sub-plan-4 card: PSE-v2 (Step 1) | OPEN (carry-forward, NOT optional) | Sub-plan-4 completeness; config-free global-card example |
| 33 | Sub-plan-4 card: SEO-writer-v2 (Step 5) | OPEN (carry-forward, NOT optional) | Sub-plan-4 completeness; config-carrying example |
| 34 | DB hygiene: stale/zombie pipeline_runs | **RESOLVED** | "0 running rows". Caveat: capture ship-gate evidence promptly (retention) |
| 35 | citation-coverage-checker padding-blind QA gate (modules) | OPEN (medium) | "can pass marketing-padded profiles with a perfect score". Load-bearing QA signal |
| 36 | Research-driven discovery + synthesis architecture (design) | OPEN (unbuilt) | Comparative content types (pillar/head-to-head); supersedes #22; builds on #2/#21/#35 |
| 37 | Global cards = copy-on-use library (skeleton+modules) | **RESOLVED (design) / OPEN (build)** | Trigger-gated; NOT near-term blocking. One seam with round-model (escalation-card naming) |
| 38 | Card-aware READ not implemented for run_submodule_config.options | **OPEN (HIGH)** | "**gates card-write enablement**… MUST land in the same change that first writes card_id rows". The card-write deploy trap |
| 39 | Stricter card-save validation deferred past §9 | OPEN (low) | Card-UI hardening; lands with card-UI session |
| 40 | npm test silently skipped 11 .mjs suites — 3 failing (skeleton) | **RESOLVED (commit not deployed)** | "108/108 green"; index top-line stale-says-Open |
| 41 | Canonical specs live outside git (skeleton+modules) | OPEN (medium) | Root cause of PHASE_3B drift; overlaps #10. **Do NOT git-add to mega-repo — dedicated sub-repo** |
| 42 | Multi-window / shared-dir state contention (process) | **OPEN (HIGH)** | "actively costing lost work" — 5 incidents incl. the lost card-write landing kit. Meta-blocker |
| 43 | Routing/card authoring belongs in template editor not run view | **PARKED** | 2026-07-04. "Decide from a DEPLOYED baseline, separate thread". Snapshot-isolation UX honesty |

**Index-vs-body inconsistencies (flagged so the plan isn't misled):** #18 body header stale (tripwire "fires" — actually shipped+dropped); #40 index says "Open" but body has dated "RESOLVED 2026-06-29".

### MUST-INCLUDE in a finish-the-product plan (the real critical path)
- **Tier 1 — complete the routing product (sub-plan 4), the deployed-but-never-once-exercised mechanism:** #30 (anchor), #32, #33, **#38 (HIGH hard-gate)**, #29 (resurrect), #39; foundation #2.
- **Tier 2 — delivery (pipeline cannot publish today):** **#9** (Step 9/10 gates — biggest functional gap) + #8 (quality → Step 8).
- **Tier 3 — content quality:** #35 (padding-blind QA), #36 (research/synthesis design).
- **Tier 4 — deploy unblockers:** #4 (client build), #31 (deploy to prod before next full deploy), #17 (migration dry-run).
- **Tier 5 — authoring usability:** #24, #23.
- **Tier 6 — process meta-blocker:** **#42** (actively destroying work).

### STALE / excludable
RESOLVED: #7, #12, #16, #18, #21, #25, #28, #34, #40. SUPERSEDED: #22. Low/defensive/decoupled (excludable): #3, #5, #10, #13, #15, #19. PARKED (re-enter via owning thread only): #29 (→sub-plan 4), #43 (→post-deploy).

---

## §3 — V5 Plan (`noble-wandering-graham.md`) — what's actually left

**File:** `~/.claude/plans/noble-wandering-graham.md` and `Dropbox/claude-sync/plans/noble-wandering-graham.md` are **byte-identical, hardlinked (inode 96554041)** — no divergence. It is an **architecture contract, not a task tracker** (almost no checkboxes); delivery status therefore comes from **session logs + git**, not plan checkmarks.

**Related plan files found:** `plan-2-groundwork-final.md` etc. = the **Rule 13 rollout, a SEPARATE workstream** (W1.1–1.3+1.5 shipped: modules `ca83d9b`/`685af34`/`f585d15`/`1728136`; W1.4+W2 partly open) — not one of V5's sub-plans. `lets-not-make-descsiom-misty-hejlsberg.md` = HelloLilly job-search, unrelated.

### Headline: of V5's five sub-plans, only **Sub-plan 1 is built (and proven) — but it lives entirely on branches, none merged to `main`, none fully deployed.**

| V5 item(s) | Sub-plan | Status | Grounding |
|---|---|---|---|
| 13–15 (data model, per-entity instructions, exec) | 1 | **DELIVERED on branch, UNMERGED to main, not fully deployed** | `376022d`/`16886fb`/`27672d1`; Multi-Card services absent on skeleton main (`bb39ed8`) |
| 16–17 (card stacking UI + routing editor) = **card-write thread** | 1 | **DELIVERED on branch, HELD** | `f9e49a9`/`7a69870`/`050e8e7`; RESUME "COMPLETE… THE DEPLOY not done here" |
| 18 (Step-7 routing) | 1 | **DELIVERED** | BACKLOG #18 `be07509` |
| Sub-plan-1 ship gate (5-entity, Wazdan-fail→Round 2) | 1 | **PASSED (mechanism proven)** | run `3db1d23b` completed; `/Downloads/subplan4-task2-2026-06-27/FINDINGS-routing-mechanism.md` "PROVEN end-to-end". Reached `terminal_state='failed', max_loops_exceeded` (plan accepts) |
| 19–22 (escalation gates) | 2 | **NOT-STARTED** | `gateEvaluator.js`/`escalationPredicates.js` never created; 0 gate wiring |
| 23 (model_select on 4 QA manifests) | 3 | **NOT-STARTED** | ABSENT on all 4 QA manifests |
| 24 (threshold tuning) | 3 | **NOT-STARTED** | no tuning commit |
| 25 (qa-structural) | 3 | **PARTIAL — built (293-line execute.js), never E2E-validated** | plan line-10 "VALIDATE" |
| 26 (E2E routing test) | 3 | **NOT-STARTED** (gated) | — |
| 27 (PSE-v2) | 4 | **NOT-STARTED / deferred** | BACKLOG #32 "NOT optional" |
| 29 (content-writer-v2) | 4 | **SUPERSEDED → fold-into-base, NO card** | entry gate PASSED (`/Downloads/cw-v2-entry-gate-2026-06-28/`); "no cost justification for a routed retry card". Preset-fold **UNVERIFIED applied** |
| 30 (SEO-writer-v2) | 4 | **NOT-STARTED / deferred** | BACKLOG #33 "NOT optional" |
| 31 / 32-partial (routing config) | 4 | **NOT-STARTED** | after cards + gates |
| 33 (50-entity/held-out validation) | 5 | **NOT-STARTED** (gated on 1–4) | — |
| 28 (scraper-deluxe-v2 / Bright Data card) | (deferred) | **DEFERRED to Phase 4/5** by plan | (Bright Data *transport* renewed 2026-06-28 `effa4e7` — infra, not this card) |

**What's actually left after card-write:** (1) **deploy Sub-plan 1** (the whole Multi-Card bundle — biggest item; blocked by parked-#29 + #38 + prod-state audit); (2) **Sub-plan 2 escalation gates — NOT-STARTED**; (3) **Sub-plan 3** — one built-unvalidated module + 3 not-started items; (4) **Sub-plan 4** — the one attempted card folded to no-card; PSE-v2 + SEO-writer-v2 unbuilt; (5) **Sub-plan 5 — NOT-STARTED.** Roughly **one of five sub-plans built, none shipped to main.**

**Session/RESUME caution:** the two `RESUME.md` files disagree (skeleton older "Unit 1 GREEN"; modules newer "ALL BUILD UNITS DONE") — the exact BACKLOG #42 contention. Prefer git evidence.

---

## §4 — Submodule Inventory (three lists)

**"Integrated" = has `manifest.json` in a `step-N-*/` subfolder.** From `moduleLoader.js` (`loadModules` L85–130): scans dirs matching `/^step-\d+-/` (so `_archive/` + `_shared/` excluded); missing manifest → skipped; `active` is NOT a load filter.

### (a) BUILT AND INTEGRATED — **38 loaded (not 37)**
The loader prints "38 submodule(s) loaded". The "37 active" in CLAUDE.md drops the **`test-dummy`** stub (`step-1-discovery/test-dummy`, category "testing"). Real production modules = 37; loaded incl. stub = 38.

- **Step 1 Discovery (9):** api-search · browser-crawler · csv-discovery · deep-links · page-links · rss-feeds · seed-url-builder · sitemap-parser · **test-dummy** (stub)
- **Step 2 Validation (4):** url-canonicalizer · url-dedup · url-filter · url-relevance
- **Step 3 Scraping (5):** api-scraper · browser-scraper · linkedin-post-scraper · linkedin-profile-scraper · page-scraper
- **Step 4 Filtering (3):** boilerplate-stripper · content-filter · intent-tagger
- **Step 5 Generation (4):** content-analyzer · content-writer · seo-planner · tone-seo-editor
- **Step 6 QA (5):** citation-coverage-checker · hallucination-detector · keyword-sufficiency-checker · meta-compliance-checker · qa-structural
- **Step 7 Routing (1):** loop-router
- **Step 8 Bundling (6):** company-media · html-output · json-output · markdown-output · meta-output · schema-org-injector
- **Steps 0, 9, 10 — NONE built** (no folders exist).

### (b) BUILT BUT NOT INTEGRATED
| Module | Location | Blocker |
|---|---|---|
| cv-generator | `modules/_archive/cv-generator/` | `_archive/` excluded by loader regex; archived 2026-05-23 (specialized-per-type; did Step 5+8). **A real field-name fix (`suggested_text`/`current_text`) is preserved only here** — must survive any revival |
| job-analyzer | `modules/_archive/job-analyzer/` | Same; destined to become a content-analyzer card (#2) |

**Config-only folders (NOT modules, correctly not loaded):** `step-5-generation/pipeline-company-profiles/` (8 prompt/ref .md, incl. 67KB master_categories.md), `pipeline-job-search/` (4 .md), `reference-docs/` (empty), `_shared/marker-parser.js` (W1.5 shared lib). **Net: only 2 genuine built-not-usable modules.**

### (c) BRIEFED BUT NOT BUILT — post-2026-07-03 consolidation
The briefs were rewritten 2026-07-03 (pipeline-agnostic; originals in `_originals-2026-07-03/`), consolidating ~20 briefs → **9 genuinely-new modules** (+ config-only). Stale `SUBMODULE_INVENTORY.md` ("18 planned"/"39 built") is superseded.

**Build order (dependency-driven, from the briefs) + credential deps:**
1. **search-discovery** (Step 1) — `PERPLEXITY_API_KEY` EXISTS → live day one. **Highest leverage** (5 other Step-1 briefs are just config of it). Note `GOOGLE_AI_API_KEY` is Gemini, not a CSE key.
2. **ai-discovery-scout** (Step 1) — `ANTHROPIC_API_KEY` EXISTS; caching live. No new keys.
3. **url-heuristics** (Step 2) — zero credentials; deployable today (V1 deterministic; V2 "learned" needs labeled-data infra that doesn't exist).
4. **api-fetcher** (Step 3) — new: `YOUTUBE_API_KEY`, `COMPANIES_HOUSE_API_KEY` (both free); Wikidata/podcast-RSS keyless.
5. **dataset-fetcher** (Step 3) — `BRIGHT_DATA_API_KEY` EXISTS (needs 1 verification call re Datasets API scope); `LINKEDIN_API_URL` exists but needs a new company endpoint in profile-api.
6. **transcript-fetcher** (Step 3) — `GOOGLE_AI_API_KEY`+`OPENAI_API_KEY` EXIST. Infra finding: free YouTube-caption path doesn't exist; datacenter-IP libs blocked on Hetzner → hosted API/STT.
7. **media-generator** (Step 5, ONE module / 3 config surfaces TTS+image+video) — see §6. Keys exist for day-one paths; **hard-blocked on skeleton gaps (2) persistence + (1) binary HTTP**.
8. **seo-planner extension** (provider layer in built module) — `PERPLEXITY_API_KEY` + `GSC_SERVICE_ACCOUNT_KEY_PATH` EXIST → $0 live.
9. **Step-9 delivery family** (cms-publisher, doc-exporter, sheet-logger) — Step 9 doesn't exist; shared blocker **tools.http PUT/PATCH** (updates); create-only + `WEBHOOK_URL` testable now; **no Strapi instance/token exists anywhere**.

**Downgraded to config-only (do NOT build as modules):** step1 google-pse-news / curated-list-import / linkedin-discovery / social-media-discovery / image-logo-search / youtube-podcast-discovery (→ search-discovery or built api-search); step5 human-rewriter (→ tone-seo-editor card).

**UNVERIFIED:** per-provider pricing figures inside briefs not exhaustively read.

---

## §5 — Four Skeleton Gaps (confirmed against current code)

The `tools` object is built inline in `stageWorker.js:buildTools()` (L52), returned L352: `{ logger, http, browser, unlocker, progress, ai, _logs, _partialItems }`. There is **no** `tools.storage`.

| Gap | Confirmed | Evidence | Size | Gates |
|---|---|---|---|---|
| **(1) tools.http lacks binary + PUT/PATCH** | **EXISTS** | `stageWorker.js:90-119` — only `get`/`head`/`post`, all `res.text()`; no put/patch/arrayBuffer (grep clean). Never specced (`SKELETON_SPEC_v2` L1126-1132) | **~0.5 day** (add put/patch + `{binary:true}`→base64) | Binary-returning providers (OpenAI/ElevenLabs/Azure TTS; raw-binary image/video); PUT uploads (S3/GCS/publishing) |
| **(2) asset persistence / tools.storage** | **EXISTS (nothing at all)** | Repo-wide grep: tools.storage/uploadAsset/putObject/supabase.storage/S3Client = 0. `db.js:20` Supabase used tables-only. `poolBlobs.js` = text-blob refs (UUID, not URL/binary). `SKELETON_SPEC_v2:1157` "No file system write access" | **1–3 days** (+ open architecture decision: storage tool vs Step-8 downloader vs distribution-owns) | Durable media persistence; makes short-expiry-URL providers usable; keeps base64 out of jsonb pool |
| **(3) Step-10 approval→delivery + terminal_state in Step 8 (#8/#9)** | **EXISTS (both parts)** | approve route `runs.js:298-666` generic 1–10, **no step-10 delivery branch**; autoExecutor 0 delivery logic; no step-9/10 modules. Step-8 outputs read 0 quality signals (grep terminal/qa_pass in markdown/html/json-output = empty) though `entity_run_meta.terminal_state` exists (`runs.js:490-494`) | **Part B ~1–2 days; Part A 3–5+ days** | Automated publishing; safe-gating flagged content; media delivery |
| **(4) api-search custom-header auth** | **EXISTS (no custom headers)** | `api-search/execute.js` `getProviderHeaders` L140-146 — only `query_param` + `bearer`; no `x-api-key`/custom branch | **~1–2 h** | Any discovery/search API using non-Authorization headers (most RapidAPI, many vendors) |

---

## §6 — Media Generation Readiness

**Brief:** 3 briefs (2026-07-03) = **ONE shared generic `media-generator` module** (Step 5, `add`/`requires_items`, cost `expensive`), emits `media_manifest_json` (URL or base64 + metadata); does NOT persist/package (Step 8's job). Engine is agnostic (auth from env, sync+poll, json_base64+url extraction, budget guards, `_partialItems` per paid slot); config via template `preset_map`. The briefs' own `tools` audit exactly matches `stageWorker.js:352`.

**Keys present (NAMES only, skeleton prod `.env`):** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY`, `GOOGLE_AI_API_KEY`, `LEONARDO_API_KEY`, `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `UNSPLASH_ACCESS_KEY`, `SCRAPFLY_KEY`, `SEARCH_PROVIDER_SERPER_KEY`, `LINKEDIN_API_URL` (+ infra). **Absent (new provisioning):** ELEVENLABS, REPLICATE/FAL, STABILITY, BFL, IDEOGRAM, RUNWAY, LUMA, CARTESIA, AZURE_SPEECH.

**Usable TODAY (existing key + base64/permanent-URL):** Gemini TTS (`GOOGLE_AI_API_KEY`, base64) · OpenAI gpt-image + Gemini image (base64) · Leonardo (non-expiring CDN URL). Pexels/Unsplash/Pixabay = license path via **api-search**, not media-generator.

**Which gap blocks which media type:**
| Media | Blocking gap(s) | Note |
|---|---|---|
| **TTS/audio** | Provider-dependent. **Gemini TTS UNBLOCKED today**; OpenAI/ElevenLabs/Azure/Cartesia (raw binary) blocked by **Gap (1)**. Gap (2) soft (base64 pool-bloat) | Ships now via Gemini |
| **Images** | **Mostly UNBLOCKED today** (base64 OpenAI/Gemini, or Leonardo URL). **Gap (2)** blocks short-expiry URL providers (BFL 10min, Ideogram ~1h) + fixes base64 bloat | — |
| **Video** | **BLOCKED for production by Gap (2)** (hard prerequisite — Veo 2d/Runway 24-48h/Sora 1h URLs expire, clips too big for base64). Gap (1) for downloads | "HARD prerequisite… decide before enabling video slots" |

**Fastest first media (no gap fixes):** Gemini TTS + OpenAI/Gemini images or Leonardo — all on existing keys. Build shared engine for **TTS+image first, video last** (after persistence). **Gaps (3)/(4) do NOT block media generation** (they block downstream distribution / are discovery-auth).

---

## §7 — Deploy State Snapshot (git + session-log inferred; NO Hetzner SSH)

**Branch/push:** skeleton `auto-21-w2-2026-06-25` pushed (origin==local, `0 0`), far ahead of skeleton `main` (`bb39ed8`) — **every card-write commit is branch-only.** Modules `main` (`0e60b7f`) pushed, clean. Skeleton working tree: **one uncommitted file `client/src/components/steps/StepContainer.tsx`** (the temporary visual-pass gate edit — unstaged, not committed). Tags: `parked-not-deployed`→`079f7d1`, `checkpoint-2026-06-25`→`250fe6a`.

| Feature / commit | Status | Grounding |
|---|---|---|
| #21 prompt caching `bef48ec` (skeleton) | **LIVE-PROD via Path-B** | proven `cache_WRITE/READ=49,050` |
| content-analyzer #21 adoption `ff28469` (modules) | **LIVE-PROD Path-B + CI-durable on main** | merged to modules main |
| browserPool CF detection `effa4e7` (skeleton) | **LIVE-PROD via Path-B** | shasum byte-identical, PM2 4/4 |
| Bright Data key renewal | **LIVE-PROD (manual, not git)** | `/opt/…/.env`, HTTP 200 |
| routingHandler rewrite `be07509`, backward-route `4c06d3f`, streaming `d7e8a89`, failure-unmask `874c436` | **LIVE-PROD via Path-B** | "byte-identical in prod" |
| **B052 `320529a`** | **CONFLICTING — see top flag #2** | git: branch-only; session record: Path-B deployed+proven. **UNVERIFIED-against-prod-now; reconcile by shasum** |
| Entire card-write UI bundle (`1d2e560`,`9a14f61`,`13c8db1`,`66ba947`,`264cad4`,`57371b7`,`f9e49a9`,`7a69870`,`050e8e7`,…) | **HELD / ON-BRANCH not deployed** | all branch-only; gated by #38; hold per #43 + the (on-disk-unrecorded) per-round-variant rework decision |
| sub-plan-4 harness `f0891a5`, Round-2 stamp `27672d1` | **ON-BRANCH not deployed** | branch-only, no deploy record |
| deploy.sh parked-guard `250fe6a` (#31) | **ON-BRANCH (active locally only)** | ships on next conscious deploy |
| #29 resume-clamp `079f7d1` | **PARKED (not deployed/merged)** | tag `parked-not-deployed` |
| skeleton #21 cherry-pick → skeleton main | **PENDING** | not on main; "cherry-pick `bef48ec`… near-term follow-up" |

**Reality:** prod = Path-B server-only rsyncs of #21 + browserPool + routing trunk fixes (+ Bright Data key); modules main is CI-current. **On branch, undeployed:** B052 (per git), full card-write UI + §9 validators, sub-plan-4 harness, #31 gate. **Parked:** #29. **The card-write deploy is its own session** with a checklist (parked-#29 gate abort, #38 must-land-together, Path-B-frankenstein shasum audit, broken client build #4). **UNVERIFIED:** prod state since the last logged Path-B deploy (no SSH this pass).

---

## §8 — What a "finish the product" plan must also know (landmines / in-flight threads)

**Shared infra (what actually overlaps):** the ONLY genuinely shared module is **api-search** (built for job-search, made template-generic — `CLAUDE.md:302-373`) + **csv-discovery** (external-tool import seam). The only shared host is **Hetzner** (profile-api).

**Separate products (share almost nothing — do not assume otherwise):**
- **hello-lily-jobsearch** (`Dropbox/Projects/hello-lily-jobsearch`, own git, CI-green) — its own skeleton/broker/store/clients/.env; "imports nothing from the OnlyiGaming pipeline"; not on Hetzner; actually the **Interview Prep** product. PARKED at a clean checkpoint 2026-06-30.
- **GSC ingest** (`OnlyiGaming/SEO/gsc-ingest/`, own git, cron) — pulls GSC data for `sc-domain:onlyigaming.com` into Supabase. **UNVERIFIED whether same Supabase project** as the pipeline. Candidate data source for SEO-informed content; else independent.

**LinkedIn scraper / profile-api:** PM2 app on Hetzner (port 3847, own Chrome on `:1`, CDP 9222); **hard runtime dep of `linkedin-profile-scraper` + `linkedin-post-scraper`** (hardcoded `localhost:3847`, HETZNER_SERVICES.md:18). Latent bug CONFIRMED: `/api/job/:jobId` → `TypeError: Failed to fetch`, "never had a successful production call" (`CLAUDE.md:671,676,699`) — **job-search-only** (company-profile core path doesn't need it); workaround = paste text inline.

**Infra landmines (single Hetzner host `188.245.110.34`):**
- **PM2 cluster_mode BROKEN → fork-only** (`CLAUDE.md:719`). **`ecosystem.config.cjs` still NOT marked fork** (`CLAUDE.md:726`) — **a clean `pm2 start ecosystem.config.cjs` would crash the whole backend.** #1 reboot/redeploy landmine.
- **`dump.pm2` silently truncates** (had 2 of 5 apps; `CLAUDE.md:711`) — discipline: `pm2 save` + verify `jq 'length'`.
- **meal-api source LOST** (`CLAUDE.md:712`) — co-tenant, no recovery; don't `pm2 delete all` expecting it back.
- **Bright Data: no spend cap set** while the CF-marker widening (2026-06-28) makes the **paid** fallback fire more often (`CLAUDE.md:1046`) — live cost risk; **key exposed in chat, worth rotating** (`CLAUDE.md:1047`).
- **Xvfb/Chrome CDP** underpins all browser scrapers; `pm2-root.service` alignment historically fragile; Chrome self-heals only after ~2min.
- **#42 multi-window contention (HIGH)** — already caused a wrong-branch cross-repo push, repeated RESUME overwrites, a lost session of client work, and the **lost card-write landing kit** (later rebuilt as `264cad4`/`57371b7`). Threatens the finish-the-product work directly.

**Other half-done / landmines:**
- **The card-write DEPLOY is a loaded gun:** parked-#29 aborts `deploy.sh` #31 gate; **#38 card-aware READ must land atomically with card writes** (`submoduleRuns.js:248` `.maybeSingle()` no card_id filter → breaks when card rows exist); Path-B-frankenstein prod needs shasum audit; client build #4 broken.
- **sub-plan 4 is ATTENDED-only** (human qualitative gate); load-bearing unknown: loop-router `flag_manual`-vs-`route` + phantom `loop_count=1`/empty `routing_log` on a straight-through run **never root-caused** — "if it surfaces a real routing defect, it reshapes the v2-card work."
- **Specs outside git (#41)** = root cause of PHASE_3B/noble-wandering drift; move to a dedicated sub-repo (NOT the mega-repo).
- **Unversioned Dropbox state:** the live cover-letter engine `/JobSearch/CVs/generate-cover-letter.js` + CV data are outside any git repo.

---

## Appendix — Critical path for the master plan (synthesis)

The path to a usable product is a **chain, not a set**:

**#2 (generic modules)** → **deploy Sub-plan 1** (card-write bundle; gated by #38 + parked-#29 + Path-B audit + client-build #4) → **decide the per-round-variant card model** (this session's parked ~2–3wk structural rework — §3/top-flag-1) → **Sub-plan 2 gates + Sub-plan 3 QA + Sub-plan 4 cards (#32/#33)** → **delivery (#9 Step 9/10 + #8 quality signals)** → **content quality (#35, #36)** → **media (media-generator, needs skeleton gaps (1)+(2))** — all riding on **deploy unblockers (#4, #31, #17)** and continuously undermined until **#42 (multi-window discipline)** is fixed.

**Biggest single functional gap to "usable":** the pipeline **cannot safely publish** — Steps 9/10 (#9) don't exist. **Biggest risk:** the card-write deploy (#38 atomicity + parked-#29 + frankenstein prod). **Biggest quiet tax:** #42 + #41 (process/spec hygiene) that keep destroying and desyncing the work.

*Generated 2026-07-05 from 7 parallel read-only research agents. Claims grounded in cited files/commits; UNVERIFIED items marked. Intended as the adversarially-reviewable foundation for the finish-the-product master plan.*
