# job-analyzer — CLAUDE.md

## Module identity

- **ID:** job-analyzer
- **Step:** 5 (Generation)
- **Template:** Job Search
- **Data operation:** add (Step 5+ must always use add)

## Rules

1. Uses `tools.ai.complete()` for LLM calls — never import Anthropic SDK directly
2. Returns errors as items with error field, does not throw
3. System + user prompt combined into single prompt (ai.complete limitation)
4. All CV text in output must come from pre-approved source files — the AI selects, it does not invent
5. Em dashes and en dashes sanitized to hyphens in all output
6. Entity must have adText or items with text_content — logs error and skips if missing

## Options contract

- `ai_model`: string — model name passed to ai.complete
- `cv_source_dir`: string — absolute path to CV source files
- `temperature`: number — LLM temperature (unused currently; ai.complete doesn't expose it)

## Data flow

- Reads: entity.adText (Phase 1) or entity.items[].text_content (Phase 2+)
- Writes: analysis JSON with fit_score, base_variant, cv selections, suggestions, gaps
- The analysis output is consumed by cv-generator and cover-letter-gen modules
