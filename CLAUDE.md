# CLAUDE.md -- Content Creation Tool v2 (Modules Repo)

This repo contains pluggable submodules for the Content Creation Tool. Each submodule is self-contained: manifest + execute function + optional React component.

---

## Rules

1. **NEVER import skeleton code.** Modules are standalone. No imports from content-pipeline-v2.
2. **NEVER access the database directly.** Use the tools object provided to execute().
3. **NEVER use raw fetch/axios.** Use tools.http for all HTTP requests.
4. **Each module folder is completely self-contained.**
5. **manifest.json is required.** No manifest = module doesn't exist.
6. **README.md is required.** Every submodule must have one.
7. **When modifying a submodule, update its README.md.** The README is the contract operators rely on. Stale docs are worse than no docs.
8. **After completing code changes, always ask to commit and push.** Local changes are NOT live — this repo deploys via CI/CD on push. Never say changes are "in place" or "ready to test" until they are committed and pushed. Be explicit: "Changes saved locally. Commit and push to deploy?"
9. **Run `/code-review` before every commit.** Spawn a review agent to check the diff for regressions, unintended side effects, scope creep, and breaking changes. Do NOT commit until the review passes. If the review finds issues, fix them first.
10. **Modules doing network I/O or LLM calls MUST push to `tools._partialItems`.** The skeleton saves `_partialItems` on timeout/abort so partial results aren't lost. After each successful page fetch, API call, or batch of LLM results, push the items: `if (tools._partialItems) tools._partialItems.push(...items);`. Without this, a timeout destroys all progress.
11. **Set `cost` correctly in manifest.json.** Discovery/scraping modules with network I/O: use `"medium"` (5 min) or `"expensive"` (30 min). LLM-heavy modules: use `"expensive"`. Pure data transforms with no I/O: use `"cheap"` (2 min). A too-tight timeout causes avoidable failures.
12. **Every manifest MUST declare BOTH `data_operation_default` AND `pool_precondition`. They are orthogonal — one describes what the module produces; the other describes what it requires. No defaults — the manifest loader (`content-pipeline-v2/server/services/moduleLoader.js`) refuses to start the server if either field is missing or invalid.**

    `data_operation_default` — what this module does to the pool:

    | Op | What it does | Example modules |
    |----|-------------|-----------------|
    | `add` | Adds net-new items to the pool. Upsert by composite `(itemKey, source_submodule)` — replaces this module's own prior output, preserves other modules' items. | sitemap-parser, page-links, browser-crawler, content-analyzer, content-writer, seo-planner, all Step 8 outputs |
    | `transform` | Modifies items already in the pool — only updates items whose key (or `original_url`) is already present. **Cannot inject net-new keys** (this is the post-`390e768` strict contract; net-new items belong in `add`). | url-canonicalizer, intent-tagger, boilerplate-stripper |
    | `remove` | Filters items out of the pool — keeps only items whose key matches an approved item. Merges enriched fields from approved items into the kept items. | url-dedup, url-filter, url-relevance, content-filter |

    `pool_precondition` — what the module requires to be true about the pool before it can execute:

    | Precondition | Meaning | Runtime behavior on violation |
    |--------------|---------|------------------------------|
    | `empty_ok` | Module works against an empty or populated pool. Discovery/seed modules that produce from external sources. | Always executes. |
    | `requires_items` | Module needs items in the pool for this entity. | Per-entity check before BullMQ enqueue. If pool is empty for an entity, that entity gets `entity_submodule_runs.status = 'skipped_no_input'` (NOT `'failed'`). Other entities with non-empty pools proceed normally. Auto-execute's failure threshold excludes skipped rows. |

    The two fields are **orthogonal** but not all combinations are sensible:

    - `add` + `empty_ok` — discovery/seed (Step 1: sitemap-parser, page-links, etc.)
    - `add` + `requires_items` — enrichment (Step 3 scrapers add scraped content; Step 5 modules add analysis/SEO/draft on top of scraped content)
    - `transform` + `requires_items` — refinement (Step 2/4 canonicalizers, taggers, strippers)
    - `remove` + `requires_items` — filtering (Step 2 dedup/filter/relevance, Step 4 content-filter)
    - `transform` + `empty_ok` — **suspicious.** transform by definition needs items to modify; loader does not block this combination, but the runtime check skips the module on empty pools regardless.
    - `remove` + `empty_ok` — **suspicious** for the same reason.

    **Legacy guidance (module-specific, not architectural):** Modules where `item_key` is `entity_name` (typically Steps 5-10) MUST use `add`. With `entity_name` as the key, `transform` would replace ALL items for an entity, destroying upstream data from other submodules.

    **When unsure:** `add` + `empty_ok` is the safest "first wave" combination. `add` + `requires_items` is the safest "enrichment" combination. Reach for `transform` or `remove` only when you specifically need their semantics.

    For broader architectural principles (small generic modules, step boundary discipline, ID-based composition), see the **Architectural commitments** section below.

---

## Workflow patterns

### 1. Subagent-driven vs inline execution

Apply silently for clear cases. Only ask when genuinely ambiguous.

**Use subagent-driven** when ALL of these hold:
- Plan document exists with discrete tasks
- More than 4-5 tasks
- Explicit sequencing or dependencies between tasks
- Estimated work spans >2 hours
- Natural checkpoints exist for human review

**Use inline** when ANY of these hold:
- Investigation/debugging without clear endpoint
- Single coherent change (<1 hour)
- Architectural discussion needing back-and-forth
- Continuous reasoning where context accumulation helps
- User asks a question rather than requesting execution

**Ask the user** when a plan exists but the execution style is ambiguous, or the work could reasonably go either way. Don't ask for clear-cut cases — apply the rule and proceed.

### 2. Review cycles for architectural changes

