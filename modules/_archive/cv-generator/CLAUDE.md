# cv-generator — CLAUDE.md

## Module identity

- **ID:** cv-generator
- **Step:** 5 (Generation)
- **Template:** Job Search
- **Data operation:** add (Step 5+ must always use add)
- **Depends on:** job-analyzer (needs analysis output)

## Rules

1. Uses `docx` npm package for suggestions DOCX — never import other DOCX libraries
2. Uses `generate_core_cvs.js` buildCV() for CV DOCX — loaded from cv_source_dir at runtime
3. Returns errors as items with error field, does not throw
4. File output goes to output_dir — returns absolute paths in items
5. The module does NOT modify analysis data — it reads and produces files
6. Each entity gets its own set of files (CV + suggestions + JSON)

## Options contract

- `cv_source_dir`: string — path to CV source files and generate_core_cvs.js
- `output_dir`: string — path for generated files

## Data flow

- Reads: entity.analysis (from job-analyzer) or entity.items[].analysis
- Writes: DOCX files to output_dir, returns file paths in items
- Files: CV_Daniel_Oskarsson_{company}_tailored.docx, SUGGESTIONS_{company}.docx, RESPONSE_{company}.json
