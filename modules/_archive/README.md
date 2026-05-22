# Archived Modules

Modules here are **excluded from the manifest loader scan** — the loader only reads `modules/step-N-name/` directories (regex `^step-\d+-` in [moduleLoader.js:69](../../../content-pipeline-v2/server/services/moduleLoader.js#L69)).

Folders are kept in version control as historical reference. To revive a module: `git mv modules/_archive/<id> modules/step-N-<name>/<id>`. To remove permanently: delete the folder.

## Currently archived

### `cv-generator` (archived 2026-05-23, originally added 2026-04-22 in commit `49a794d`)

**Why archived:** No production template references this module. The Job Search workflow has moved to using `content-writer` with template-level prompt overrides and reference docs instead of a CV-specific generator module. The architectural pattern is that workflow-specific behaviour belongs at the *template level*, not as separate modules.

**What it did:** Generated a tailored CV DOCX from `job-analyzer` output, using `generate_core_cvs.js buildCV()` with variant selection and overrides. 310 lines. Dependencies: `docx` npm package, CV source directory containing structured CV data.

**Historical use:** Ran in production on 2026-04-28 (Job Search E2E test, produced 2.6 MB CV DOCX in 1.7s).

### `job-analyzer` (archived 2026-05-23, originally added 2026-04-22 in commit `49a794d`)

**Why archived:** Same reason as `cv-generator` — Job Search template now uses `content-analyzer` for Step 5 analysis with `pause_after_submodules: ["content-analyzer"]` to allow manual review before generation. Job-specific prompts belong in template configuration, not in a dedicated module.

**What it did:** 5-layer analysis of a job ad against CV content. Produced fit score, variant selection, suggestions, and gap identification. 402 lines. Dependencies: CV source directory, Anthropic API.

**Historical use:** Ran in production on 2026-04-28 (Job Search E2E test, fit score 78, CEO variant, 31.8 K tokens, 114 s).