Architectural changes require `brutal-critic` and CTO review BEFORE implementation:
- Data model changes (schema, manifest fields, contract definitions)
- Cross-module interfaces (how submodules interact, how skeleton interprets module declarations)
- Execution semantics (`data_operation`, pool handling, routing logic)
- Multi-phase plans (Phase 3, Phase 4, etc.)

Skip review for: single-function bug fixes, manifest field *value* changes (not new fields), UI tweaks, documentation updates.

When uncertain whether a change is architectural, default to review.

### 3. Multi-task execution checkpoints

Plans with >5 tasks require explicit human review checkpoints every 3-5 tasks. Don't batch through silently. Surface results at each checkpoint, wait for review, proceed only when confirmed.

Natural checkpoint moments:
- After a test suite completes
- After an audit/inspection task produces output for review
- After deployment, before validation
- Before any irreversible action (commits, deploys, schema changes)

### 4. Strategic vs tactical boundary

Agents handle tactical execution. The user holds strategic alignment.

**Tactical (agent decides):**
- How to implement a specified change
- Which library to use for a defined task
- Code organization within a module
- Test cases for known requirements

**Strategic (surface to user):**
- What to build vs defer
- How architectural pieces connect
- Whether a change affects future work directions
- Trade-offs that have product implications

When uncertain whether a decision is strategic or tactical, surface to the user rather than improvising. The cost of asking is low; the cost of unilateral strategic decisions is high.

---

## Architectural commitments

### Small generic modules, not specialized ones

Content type variation is handled via configuration (cards, prompts, reference docs) of a small number of flexible generic modules. Specialized modules per content type are an anti-pattern.

When a workflow needs different behavior:
1. First: can this be a card of an existing module?
2. Second: can this be template/configuration of an existing module?
3. Last: only if behavior is genuinely different, create a new module

The module catalog should stay small as the content type catalog grows.

### Step boundary discipline

Each step has a specific concern. Modules belong to one step's concern. Modules spanning step boundaries get refactored or replaced.

- **Step 0** — Project setup and user input: project name/description, template selection, entity definition, seed inputs (CSV uploads, manual URL entry, descriptions). Produces structured input that Step 1 submodules consume.
- **Step 1** — Discovery: produce URLs/items into the pool
- **Step 2** — URL processing: filter, dedup, canonicalize
- **Step 3** — Scraping: produce content from URLs
- **Step 4** — Cleanup: transform/filter scraped content
- **Step 5** — Generation: produce format-agnostic content (markdown, JSON, structured fields)
- **Step 6** — QA: verify produced content
- **Step 7** — Routing: decide retry/proceed
- **Step 8** — Bundle: format content for delivery (DOCX, PDF, HTML via templates)
- **Step 9** — Distribution setup: configure send/save (staged but not executed)
- **Step 10** — Human review: publication gate (human decides publish/save/skip)

Step 10 is the publication gate. Steps 0-9 are automated; Step 10 is a human decision.

### Pipeline architecture is ID-based composition

The current 11-step structure is current scaffolding, not fundamental architecture. The real architecture is ID-based submodule composition: the execution engine runs submodules in sequences determined by templates (current), routing decisions (multi-card retries), or user composition (future drag-and-drop).

Validation and contract rules should be position-agnostic — based on what a module does/needs, not where it sits. Step numbers are guidance for current organization, not architectural constraints.

---

## Folder Pattern

```
modules/step-N-name/submodule-id/
├── manifest.json     (required)
├── execute.js        (required)
├── README.md         (required)
├── CLAUDE.md         (required -- stale-docs rule)
└── OptionsPanel.jsx  (optional -- custom options UI)
```

---

## Skills

- **`/submodule-create`** -- Creating a new submodule from scratch. Reads the canonical spec, applies decision guidance, generates all files.
- **`/submodule-readme`** -- Documenting, describing, or explaining a submodule. Generates READMEs and handles conversational descriptions ("what does X do", "how should I configure X for Y").

---

## Step 8 Bundling -- Data-Shape Routing

Step 8 submodules find input by checking which FIELDS exist on pool items, never by checking `source_submodule`:

```javascript
// CORRECT
const markdownItems = (entity.items || []).filter(item => item.content_markdown);
// WRONG
const items = entity.items.filter(item => item.source_submodule === 'content-writer');
```

All six Step 8 submodules use `requires_columns: []`, `item_key: "entity_name"`, `data_operation_default: "add"`.

| Submodule | Input shapes | Output |
|-----------|--------------|--------|
| markdown-output | content_markdown + analysis_json | Clean .md with YAML frontmatter |
| html-output | content_markdown + analysis_json | HTML with schema.org JSON-LD |
| json-output | all three shapes | Strapi-ready/flat JSON |
| meta-output | seo_plan_json + analysis_json | Validated SEO metadata |
| media-output | analysis_json + content_markdown | Media URL manifest |

---

## Parallel Development

28 planned submodules documented in `docs/SUBMODULE_INVENTORY.md`. Research briefs at `Content-Pipeline/specs/submodule-briefs/`.

---

## Decision Log

Automated via PostToolUse hook -- writes to Supabase every 60 minutes.

For important decisions, write manually:

```sql
INSERT INTO decision_log (project_name, entry_type, summary, decision_made, alternatives_rejected, reasoning, source)
VALUES ('content-pipeline-modules-v2', 'decision', 'What was decided', 'The choice made', 'What was rejected', 'Why this choice', 'manual');
```

Entry types: decision | progress | blocker | idea

---

## Session Log

### Session: 2026-03-23 — Submodule batch build + rendering audit
**Accomplished:**
- Built 7 new submodules: citation-coverage-checker, keyword-sufficiency-checker, schema-org-injector, hallucination-detector, intent-tagger, tone-seo-editor, loop-router
- Code reviewed all 10 new submodules, fixed 6 issues (field preservation, dead code, missing params)
- Fixed remaining bugs across 5 submodules (dead fields, max-length guards, format consistency)
- Deep audit of skeleton ContentRenderer compatibility — found and fixed 8 rendering bugs
- All rendering fixes: flagged_when boolean→string (4 QA modules), arrays→joined strings, invalid display type, unsupported comparison operator

