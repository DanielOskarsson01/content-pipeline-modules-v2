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

13. **The UI-editability rule (binding architectural test).** A change that CANNOT be made by editing a template in the UI (prompt, model, reference docs, or any `preset_map` field) lives in code: submodule `execute.js`, manifest defaults (`options[*].default` / `options_defaults.*`), or skeleton routes. Anything in code MUST be 100% pipeline-agnostic. Submodule code and manifest defaults must not be optimized for whichever pipeline is in production today.

    **Operational test before adding any code or manifest default:** Ask, "Can this be expressed as configuration that a template uploads via the UI?" If yes, put it there. If no, the implementation must work equally well for every current and future content type.

    Good: a generic `allowed_slug_paths` textarea option whose default is empty; templates configure paths. Good: a `requires_prompt_override` boolean option whose default is false; templates flip it true when they depend on pipeline-specific shape.

    Bad: an `extractCompanyCategories()` function in `execute.js` that knows about `categories.primary[].slug`. Bad: a manifest default `prompt` that opens with "You are a B2B iGaming directory writer" — would be a valid OnlyiGaming-pipeline prompt, but it's hardcoded in code that any pipeline inherits.

    Rationale: violating this rule makes the next content type (news, podcast, cover letters, marketplace, etc.) silently inherit assumptions baked into code. Specialization belongs in template `preset_map` overrides stored in Supabase, edited via the UI — not in submodule defaults or executor logic.

---

## See also — process discipline (skeleton repo CLAUDE.md)

Planning, plan review, validation, and progress-reporting discipline live in the skeleton repo: `content-pipeline-v2/CLAUDE.md` → **"🛡 Process discipline — failure modes we've hit"** (patterns A–I). That section governs how architectural work is planned and reviewed across both repos; the module-authoring **Rules 1–12** above govern what an individual submodule must look like. Both apply when a planning task touches a submodule.

If you're about to start a bug fix, architectural change, or any plan that affects pool/routing/schema/multi-step coordination, **read patterns A–I before drafting.** They are not optional reading — each one is in there because it has already failed in this codebase.

**Patterns G and H (added 2026-05-29) cover planning-session drift specifically.** A–F catch failures inside individual tasks; G (reviewer engagement at scope moments) and H (current-state verification before citing plan files) catch strategic-level drift — pivots based on stale uploads, scope changes without reviewer engagement, multi-hour sessions that quietly drift from the original direction. If you're about to make a strategic pivot, change scope, or cite a planning document, G and H apply BEFORE you act.

**Pattern I (added 2026-06-06) covers post-merge architectural drift.** When an architectural change merges (DDL migration, contract change, identity-shape change, RPC signature change), callsites referencing the changed surface are NOT covered by the change's own tests. Without a deliberate post-merge callsite audit, those callsites silently break. Pattern I codifies the audit as a mandatory step after any architectural merge, before subsequent work begins on top of it. Three confirmed examples in this codebase: B052 (onConflict strings stale after Multi-Card migration), B054 (multi-source duplicates after composite-key `add` change), the 2026-04-22 `apply_entity_routing` signature mismatch.

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

### Session: 2026-05-31 → 2026-06-02 — Week 22 CV/cover letter run + cover letter prompt overhaul + pipeline-job-search/ config folder

**Status:** Multi-hour session generating tailored CVs and cover letters for 14 LinkedIn job ads, plus a full cover letter prompt rewrite per user brief. Durable improvements landed on main (commit `7ab6b22`); modules re-archived per the architectural principle.

**Accomplished:**
- Temporarily un-archived `cv-generator` and `job-analyzer` (commit `9fe84f5`) to run them for tonight's week 22 batch. Re-archived at end of session (commit `15eb21f`); both commits squashed out of main during merge so main history shows only the durable changes.
- Generated 14 tailored CVs + 14 suggestions docs + 13 cover letters in `/JobSearch/week 22/outputs/`. VBET (4417057498) intentionally skipped (moved to `no - Vbet/` subfolder). Acne Studios (4405659336) cover letter failed mid-batch on Anthropic credit exhaustion; credits later topped up but Acne not re-run yet.
- Rewrote the cover letter SYSTEM_PROMPT in `/JobSearch/CVs/generate-cover-letter.js` per user-supplied brief: banned mission-echoing openers, banned 16 AI-cliche words (leveraged, spearheaded, cutting-edge, robust, passionate, excited, thrilled, resonates, synergy, dynamic, proven track record, perfect fit, hit the ground running, happy to discuss, I am confident that, I believe I would be a great fit), restructured to 4-5 paragraphs (~250-320 words) with explicit Open/Middle/Bridge/Close structure, added accuracy rules pinning Daniel's MrGreen role to founding team (NOT CPO) and ComeOn role to CMO/CPO/COO.
- Switched cover letter model from `claude-sonnet-4-20250514` to `claude-sonnet-4-6`. Tested `claude-opus-4-7` as comparison for INFINNI + Duelbits (saved as `_v3_opus.docx`) — Opus produces visibly sharper voice, ~5x cost.
- Added `unsupported_by_cv` field to the cover letter response JSON; logged in console; populated 3-5 items per letter consistently across the batch.
- Wired the 5-layer analyzer's RESPONSE JSON into the cover letter writer as a `## JOB ANALYSIS` input block (must-haves drive accomplishment selection; gaps drive Bridge paragraph). Backwards-compatible — works without analysis input too.
- Fixed `cv-generator/execute.js` silent field-name contract mismatch: analyzer emits `suggested_text`/`current_text` but renderer was reading `item.suggested`/`item.current`, producing blank SUGGESTED: labels in every SUGGESTIONS docx ever generated. Renderer now reads `suggested_text || suggested` and `current_text || current` (backwards-compatible). Section header now uses `item.section || item.job`. Fix preserved in `modules/_archive/cv-generator/execute.js` after re-archive.
- Re-rendered all 14 SUGGESTIONS docs from cached RESPONSE_*.json files using a one-shot `rerender.js` script (no LLM calls, instant).
- Created new folder `modules/step-5-generation/pipeline-job-search/` mirroring `pipeline-company-profiles/` in shape: README.md, cover_letter_prompt.md (prompt snapshot), job_analyzer_prompt.md (5-layer analyzer prompt snapshot), format_spec.md (variant catalogue + structure + JSON shapes + filename conventions). Configuration only — no manifest.json, no execute.js — so it does not violate the no-specialized-modules architectural principle.
- Created `/JobSearch/CVs/package.json` declaring `@anthropic-ai/sdk ^0.100.1` + `docx ^9.7.1` so the previously ad-hoc install of those packages becomes a managed dep tree (single `npm install` to reinstate from any machine). Not in any git repo.
- Built supporting wrapper scripts in `/JobSearch/week 22/driver/`: `driver.js` (CV pipeline orchestrator), `cover-letters.js` (cover letter wrapper with `JOB_TO_ANALYSIS_SLUG` map, `SKIP_JOBS` set, double-suffix guard for Fidel HoP), `rerender.js` (regenerate suggestions DOCX from cached JSON), `dump-prompt.js` (export the fully-expanded prompt to markdown for Gemini review).
- Exported the fully-interpolated INFINNI cover letter prompt to `/JobSearch/week 22/expanded-prompt-INFINNI-for-gemini.md` (65k chars / ~16k tokens) so user can paste into Gemini for review/improvement suggestions.
- Pushed commit `7ab6b22` to `origin/main` in the modules-v2 repo.
- Killed the SSH tunnel to Hetzner profile-api on `localhost:3847` (pid 55898) — opened earlier in the session for the broken LinkedIn jobs scraper investigation.
- Wrote 4 decision_log entries to Supabase covering tonight's commits + the cross-repo push incident.

**Decisions:**
- **Un-archive was temporary, principle stands.** `cv-generator` and `job-analyzer` are back in `_archive/` after tonight's run. BACKLOG #2 (generic content-writer + content-analyzer with card support) is still the canonical path; cover-letter-writer should also become a card of that future generic content-writer module.
- **`pipeline-job-search/` is configuration, not a module.** No manifest.json, no execute.js — does not violate the "specialized modules per content type are an anti-pattern" rule. Lives in modules-v2 alongside `pipeline-company-profiles/` so future BACKLOG #2 work can find and load it.
- **Cover letter prompt rewrite landed verbatim per user brief.** Did not strengthen beyond the brief's text despite the audit finding 4 numeric-fabrication violations in the v2 batch (80Twenty inflated MrGreen 7→250, INFINNI fabricated "2,000+ companies, 1,000+ jobs" for OnlyiGaming, KGK + Curoflow fabricated "8-tier taxonomy"). User chose to live with on-disk state rather than strengthen prompt + regenerate.
- **Model upgrade to `claude-sonnet-4-6`.** Older `claude-sonnet-4-20250514` retired. Opus 4.7 tested for comparison but kept Sonnet as default to keep cost low across 14-letter batches.
- **VBET excluded by user decision** (moved to `no - Vbet/` folder). Not regenerated this session.
- **Squash-merge to main, delete branch.** `job-search-tonight` branch deleted after squash to keep main history showing only the durable improvements. The temp un-archive/re-archive churn is squashed out.
- **`CVs/package.json` over deleting `node_modules/`** — keeps `generate-cover-letter.js` runnable AND makes the deps explicit/reproducible, instead of leaving an unmanaged install or breaking the script.
- **No fix for the LinkedIn jobs scraper.** The `/api/job/:jobId` endpoint in `profile-api` returned `Uncaught (in promise) TypeError: Failed to fetch` for both test calls (~422ms / ~654ms). Logs on Hetzner show the endpoint has never had a successful production call — only the two we made tonight. Bypass: paste job ad text inline. Fix is a future-session task.

**Blockers/Questions:**
- **Acne Studios cover letter still pending.** Credits exhausted mid-batch; user topped up after the rerun finished. Single re-run with the new prompt + analysis input would cost ~$0.03 and ~30 sec. Awaiting user signal.
- **Cross-repo push accident — pending revert decision.** After `cd` to `/JobSearch/CVs/` for `npm install`, the cwd persisted across the next bash call. Subsequent `git push origin main` ran from inside the `onlyigaming-projects` repo (which contains `/JobSearch/`) and pushed three pre-existing local commits there: `eeba8d7 docs(reviews): bump satellite word counts + sync docs to current pipeline`, `5c9125d feat(satellite-prompts): BEST-FOR template + 5 niche profiles (replacing NICHE REVIEW)`, `7a923b6 Session: log 2026-05-27 casino-platforms lock + inventory`. Fast-forward push, not destructive, but unauthorized. User informed and offered `git reset --hard 0caed8d && git push --force origin main` revert path. User has not yet decided whether to revert.
- **LinkedIn jobs scraper latent bug** in `profile-api` on Hetzner (`/api/job/:jobId` endpoint, `TypeError: Failed to fetch` from Voyager) — never exercised before tonight. Worth a fresh-session investigation if job scraping becomes important again. Pasting job text inline is the current workaround.
- **Numeric fabrication still slips through** the cover letter prompt's "use ONLY CV facts" rule. 4 of 12 letters in the v2 batch had at least one invented or rounded-up number despite explicit instruction. Possible mitigation (not applied tonight per brief constraint): require the model to quote the CV phrase each number came from before using it; or push every uncertain number into `unsupported_by_cv`.
- **BACKLOG.md has uncommitted items 12-14** added by a parallel Sub-plan 1 Claude session (Pre-flight overshoot, UUID_REGEX false-positive risk, Sub-plan 1 ship-gate stress validation). Not from tonight's CV work — stashed during my commits and restored at the end. Sit in main's working tree for the Sub-plan 1 session to commit.

