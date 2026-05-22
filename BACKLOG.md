# Content Pipeline Modules — Backlog

Tasks not yet scheduled for implementation.

---

## Index

| # | Task | Priority | Added |
|---|------|----------|-------|
| 1 | Second LinkedIn account support in linkedin-post-scraper and profile-api | — | 2026-05-22 |
| 2 | Content-analyzer + content-writer flexibility for multi-content-type support | Medium-high (active) | 2026-05-23 |

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