**Decisions:**
- QA submodules stay separate (not merged as options) — pipeline modularity
- flagged_when must use string values ["false"] not boolean [false] — skeleton String() coercion
- All arrays must be pre-formatted as strings before emitting to skeleton UI
- schema-org-injector: added has_validation_errors boolean string for flagging

**Blockers/Questions:**
- None

**Updated by:** session-closer agent

### Session: 2026-03-23 16:00 - Page scraper boilerplate detection + low_content fixes
**Accomplished:**
- Added boilerplate detection to page-scraper: 3+ pages from the same domain with identical text_content are demoted from `success` to `low_content` with error "Boilerplate: identical content across multiple pages"
- Fixed page-scraper summary counting: `low_content` items were invisible in the description (said "all scraped successfully" even with 198 boilerplate pages). Now counted as issues.
- Added `low_content` to sort order (errors → skipped → low_content → success)
- Added `low_content` count to per-entity meta and top-level summary
- Page scraper `< 50 words` items changed from `success` to `low_content` status (previous session)
- Browser scraper: added `low_content` to re-scrape filter, `timed_out` to flagged_when, `_partialItems` push for timeout resilience

**Decisions:**
- Boilerplate detection mirrors browser-scraper logic (3+ identical text_content per domain)
- `low_content` items are flagged in UI via `flagged_when`, browser-scraper picks them up for re-scrape
- og:description truncation detection added (user modification) — catches JS-rendered pages where body text < og:description

**Blockers/Questions:**
- Flow test needed to validate boilerplate detection with real data

**Updated by:** session-closer agent

### Session: 2026-03-24 — og:description truncation detection across all Step 3 scrapers
**Accomplished:**
- Root-caused Play'n GO PokerStars article scraping failure: Wix JS-rendered page with only 2 paragraphs SSR'd into static HTML; rest loads via JavaScript. Body text (~60 words) passes 50-word threshold, so page-scraper marks "success" with truncated content.
- Added `extractOgDescription()` and `isLikelyTruncated()` helpers to all 3 scrapers:
  - page-scraper: body text <= og:description length (100+ chars) → marks `low_content` → cascades to browser-scraper
  - browser-scraper: `waitForSelector` for content containers + truncation check → cascades to api-scraper
  - api-scraper: handles `low_content` in partition logic, flags `possibly_truncated: true` on final output
- Code review found missing `decodeEntities()` in api-scraper's `extractOgDescription` — fixed before commit

**Decisions:**
- og:description meta tag as truncation signal — conservative: body text shorter than the summary itself should never happen for a complete article
- Truncation triggers cascade (not hard failure) — flows to next scraper in chain
- Used consistent helper pattern across all 3 scrapers for maintainability

**Blockers/Questions:**
- None — committed (9832f4e) and pushed

**Updated by:** session-closer agent

### Session: 2026-04-22 — Replace jobtech with generic api-search module
**Accomplished:**
- Diagnosed why jobtech keyword searches produced poor results: JobTech API uses full-text search (not title-only), compound keywords use AND matching (returns 0), municipality codes were configured but never sent
- Researched RemoteOK and Remotive APIs: both are feed APIs with no keyword search param, requiring a different execution pattern (fetch all, filter client-side)
- Built generic `api-search` module with two modes: search (keyword per API call) and feed (fetch all, filter client-side)
- Three built-in providers: jobtech, remoteok, remotive — adding new job boards = JSON config, not code
- Code review caught 2 issues: missing URL fallback for JobTech (`webpage_url` → `application_details.url`), `_partialItems` not saved inside search-mode keyword loop. Both fixed before commit.
- Deleted old jobtech module after verification
- Updated Supabase template `b6ffa614` to use api-search (municipality filter now actually sent to API)
- All 3 providers tested on production: jobtech 76 items (search mode), remoteok 89 items (feed mode), remotive 17 items (feed mode). 0 errors, 0 HTML leaked, 0 excluded terms leaked, 100% unique externalIds, 100% items with URLs
- Commits: `d3a7682` (feat: add api-search), `5d2e227` (chore: remove jobtech)

**Decisions:**
- Two provider modes (search vs feed) instead of assuming all APIs support keyword search — proven by RemoteOK having no search param
- `url` field stays canonical in output (Step 2+ depends on it); all other fields are field_map-driven and auto-detected by ContentRenderer
- Provider configs are JSON objects with `mode`, `field_map`, `results_path`, `filter_fields` — no code needed per provider
- Feed-mode keyword filtering uses case-insensitive substring match on raw fields before mapping (not post-mapping)
- Municipality filter added to template default as `provider_params.jobtech.municipality: "0180"` (Stockholm)

**Blockers/Questions:**
- None — both commits pushed, all tests passing

**Updated by:** session-closer agent

### Session: 2026-04-22 — Pronetgaming scraping fixes (word_count, presets, waitForSelector)
**Accomplished:**
- Fixed `word_count` NaN propagation in 3 scraper pass-through paths: browser-scraper (line 196-200), api-scraper (line 147-151), page-scraper reduce (line 276)
- Enabled presets on url-filter `exclude_patterns` option (`presets_enabled: true` in manifest.json)
- Added `waitForSelector: 'a'` to browser-crawler depth-2 fetch options — ensures RSC/SPA pages hydrate before link extraction
- Acceptance test: browser-crawler discovered 7 blog URLs from pronetgaming.com (threshold was 5)
- Commit: `9a3f9ab` (all 3 fixes in one commit)

