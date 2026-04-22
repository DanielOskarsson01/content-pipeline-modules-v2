# Job Ad Analyzer

Step 5 generation submodule for the Job Search template.

## What it does

Performs a 5-layer analysis of a job ad against pre-approved CV content. Selects the best CV variant, identifies which sections to emphasize, suggests specific improvements, identifies gaps in coverage, and produces a fit score (0-100).

## Input requirements

The entity must have ad text available via one of:
- `entity.adText` — direct field (used in Phase 1 with hardcoded text)
- `entity.items[].text_content` — from upstream scraping (Phase 2+)

## CV source files

Reads from `cv_source_dir` option:
- `CV_SECTION_VARIANTS.md` — 7 variants of summary, highlights, other experience
- `CV_JOB_VARIANTS.md` — 7 variants per job entry (5 jobs x 7 = 35 sets)
- `COMPETENCY_MASTER_POOL.json` — ~8 competency categories
- `cv/MASTER_CV.md` — Complete career history
- `cv_data.json` — Structured CV data (education, contact, positioning)
- `generate_core_cvs.js` — Variant definitions and build function

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ai_model` | text | `sonnet` | LLM model for analysis. |
| `cv_source_dir` | text | (local path) | Path to CV source files. |
| `temperature` | number | `0.2` | LLM temperature. |

## Output

One item per entity containing:
- `fit_score` (0-100)
- `base_variant` (generic, igaming, cmo, cpo, ceo, startup, digital)
- `fit_summary` (1-2 sentences)
- `company_name` (short name for filenames)
- `analysis` (full JSON with job_analysis, cv selections, suggestions, gaps)

## Known issues

- Combined system+user prompt (ai.complete doesn't support separate system prompt)
- CV source files loaded from filesystem — migrated to module assets in Phase 3
- Knowledge bank integration not yet wired (returns empty for Phase 1)
