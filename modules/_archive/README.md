# Archived Modules

Modules here are **excluded from the manifest loader scan** — the loader only reads `modules/step-N-name/` directories (regex `^step-\d+-` in [moduleLoader.js:69](../../../content-pipeline-v2/server/services/moduleLoader.js#L69)).

These modules represent an **earlier architectural approach being actively replaced**, not dormant code preserved for revival. The pipeline is moving toward a small number of generic, configurable modules (content-analyzer, content-writer, etc.) that handle any content type via cards — not specialized modules per content type. When the flexibility work in those generic modules matures (configurable analysis dimensions, reference doc loading, variant selection per card), modules in this folder get **deleted permanently**. They are kept in version control only as a historical reference for what the old approach looked like, and so anyone who happens upon a stray import or reference can trace it back.

If you find yourself wanting to "revive" something from here, the right move is almost certainly to add a card to an existing generic module instead. See `BACKLOG.md` item B-001 (Content-analyzer / content-writer flexibility for multi-content-type support).

## Currently archived

### `cv-generator` (archived 2026-05-23, originally added 2026-04-22 in commit `49a794d`)

**Why archived:** Two reasons.

1. **Specialized-per-content-type pattern is being replaced.** A dedicated module for "CV writing" represents the old approach. The new direction is a configurable `content-writer` whose cards carry CV-specific prompts, reference docs (CV source files), and variant selection — same module, different configuration.
2. **Violates Step 5 / Step 8 boundary.** `cv-generator` did both Step 5 work (content writing logic) *and* Step 8 work (DOCX file production via the `docx` npm package). The pipeline cleanly separates content generation (Step 5, format-agnostic markdown/JSON/structured fields) from content bundling (Step 8, format-specific output via templates). DOCX output belongs in a Step 8 bundle module driven by a template — not inside the writer.

**What it did:** Generated a tailored CV DOCX from `job-analyzer` output, using `generate_core_cvs.js buildCV()` with variant selection and overrides. 310 lines. Dependencies: `docx` npm package, CV source directory containing structured CV data.

**Historical use:** Ran in production on 2026-04-28 (Job Search E2E test, produced 2.6 MB CV DOCX in 1.7s). That run validated the *concept* of CV-tailored output but the *implementation* was the wrong architectural shape.

**When it goes away permanently:** When `content-writer` flexibility (reference doc loading, variant selection per card) matures and DOCX bundling exists at Step 8 as a template-driven option.

### `job-analyzer` (archived 2026-05-23, originally added 2026-04-22 in commit `49a794d`)

**Why archived:** Same specialized-module pattern. Job-vs-CV fit analysis is just one configuration of "comparison-based content analysis" — it belongs as a card of `content-analyzer` with a configurable analysis dimension (fit-scoring, comparison reference docs), not as a dedicated module.

**What it did:** 5-layer analysis of a job ad against CV content. Produced fit score, variant selection, suggestions, and gap identification. 402 lines. Dependencies: CV source directory, Anthropic API.

**Historical use:** Ran in production on 2026-04-28 (Job Search E2E test, fit score 78, CEO variant, 31.8 K tokens, 114 s). The 5-layer analysis approach is valuable; the dedicated-module packaging is not.

**When it goes away permanently:** When `content-analyzer` supports configurable analysis dimensions per card (so fit-scoring, structural analysis, comparison-based analysis, etc. are all the same module configured differently).
