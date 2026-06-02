# Job Search Pipeline — Configuration & Prompts

Mirrors `pipeline-company-profiles/` in structure. Holds the prompts, format specs, and reference docs for the Job Search content pipeline (job ad analysis + tailored CV + cover letter generation).

## What this pipeline does

Given a job ad URL or text, produce three artifacts per job:

1. **5-layer job analysis** with fit score, variant selection, and gap identification
2. **Tailored CV** (DOCX) assembled from pre-approved variant content
3. **Cover letter** (DOCX) addressing the role honestly without echoing the ad

The pipeline runs end-to-end via a per-job driver. Currently lives as standalone scripts; will be absorbed into generic `content-analyzer` + `content-writer` modules per BACKLOG item 2 once those gain the necessary card/configuration support.

## Files in this folder

| File | Purpose |
|---|---|
| `README.md` | This file. |
| `job_analyzer_prompt.md` | SYSTEM_PROMPT for the 5-layer job ad analysis (snapshot of what runs in `job-analyzer/execute.js`). |
| `cover_letter_prompt.md` | SYSTEM_PROMPT for the cover letter writer (snapshot of what runs in `/JobSearch/CVs/generate-cover-letter.js`). |
| `format_spec.md` | Variant catalogue (cmo/cpo/ceo/igaming/startup/digital/generic), cover letter structure spec, JSON response schemas. |

## Where the running code lives (as of 2026-06-02)

| Component | Path | Model |
|---|---|---|
| 5-layer job analyzer | `modules/step-5-generation/job-analyzer/execute.js` (currently un-archived for week 22 run, scheduled to re-archive) | `claude-sonnet-4-6` |
| CV generator (no LLM — composes pre-approved variant text) | `modules/step-5-generation/cv-generator/execute.js` (same archive fate) | n/a |
| Cover letter writer | `/Users/danieloskarsson/Library/CloudStorage/Dropbox/Projects/JobSearch/CVs/generate-cover-letter.js` (standalone, in Dropbox, not in any git repo) | `claude-sonnet-4-6` (also tested with `claude-opus-4-7`) |
| Per-job driver | `/Users/danieloskarsson/Library/CloudStorage/Dropbox/Projects/JobSearch/week 22/driver/` | n/a |

## Where the CV source data lives

`/Users/danieloskarsson/Library/CloudStorage/Dropbox/Projects/JobSearch/CVs/`:
- `cv/MASTER_CV.md` — full career history (the only source of facts)
- `cv-source/en/CV_SECTION_VARIANTS.md` — section variants per voice (summary, highlights, competencies, other experience)
- `cv-source/en/CV_JOB_VARIANTS.md` — each job entry rewritten in 7 role-specific variants
- `COMPETENCY_MASTER_POOL.json` — categorized competency catalogue
- `cv_data.json` — identity positioning + structured fields
- `generate_core_cvs.js` — the `buildCV(variant, overrides)` function used by `cv-generator/execute.js`
- `generate-cover-letter.js` — the standalone cover letter writer

## Source-of-truth note

This folder is **a documentation snapshot**, not the executable source. The running prompts live in the JS files listed above. When BACKLOG #2 work lands (generic `content-writer` + `content-analyzer` with card support), this folder becomes the canonical config that the generic modules load. Until then, edit the JS files when you change a prompt and re-sync the markdown here, or vice versa with care.

## Pipeline architecture (intended end state, per BACKLOG #2)

- `content-analyzer` (generic Step 5) loads `job_analyzer_prompt.md` as its card, produces `analysis_json` per job
- `content-writer` (generic Step 5) loads `cover_letter_prompt.md` as its card, produces cover letter markdown
- `cv-generator` (or a Step 8 bundle module) composes CV DOCX from analysis + pre-approved variants
- DOCX bundling for cover letter happens in Step 8

The current specialized modules (`job-analyzer`, `cv-generator`) are scheduled to be permanently deleted once that flexibility work matures.