**Alignment:** Confirmed. The `pipeline-job-search/` config folder mirrors `pipeline-company-profiles/` and positions for BACKLOG #2 work without violating the no-specialized-modules architectural principle. The cv-generator fix preserved in `_archive/` keeps a future un-archive cleaner. The temporary un-archive was tactical and explicitly rolled back. None of tonight's main-branch changes contradict the project's architectural commitments.

**Updated by:** session-closer skill

### Session: 2026-06-02 — Hetzner Xvfb + pm2-root systemd services documented

**Accomplished:**
- Verified the systemd setup user established earlier today on `188.245.110.34`: `xvfb.service` enabled + active (Xvfb on `:1`, screen 1920x1080x24, `Restart=always`, `ExecStartPre` cleans stale X lock files), `pm2-root.service` unit file now has `Requires=xvfb.service` + `After=xvfb.service` + `Environment=DISPLAY=:1`. Replaced manually-started TigerVNC (running since 2026-04-25) — boot-time start + self-healing now both covered.
- Confirmed Chrome on `:1` with `--remote-debugging-port=9222` (spawned by `profile-api/server.js`, NOT a separate systemd service). CDP returns HTTP 200. All 5 PM2 apps online (pipeline-api, stage-worker, batch-worker 10h+ uptime; profile-api 3h, meal-api 5D).
- Wrote `content-pipeline-v2/docs/HETZNER_SERVICES.md` (158 lines) — service unit files verbatim from production, boot chain diagram, self-healing layer table, verification commands, known relic (noVNC websockify on 6080 → dead 5901 proxy).
- Saved reference memory `hetzner_services.md` pointing at the doc + SSH alias + boot chain + the pm2-root state issue (see below). Created `MEMORY.md` index.

**Decisions:**
- Infra doc lives in the skeleton repo (`content-pipeline-v2/docs/HETZNER_SERVICES.md`), not modules-v2 — skeleton owns `deploy.sh` + `ecosystem.config.cjs` and the PM2 apps are skeleton-level, so the doc belongs there.
- Did NOT auto-fix the pm2-root inactive state (see Blockers). Decision belongs to the user — `pm2 kill && systemctl start pm2-root.service` would align state but interrupts production briefly.
- Left the noVNC websockify relic alone — harmless dead-end proxy, not in scope.

**Blockers/Questions:**
- **`pm2-root.service` is enabled but currently inactive** even though all 5 PM2 apps are running. PM2 was started outside systemd, so the unit never tracked the daemon. Consequence: boot recovery works (systemd will run `pm2 resurrect`), but a mid-runtime PM2 daemon crash will NOT trigger systemd respawn. Fix is a one-time `pm2 save && pm2 kill && systemctl start pm2-root.service`. Documented in `HETZNER_SERVICES.md` under "Known state issue".
- Latent LinkedIn jobs scraper bug from the previous session (`profile-api /api/job/:jobId` returning `TypeError: Failed to fetch`) is unrelated to display/systemd — was already on `:1` via TigerVNC at the time, so today's switch to Xvfb doesn't change anything for that endpoint.

**Updated by:** Claude (manual session entry — infrastructure verification + documentation)

### Session: 2026-06-02 (later) — Hetzner pm2-root alignment + websockify cleanup + production recovery from cluster_mode bug

**Status:** Both requested fixes (pm2-root inactive + websockify relic) completed. Production was briefly down ~10 min during the realignment due to a PM2 6.0.14 cluster_mode bug surfaced by the operation; recovered by switching to fork_mode. All 4 PM2 apps online under systemd-managed pm2-root.service. `meal-api` discovered missing from disk — flagged for user.

**Accomplished:**
- Killed the noVNC `websockify` relic process (PID 1908051, port 6080 → dead :5901, no systemd unit owned it). Port 6080 freed.
- Started the pm2-root alignment via `pm2 save && pm2 kill && systemctl start pm2-root.service`. systemd unit started but pm2-root timed out on first attempt; PM2 daemon came up but in `activating` state.
- **Production went down for ~10 minutes** because the resurrected apps (pipeline-api, stage-worker) exited with `code 9 + SIGINT` instantly under PM2 6.0.14's cluster_mode. Diagnosed by running `node --env-file=.env --max-old-space-size=512 server/server.js` directly — worked perfectly outside of PM2.
- Discovered the dump.pm2 file (and its .bak) had only 2 apps despite 5 actually running — `pm2 save` had been silently writing stale dumps for some time. The 3 missing apps (batch-worker, profile-api, meal-api) would have been lost on any reboot.
- Recovered by `pm2 delete all && pm2 start <script> --name <name> --node-args=...` for each app individually in fork mode, then `pm2 start /opt/profile-api/server.js --name profile-api`. Couldn't recover meal-api — its source code is not on disk anywhere (searched `/opt`, `/root`, `/home`; only its PM2 log files exist).
- Restarted via systemd: `pm2 save && systemctl restart pm2-root.service`. New dump has 4 apps (pipeline-api, stage-worker, batch-worker, profile-api), all online in fork_mode, pm2-root.service now `active`.
- Profile-api's Chrome respawned correctly via its 120s health check after the restart (CDP 9222 returns HTTP 200, Chrome v147.0.7727.15 on display `:1`).
- Updated `HETZNER_SERVICES.md`: cluster→fork modes in the services table, new "Resolved: pm2-root alignment" section documenting Issue 1 (cluster_mode bug) + Issue 2 (silent dump truncation) + operational discipline (`pm2 save` mandatory after any change), removed the "Known relic" section since websockify is gone, updated History.
- Updated memory file `hetzner_services.md` with 4 gotchas: cluster_mode broken, `pm2 save` mandatory, meal-api lost, profile-api 120s health check window.

**Decisions:**
- **Fork mode is the new default for all apps on this server.** PM2 6.0.14 cluster_mode is broken here (code 9 + SIGINT before logs open). Direct `node` invocation works, so it's a PM2 cluster wrapper bug, not an app bug. With `instances: 1` fork is functionally equivalent.
- **Did NOT edit `ecosystem.config.cjs`.** The file on disk still lacks `exec_mode`, so a fresh `pm2 start ecosystem.config.cjs` from zero state would re-hit the bug. Documented in HETZNER_SERVICES.md "Issue 1". Editing the config is a code change for a separate session — needs user approval and the right safety net (deploy + rollback tag).
- **meal-api not auto-restored.** Source missing; restoring it requires user input (where the code lives now, or whether to drop it from inventory). Flagged in HETZNER_SERVICES.md and the memory file.
- **No `tigervncserver@.service` cleanup** — disabled, harmless, left alone.

**Blockers/Questions:**
- **`meal-api` recovery decision needed.** Was running as "Pantry API on port 3002" for 5 days; logs in `/root/.pm2/logs/meal-api-*.log` confirm it was alive. No source code found on disk. Was it deployed from a private location not searched, or has it been intentionally retired? If keeping: re-deploy. If not: remove its logs and update HETZNER_SERVICES.md to drop it entirely.
- **ecosystem.config.cjs not edited to mark fork mode.** Future `pm2 start ecosystem.config.cjs` (e.g. after a fresh deploy that wipes state) will re-hit the cluster_mode bug. Either edit the file to add `exec_mode: 'fork'` per app, or investigate the PM2 6.0.14 cluster bug for a real fix (Node 20.20.0 + Ubuntu 24.04.3, sample to test against). User decision.
- **dump.pm2 silent truncation root cause unknown.** Both dump and dump.bak had only 2 apps despite all 5 running. Possibly a PM2 internal serialization issue, or someone ran `pm2 save` at a moment when only 2 apps were known to that daemon (e.g., apps started via a different daemon instance). Worth keeping an eye on — `pm2 save && cat /root/.pm2/dump.pm2 | jq 'length'` should always show the expected count.

**Updated by:** Claude (manual session entry — incident recovery + documentation update)

### Session: 2026-06-10 → 2026-06-12 — Rule 13 rollout plan: groundwork → CTO review → canonical sign-off (planning only, no module code)

**Status:** Planning-document session only. No module code touched, no commits to module folders, no pushes. Canonical plan written, CTO-reviewed, amended, signed off. Workstream 1 opens in a fresh session against the canonical plan.

**Accomplished:**