**Decisions:**
- `?? 0` for pass-through maps (preserves legitimate zero), `|| 0` for page-scraper sum reduce (falsy treatment fine in summation)
- `waitForSelector: 'a'` uses existing browserPool non-fatal handling (try/catch, logs warning, continues)
- `presets_enabled: true` activates existing PresetField dropdown — no new UI code needed

**Blockers/Questions:**
- None — committed and pushed, CI/CD deployed

**Updated by:** session-closer agent

### Session: 2026-04-28 — Job Search E2E pipeline validated end-to-end
**Accomplished:**
- Fixed api-search snippet truncation: full description text now preserved as `text_content` field (line 127) alongside 200-char `snippet` for UI display. Eliminates need for browser-scraper on SPA URLs.
- Ran full E2E pipeline on Hetzner: api-search (77 jobs, all with text_content) → job-analyzer (fit score 78, CEO variant, 31.8K tokens, 114s) → cv-generator (2.6MB tailored CV + suggestions DOCX, 1.7s)
- Verified auto-execute handles skip_steps correctly: Steps 0,2-4,6-10 skipped, Steps 1+5 executed
- Discovered browser-scraper fails on all 76 Platsbanken URLs (SPA — duplicate text/block page detection). Root cause: arbetsformedlingen.se is React SPA, static HTML is empty shell.
- Generated 4 output documents: Jobs Found (77 jobs table), Job Analysis (5-layer framework), Suggestions & Gaps (4 gaps, 6 suggestions), Tailored CV (CEO variant for Tre/Hi3G Head of Commercial)
- Template updated: execution_plan simplified to Steps 1+5 only (skip 2-4,6-10), submodules_per_step only defines api-search and job-analyzer+cv-generator
- Commit `87b2137` pushed: `feat: preserve full text_content in api-search for downstream modules`

**Decisions:**
- Store full text as `text_content` at discovery time (api-search) rather than requiring a separate scraping step — JobTech API already returns complete descriptions, re-scraping SPA URLs is wasteful and fails
- Skip Steps 2-4 in Job Search template — url-dedup unnecessary (externalId dedup in api-search), browser-scraper can't handle Platsbanken SPAs, no filtering needed
- Auto-execute (not manual step approval) is the correct flow for production — it handles skip_steps via safeSkipStep(), manual approval requires at least one submodule run per step
- Kept snippet truncated at 200 chars for display (UI table) — text_content is the full-length field for downstream consumption

**Blockers/Questions:**
- None — pipeline working E2E. Ready for multi-entity production runs.

**Updated by:** session-closer agent

### Session: 2026-04-29 to 2026-05-03 — csv-discovery, api-search fixes, partial timeout resilience
**Accomplished:**
- Added csv-discovery submodule for external tool integration (CSV import from local directory)
- Changed url-relevance cost from cheap to medium
- Added job_description mode to linkedin-profile-scraper
- Detected Cloudflare challenge pages in sitemap-parser browser fallback
- Refactored linkedin-profile-scraper to use Profile API instead of direct CDP
- Added _partialItems timeout resilience to all 27 remaining submodules
- Made seo-planner dependency optional in content-writer (v1.4.0)
- Made api-search and content-analyzer fully template-generic
- Added search_input mode and entity_production toggle to api-search
- Fixed api-search 0 results: parse string-typed options from UI
- Fixed csv-discovery: add missing manifest fields and semicolon support
- Fixed api-search empty rows: flatten output_schema columns
- Added upload_dir support and XLSX-ready defaults to csv-discovery
- Added sort_order to Step 2 validation manifests for correct execution sequence

**Commits:** 14 commits (Apr 29 – May 4)

**Updated by:** CTO audit catchup (2026-05-21)

### Session: 2026-05-05 to 2026-05-06 — Selective field loading + api-search enhancements
**Accomplished:**
- Fixed keyword-sufficiency-checker SyntaxError: const entityResult redeclaration
- Added configurable score_rules to api-search for high-signal item flagging
- Added metadata_fields and prompt_context options to url-relevance
- Declared requires_columns for selective field enrichment (all modules)
- Updated api-search manifest (presets_enabled) and rewrote READMEs

**Commits:** 5 commits (May 5-6)

**Updated by:** CTO audit catchup (2026-05-21)

### Session: 2026-05-08 to 2026-05-14 — LinkedIn post scraper + api-search auth
**Accomplished:**
- Added linkedin-post-scraper submodule and bumped browser-scraper concurrency
- Added bearer auth to api-search and fuzzy dedup to url-dedup
- Increased post-scraper fetch timeout from 30s to 60s
- Added post_engagers mode to linkedin-post-scraper
- Added feed_posts mode to linkedin-post-scraper (v1.2.0)
- Updated linkedin-post-scraper README with post_engagers and feed_posts details

**Commits:** 6 commits (May 8-14)

**Updated by:** CTO audit catchup (2026-05-21)

### Session: 2026-05-20 — Phase 3: QA tuning + structural checker + loop-router fix
**Accomplished:**
- Phase 3: QA manifest tuning, structural checker, loop-router integration
- Fixed loop-router findSourcePages: detect source pages by url + word_count

**Commits:** 2 commits (May 20)

**Updated by:** CTO audit catchup (2026-05-21)

### Session: 2026-05-21 11:46 — SEO planner v2.0.0: Perplexity keyword research
**Accomplished:**
- SEO planner upgraded to v2.0.0 with keyword research pre-step via Perplexity Sonar API
- Added 4 new functions: buildEntityContext, parseResearchQueries, runKeywordResearch (parallel via Promise.allSettled), synthesizeResearch
- Added 3 new manifest options: keyword_research (boolean), search_provider (select), research_queries (textarea with {entity_name}/{entity_context} placeholders)
- Updated buildPrompt() with {keyword_research} placeholder and 3-tier fallback (research → keyword-summary.md → empty notice)
- Prompt template updated: {doc:keyword-summary.md} → {keyword_research}
- README.md updated with v2.0.0 changelog, new options docs, architecture diagram
- Pipeline-agnostic design: works for company profiles, review articles, news, bios — user controls queries per run

