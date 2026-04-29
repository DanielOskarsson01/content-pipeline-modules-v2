# CSV Discovery

**Step 1 — Discovery** | Cost: cheap (no network I/O)

Imports items from CSV files dropped into a local directory by external tools (Cowork daily automation, cron scripts, manual exports). Maps CSV columns to standard pipeline item format.

---

## Use Case

External tools discover jobs/URLs on a schedule and save results as CSV. This submodule reads those CSVs and feeds them into the pipeline without re-running the discovery.

**Primary integration:** Cowork → LinkedIn job search → CSV → Pipeline → Job Analyzer → CV Generator

---

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `source_dir` | text | (required) | Absolute path to folder containing CSVs |
| `file_pattern` | text | `jobs-*.csv` | Glob pattern for filenames to process |
| `column_map` | json | see below | Maps pipeline fields to CSV column headers |
| `source_label` | text | `linkedin` | Value for `source` field on output items |
| `skip_processed` | boolean | `true` | Skip files already read in previous runs |
| `exclude_keywords` | json | `[]` | Filter out items whose title contains these |

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

---

## Output

Standard pipeline items:

```json
{
  "url": "https://linkedin.com/jobs/view/1234567890",
  "title": "Head of Marketing",
  "company": "Betsson Group",
  "location": "Malta",
  "snippet": "First 200 chars...",
  "text_content": "Full description if > 200 chars",
  "postedAt": "2026-04-29",
  "externalId": "linkedin-1234567890",
  "source": "linkedin",
  "status": "success"
}
```

---

## Dedup & Processing Tracking

- **Within-run dedup:** by `externalId` (LinkedIn numeric job ID extracted from URL)
- **Cross-run dedup:** `.processed` file in source_dir tracks which CSVs have been read
- Set `skip_processed: false` to re-read all files every run

---

## Integration with Job Search Template

Add to template's `submodules_per_step["1"]` alongside `api-search`:

```json
{
  "submodules_per_step": {
    "1": ["api-search", "csv-discovery"]
  }
}
```

Configure in `preset_map`:

```json
{
  "csv-discovery": {
    "source_dir": "/opt/discovery/daily-jobs",
    "source_label": "linkedin",
    "exclude_keywords": ["intern", "junior", "assistant"]
  }
}
```
