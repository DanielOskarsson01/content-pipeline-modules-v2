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
12. **`data_operation_default` for Steps 5-10 MUST be `"add"`, never `"transform"`.** Steps 5-10 use `item_key: "entity_name"` — `transform` replaces ALL items for an entity, destroying upstream data from other submodules. Only Steps 1-4 (which use `item_key: "url"`) are safe with `transform`.

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
