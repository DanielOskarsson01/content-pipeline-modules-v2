# CLAUDE.md — Content Creation Tool v2 (Modules Repo)

## ⛔ STOP — READ THIS ENTIRE FILE BEFORE WRITING ANY CODE

This repo contains pluggable submodules for the Content Creation Tool. Each submodule is self-contained: manifest + execute function + optional React component.

---

## 🧭 How You Work

1. Read SUBMODULE_DEVELOPMENT.md in the skeleton repo specs/ before writing any module
2. Every module needs a valid manifest.json before an execute.js
3. Test manifests load correctly via the skeleton's auto-discovery before writing execution logic
4. One module at a time. Verify it works end-to-end before starting the next.

---

## 🚫 Rules

1. **NEVER import skeleton code.** Modules are standalone. No imports from content-pipeline-v2.
2. **NEVER access the database directly.** Use the tools object provided to execute().
3. **NEVER use raw fetch/axios.** Use tools.http for all HTTP requests.
4. **Each module folder is completely self-contained.**
5. **manifest.json is required.** No manifest = module doesn't exist.

---

## 📁 Folder Pattern

```
modules/
├── step-1-discovery/
│   ├── sitemap-parser/
│   │   ├── manifest.json     (required)
│   │   ├── execute.js        (required)
│   │   └── OptionsPanel.jsx  (optional — custom options UI)
│   └── rss-feeds/
│       ├── manifest.json
│       └── execute.js
├── step-2-validation/
│   └── url-filter/
│       ├── manifest.json
│       └── execute.js
└── ...
```

---

## 📋 manifest.json Required Fields

```json
{
  "id": "example-submodule",
  "name": "Example Submodule",
  "description": "One-line explanation of what this submodule does",
  "version": "1.0.0",
  "step": 1,
  "category": "example-category",
  "cost": "cheap",
  "data_operation_default": "transform",
  "requires_columns": ["website"],
  "item_key": "url",

  "options": [
    {
      "name": "max_results",
      "type": "number",
      "label": "Maximum Results",
      "default": 1000,
      "min": 1,
      "max": 50000
    }
  ],

  "options_defaults": {
    "max_results": 1000
  },

  "output_schema": {
    "display_type": "table",
    "url": "string (required)",
    "source": "string",
    "last_modified": "string (ISO date, if available)"
  }
}
```

**output_schema format:** Keys are field names, values are type strings. NOT a "fields" array. See SKELETON_SPEC_v2.md Part 11 for the full field reference.

---

## 🔄 execute.js Input Contract

```javascript
async function execute(input, options, tools) → results
```

**Step 1 modules** receive flat entities from user upload:
```javascript
input.entities = [
  { name: "Company A", website: "companya.com" },
  { name: "Company B", website: "companyb.com" }
]
```

**Step 2+ modules** receive entities enriched with `items` from the previous step's working pool:
```javascript
input.entities = [
  {
    name: "Company A",
    website: "companya.com",
    items: [
      { url: "https://companya.com/about", last_modified: "2024-01-01" },
      { url: "https://companya.com/products", last_modified: "2024-02-15" }
    ]
  }
]
```

Step 2+ modules process `entity.items`, NOT top-level entity fields. Always check for missing/empty `items` gracefully.

---

## CURRENT PHASE: Waiting for skeleton Phase 4 (auto-discovery) before building real modules.