- **Original Plan 2 brief reframed.** The 2026-06-09 brief proposed extending the pilot primitive (agnostic-runnable default + `requires_prompt_override` + refusal block) to ~37 submodules. Initial inventory found 34 active (not 37; 3 directories without manifests). The brief's "Phase A/B/C/D/E" framing was superseded by a triaged, gate-anchored approach.
- **Triage written to `~/.claude/plans/plan-2-groundwork.md` (2026-06-10 draft).** Three parallel Explore agents bucketed all 34 modules — 26 confidently Bucket A (no action), 2 already done (seo-planner v2.2.0, content-writer v1.6.0 from the pilot), 2 Bucket B (content-analyzer, hallucination-detector), 1 Bucket C (tone-seo-editor — the only genuine cross-module contract via `[Type: slug]` markers consumed by Step 8 bundlers), 2 ambiguous (url-relevance, intent-tagger), 4 N/A (Step 6 code-based checkers — they ARE the validation gates the plan now rests on).
- **Meta-finding surfaced:** 3 consumers (markdown-output, html-output, citation-coverage-checker) hardcode `[#n]` and `[Type: slug]` regex in execute.js. `requires_prompt_override` cannot catch these silent-wrong-output failure modes — gates and code-locks needed.
- **CTO-review revision written to `~/.claude/plans/plan-2-groundwork-final.md` (2026-06-11).** Nine corrections folded in: (1) Workstream order flipped (contracts-hardening W1 before agnosticism W2); (2) content-analyzer safety = W1.3 vocabulary-fidelity gate + pre-flight, NOT `requires_prompt_override`; (3) hallucination-detector reclassified as code-lock + one-line example swap (no override surface at all — truth metrics must be standardized system-wide); (4) tone-seo-editor marker gate uses a shared parser (`modules/_shared/marker-parser.js`) consumed by both validator AND bundlers — loose substring check rejected; (5) dropped `citation_format` option work — format isn't changing in this rollout, configurable option is the opposite of hardening; (6) url-relevance + intent-tagger reclassified to default neutralization (move flavored content to preset doc; leave generic-runnable default; no refusal flag); (7) non-breakage guarantee reframed around gates — "downstream consumers tolerate missing fields" REMOVED as a safety argument; (8) Step 5→Step 6 categorization-invalidation hazard explicitly rejected; (9) NPOV split out as separate workstream.
- **Two decisions closed via Supabase fact-check on 2026-06-11.** Decision 1 (url-relevance + intent-tagger neutralization timing) = DEFER. Live project `fevxvwqjhndetktujeuu`, "Job Search" template `b6ffa614-4be1-49fb-9887-bea6691bee68`: url-relevance preset FULLY overrides `prompt_context` / `keep_criteria` / `drop_criteria` (recruitment-pipeline framing, no company-research leak). intent-tagger absent from BOTH `preset_map` AND `execution_plan.submodules_per_step` — Step 4 is not in the job-search plan. Both flavored defaults dormant for current live pipelines, no live data-quality issue. Decision 2 (audit-only `requires_prompt_override` on content-analyzer) = SKIP — removed from plan entirely. Audit-only flag with no safety weight would mislead readers; one honest guard (W1.3 gates), no decorative ones.
- **CTO review bundle created at `/Users/danieloskarsson/Downloads/cto-review-rule13-rollout-2026-06-11/`** with the modules-v2 CLAUDE.md, RULE_13_ROLLOUT_BRIEF.md, canonical plan, optional canonical-pattern code (seo-planner manifest/execute/test-refusal), and a README with four framing questions for the CTO. Bundle is historical, not refreshed after the 2026-06-12 amendments per user direction.
- **CTO review passed (2026-06-12). Five amendments folded into the canonical plan + changelog row 10 added:**
  - W2.3 extended with W2.3b strictness-knob inventory across hallucination-detector + loop-router + citation-coverage-checker + qa-structural — prompt is not the only weakening lever; thresholds matter too. Phase D CLAUDE.md wording narrowed conditionally if any knob stays template-tunable, so the documented guarantee matches the mechanism.
  - W1.5 byte-identity gate scoped for nondeterministic fields via explicit pre-check + named-fields normalization pipeline. Acceptance stays strict; does not loosen to "structurally equivalent."
  - W2.3 code-lock mechanism resolved BEFORE the session opens (W2.3a) — verify loader capability; manifest-removal is the default; loader extension is out of scope with explicit stop condition if it breaks schema validation or UI.
  - Decision 1 revisit trigger extended: also fires if the job-search execution plan ever adds Step 4 (the moment intent-tagger's dormant trap activates for job-search).
  - Typo fix in deferred-risk rationale ("unflavored defaults silently classifying as company-flavored" → "still-flavored defaults silently producing company-flavored classification").
- **Hardlink confirmed (2026-06-12):** `/Users/danieloskarsson/.claude/plans/plan-2-groundwork-final.md` and `/Users/danieloskarsson/Library/CloudStorage/Dropbox/claude-sync/plans/plan-2-groundwork-final.md` resolve to the same inode (89563924, SHA-256 `3a7143c5...`). Canonical path going forward: `Dropbox/claude-sync/plans/plan-2-groundwork-final.md`. All five 2026-06-12 amendments are present.
- **Plan signed off.** Workstream 1 (contracts-hardening) opens in a fresh session reading the canonical plan's own file list. Starting task: W1.1 — keyword-sufficiency-checker loud-fail on empty seo_plan. Smallest blast radius.

**Decisions:**

- **Bias correction 1 (correct):** Most submodules are operation-generic. Reflexive primitive rollout would have damaged 26 of 34 modules for no benefit. Default bucket = A; burden of proof = on B/C placement.
- **Bias correction 2 (correct):** `requires_prompt_override` alone is not sufficient for cross-module contracts. It guarantees a template has a prompt; it does NOT guarantee the prompt produces the output characteristic a downstream submodule reads. Cross-module contracts need code-enforced gates, validators, or code-locks.
- **Workstream order:** contracts-hardening (W1.1–W1.5) ships BEFORE agnosticism (W2.1–W2.3). A regression run against a silently-passing baseline cannot validate a migration. Loud-failing gates establish a trustworthy baseline first.
- **content-analyzer safety:** W1.3 vocabulary-fidelity gate (every assigned slug must exist in the injected vocabulary) + pre-flight (fail fast if `{doc:master_categories.md}` / `{doc:master_tags.md}` resolved to empty). NO `requires_prompt_override` flag — not even audit-only.
- **hallucination-detector:** full code-lock. Default mechanism = manifest-removal of the `prompt` option (single-manifest edit in modules-v2, no skeleton coupling). Loader-capability extension is OUT of scope for this plan with explicit stop condition.
- **Strictness-knob inventory required (W2.3b):** Truth-metric locking covers prompts AND verdict logic AND thresholds across hallucination-detector + loop-router + citation-coverage-checker + qa-structural. Lock decisions per knob recorded in the plan before W2.3 execution.
- **tone-seo-editor (the genuine Bucket C case):** shared marker parser `modules/_shared/marker-parser.js` consumed by both the bundlers (markdown-output, html-output) and the validator. Byte-identity acceptance on bundler outputs after named-field normalization is load-bearing — proves the regex extraction was behavior-neutral.
- **url-relevance + intent-tagger:** DEFER neutralization. Live Job Search template Supabase fact-checked clean — defaults dormant. Two triggers will reopen the decision: a new content type imminent, OR job-search execution_plan adds Step 4.
- **Citation format `[#n]` stays enforced via citation-coverage-checker loud-fail (W1.4 confirms the template flag). No `citation_format` configurable option — format isn't changing in this rollout.**
- **NPOV is a separate workstream** — company-profile content quality, not module agnosticism. Not folded in.
- **Non-breakage guarantee rests on gates, not on consumer tolerance.** "Downstream consumers tolerate missing fields" was explicitly removed as a safety argument; tolerance is precisely how corruption goes unnoticed.

**Blockers/Questions:**

- **W2.3a — code-lock mechanism verification.** Open technical question for the W2.3 session: does `content-pipeline-v2/server/services/moduleLoader.js` (or its consumers) support a not-overridable / locked option marking today? If yes, the mechanism is the loader's contract. If no, manifest-removal is the default (drop `prompt` from `options`, inline as `const MANIFEST_DEFAULT_PROMPT` in `execute.js`). Stop condition: if manifest-removal breaks schema validation or UI enumeration, surface the conflict — do NOT silently expand into a skeleton-loader change.
- **W2.3b — strictness-knob inventory will reveal whether any tunable threshold remains** across hallucination-detector + loop-router + citation-coverage-checker + qa-structural. Phase D CLAUDE.md wording for the truth-metric lock is CONDITIONAL on this finding — "templates cannot override their behaviour" only if ALL knobs lock; otherwise narrow to "templates cannot override prompts and verdict logic" with the tunable knobs enumerated.
- **W1.5 — nondeterminism pre-check.** Before the marker-parser repoint, inventory both bundlers' output for fields that vary between runs on identical input (timestamps, generated_at, ordering dependent on object iteration). The original Plan 2 hinted "byte-identical modulo timestamps" for Step 8, so at least one nondeterministic field likely exists in html-output's schema.org JSON-LD or markdown-output's YAML frontmatter. Acceptance becomes byte-identity after named-fields normalization, with the field list documented explicitly.
- **No live data-quality issue** in the current pipeline. Job-search template fact-check (2026-06-11) confirmed all flavored defaults in url-relevance + intent-tagger are dormant.

**Files touched this session (planning artifacts only):**

- `/Users/danieloskarsson/.claude/plans/plan-2-groundwork.md` — drafted 2026-06-10 (since SUPERSEDED 2026-06-11; header marks it as historical record only, internal reading list redirected to canonical).
- `/Users/danieloskarsson/.claude/plans/plan-2-groundwork-final.md` — canonical plan; created 2026-06-11; CTO-review amendments folded in 2026-06-12 (five amendments + changelog row 10). Hardlinked to `Dropbox/claude-sync/plans/plan-2-groundwork-final.md` (same inode 89563924, SHA-256 `3a7143c5...`).
- `/Users/danieloskarsson/Downloads/cto-review-rule13-rollout-2026-06-11/` — CTO review bundle (historical snapshot; not refreshed after the 2026-06-12 amendments per user direction).
- **No files in `content-pipeline-modules-v2/modules/` touched this session.** No skeleton files touched. No commits to module folders, no pushes.

**Alignment:** Confirmed. The plan honors both project architectural commitments — "small generic modules, not specialized ones" (Bucket A default; the primitive is applied surgically only where genuinely needed) and "step boundary discipline" (no cross-step responsibility creep). It also honors Rule 13 (UI-editability test) by moving content-type-specific framing out of manifest defaults and into either template preset_map overrides or `pipeline-<type>/` reference docs — never into code that other content types reuse. The triage-first approach corrects the over-application bias the brief warned about.

**Updated by:** session-closer skill

### Session: 2026-06-12 — W1.1 shipped: keyword-sufficiency-checker v1.0.1 (loud-fail on empty seo_plan)

**Status:** First execution session against the canonical Plan 2 (Rule 13 rollout). Workstream 1 task **W1.1 complete** — implemented, TDD-tested, code-reviewed, committed (`ca83d9b`), pushed, CI-deployed to Hetzner, and production-verified. Stopped before W1.2 per explicit instruction. Single focused task; ran inline (not subagent-driven).

**Accomplished:**
- Fixed the silent-pass bug in `modules/step-6-qa/keyword-sufficiency-checker/execute.js`. Previously, an `seo_plan_json` that was **present but empty** (zero keyword targets) silently PASSed (`keyword_score: 1`, `skipped: true`), hiding upstream seo-planner failures. The checker now distinguishes three cases: **no plan at all** → skip-with-pass (unchanged, documented contract); **plan present but empty** → LOUD FAIL (`qa_pass: false`, `keyword_score: 0`, error logged, reason names the cause); **plan present but empty + `allow_empty_keyword_plan`** → skip-with-pass carve-out.
- Added manifest option `allow_empty_keyword_plan` (boolean, default `false`) to both `options` and `options_defaults`. PATCH bump 1.0.0 → 1.0.1.
- Broadened the keyword-target count to all four lists (head + mid + entities + negatives) per the W1.1 spec — necessary so a plan that legitimately carries only entities/negatives isn't falsely flagged empty.
- TDD: wrote `test-empty-plan.js` (new, repo convention) FIRST, watched it fail red against the silent-pass code, then implemented → green. 17/17 assertions: loud-fail default, carve-out skip, no-plan skip (regression guard), real-plan-proceeds-to-scoring (baseline no-change guard).
- Proved "no baseline behavior change" via an A/B diff: ran the pre-change `execute.js` (git HEAD) vs the new one on representative non-empty + no-plan inputs → byte-identical output. Only the present-but-empty path changes, by design.
- Independent code review (`/code-review`, general-purpose agent): **PASS / PROCEED**, zero critical/warning. Folded in its one user-facing INFO: summary skip-label "(no SEO plan)" → "(no/empty SEO plan)" so it stays accurate once the carve-out skip exists.
- Updated `README.md` (Rule 7): new option row, loud-fail example, Edge Cases entry distinguishing no-plan vs empty-plan, "What Happens Next" note that an empty-plan failure points upstream to seo-planner (not content-writer).
- Decision_log entry written to Supabase (id `53de609c-…`, project `content-pipeline-modules-v2`).
- Pre-deploy rollback tag `pre-rule13-w1-1-2026-06-12` (annotated) set on the parent commit `f80245d` (the pre-W1.1 / prior production state), pushed to origin.
- Commit `ca83d9b` pushed to `origin/main`; CI run `27406285414` ("Deploy modules to Hetzner") completed **success**.
- Production verified per the recipe: `shasum -a 256` on all four files matches local HEAD byte-for-byte on Hetzner (`/opt/content-pipeline-modules-v2/...`); PM2 shows **4/4 apps online** (pipeline-api, stage-worker, batch-worker, profile-api), fresh restart from the deploy's `pm2 delete all && pm2 start` cycle.

**Decisions:**
- **Loud-fail scoped to "present but empty" only.** "No `seo_plan_json` at all" remains a legitimate skip-with-pass (the documented "works without seo-planner data" contract) and is intentionally unaffected by `allow_empty_keyword_plan`. Distinguished via `seoPlanPresent = seoItems.length > 0`.
- **`allow_empty_keyword_plan` default `false`** — fail-loud is the safe production default; the flag is an explicit opt-out carve-out, not a trip-wire (consistent with brief Lesson 2: defaults must be runnable, not deliberate trip-wires — here the safe default is to surface the upstream failure).
- **Committed directly to `main`.** The project workflow (every prior session log + the CI `deploy.yml`) deploys on push to main; branching would break the CI-deploy-on-push flow the user invoked. Overrides the generic "branch first" default per explicit user instruction.
- **New fail branch pushes to `tools._partialItems`** (Rule 10) — more consistent with the success path than with the older no-content sibling branch (which doesn't push); harmless for a no-I/O checker.

**Blockers/Questions:**
- **None for W1.1.** W1.2–W1.5 (content-writer slug loud-fail/warn; content-analyzer fidelity gate + pre-flight; citation-coverage-checker template-flag audit; tone-seo-editor shared-parser marker gate) remain open per the canonical plan; not started.
- **Honesty caveat on the no-change proof:** the A/B byte-identical proof covers the realistic plan shapes (which always carry head/mid terms). A degenerate plan with *only* negatives/entities and no head/mid now proceeds-and-fails instead of skip-and-pass — arguably more correct, surfaced in code review as INFO, and not a shape real seo-planner output produces. No literal full-pipeline run against the locked Casino Platforms project data was performed (the module is pure deterministic no-I/O; logic-equivalence is a sound substitute).
- **Tooling notes for future sessions:** the Supabase MCP server (`00ae70c1-…`) does NOT have access to the decision_log project `zgfvgghfkkbrbiunsgry` (different org → permission denied) — decision_log entries must go via the REST API with `SUPABASE_ANON_KEY`. That key lives in `~/.zshrc` / `~/.zprofile` but is NOT in the non-interactive Bash-tool shell, so the local pre-commit hook prints "SUPABASE_ANON_KEY not set — skipping" and does not enforce the gate; write the entry explicitly (sourced via `zsh -c 'source ~/.zprofile; …'`).

**Files touched this session:**
- `modules/step-6-qa/keyword-sufficiency-checker/execute.js` — three-way no-plan/empty-plan/proceed split + loud-fail branch + new option destructure + summary label fix. (modified, committed)
- `modules/step-6-qa/keyword-sufficiency-checker/manifest.json` — `allow_empty_keyword_plan` option + version 1.0.1. (modified, committed)
- `modules/step-6-qa/keyword-sufficiency-checker/README.md` — documented the new behavior + option (Rule 7). (modified, committed)
- `modules/step-6-qa/keyword-sufficiency-checker/test-empty-plan.js` — new TDD test, 17 assertions. (added, committed)
- Commit `ca83d9b`; rollback tag `pre-rule13-w1-1-2026-06-12` on `f80245d`. CI deploy `27406285414` success.
- This `CLAUDE.md` session entry (working-tree change; not committed as part of the W1.1 code commit).

**Alignment:** Confirmed. W1.1 honors Rule 13 — the new option, its default, the failure-path strings, and the logic carry zero content-type/iGaming/company-profile assumptions (verified in review). It honors the Plan 2 Workstream-1 intent: establish a loud-failing baseline (the empty-plan guard) BEFORE any Workstream-2 prompt/manifest migration, so a later regression run is attributable to the migration, not a pre-existing silent pass. No scope creep beyond W1.1; W1.2 not started.

**Updated by:** Claude (manual session entry — W1.1 execution + deploy + production verification)

### Session(s): 2026-06-12 → 2026-06-14 — Rule 13 W1.2 / W1.3 / W1.5 + seo-planner v2.2.1 (RECONSTRUCTED from git 2026-06-14; not logged at the time)

**Note:** These entries are reconstructed from commit messages on modules `main`, NOT from contemporaneous session records — detail is limited to what each commit states. Flagged during the 2026-06-14 verification session when git was found ahead of this log (Pattern H: current-state verification before citing plan files). Do not treat as a full session record.

- **W1.2 — content-writer v1.6.1** (`685af34`): loud-fail/warn on configured-but-unresolved `allowed_slug_paths` (paths that don't resolve now surface instead of silently passing).
- **W1.3 — content-analyzer v1.4.1** (`f585d15`): config-driven vocabulary-fidelity gate (every assigned slug must exist in the injected vocabulary).
- **W1.5 — shared heading-marker parser** (`1728136`): `modules/_shared/marker-parser.js` as the single canonical marker regex, consumed by markdown-output + html-output + the tone-seo-editor preservation gate.
- **seo-planner v2.2.1** (`3b48ef6`): corrective JSON retry (markdown→JSON safety net) — addresses the "seo-planner returned markdown instead of JSON" failure (a BACKLOG #25 instance).

**Grounded Rule-13 status (2026-06-14):** W1.1–W1.3 + W1.5 shipped on `main`. **W1.4** (citation-coverage-checker template-flag confirm — config only, no code) + **W2.1 / W2.2 / W2.3** (agnosticism) appear open. The seo-planner v2.2.0 / content-writer v1.5.0–1.6.0 commits were the W2 *pilot*, not the full W2 rollout.

**Updated by:** Claude (reconstructed from git history during the 2026-06-14 session; not a contemporaneous record)

### Session: 2026-06-14 — Verified + tested the per-entity failure-status fix (874c436); ship-gate E2E incl. Wazdan reported successful

**Status:** Verification + regression-test + audit session for an ALREADY-COMMITTED skeleton fix. No new product code authored this session. All work on `content-pipeline-v2` branch `sub-plan-1-multi-card` + `content-pipeline-modules-v2/BACKLOG.md`.

**Context — log is stale vs git (Pattern H):** This CLAUDE.md session log documents Rule 13 only through W1.1, but git on modules `main` shows **W1.2 (`685af34`), W1.3 (`f585d15`), W1.5 (`1728136`), seo-planner v2.2.1 (`3b48ef6`)** all committed since. Those sessions were not logged here. This entry does NOT fabricate them — flagged for a future reconciliation pass. (Grounded next-state: Rule 13 W1.4 + W2.1/W2.2/W2.3 appear open; V5 sub-plan 1 is code-complete on `sub-plan-1-multi-card`, in ship-gate.)

**Accomplished:**
- **Verify-before-assume:** the task described mirroring `entity_stage_pool.status` to the derived run status as work-to-do, but `git blame` showed it was **already committed today** in `874c436` ("un-mask per-entity submodule failures"). `stageWorker.handleEntityJob` derives status via `deriveEntityRunStatus(result)` (`server/utils/entityRunStatus.js`) and writes that SAME value to both `entity_submodule_runs.status` (success write) and `entity_stage_pool.status` (success-path mirror, ~L877-882). There was never a committed intermediate state with the run status derived but the pool hardcoded `'completed'`.
- **Confirmed the decision is correct:** mirroring `entityStatus` makes `batchWorker`'s `pipeline_stages.completed_count/failed_count` (derived from pool status) agree with `autoExecutor.evaluateStepResult` (reads `entity_submodule_runs.status`). Keeping `'completed'` re-introduces the "N completed, 0 failed" masking the fix targets.
- **Full downstream carry-forward audit:** `approve_step_v2` forwards only `status='approved'` pool rows (`sql/migration_move_routing_to_step7.sql:80-94`); approve promotes only `completed`/`pending`→`approved` (`runs.js:390-397`). So a `failed` entity is NOT forwarded — **intended**, consistent with the pre-existing throw-path (`stageWorker.js:723-729` already wrote `failed` to the pool on thrown errors). Non-card same-step reads have no status filter (safe); card-routed retries exclude `failed` by design; skip forwards all rows. **QA verdicts (`qa_pass:false`) stay `completed`** → still forward + route (critical non-regression; `deriveEntityRunStatus` flags only `meta.status==='error'` or all-items-error).
- **Added the first test in the skeleton repo:** `server/utils/entityRunStatus.test.js` (18 `node:test` cases) + a `test` npm script (`node --test 'server/**/*.test.js'`). Covers the failed/completed/defensive cases and the `qa_pass:false`→completed non-regression, plus a STRUCTURAL guard that reads `stageWorker.js` as text and asserts the success-path pool mirror uses `status: entityStatus` (not a literal), scoped so it cannot match the throw-path update. (stageWorker can't be imported in a unit test — it starts a live BullMQ Worker at load.) **18/18 pass.** Independent code review: **PASS** (0 critical/0 warning); closed its one info-gap (added meta-error + successful-items case).
- **Ship-gate E2E SUCCESSFUL — run `5512e8b5-66a3-4802-878f-ffe003cae2f8` (DB-VERIFIED this session, read-only SQL on project `fevxvwqjhndetktujeuu`).** Run `status=completed`, `current_step=10`, finished 2026-06-14 16:03 UTC, template `7th june 17.15` (`6c4b2311…`). Both entities (Wazdan + Pronet Gaming) traversed **Steps 1-8 with 0 failures at every step** (each stage `completed`, `failed_count=0`, `approved_count=2`); Steps 9-10 `skipped` (distribution + review gates not configured — BACKLOG #9). Wazdan — the previously hard-failing entity (content-writer `fetch failed` ~908s timeout, #25) — now shows **`content-writer=approved`** at Step 5 and produces Step-8 output (markdown-output + meta-output). Validates `d7e8a89` (streaming timeout fix) + the full forward pipeline + Section C routing executing (`78c216c`); `874c436` keeps the status honest.
  - **Scope correction (resolved 2026-06-14 via plan quote + DB):** `5512e8b5` ran on template `7th june 17.15`, which has **no `routing_rules` / `card_definitions`** (only pause/submodules keys). So loop-router could ONLY flag-and-forward — `loop_count=0` is the **correct** outcome there, not a deficiency (nowhere to route ⇒ flag-and-hold is right). It is therefore **NOT the sub-plan-1 ship gate.** That gate explicitly requires backward routing — verbatim (`~/.claude/plans/noble-wandering-graham.md` L76-79): "ONE entity is configured to fail Step 6 QA… routes to Step 1 via card_instructions, re-executes Round 2, either passes QA (terminal_state='approved') or hits max_loops=3 (terminal_state='failed')." Backward routing is **sub-plan-1 scope** (items 13/17 + the amendment-3 migration), **NOT** deferred to sub-plan 4 (sub-plan 4 = the *real* v2 card content; the mechanism test uses a placeholder).
  - **Fixture EXISTS on the `30 april` template (`3442873e`):** `routing_rules` = {`citation:fail`,`hallucination:fail`} → step 5 card `a8f4…0001`; `card_definitions` = a `writer-v2-placeholder` (`submodule_id=content-writer`, step 5, rounds {1:{}, 2:{`_placeholder_marker: "sub-plan-1-ship-gate"`}}) whose own description reads "Placeholder retry card for sub-plan 1 ship-gate mechanism test… Real escalation config produced in sub-plan 4." So this is **not** a missing-fixture problem and **not** a sub-plan-4 dependency.
  - **What actually blocks the ship-gate run:** the **synthetic controlled-QA-fail entities don't exist** (amendment-3 item 3 — Pronet + Wazdan + 3 synthetic with controlled QA outcomes). DB search found none (example.com/.net/.org absent); the only `30 april` run is an abandoned pre-Section-C one (`23a6267d`, stuck step 4 since 2026-05-22, real entities). So before the gate can run, a QA-failing entity (trips `citation:fail` or `hallucination:fail`) must be created/seeded.
  - Still true and valuable: `5512e8b5` validated the forward pipeline + loop-router executing + flag-and-forward + **Wazdan producing output with 0 failures** (the `d7e8a89` timeout fix held). It is a real stability win — just not the routing ship gate. (It is also a live instance of the #8/#9 gap: two `flagged` entities produced Step-8 output with nothing surfacing the flag, Steps 9-10 skipped.)
- **Backlog:** marked modules `BACKLOG.md` **Item 25** largely resolved by `874c436` (+ resolution paragraph) and added **Item 26** for the residual: pool status is last-writer-wins across submodules at a step, so `pipeline_stages` counts (from the pool) can still disagree with `evaluateStepResult` (any-submodule-failed) in multi-submodule steps. Pre-existing shape; not introduced by `874c436`.

**Decisions:**
- **Mirror `entityStatus` to the pool = correct (confirmed, already shipped).** The drop-at-approve of `failed` entities is intended de-masking, consistent with throw-path behavior — not a wrongful drop. A failed entity stays fully auditable as `failed` at the step it failed (and, unlike a thrown no-partial error, its `output_data` is preserved).
- **Did not author a code change** — the fix was present; a no-op edit "to implement" would be theater. Deliverables were the missing test + the audit + backlog hygiene.
- **No formal brutal-critic/CTO round forced.** The change is architectural by Rule 2 but already committed; my audit + the code-review PASS is one verification pass. An independent adversarial round is optional (consistent with throw-path + tested), not a V5 blocker.

**Blockers/Questions / loose ends:**
- `8f0b132` (skeleton test + script) committed locally on `sub-plan-1-multi-card`, **not pushed**.
- modules `BACKLOG.md` (Items 25/26) **edited; commit status: see below**.
- The cross-reference I proposed (generation-failures should flow forward as `flagged` for human review — ties Item 26 → Items 8/9, since `terminal_state` is only set by routing, so a Step-5 drop never reaches the #9/#10 review queue) — **not yet added**; awaiting your go.
- **Sub-plan-1 ship gate is NOT met (corrected).** `5512e8b5` (`7th june 17.15`, `completed`, step 10, 0 failures) validated the forward pipeline + loop-router executing + flag-and-forward + Wazdan producing output — but that template has **no routing config**, so flag-and-forward is its only possible outcome (correct, not a gap). The gate REQUIRES backward routing on the **`30 april`** template (fail Step 6 QA → route → Round 2 → `approved`/`max_loops`). **Fixture is ready** on 30-april (`routing_rules` + `writer-v2-placeholder` card). **Blocker:** the synthetic controlled-QA-fail entities (amendment-3 item 3) **don't exist** — must be created before the run; NOT a sub-plan-4 dependency (the placeholder card is by design). Sequence: create QA-fail entity → run 30-april ship-gate scenario → (pass) merge → deploy → remove the `apply_entity_routing` tripwire stub (Item 18).
- decision_log (Supabase) not written this session.

**Files touched this session:**
- `content-pipeline-v2/server/utils/entityRunStatus.test.js` — new, 18 cases. (added, committed `8f0b132`)
- `content-pipeline-v2/package.json` — `test` script. (modified, committed `8f0b132`)
- `content-pipeline-modules-v2/BACKLOG.md` — Item 25 resolution note + new Item 26 + index rows. (modified)
- `content-pipeline-modules-v2/CLAUDE.md` — this entry. (modified)

**Updated by:** Claude (manual session entry — verification/test/audit of 874c436; ship-gate E2E incl. Wazdan reported successful)

### Session: 2026-06-18 — Park #29 + park-and-pivot recorded; ship-gate parked, four conditions carried to sub-plan 4

**Status:** Execution of a prior session's handoff "do first" actions. Park #29 (skeleton), tidy the floating brief (modules), record the park-and-pivot decision (BACKLOG + this log), then open sub-plan 4. No deploy, no merge, tripwire stub untouched.

**Git-vs-log reconciliation (Pattern H — verify before citing):** This log was behind git again. The prior session's **Track B** commits on skeleton branch `sub-plan-1-multi-card` were never logged here: `be07509` (routingHandler schema-drift fix — `resolveCards`/`validateCards`/`applyRouting` migrated off the legacy `cards`/`target_cards` shape onto the canonical `card_definitions` + `routing_rules[key]=[{step,card_id}]`, confirmed via PHASE_3B §2.1; a real blocker — would have thrown TypeError on the first routing run; reviewed Gemini + code-review agent, tested, deployed Path B, verified) and `4c06d3f` (BACKLOG #28 backward-route stage-reset fix — reopen the loop body so Round 2 re-executes; reviewed, tested, deployed Path B, verified). Both reviewed/tested/deployed/pushed in the prior session. `8f0b132` (entityRunStatus regression tests) likewise. **Now reconciled** — BACKLOG #28 is marked resolved+deployed and this entry records the chain.

**Accomplished this session:**
- **Parked #29** (skeleton, branch `sub-plan-1-multi-card`): committed the reviewed/tested resume-range-clamp fix as `079f7d1` — exactly three files (`server/services/autoExecutor.js` wiring, `server/utils/stepRange.js` new pure helper, `server/utils/stepRange.test.js` 10 tests), 130 insertions, nothing else. Tagged **`parked-not-deployed`** (annotated). **NOT deployed, NOT merged, NOT pushed** (branch local, ahead 1 of origin). Both skeleton commit gates satisfied: decision_log entry (`3a553e8e`) + Pattern B.1 code-path-trace trailer (`autoExecutor.js` is a routing-class file). The trace was genuinely verified this session, not just repeated from the patch comment: `runs.js:1279` resume endpoint clamps `config.steps` to `[haltedStep..10]` (the exact clamp the fix targets); `runs.js:1202` normal launch builds `[0..10]` unclamped (confirms "production no-op today"); `widenStepRange` runs before the `per_step_results` cleanup (structural test confirms ordering). 10/10 tests pass.
- **Lockfile drift reported, not committed:** `client/package-lock.json` (skeleton) showed ~609/-549 lines of Babel **dev-dependency** version bumps (7.29.0 → 7.29.7, transitive) — incidental `npm install` drift, **origin unknown**, zero relation to #29 (which adds no dependencies). Left out of the commit; deliberately **NOT reverted** (not ours to discard — it's pre-existing working-tree state, not something this session created). Still sits unstaged in the skeleton working tree. **Recorded here, not floating.**
- **Tidied the floating brief:** committed the long-untracked `docs/RULE_13_ROLLOUT_BRIEF.md` (230 lines, the canonical Rule-13 rollout brief) to the modules repo in its own commit so it stops surfacing as a loose end across sessions.
- **Recorded the park-and-pivot** in `BACKLOG.md` (#28 → RESOLVED+deployed; #29 → PARKED; new **Item 30** = ship-gate parked + four carried-forward conditions + principle; index rows updated) and in this session log.

**Decisions:**
- **Park-and-pivot (the session's conclusion).** The ship-gate kept surfacing bugs (#28, #29) that live in the skip/pause/resume **test scaffolding**, not in routing. Root realization: routing isn't wired into any real template — `30 april` (`3442873e`) is the only one with `routing_rules` + `card_definitions`, and its card is the `writer-v2-placeholder` (sub-plan-1 ship-gate marker). The real escalation card + real routing config are **sub-plan 4**. So the gate has been testing a fixture-shaped version of a feature that isn't built yet.
- **#28 stays deployed** — trunk prerequisite for any backward routing; dormant/harmless until routing goes live. Do NOT revert.
- **#29 parked, not deployed** — side-branch; only bites pause + resume + backward-route below the resume point; unreachable until routing config exists. Reviewed/tested patch preserved on-branch tagged `parked-not-deployed`; resurrect when the path is live.
- **Ship-gate parked.** Its four conditions (1 routing fired / 2 Round 2 executes with marker / 3 terminal state / 4 orphan check clean — the cascade-delete safety) carry forward as **sub-plan 4's acceptance bar**, where the gate becomes meaningful (real card, real trigger, production path — straight-through 0..10, no skip/pause). **Principle:** pre-fix trunk prerequisites, defer side-branch bugs, don't push a scaffolded gate to green (doing so is what manufactured the #29-class entangled bug).
- **Did not push the parked branch** to origin this session — held as a checkpoint decision (outward-facing); local commit + tag already satisfy "parked on branch."

**Blockers / next (sub-plan 4):**
- Build the **real escalation card** (a genuine content-writer-v2 with a real prompt/model difference, not the placeholder) and wire `routing_rules` onto a **genuine** template. Then run the four ship-gate conditions on the production path — condition 2 (Round-2 marker) + the orphan check finally prove the product, not the scaffolding.
- **Open question to settle early:** deterministic `citation:fail` on a real run is hard — thin seeds trip an off-site crawl (BACKLOG #27, `follow_external`), so content gets real citations. Decide whether a high-probability trigger is acceptable, or whether a controlled test mechanism is needed.

**Files touched this session:**
- `content-pipeline-v2/server/services/autoExecutor.js`, `server/utils/stepRange.js`, `server/utils/stepRange.test.js` — #29 patch (committed `079f7d1`, tag `parked-not-deployed`, branch `sub-plan-1-multi-card`, NOT deployed/merged/pushed).
- `content-pipeline-modules-v2/docs/RULE_13_ROLLOUT_BRIEF.md` — committed (own commit) to stop the floating-loose-end churn.
- `content-pipeline-modules-v2/BACKLOG.md` — #28 resolution, #29 resolution/park, new Item 30, index rows.
- `content-pipeline-modules-v2/CLAUDE.md` — this entry.

**Alignment:** Confirmed. Parking (not deploying) an unreachable side-branch fix while keeping the deployed trunk prerequisite, and refusing to push a scaffolded gate to green, are consistent with the project's "verify-before-assume" discipline and Pattern I (don't ship around an unexercised path). No architectural commitment touched; sub-plan 4 is where the routing product actually gets built.

**Updated by:** Claude (manual session entry — park #29, tidy brief, record park-and-pivot)

### Session: 2026-06-20 — CTO audit of the park-and-pivot + 3 actioned findings + sub-plan-4 scope lock

**Status:** CTO oversight pass on the prior session's park-and-pivot. Verified all claims against ground truth (git, production SSH, pipeline DB, canonical plan, test suite, Supabase) via a 6-agent workflow + direct re-verification. Bookkeeping all GREEN; surfaced live-state hazards; actioned three findings; locked sub-plan-4 scope. No sub-plan-4 build work.

**Verification (trust-but-verify):**
- **Bookkeeping GREEN, production-verified:** skeleton HEAD `079f7d1` = exactly 3 files; tag `parked-not-deployed`→`079f7d1` annotated, on origin; modules `main` `78aa932` pushed; CI green; PM2 4/4 fork. **#29 confirmed ABSENT from prod** (no `stepRange.js`, `widenStepRange`=0, prod `autoExecutor` SHA = the `4c06d3f` version); **#28 confirmed PRESENT** (prod `runs.js` byte-identical to `4c06d3f`). Patch tests 10/10; code-path-trace attestation independently re-verified (`runs.js:1279` clamp, `:1202` `[0..10]`, `autoExecutor:437` widen-before-cleanup); 100% pipeline-agnostic; 3 decision_log rows exist.
- **Caught an error in my own audit's adversarial agent** (trust-but-verify worked): it claimed the synthetic ship-gate entity "passed QA, so routing never fired" by reading run-`status='approved'`. Direct DB read of `output_data` refuted this — `citation-coverage-checker` emitted `qa_pass:false` ("no inline citations [#n]. Automatic fail."). The entity FAILED QA correctly; the blocker is loop-router deciding `flag_manual` (the #29 pause/resume clamp), not a non-deterministic trigger. Recorded in BACKLOG #30 "CTO audit" subsection.

**Three findings actioned:**
1. **Killed the zombie run.** `36d34311` had been `status='running'` 13 days at step 7 (BullMQ worker long dead). Set `status='abandoned'`, `completed_at=2026-06-20 08:09 UTC` in the pipeline DB. Future state-checks no longer ambiguous. (5 other `running` rows at other steps remain — flagged, not triaged.)
2. **`deploy.sh` footgun → BACKLOG #31** (skeleton repo, HIGH). Whole-tree `rsync --delete` (excludes only node_modules/.env/.git/.DS_Store) → next full `./deploy.sh` ships parked #29 to prod silently. **Gating decided = Option B (abort if `parked-not-deployed` is an ancestor of HEAD, `DEPLOY_ALLOW_PARKED=1` override).** Rejected per-file `--exclude` (can't handle the modified `autoExecutor.js`) and warning-only (fails open). Copy-paste snippet in #31. Not implemented this session (own reviewed change).
3. **Corrected citation:fail recipe → BACKLOG #30.** "Deterministic citation:fail is hard" was over-stated. The zero-`[#n]`-content seed produces a deterministic auto-fail (DB-proven on run `48c0e3f4`); #27's crawl problem is specific to the `example.com`-link seed, not seeding generally. Recipe: zero-citation seed + straight-through run (no pause) dodges both #27 and #29.

**Sub-plan-4 scope LOCK (user-confirmed 2026-06-20):** canonical = THREE v2 cards (PSE-v2, content-writer-v2, SEO-writer-v2) on company_profile, entry gate + one-shot harness built FIRST. The earlier "one card" handoff framing is confirmed as **reduced-slice-first** (content-writer-v2 as a vertical slice to prove the mechanism end-to-end, then the other two follow) — **NOT a permanent cut to one card.** Recorded in BACKLOG #30 "Scope lock".

**Decisions:**
- Park #29 as-is confirmed (user): stays parked, not deployed; resurrection question resolved for now.
- Zombie kill uses `abandoned` (the established terminal status; 2 prior runs use it), not `failed` (not in vocab).
- Gating decision recorded in BACKLOG, implementation deferred (touches the deploy path) — honors "stop after these three + scope confirmation."

**Blockers / next (sub-plan 4 — its own session):**
- Implement BACKLOG #31 deploy.sh gate before any skeleton deploy.
- Root-cause loop-router `flag_manual`-vs-`route` on a STRAIGHT-THROUGH run + the phantom `loop_count=1` / empty `routing_log` inconsistency.
- Build the one-shot harness (`scripts/run-submodule-once.js`) + check `merge_sections` markers (both hard prerequisites that don't exist yet).
- Triage the remaining 5 `running` rows.
- Two-gate structure (mechanism gate vs quality gate) + disambiguate V5-plan item numbers (27/29/30) vs BACKLOG item numbers (27-31).

**Files touched this session:**
- pipeline DB `fevxvwqjhndetktujeuu`: `pipeline_runs` row `36d34311` → `abandoned` (zombie kill).
- `content-pipeline-modules-v2/BACKLOG.md` — Item 30 (CTO audit + citation recipe + scope lock subsections), new Item 31 (deploy.sh footgun + gating decision), index rows.
- `content-pipeline-modules-v2/CLAUDE.md` — this entry.
- No skeleton code touched; no deploy; #29 stays parked.

**Follow-up (same session, post-push request):** filed the two flagged loose ends as durable records, not log sentences — (a) the 5 remaining stale `running` rows (`23a6267d` s4/28.7d, `1e834cb6` s3/21.7d, `99b8f268` s1/14.6d, `7dcc4794` s2/13.4d, `aa81daa2` s6/13.0d) filed in **BACKLOG #34** (DB hygiene — split out of #30 on 2026-06-20 so the ship-gate record isn't conflated with DB cleanup) as "UNTRIAGED, check at sub-plan-4 start"; (b) the two deferred v2 cards filed as **named BACKLOG items #32 (PSE-v2) + #33 (SEO-writer-v2)**, marked "carry-forward, NOT optional", so the content-writer-v2 slice can't close as "sub-plan 4 done at one card."

**Updated by:** Claude (CTO agent — audit + zombie kill + footgun/citation-recipe BACKLOG + scope lock + carry-forward items #32/#33)

### Session: 2026-06-22 — Two quick wins before sub-plan 4: deploy.sh gate (#31) + DB-hygiene triage (#34)

**Status:** Two pre-sub-plan-4 quick wins, both done. Sub-plan 4 deliberately NOT opened (multi-week thread, its own session). No skeleton deploy.

**#31 — deploy.sh parked-commit guard IMPLEMENTED (skeleton `250fe6a`, pushed as backup; not deployed):** Added a `[0/6]` pre-flight guard to `content-pipeline-v2/deploy.sh` that aborts the deploy if the `parked-not-deployed` commit is an ancestor of HEAD, unless `DEPLOY_ALLOW_PARKED=1`. Closes the hole where the whole-tree `rsync --delete` would silently ship parked #29. Treated as a reviewed change (not an unreviewed paste): functionally tested both branches (aborts on current parked HEAD; override warns+continues; `bash -n` clean), independent `/code-review` = **PASS** (0 critical/0 warning; confirmed the `set -e` × `merge-base --is-ancestor` interaction is safe because it sits in an `if`-condition; annotated tag dereferences to the commit via `rev-list -n1`). decision_log `2ed0a8a9`. Active locally immediately (deploy.sh runs locally); the gate itself ships on the next conscious deploy (which it gates). Scoped to the app-repo rsync; modules-repo rsync intentionally uncovered.

**#34 — DB hygiene RESOLVED:** Triaged the 5 stale `running` rows (`23a6267d`/`1e834cb6`/`99b8f268`/`7dcc4794`/`aa81daa2`, 13–29 days) → all set `abandoned` (one guarded UPDATE, `status='running'` precondition; RETURNING confirmed the 5 IDs). **Baseline clean: 0 `running` rows.** Observed in passing: `pipeline_runs` shrank 17→10 rows between 06-20 and 06-22 (external live churn, not from this triage) — noted, not acted on.

**Flag carried to the sub-plan-4 session (load-bearing, not a checklist tick):** task 2 — root-cause the loop-router `flag_manual`-vs-`route` decision + the phantom `loop_count=1`/empty `routing_log` on a **straight-through** run — is the "does the mechanism actually work" question. Do it EARLY and honestly: if it surfaces a real routing defect (not just the #29 resume-clamp artifact), it reshapes the v2-card work. Ready for it to change the plan.

**Files touched:** skeleton `deploy.sh` (`250fe6a`, pushed); pipeline DB `pipeline_runs` (5 rows → abandoned); modules `BACKLOG.md` (#31 → resolved/implemented, #34 → resolved, index rows); modules `CLAUDE.md` (this entry).

**Updated by:** Claude (CTO agent — #31 deploy.sh gate implemented + reviewed, #34 DB-hygiene triage)

### Session: 2026-06-25 — SESSION CLOSE: backlog reconciliation + impact analysis + delegation decision (autonomous #21/W2, sub-plan 4 stays attended)

**Scope:** Closing entry for the 06-24 → 06-25 reconciliation work + the impact-analysis Q&A + the delegation decision. The detailed park-and-pivot / CTO-audit / quick-wins work is already logged in the 06-18, 06-20, 06-22 entries above; this entry covers what came after them and sets up the next (autonomous) phase.

**Accomplished:**
- **DB hygiene closed out (#34):** abandoned the last step-7 leftover `3e27ba01` (synthetic `ship-gate-citation-fail` run, project `ship-gate-2026-06-15`, paused, no routing artifacts). No non-terminal runs remain at the step-7 routing boundary.
- **Retention finding recorded (#34):** `pipeline_runs` auto-purges terminal runs (table churned 17→10→3 rows over 06-20→06-24). Consequence captured: sub-plan-4 task 2 must **capture ship-gate evidence promptly before purge** — this is how the `48c0e3f4` forensic specimen was lost.
- **#30 evidence note:** the CTO-audit specimen `48c0e3f4` (+ `61c8a8c4`) was deleted by that churn; the diagnosis stands (recorded while it existed) but task 2 must **reproduce the citation-fail scenario fresh, not hunt for old runs**.
- **#7 verified RESOLVED/SUPERSEDED (in deployed code):** Section C removed the automatic routing cascade-delete — `routingHandler.applyRouting()` is append-only (READ + `append_card_instruction` RPC, no run-table `.delete()`); `runs.js:539` backward-route branch explicitly refuses to delete; the only run-table deletes left (`runs.js:820-859`) are the **manual reopen** endpoint; `apply_entity_routing` dropped. Risk is **structurally closed, not just untracked**; orphan-check (#30 cond. 4) **retained as a regression guard** so it can't silently return.
- **Index reconciled:** added missing rows #17/#18/#19 → BACKLOG index now **contiguous 1–34**; noted #18's "tripwire fires at Step 7" framing is stale (rewrite shipped `be07509`, tripwire dropped).
- **Impact analysis (verified against prod):** confirmed `aiStream.js` (Wazdan streaming-timeout fix), `entityRunStatus.js` + `stageWorker.js` (honest failure status), and `routingHandler.js` (canonical schema) are all byte-identical in prod. Established that a re-run of the same two companies (Wazdan + Pronet) would complete straight-through much like run `5512e8b5` — **the routing/Round-2 machinery stays dormant because real companies pass QA** (only the synthetic zero-`[#n]` seed deterministically fails). DB-confirmed the backward-routing mechanism has executed **zero** times ever (0 routing_log / 0 loop_iteration>0 / 0 card_id / 0 terminal_state).

**Decisions:**
- **Delegation scope for the next (autonomous) phase:** run **#21 (Anthropic prompt caching)** + **Rule 13 W2** (content-analyzer agnostic rewrite, tone-seo-editor #20, hallucination-detector code-lock) **autonomously**, gated behind tests + `/code-review`, **commit but DO NOT deploy** → keeps them 100% git-revertable.
- **Sub-plan 4 stays ATTENDED — not on autopilot.** Reasons (recorded so it isn't re-litigated): (1) its acceptance gate is **human qualitative judgment** ("v2 beats v1 on 3 reference entities, brutal-critic" — no automated metric), so auto-accepting would defeat the gate; (2) it touches **production state** (live template `routing_rules`, live pipeline runs) which git can't cleanly revert; (3) its load-bearing task 2 should **halt-and-reshape** on a discovered defect, not barrel past it. Autonomy-safe PREP only (build the one-shot harness, run the task-2 investigation, draft v2 prompts), stopping at the human gate.
- **Revert rule that makes "return to now" clean:** *commit everything, deploy nothing, don't touch the live pipeline DB or production templates.* A **checkpoint tag** (`checkpoint-2026-06-25`) on both repos is the literal return point; `git reset --hard <checkpoint>` restores this exact state.

**Blockers/Questions:**
- **Thread-scheduling is the user's calendar call** — sub-plan 4 (multi-week, attended) vs the bounded autonomous threads. Resolved this session: do the bounded threads autonomously now.
- **Lockfile drift** (`client/package-lock.json`, skeleton) remains deliberately untouched (Babel dev-dep churn, origin unknown) — NOT to be blanket-committed.
- **#31 deploy.sh gate** active locally but not yet deployed to prod; ships on the next conscious deploy (which it gates).

**Files touched (06-24 → 06-25):** modules `BACKLOG.md` (#30 evidence note, #34 closeout + retention finding, #7 resolution, index rows 17/18/19) committed `c5f1892` + `1654c55`; pipeline DB `pipeline_runs` (`3e27ba01` → abandoned); modules `CLAUDE.md` (this closing entry).

**Alignment:** Confirmed. The reconciliation honors the session's record-accuracy discipline (verify-before-assert: #7 checked in deployed code before declaring dead; index made to match bodies). The delegation decision honors the project's core architectural caution — refusing to push a human-judgment gate (sub-plan 4) to green on autopilot is the same principle as "don't push a scaffolded gate to green" that drove the whole park-and-pivot.

**Updated by:** session-closer skill

### Session: 2026-06-25/26 — Autonomous run: #21 prompt-caching ENABLING shipped (branch); W2 scoped + de-risked, module edits deferred

**Status:** Delegated autonomous run (#21 + Rule 13 W2) with the revert rule "commit everything, deploy nothing, don't touch live DB/templates." All work on branch `auto-21-w2-2026-06-25` in both repos; **nothing deployed**; revert anchor = tag `checkpoint-2026-06-25` on both repos (`git reset --hard checkpoint-2026-06-25`). Skeleton branch pushed (backup); modules branch pushed (backup, NOT main → no CI deploy).

**#21 — Anthropic prompt caching ENABLING change DONE** (skeleton `bef48ec`, branch, NOT deployed):
- Optional `cache_prefix` on `ai.complete` → splits stable prefix into a `cache_control:ephemeral` block; pure helper `promptCache.js::buildCachedUserContent`; assembled text byte-identical to `cachePrefix+prompt`. No `cache_prefix` → unchanged string content. `parseAnthropicSSE` surfaces `cache_creation_input_tokens`/`cache_read_input_tokens`. Consulted the `claude-api` skill for the caching spec (block structure, per-model min thresholds, no beta header for ephemeral).
- Tests 10/10 new + 14/14 existing aiStream + 50/50 full `npm test`; independent `/code-review` PASS (0 critical/0 warning; 1 forward note: cost consumers must sum `tokens_in+cache_write+cache_read`). Recorded in BACKLOG #21.
- **Remaining = module adoption** (the $ realization): each LLM module splits its prompt (reference-doc prefix → `cache_prefix`). Byte-safe, but cache hits can only be confirmed on a live run — belongs in a deploy-capable session, not a blind one.

**Rule 13 W2 — scoped from the canonical plan + LIVE-DE-RISKED, but module edits DEFERRED:**
- **W2.3 (hallucination-detector code-lock):** confirmed SAFE — Supabase check shows 6 templates carry a hallucination-detector preset but **0 override the prompt** (`overrides_hd_prompt:false` for all). Code-lock (manifest-removal of the `prompt` option + inline const + neutral-example swap of "Malta is a popular iGaming jurisdiction") changes nothing in production. Attempted the manifest edit via `node`/JSON.stringify → **reverted** because it reformatted the whole file (75-line diff for an ~11-line intent). Targeted format-preserving edit deferred.
- **W2.1 (content-analyzer agnostic default prompt):** low production risk (templates supply their own prompt via preset; the manifest default is the fallback, and the W1.3 vocab-fidelity gate is the safety) — but the plan wants it validated against the locked Casino Platforms baseline, which needs data/runs.
- **W2.2 (tone-seo-editor #20, remove redundant TONE_STYLES dropdown):** the marker gate (W1.5) already ships; but the plan requires a pre-migration **template inventory** (which templates set `tone_style`) before removing the option.

**Decision (the session's discipline):** **stop the autonomous module-edit work and checkpoint** rather than push 3 module rewrites through a degraded context. The noisy JSON diff was the warning sign. Each W2 module edit deserves a focused session with clean diffs + (W2.1) baseline validation + (W2.2) the template inventory. Same "don't push to green carelessly" discipline that drove the park-and-pivot. #21 enabling — fully testable without a deploy — was the right autonomous deliverable; the W2 rewrites + #21 module-adoption are not (they need live validation).

**Next (focused continuation):** W2.3 first (smallest, fully de-risked — targeted manifest edit preserving format + inline const + neutral example + structural test + `/code-review`), then W2.2 (after template inventory), then W2.1 (after baseline validation). Then #21 module adoption (content-analyzer) on a deploy-capable run watching `cache_read_tokens>0`. Merge to main / deploy stays the user's call; revert = `git reset --hard checkpoint-2026-06-25`.

**Files touched (branch `auto-21-w2-2026-06-25`):** skeleton — `server/services/promptCache.js` (+test), `server/services/aiStream.js`, `server/workers/stageWorker.js` (committed `bef48ec`, pushed). modules — `BACKLOG.md` (#21 status), `CLAUDE.md` (this entry). No module code edited (the hallucination-detector manifest edit was reverted). Nothing deployed.

**Updated by:** Claude (autonomous run — #21 enabling shipped on branch; W2 scoped/de-risked/deferred; checkpoint)

### Session: 2026-06-26 — #21 DEPLOYED + savings PROVEN + made durable (content-analyzer merged to main)

**Status:** User authorized the full #21 deploy + verification (superseding the earlier "defer adoption" stance). #21 is now live in production, the cache savings are proven on a real run, and the content-analyzer adoption is merged to modules `main` so routine CI deploys can't revert it.

**content-analyzer adoption (modules `ff28469`):** `buildCachedPrompt` splits the prompt at `{entity_content}` (stable vocab head → `cache_prefix`, variable tail → `prompt`) with a runtime self-check (`cachePrefix+prompt === buildPrompt(...)`) that guarantees byte-identity and falls back to no-cache on the two divergence cases a `/code-review` caught: `$`-replacement sequences in scraped entity text (`$$`/`$&`) and `{entity_content}` nested in a `{doc:}` token. 23/23 tests. README updated.

**Deploy (Path B):** file-scoped rsync of the 3 skeleton #21 files (`promptCache.js`, `aiStream.js`, `stageWorker.js`) + content-analyzer `execute.js` to Hetzner; all 4 shasum-verified byte-identical prod==local; `pm2 restart all` → 4/4 fork. **#29 stayed parked** (stepRange absent, `widenStepRange` 0 in prod). The #31 gate is inside `deploy.sh`, which Path B doesn't invoke — confirmed it didn't (and wouldn't wrongly) block.

**PROOF (real Anthropic calls through the deployed code):** two calls, same ~49K-token vocab prefix, different entities → **call 1 `cache_WRITE=49,050` / `cache_READ=0`; call 2 `cache_WRITE=0` / `cache_READ=49,050`** (uncached `tokens_in` 20 / 17). Cache hit confirmed; the stable prefix re-reads at ~10% input cost. Savings proven, not assumed.

**Durability:** content-analyzer adoption merged `auto-21-w2` → modules `main` (this entry's commit), fast-forward, pushed → CI docs deploy. Verified post-merge that prod content-analyzer `execute.js` shasum is unchanged (the merge made it permanent without changing running code).

**Skeleton #21 — follow-up (NOT done this pass, by design):** merging the skeleton `auto-21-w2` branch → skeleton `main` is **NOT a clean merge** — that branch sits on `sub-plan-1-multi-card` and would drag the entire unmerged V5 routing work + **parked #29** onto `main`. The durable path for skeleton #21 is to **cherry-pick `bef48ec` onto skeleton `main`** (or a clean branch off main), not a full merge. Lower urgency: skeleton deploys manually (not CI-on-push), so prod's Path-B #21 won't auto-revert. Near-term follow-up.

**Revert anchor:** `checkpoint-2026-06-25` stays until the skeleton #21 cherry-pick is also confirmed.

**Updated by:** Claude (#21 deployed + proven + content-analyzer merged to main; skeleton cherry-pick is the remaining follow-up)

### Session: 2026-06-28 17:00 UTC — Bright Data key renewed + Cloudflare detection widened (skeleton); + committed two earlier-session artifacts

**Status:** Short, focused infra/scraping session (skeleton repo). Renewed the Bright Data Web Unlocker API key in production, then widened the Cloudflare challenge/block detection that gates the unlocker fallback. Reviewed, deployed (Path B), pushed. NOT my work but committed alongside to stop them floating: BACKLOG #35 + the Task-2 PROVEN state from the earlier 2026-06-28 session (see RESUME.md).

**Accomplished (this session):**
- **Diagnosed Bright Data usage across both repos.** Confirmed it is used in exactly TWO places, both in the **skeleton** (`content-pipeline-v2`), never in any submodule (modules-v2) — including the job-search ones (Rule 3: submodules use `tools.http`/`tools.browser`/`tools.unlocker`, never raw fetch): `webUnlockerFetch()` (the API call to `api.brightdata.com/request`) and `browserFetch()`'s Cloudflare-challenge fallback. No submodule calls the direct `tools.unlocker` path; submodules only reach it transitively via `tools.browser.fetch` → `browserFetch`.
- **Established the architecture boundary** (in response to "why are scrapers in the skeleton"): scrapers are NOT in the skeleton — the **scraping logic** lives in modules-v2 submodules; the **transport layer** (CDP Chrome pool, proxy config, Bright Data) lives in the skeleton and is exposed to submodules via the `tools` object built in `stageWorker.js::buildTools()`. Centralized for: shared warm browser pool, single secret/fallback policy, submodule portability.
- **Renewed the Bright Data API key in production.** Updated `BRIGHT_DATA_API_KEY` in `/opt/content-pipeline-v2/.env` over SSH (backup at `.env.bak.brightdata`; zone var untouched), `pm2 restart all` (4/4 online), and **live auth-tested**: POST to `api.brightdata.com/request` returned HTTP 200 with real `example.com` content. Key is valid and live.
- **Widened Cloudflare detection** in `server/services/browserPool.js`: `CHALLENGE_MARKERS` 3 → 9 (added `Enable JavaScript and cookies to continue`, `Sorry, you have been blocked`, `Attention Required! | Cloudflare`, `/cdn-cgi/challenge-platform/`, `cf_chl_opt`, `__cf_chl_`). Previously most CF block shapes were silently recorded as failed/low_content scrapes instead of routing to the (paid) unlocker. `hasCloudflareChallenge()` signature now accepts the result object or a body string (back-compat); single caller updated; the old `result.body &&` guard removed (function handles empty body).
- **Code-reviewed (`/code-review`) → WARN, all 3 findings tightened before commit.** Independent reviewer flagged false-positive vectors that would bill paid unlocker calls on normal pages: removed `Verify you are human` (matches embedded captcha widgets on normal 200 pages; real CF challenges carry the `cf_chl` tokens anyway); narrowed `challenge-platform` → path-specific `/cdn-cgi/challenge-platform/`; dropped the `(403/503) && /cloudflare/i` status rule (matched the "by Cloudflare" footer the author had explicitly excluded, and the unlocker can't fix app-level 403/geo/auth blocks). Documented the exclusions inline so nobody re-adds them.
- **Committed skeleton `effa4e7`** (branch `auto-21-w2-2026-06-25`, 1 file, +25/-8), deployed **Path B** (file-scoped rsync of `browserPool.js`; prod ≡ local shasum byte-identical; `pm2 restart all` → 4/4), and **pushed** the branch (`f0891a5..effa4e7`). `client/package-lock.json` Babel dev-dep drift left unstaged (pre-existing, unrelated). decision_log entry written for the skeleton commit (REST API, HTTP 201).

**Decisions:**
- **Don't reflexively hold the deploy.** The change was reviewed, tightened, single-caller, syntax-clean, and the key it depends on was already live — there was no real reason to hold, so it shipped immediately.
- **Keep CF markers deliberately specific** to protect the pay-per-successful-request cost model. A false positive = a real paid Bright Data request (and for app-level 403/geo blocks the unlocker won't even help). Broad signals (`cf-ray`, bare `cloudflare`, status-only) explicitly rejected.
- **Renew vs hold (the user's call):** renewing is low-regret IF the plan is pay-as-you-go with no monthly minimum (idle ≈ free, asymmetric upside). The one caveat flagged to the user: a fixed monthly commitment would break the "free when idle" logic. User chose to renew.
- **Committed two non-session artifacts to stop them floating** (recurring loose-end pattern in this repo): BACKLOG #35 (citation-coverage-checker padding-blind QA gap, surfaced by the content-writer-v2 entry gate) and the Task-2 PROVEN state — both from the earlier 2026-06-28 session, both complete/dated, attributed here so they aren't mis-credited to this session.

**Blockers/Questions:**
- **Spend cap not set** — flagged to the user as a follow-up they must do in the Bright Data dashboard (protects against a runaway crawl now that the fallback fires on more block types). Not a code task.
- **API key exposed in chat history** — the renewed key was pasted into the conversation; worth rotating down the line if that matters. (Functional now; this is a hygiene note.)
- **Skeleton #21 cherry-pick to `main`** still pending (carry-forward from 2026-06-26) — the `auto-21-w2-2026-06-25` branch can't be clean-merged (drags V5 routing + parked #29); cherry-pick `bef48ec` is the durable path. This CF change (`effa4e7`) rode the same branch and inherits the same "not on main" status; prod has it via Path B regardless.
- **No live validation that the new markers actually catch a real CF block** — they're logic-correct and reviewed, but the next real scrape that hits a Cloudflare wall is the true confirmation; watch PM2 logs for `[browserPool] Cloudflare challenge detected` followed by a successful `[webUnlocker]` unlock.

**Files touched this session:**
- `content-pipeline-v2/server/services/browserPool.js` — widened CF detection (committed `effa4e7`, deployed Path B, pushed).
- `content-pipeline-v2/.env` (prod, Hetzner) — `BRIGHT_DATA_API_KEY` renewed (not in any repo; backup `.env.bak.brightdata`).
- `content-pipeline-modules-v2/CLAUDE.md` — this entry.
- `content-pipeline-modules-v2/RESUME.md` — position pointer refresh.
- `content-pipeline-modules-v2/BACKLOG.md` — Item 35 (NOT this session's work; committed to stop it floating).

**Alignment:** Confirmed. The change honors the modules architectural boundary (transport stays in the skeleton; submodules untouched and still reach it only via `tools`) and Rule 13 by analogy (no content-type assumptions — pure infra). The cost-protective marker tightening is consistent with the project's "don't ship around an unexercised path / verify-before-assume" discipline.

**Updated by:** session-closer skill

### Session: 2026-07-03 — All 20 unbuilt submodule briefs rewritten pipeline-agnostic (Rule 13) + BACKLOG #43–46 filed (worktree `charming-lamport-4b708c`)

**Status:** Docs/planning session. No module code touched, nothing deployed. Work on worktree branch `claude/charming-lamport-4b708c` (this thread's own worktree — honors #42 one-thread-one-worktree).

**Accomplished:**
- Gap analysis: of 32 research briefs in `Content-Pipeline/specs/submodule-briefs/`, 12 are built, 20 are not (incl. seo-keyword-researcher, partially superseded by seo-planner v2).
- **All 20 unbuilt briefs rewritten in place** (4 parallel research agents, live web research on 2026-07 provider landscape). Originals preserved at `specs/submodule-briefs/_originals-2026-07-03/`. Every brief now: Rule-13 agnostic (vertical flavor moved to "Example template configurations"), full module contract (item_key / data_operation_default / pool_precondition / cost), provider tables with researched pricing + source URLs, credentials & testing section keyed to the user-approved existing .env keys.
- **Consolidation: 20 briefs → 10 new generic modules** (`search-discovery` canonical for 6 discovery briefs; `ai-discovery-scout`; `url-heuristics` (né learned-validator); `api-fetcher`; `dataset-fetcher` (LinkedIn-company = one provider config); `transcript-fetcher`; `media-generator` (ONE module for tts/image/video); Step-9 family `cms-publisher`/`doc-exporter`/`sheet-logger`) + 1 extension (seo-keyword-researcher → seo-planner provider layer) + 1 card (human-rewriter → tone-seo-editor card) + rest = configs of built modules (api-search, rss-feeds, csv-discovery, page-links). Catalog 37→47 instead of →56.
- **Dead providers confirmed by research** (originals were unbuildable as written): Google Custom Search JSON API (closed to new customers, sunset 2027-01), Bing Search API (retired 2025-08), Clearbit Logo (dead 2025-12), Proxycurl (LinkedIn injunction, dead 2025-07), Crunchbase free API + OpenCorporates free keys (eliminated), Sora API (shuts 2026-09-24), YouTube captions.download (owner-OAuth-only).
- **Live-testable today with existing keys:** Perplexity (search-discovery), Anthropic (ai-discovery-scout, human-rewriter), Gemini (TTS/image/Veo video/YouTube transcription), Leonardo + OpenAI (image), Pixabay/Unsplash (stock), GSC service account (real keyword data; sheet-logger after API enablement), plus zero-credential paths (url-heuristics, iTunes Search, podcast RSS/transcripts, Wikidata, webhooks). Bright Data Datasets: one $0.003 call verifies key scope.
- **BACKLOG #43–46 filed** (skeleton capability gaps surfaced by the redesign): #43 tools.http verb/binary/multipart gaps; #44 no asset persistence for generated media; #45 Step-10→Step-9 execute trigger + terminal_state readability (extends #8/#9); #46 api-search header-auth (modules, small).
- **Durability snapshot:** all 20 revised briefs + 20 originals committed to this repo at `docs/submodule-briefs-rev-2026-07-03/` (canonical copies remain in `Content-Pipeline/specs/submodule-briefs/`, which is untracked in any repo — the #41 gap; snapshot is the mitigation, NOT a canonical move).

**Cross-thread notes (per session working rules):**
- `BACKLOG.md` + this `CLAUDE.md` are shared docs — this session appended items #43–46 and this entry only; #42 (card-write thread, filed earlier today on main) was picked up via fast-forward before numbering.
- The revised briefs live in `Content-Pipeline/specs/` (inside the `/Projects` mega-repo but untracked). Deliberately NOT committed there (#41's explicit non-goal + other thread's territory). Backup dir `_originals-2026-07-03/` created there.
- Credentials decision (user, this session): existing .env keys ARE approved for reuse by future modules; briefs prefer providers with existing keys. No production credentials were read (SSH env check was denied and not retried; local .env read was NAMES only).

**Blockers/Questions:**
- Skeleton gaps #43–45 gate parts of the build-out (media video mode, Step-9 execute, several delivery providers). #46 is a small modules-repo fix.
- Open verifications parked in this worktree's RESUME.md: Bright Data Datasets key scope ($0.003 test), Gemini YouTube-ingestion billing status, Workspace Shared Drive availability (gates Google Docs delivery — service-account My-Drive pattern is broken as of mid-2026).

**Updated by:** Claude (brief-revision session, worktree charming-lamport-4b708c)