**Decisions:**
- Pipeline-agnostic over mode detection: user-editable research_queries textarea replaces hardcoded company/category modes
- Keep search_provider option from day one: stable manifest schema for future Gemini/Ahrefs/Semrush providers
- Parallel queries via Promise.allSettled: 3-4x latency improvement, partial failure tolerance
- CTO review approved with all blocking issues resolved (parallel queries, fallback mechanism, synthesis format)

**Blockers/Questions:**
- Needs PERPLEXITY_API_KEY in skeleton .env before testing
- Modules repo 2 commits ahead of origin — need push

**Updated by:** session-closer agent

### Session: 2026-05-22 — SEO planner pipeline-agnostic defaults + real-questions FAQ + haiku models
**Accomplished:**
- Made seo-planner manifest fully pipeline-agnostic: removed all OnlyiGaming/iGaming/B2B hardcoding from default prompt and research_queries — platform context now belongs in reference docs/templates, not module defaults
- Updated seo-planner third research query to ask for 8-12 real search queries people actually type, explicitly flagged as verbatim FAQ source
- Updated seo-planner FAQs prompt instruction: "Use the real questions from the keyword research as the basis — actual search queries people type"
- Updated seo-planner meta title rule: generic "Lead with entity name and primary value proposition" (was hardcoded `{Company} — {Primary USP} | OnlyiGaming`)
- Set content-writer and job-analyzer default model to haiku for testing (was sonnet)
- Fixed job-analyzer option description to match new haiku default (was "sonnet recommended for quality")
- Parallel fix in project-command-center: H1 placement rule tightened — now says "Rewrite the H1 to naturally include the primary keyword" not "Place if not already there"
- Keyword research Perplexity query restructured: REAL QUESTIONS as item 1 (8-12 actual search queries), keywords/intent/competitive landscape after
- SEO edit prompt updated: Common Questions section replaced with Perplexity's real operator questions verbatim
- Fixed Keywords step visual indicator bug in ReviewArticles.tsx: was always green (not_started = index 0 in STATUS_ORDER); now uses `kwResearchDone` prop based on actual `kwResearch` file presence
- Code review caught 2 issues (Keywords indicator bug + job-analyzer description mismatch) — both fixed before commit
- Committed: modules repo commit 11dc1bc (pushed), command-center commit 6e9df39 (local only — no remote configured)

**Decisions:**
- Pipeline-agnostic module defaults: OnlyiGaming-specific prompts belong in presets/reference docs per template run, not in module defaults
- Perplexity determines the actual questions: real search queries replace AI-invented FAQ questions in the Common Questions section
- H1 must be rewritten (not just checked): primary keyword should always be in H1, rewrite title naturally to include it
- Keywords pipeline step visual uses kwResearch file presence (not status index) to determine done/current/pending state
- Haiku as default for all LLM modules during testing phase; operators switch to sonnet for production

**Blockers/Questions:**
- project-command-center has no git remote — commits are local only, need remote configured to deploy
- seo-planner README.md not updated this session despite manifest changes (rule 7: update README when modifying submodule)

**Updated by:** session-closer agent

### Session: 2026-05-22 — Phase 3 planning + skeleton RPC fix
**Accomplished:**
- No modules repo changes this session — work was in skeleton repo (SQL migration)
- Phase 3 planning completed: discovered multi-card infrastructure already built; identified RPC bug as the primary blocker
- Next session picks up at Batch 1: add model_select option to 4 QA manifests (hallucination-detector, citation-coverage-checker, keyword-sufficiency-checker, meta-compliance-checker)

**Decisions:**
- Phase 3 QA submodule work (model_select, threshold tuning) held until Batch 1 start next session

**Blockers/Questions:**
- Batch 1 (model_select on 4 QA manifests): verify each execute.js uses options.model before adding manifest option — some may hardcode model name
- Batch 4 (phase3-cards-routing-rules.sql): needs production run to configure company_profile template cards

**Updated by:** session-closer agent

### Session: 2026-05-22 — Phase 3 blocking bugs fixed in skeleton repo
**Accomplished:**
- No modules repo changes — all fixes were in content-pipeline-v2 (skeleton repo), commit 52540ae pushed
- Diagnosed Bug 1 (empty result pane in auto-execute): previous session misidentified root cause as `submodule_runs.output_data` being NULL; actual cause is per-entity UI reads from `entity_submodule_runs` via the polling endpoint's `entities` array — so Bug 1 is a symptom of Bug 2
- Root-caused Bug 2: stale `entity_stage_pool` rows from previous partial manual runs cause auto-execute to silently drop entities not in the pool (filteredPools.length > 0 branch used stale rows unconditionally)
- Fixed Bug 2 in `server/routes/submoduleRuns.js` execute endpoint: added defensive entity merge — when pool exists but inputData has additional entities, missing ones are upserted into entity_stage_pool before bulk entity_submodule_runs insert; guard excludes loop passes
- Fixed failed_count always being 0 in `server/workers/batchWorker.js`: added `failed_count: failed + zombies.length` to the submodule_runs update (previously this field was never written)
- Traced full per-entity execution flow: execute endpoint → BullMQ FlowProducer → stageWorker → batchWorker → approve endpoint → step approve; confirmed entity_stage_pool as authoritative state carrier across steps

**Decisions:**
- Bug 1 is not independent: fixing Bug 2 (entity rows created for all entities) automatically fixes Bug 1 (result pane populated); no separate UI fix needed
- Defensive merge guarded with `!isLoopPass`: loop passes intentionally filter to 'pending' subset, merging all inputData entities would break that behavior
- `upsert` with `ignoreDuplicates: true` used for merge: safe re-run if execute is called twice — no duplicate rows created

