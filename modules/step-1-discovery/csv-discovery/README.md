# CSV Discovery

> Imports items from CSV or XLSX files -- uploaded directly or read from a local directory. Maps columns to standard pipeline format and feeds items into the pipeline without re-running discovery.

**Module ID:** `csv-discovery` | **Step:** 1 (Discovery) | **Category:** search | **Cost:** cheap
**Version:** 1.0.0 | **Data Operation:** transform (=)

---

## What This Module Does

CSV Discovery reads structured data files (CSV, XLSX, XLS) and converts them into pipeline items. It's the primary way to bring external data into the pipeline -- LinkedIn job exports, company lists, spreadsheets from colleagues, or output from external scripts.

The module supports two input methods:

- **File upload** -- drag and drop CSV/XLSX files directly in the UI. XLSX files are auto-converted to CSV on upload.
- **Source directory** -- point to a folder on the server where external tools drop CSV files on a schedule.

Both methods can be used simultaneously. Files from both sources are combined and deduplicated by `externalId`.

```
CSV/XLSX files -> csv-discovery (Step 1) -> url-relevance (Step 2) -> scrapers (Step 3) -> ...
```

### Entity Production

When `entity_production` is enabled, each approved item becomes its own entity for downstream steps. This is how imported job listings become individual entities -- each with its own URL to scrape, its own analysis, and its own CV.

The `entity_name_template` option controls naming using `{field}` placeholders. Entity production is handled by the skeleton at approval time.

### Column Mapping

The `column_map` option maps your CSV column headers to standard pipeline fields. The module lowercases all column headers before matching, so `"Company Name"` and `"company name"` both work. The skeleton also applies column aliases (see Technical Reference), so common variations like `"website"`, `"domain"`, `"company url"` are automatically resolved.

### Delimiter Detection

The CSV parser auto-detects whether a file uses commas or semicolons as delimiters by counting occurrences in the header line. European CSV exports that use semicolons work automatically.

## When to Use

**Always run when:**
- You have a spreadsheet or CSV with items to process (job listings, company lists, URL lists)
- External tools export discovery results as CSV files
- You want to combine uploaded data with API search results in a single pipeline run

**Skip when:**
- You're discovering items from APIs (use api-search instead)
- You're entering URLs manually (use URL seed input instead)

**Tune the settings when:**
- Your CSV has non-standard column headers -- configure `column_map`
- Running the same files repeatedly -- enable `skip_processed` to avoid re-importing
- Each row should become its own entity downstream -- enable `entity_production`

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `upload_dir` | (set by UI) | Used automatically when files are uploaded via the UI | Directory where uploaded files are stored. XLSX files are auto-converted to CSV |
| `source_dir` | (empty) | Set to a server path when external tools drop CSV files on a schedule | Absolute path to folder containing CSV files. Leave empty if using upload only |
| `file_pattern` | `*.csv` | Change to `jobs-*.csv` to match specific filenames, or `*.xlsx` for Excel files | Glob pattern for filenames to process |
| `column_map` | see below | Change when your CSV columns don't match the defaults (e.g. `"job_url"` instead of `"url"`) | Maps pipeline field names to CSV column headers |
| `source_label` | `linkedin` | Set to describe the data source -- `"adzuna"`, `"manual"`, `"company-list"` | Value for the `source` field on output items. Used in externalId prefix |
| `skip_processed` | `true` | Set to `false` to re-import all files every run (useful during development) | Tracks which files have been read via a `.processed` file in the source directory |
| `exclude_keywords` | `[]` | Add terms like `["intern", "junior"]` to filter unwanted items by title | Items whose title contains any of these terms (case-insensitive) are silently dropped |
| `entity_production` | `false` | Enable when each imported row should become its own entity for downstream steps | Each approved item becomes a separate entity for Step 2+ (scraping, analysis, writing) |
| `entity_name_template` | `"{title} - {company}"` | Adjust to `"{title}"` or `"{company} - {title}"` depending on what makes sense in the UI | How to name produced entities. Only used when entity_production is enabled |

### Default column_map

```json
{
  "url": "url",
  "title": "title",
  "company": "company",
  "location": "location",
  "snippet": "snippet",
  "postedAt": "posted_date",
  "externalId": "url"
}
```

Left side = pipeline field name. Right side = CSV column header (case-insensitive). Change the right side to match your CSV.

## Recommended Configurations

