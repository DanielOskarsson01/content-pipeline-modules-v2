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

All five Step 8 submodules use `requires_columns: []`, `item_key: "entity_name"`, `data_operation_default: "transform"`.

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