**Blockers/Questions:**
- Validation re-run needed: fresh auto-execute test on a clean project (not "test2" which has stale pool state) to confirm all entities appear in entity_submodule_runs and result pane shows correctly
- Remaining Phase 3 batches still pending: Batch 1 (model_select on 4 QA manifests), Batch 4 (phase3-cards-routing-rules.sql production run), then 50-entity E2E test

**Updated by:** session-closer agent

### Session: 2026-05-23 — Architectural principle clarified + cv-generator/job-analyzer archived
**Accomplished:**
- Archived `cv-generator` and `job-analyzer` (commit `792945d`) — moved from `modules/step-5-generation/` to `modules/_archive/`. Excluded from manifest loader scan via the `^step-\d+-` regex. Active module count: 39 → 37.
- Added `BACKLOG.md` item 2 — "Content-analyzer + content-writer flexibility for multi-content-type support" — captures the work that makes the archived modules permanently disposable.
- Updated `modules/_archive/README.md` to reflect the corrected framing (specialized-per-content-type is the OLD approach being replaced, not dormant code awaiting revival).

**Decisions:**
- **Architectural principle (binding):** The pipeline does NOT have specialized submodules per content type. Content type variation is handled via configuration (cards: prompts, reference docs, analysis dimensions) of a small number of flexible generic modules. Specialized modules (cv-generator, job-analyzer) represent the old approach being actively replaced. This principle informs Phase 4+ decisions: new content types ship as cards of existing modules, not as new modules. Module catalog stays small as the content-type catalog grows.
- **Step boundary discipline (binding):** Step 5 (Generation) produces format-agnostic content — markdown, JSON, structured fields. Step 8 (Bundle) handles output format — DOCX, PDF, HTML via templates. Modules that violate this boundary (`cv-generator` did both Step 5 writing AND Step 8 DOCX file production) get refactored or replaced.
- Archive (not delete) chosen because permanent removal happens when the BACKLOG item 2 flexibility work matures — not now. Keeping the folders in version control means anyone who finds a stray reference or import can trace it back to the old approach.

**Blockers/Questions:**
- None — Task 3 of the empty-pool-bug-fix plan can proceed against the now-37-module active set.

**Updated by:** CTO agent (manual session entry)

### Session: 2026-05-23 — Satellite prompts + dashboard stubs (project-command-center)

**Accomplished:**
- No modules repo changes this session — all work was in project-command-center
- Completed satellite prompt system in `project-command-center/server/reviewArticlesRoutes.ts`: `detectSatelliteClass()` + `interpolateTemplate()` functions added, generic satellite branch replaced with class-based dispatch (7 classes from `satellite-prompt-templates.md`)
- Installed macOS LaunchAgent so project-command-center auto-starts at login
- Created `CLAUDE.md` stubs for `OnlyiGaming/linkedin/` and `OnlyiGaming/tags/` so they appear as project cards in the dashboard

**Decisions:**
- No GitHub remote needed for project-command-center — fully local tool, Dropbox provides backup
- Satellite class detection: slug patterns take precedence over title patterns; `niche-review` is the catch-all default

**Blockers/Questions:**
- Phase 3 batches still pending: Batch 1 (model_select on 4 QA manifests), Batch 4 (phase3-cards-routing-rules.sql), 50-entity E2E test
- seo-planner README.md not updated (rule 7 carry-forward from last session)

**Updated by:** session-closer agent

### Session: 2026-05-24 — Empty-pool-fix executed (Tasks 1-11) + forensic finding on external deploy

**Accomplished:**
- Executed Tasks 1-11 of `docs/superpowers/plans/2026-05-22-empty-pool-bug-fix.md` via subagent-driven development. Final state: 37 active modules (cv-generator + job-analyzer archived), every active manifest declares `pool_precondition` (`empty_ok` for 8 Step 1 discovery modules; `requires_items` for the other 29 modules); skeleton has the pure `applyDataOperation` function with 23 unit tests, runtime precondition check before BullMQ enqueue, `skipped_no_input` status semantics in auto-execute threshold, and fail-closed manifest loader validation.
- Discovered mid-deploy-prep that **production was already at this session's Task 8 output even though no deploy had been initiated from this session.** Forensic investigation followed (documented below).
- Tasks 1-11 commits in modules repo: `cabec02` (audit script), `792945d` (archive cv-generator/job-analyzer), `672da18` (architectural principle docs), `2ff0833` + `bc19ff3` (pool_precondition added + formatting fix), `e1c1a11` (Step 1 transform→add), `ddd6858` (rule 12 rewrite), `d39a530` (BACKLOG item 3).
- Tasks 1-11 commits in skeleton repo: `62ba730` (skipped_no_input status), `4407a77` (extract applyDataOperation), `e2ae80d` (runtime precondition check), `c1087cb` (manifest loader fail-closed), `abeb8ac` (pre-deploy script), `c2c8e2d` (plan docs).
- Documented architectural reframe: `data_operation` (what the module produces) and `pool_precondition` (what the module requires) are orthogonal. Decoupled from step-position numbers — multi-card routing and future drag-and-drop can compose modules in any sequence; the runtime check uses the manifest's declared precondition regardless of position.
- Confirmed `_archive/` excluded from manifest loader scan by the regex `^step-\d+-` filter (`moduleLoader.js:101`). Archive folder houses orphaned modules from the old "specialized per content type" approach being phased out.

**Forensic investigation — external deploy without session tracking:**