### LinkedIn Job Export
Standard configuration for LinkedIn job CSV exports:
```
source_label: linkedin
column_map: {"url": "url", "title": "title", "company": "company", "location": "location", "snippet": "snippet", "postedAt": "posted_date", "externalId": "url"}
skip_processed: true
exclude_keywords: ["intern", "junior", "student"]
entity_production: true
entity_name_template: "{title} - {company}"
```

### Company List Import
Importing a spreadsheet of companies for research:
```
source_label: manual
column_map: {"url": "website", "title": "company_name", "company": "company_name", "location": "hq_location", "externalId": "company_name"}
skip_processed: true
exclude_keywords: []
entity_production: false
```

### Recurring External Automation
External script drops CSV files into a server directory daily:
```
source_dir: /opt/discovery/daily-jobs
file_pattern: jobs-*.csv
source_label: automation
skip_processed: true
exclude_keywords: []
entity_production: true
entity_name_template: "{title} - {company}"
```

### Development / Re-Import
Re-process all files during testing:
```
skip_processed: false
source_label: test
exclude_keywords: []
entity_production: false
```

## What Good Output Looks Like

**Healthy result:**
- Items match the number of rows in your CSV (minus duplicates and excluded keywords)
- Every item has a `url`, `title`, and `externalId`
- Summary shows files read and items imported

**Output fields:**

| Field | Description |
|-------|-------------|
| `title` | Item title from the mapped CSV column |
| `company` | Company name from the mapped column |
| `location` | Location from the mapped column |
| `url` | URL for downstream scraping |
| `source` | The `source_label` value (e.g. `linkedin`) |
| `externalId` | Source-prefixed unique ID for deduplication (LinkedIn numeric IDs are extracted from URLs) |
| `snippet` | First 200 characters of the description column |
| `text_content` | Full description text if > 200 chars |
| `postedAt` | Date from the mapped column |
| `status` | Always `success` for imported items |

**Warning signs:**
- 0 items from a file with many rows -- check `column_map`. If the `url` column can't be found, rows are silently skipped
- All items missing titles or companies -- column headers don't match the map. Check case and exact spelling
- "No new files" when you expect results -- files were already processed. Set `skip_processed: false` or delete the `.processed` file in the source directory
- Duplicate `externalId` warnings -- same items appearing in multiple files. This is expected and handled by dedup

## Limitations

- **No network I/O** -- reads files from local disk only. Cannot fetch CSVs from URLs
- **BOM handling** -- automatically strips UTF-8 BOM markers, but other encodings (UTF-16, Latin-1) may cause issues
- **Flat structure only** -- CSV rows are treated as flat key-value pairs. Nested JSON columns are read as strings
- **Entity-agnostic** -- all entities receive the same items. CSV data isn't split by entity (unlike api-search which searches per-entity)
- **XLSX conversion** -- happens at upload time in the skeleton, not in this module. The module reads the resulting CSV
- **LinkedIn externalId extraction** -- specifically parses LinkedIn job URL format (`/jobs/view/1234567890`). Other URL formats use the full URL as ID

## What Happens Next

Imported items flow into **Step 2 (Validation)** where they can be filtered by URL patterns or classified by an LLM. When `entity_production` is enabled, each approved item becomes its own entity -- subsequent steps process each independently (scraping the job page, analyzing the listing, generating a CV).

The `source` field tracks data origin throughout the pipeline, so downstream modules and reports can distinguish items imported from CSV versus discovered via API.

## Technical Reference

- **Step:** 1 (Discovery)
- **Category:** search
- **Cost:** cheap -- no network I/O, pure file reading
- **Data operation:** transform (=) -- CSV rows converted to pipeline items
- **Required input columns:** `name` (entity name, enforced by skeleton)
- **Depends on:** nothing (first in pipeline)
- **Input:** `input.entities[]` with entity names. CSV data comes from files, not entities
- **Output:** `{ results[], summary }` where results are grouped by entity_name. All entities receive the same items
- **Selectable:** items are selectable in the UI for review before approval
- **Error handling:** Per-file errors are caught and logged; other files continue. Missing directories produce an error result. Partial results saved after each file for timeout resilience
- **External dependencies:** Node.js `fs` and `path` (built-in). No npm packages
- **Column aliases:** The skeleton applies aliases before this module runs -- `"company name"`, `"brand"`, `"operator"` all resolve to `name`; `"website"`, `"domain"`, `"homepage"` resolve to `website`
- **Files:** `manifest.json`, `execute.js`
