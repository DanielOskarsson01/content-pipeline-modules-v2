# Content Pipeline Modules — Backlog

Tasks not yet scheduled for implementation.

---

## Index

| # | Task | Priority | Added |
|---|------|----------|-------|
| 1 | Second LinkedIn account support in linkedin-post-scraper and profile-api | — | 2026-05-22 |
| 2 | Content-analyzer + content-writer flexibility for multi-content-type support | Medium-high (active) | 2026-05-23 |
| 3 | Loader fail-closed behavior when MODULES_PATH unset (skeleton repo) | Low | 2026-05-24 |

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