1. **Discovery:** Mid-Task-12 verification revealed production file mtimes at 2026-05-24 11:47 UTC for skeleton paths (e.g., `applyDataOperation.js`, not present in any commit before today). The deploy was NOT initiated from this session — at 11:47 UTC this session had committed through `c1087cb` (10:14 CEST = 08:14 UTC) but had not run `./deploy.sh`.
2. **Investigation methods used (reusable for future sessions):**
   - **SHA fingerprint check** (workaround for missing `.git` on Hetzner — deploy is rsync, not git pull, per the PROJECT_STATUS.md correction earlier today): `shasum` comparison between local HEAD and `/opt/content-pipeline-v2/server/lib/applyDataOperation.js`, `moduleLoader.js`, and a sample `manifest.json` returned **byte-identical hashes**. Confirmed prod ≡ local HEAD at the file level.
   - **PM2 uptime vs file mtime analysis**: pipeline-api + stage-worker uptime 29.3m (restarted 20:21 UTC); batch-worker uptime 568m (restarted ~11:22 UTC). batch-worker restarted ~25 min BEFORE the 11:47 UTC file deploy, so it was running stale code while the other two workers had picked up the new code 8.5h later.
   - **Commit author verification**: every commit since 2026-05-21 carries `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`. Tasks 1-11 implementation commits are all from THIS session (verified by subagent-reported SHAs). The Workflow Patterns (`a318d02`/`ec0e5b1`) and Architectural Commitments (`7120c35`/`ee91642`) sections were authored by a separate Claude session earlier (2026-05-22 evening / 2026-05-23 early morning). No code-work overlap between sessions.
   - **Traffic check during split-brain window**: zero `submodule_runs` rows in the 11:47 UTC → 20:21 UTC interval, zero today total. Pipeline has been idle. No `skipped_no_input` rows in production. No code paths exercised on either old or new behavior.
3. **Conclusion:** External deploy occurred (almost certainly Daniel running `./deploy.sh` in another terminal, or another Claude session triggering it). Files match local HEAD exactly. No production state corruption from the split-brain because no traffic happened during the split-brain window. batch-worker still on old code at time of investigation but has not been called.
4. **Process gap surfaced:** **deploys can happen outside execution sessions** when the user runs `deploy.sh` from another terminal or another Claude session triggers it. The execution session may not know production has been updated. Future sessions should **verify production state at start of work, not assume it matches the local repository state.** Specifically:
   - SHA fingerprint comparison (`shasum`) is the workaround for missing `.git` on Hetzner.
   - PM2 uptime vs file mtime detects stale-worker situations after a deploy that didn't restart all workers cleanly.
   - DB query for recent `submodule_runs` confirms whether any traffic exercised the affected paths during ambiguity.

**Decisions:**
- **Production deploy still proceeds via the planned Task 12 (pre-deploy script + `deploy.sh`)** even though code is mostly already deployed. Reasoning: pre-deploy tags create a clean rollback point on the current state; `deploy.sh` is idempotent on already-matching files (rsync no-op); `pm2 restart` aligns all 3 workers (closes the batch-worker stale-code gap); pushes the 4 newer doc/tooling commits (`ddd6858`, `abeb8ac`, `c2c8e2d`, `d39a530`) that landed after the external deploy at 11:47 UTC.
- **No corrective action needed for the split-brain.** Zero traffic during the window means no production data is corrupted or inconsistent. PM2 restart resolves the worker state cleanly.
- **Verify-before-assume becomes the operational discipline.** Future sessions start with: shasum check on critical files, PM2 uptime read, recent traffic query. Three commands, ~30 seconds. Avoids the "assumed state vs actual state" trap that surfaced this session.

**Blockers/Questions:**
- Task 12 (pre-deploy + deploy.sh) pending — user approved "deploy" path
- Task 13 (5-entity Phase 3 validation) pending — will be the first real traffic through the new code on production; watch for `skipped_no_input` rows (expected: 0 for healthy entities), batch-worker handling new status correctly, threshold logic excluding skipped rows from the denominator.

**Updated by:** CTO agent (manual session entry — forensic deploy-finding documentation)

### Session: 2026-05-25 — Empty-pool fix CLOSED OUT + 3 Phase 3 architectural findings filed

**Status:** Empty-pool fix VALIDATED and complete. Three orthogonal Phase 3 architectural issues surfaced via the smoke test, all filed as BACKLOG items 7-9 for follow-up sessions.

