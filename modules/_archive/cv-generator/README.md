# CV Generator

Step 5 generation submodule for the Job Search template.

## What it does

Generates a tailored CV DOCX file from the job-analyzer's analysis output. Uses the pre-existing `generate_core_cvs.js` buildCV function with variant selection and content overrides. Also generates a suggestions DOCX documenting the analysis findings and improvement recommendations.

## Dependencies

- `docx` npm package (for suggestions DOCX)
- `generate_core_cvs.js` from CV source directory (for CV DOCX)

## Input requirements

The entity must have an `analysis` object from the job-analyzer, containing:
- `base_variant` — which CV variant to use
- `cv` — content selections (summary, highlights, competencies, jobs, otherExp)
- `job_analysis` — 5-layer analysis results
- `suggestions` — improvement recommendations
- `gaps` — identified content gaps

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cv_source_dir` | text | (local path) | Path to CV source files and generate_core_cvs.js. |
| `output_dir` | text | `/tmp/job-search-output` | Directory for generated DOCX files. |

## Output

Per entity:
- `cv_file` — absolute path to generated CV DOCX
- `suggestions_file` — absolute path to suggestions DOCX
- `response_file` — absolute path to raw analysis JSON
- `variant` — which CV variant was used
- `fit_score` — from the analysis

## Known issues

- File output goes to filesystem, not Supabase storage (Phase 3: migrate to proper file handling)
- generate_core_cvs.js loaded via filesystem require (Phase 3: migrate into module assets)
- Cover letter generation is in a separate module (cover-letter-gen, Phase 3)