**Empty-pool fix closeout:**
- ✅ Smoke test on `0e16676a-d368-4155-9f62-fcade4f4e6ef` (Pronet Gaming + Wazdan, "30 april" template) — Pronet Gaming's clean flow through Steps 1-7 validates the fix (480 → 214 → ... items at every step, no skipped_no_input rows, output produced).
- ✅ Mechanism on correct code path — Gemini Pro/Flash verified that `autoExecutor.js:553,577` calls `executeRouter.post('/run')` for all submodules; the Task 7 precondition check lives in the architecturally correct location.
- ✅ Production deployed and stable — all 3 PM2 workers restarted on new code (`pm2 restart all` via Path B after `deploy.sh` was blocked by Rollup darwin-arm64 bug, captured as BACKLOG #4).
- ✅ Pre-deploy rollback tags in place: `pre-empty-pool-fix-2026-05-24` on both repos.
- ✅ All implementation commits pushed (Tasks 1-12 done; Task 13a smoke test passed for Pronet, surfaced bugs for Wazdan that are unrelated to this PR).

**Smoke test surfaced three pre-existing Phase 3 architectural issues** (all filed as BACKLOG items, separate scope, not introduced by this PR):

1. **BACKLOG #7 (High, blocks Phase 3 validation)** — `routingHandler.js` cascade-deletes entity_submodule_runs + submodule_runs on routing decisions. Contradicts the `loop_iteration` schema column's intent. Also has cross-entity collateral damage, no transaction wrapper around the RPC, and pool restoration fails for `target_step=0`. Caught when Wazdan's 2 QA failures (citation + hallucination) triggered routing to Step 1, deletion fired, RPC failed, Wazdan ended in partial-delete state with `terminal_state='flagged'`.

2. **BACKLOG #8 (Medium)** — Step 8 bundle outputs don't propagate quality signals. `wazdan.md` and `pronet-gaming.md` are format-indistinguishable despite Wazdan being flagged terminal. Each Step 8 module needs to read `entity_run_meta` and add `terminal_state` / `last_qa_scores` / `needs_review` to its output frontmatter/metadata.

3. **BACKLOG #9 (Medium)** — Step 9 distribution gate doesn't exist in the `30 april` template (stage `status='skipped'`). The architectural intent — Step 9 gates flagged content from auto-publication, Step 10 surfaces for human review — is not implemented. Currently mitigated by absence of any auto-distribution, but becomes critical the moment distribution automation comes online.

**Decisions during closeout:**
- The empty-pool work and the Phase 3 routing bugs are decoupled in scope; mixing them in one PR would conflate validation. Items 7-9 are filed separately for fresh-session work.
- No further investigation or implementation this session. Pre-deploy tags remain in place. Production is in known-good state for the empty-pool fix and pre-existing-broken state for Phase 3 routing (no regression from this PR's deploy).
- Forensic process gains documented in this CLAUDE.md (earlier session entry): SHA fingerprint verification when no `.git` on Hetzner, PM2 uptime vs file mtime for stale worker detection, second-model verification (Gemini) for diagnosis disagreement, "verify-before-assume" operational discipline going forward.

**Blockers/Questions:**
- Next session priority: BACKLOG #7 (cascade-delete fix). Phase 3 multi-card validation is blocked until this is addressed.
- Subsequent sessions: BACKLOG #8 (quality propagation), BACKLOG #9 (distribution gate). These can run in parallel once #7 is resolved.
- This session does NOT recommend a remediation design — those should be planned in fresh sessions with the full architectural picture per BACKLOG items.

**Updated by:** CTO agent (manual session entry — closeout summary after smoke-test findings + second-model verification)

### Session: 2026-05-26 — PHASE_3B spec located + validated; halted before adoption

**Status:** Spec discovery and validation only. No code changes. No adoption decision (deferred to fresh session). No implementation plan drafted.

**Accomplished:**
- Started brainstorming a fix for BACKLOG #7 (routing cascade-delete bug). Before brainstorming progressed beyond clarifying questions, user prompted to check for prior architectural decisions.
- Located [`Content-Pipeline/specs/PHASE_3B_PER_ENTITY_INSTRUCTIONS_SPEC.md`](../Content-Pipeline/specs/PHASE_3B_PER_ENTITY_INSTRUCTIONS_SPEC.md) — 1088 lines, dated 2026-04-30, status "REVIEWED v4 — pending final sign-off."
- Read the spec end-to-end. Validated against production state and against today's empty-pool-fix changes.
- Confirmed the spec resolves all four BACKLOG #7 issues with explicit section-by-section mapping (§3.1 card_instructions, §3.5 history preserved permanently, §5.2/5.3 atomic RPCs, no pool restoration in design).
- Confirmed ZERO of the spec's schema changes, new code files (`executionPlanUtils.js`, `cardInstructions.js`), or new Supabase RPCs exist in production.
- Identified critical chronology: cascade-delete code in routingHandler.js (commit `f2dd7b9`, 2026-04-22) PREDATES the spec (2026-04-30) by 8 days. The spec was written as the intended replacement; migration was never scheduled despite 4 review rounds.
- Identified 4 implementation gaps the plan needs to address (snapshot fallback, getConsumedRoundsForRun frequency, template migration path, index migration safety) — documented in modules-repo BACKLOG #7 "Validation 2026-05-26" section.
- Updated PHASE_3B spec header status: "REVIEWED v4 — validated 2026-05-26, awaiting adoption decision."
- Added BACKLOG #10: process pattern for pending-spec tracking to prevent indefinite "pending sign-off" state and implementation drift.

**Decisions:**
- **Do not adopt the spec in this session.** Adoption belongs to a fresh session with current judgment. Validation only; decision deferred.
- **Do not draft implementation plan.** Plan requires adoption decision first. Current session ends at validation handoff.
- **Treat the spec as implementer-ready when adopted** — 1088 lines covering concept → data structure → API → schema → callers → constraints → design decisions → 9-step implementation order. No blockers identified during validation read.
- **Spec discoverability gap is a recurring risk** — captured as BACKLOG #10. The pattern (spec written, reviewed, then sits in "pending" while implementation drifts) is likely to recur across other `PHASE_*_SPEC.md` files in `Content-Pipeline/specs/`.

**Discoverability gap surfaced today:**
- 1088-line spec sat in `Content-Pipeline/specs/` from 2026-04-30 through 2026-05-26 (~26 days)
- During that window, the cascade-delete code stayed in production and Phase 3 multi-card UI work continued without referencing the spec
- The cascade-delete bug surfaced 2026-05-25 during empty-pool-fix smoke testing — required ~50% re-derivation of design decisions the spec already documented
- Today's brainstorming session was about to redo the same design from scratch before the user prompted to check for prior decisions

**Process finding (captured as BACKLOG #10):**
Architectural specs in "pending sign-off" state need active tracking to either adoption or rejection. Indefinite pending state creates silent implementation drift — no error, no warning, no broken test, just two parallel realities. Proposed approaches: pre-commit hook warning when modifying code in pending-spec areas; quarterly pending-spec review; spec status surfaced in PROJECT_STATUS.md; status-suffix filename convention.

**Blockers/Questions:**
- Adoption decision on PHASE_3B v4 — fresh session priority. Likely yes given validation confirms it resolves all four BACKLOG #7 issues, but the decision belongs outside this session.
- If adopted: implementation plan needs to address 4 gaps (see BACKLOG #7 "Validation 2026-05-26" section).
- Other `PHASE_*_SPEC.md` files in `Content-Pipeline/specs/` should be reviewed for similar "pending → drift" risk (BACKLOG #10 starting point).

**Updated by:** CTO agent (manual session entry — spec validation, no implementation)
