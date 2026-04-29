When modifying this submodule — fixing bugs, changing logic, adjusting options, altering output schema — update README.md to reflect the changes. The README is the contract operators and downstream modules rely on. Stale docs are worse than no docs.

## Module-Specific Notes

- **Three modes**: `bio` (scrape personal profiles, ADD), `company_people` (scrape employee profiles, ADD), `job_description` (enrich pool items with full LinkedIn job text, TRANSFORM).
- **CDP connection**: Uses Playwright `chromium.connectOverCDP()` to connect to a running Chrome instance at `LINKEDIN_CDP_URL` (default `http://localhost:9222`). Chrome must be pre-authenticated with LinkedIn — the module does NOT handle login.
- **Voyager API**: Calls LinkedIn's internal Voyager REST API from within the browser context. Profile modes use `/voyager/api/identity/dash/profiles`. Job mode uses `/voyager/api/jobs/jobPostings/{jobId}`.
- **Rate limiting**: `requests_per_hour` option (default 20) — LinkedIn is aggressive about detecting automation. Keep this low.
- **Job mode input**: Reads pool items from `entity.items[]` — only processes items whose `url` contains `linkedin.com/jobs/view/`. Non-LinkedIn items pass through unchanged.
- **Job mode output**: Enriches existing items with `text_content` (full description), `workplace_type`, `employment_type`, `seniority_level`, `industries`, `job_functions`. Also updates `title`/`company`/`location` from Voyager if available.
- **Profile fallback**: ScrapeLinkedIn API ($0.01/profile) when `fallback_to_scrapelinkedin` is enabled. Only applies to bio/company_people modes.
- **Environment vars**: `LINKEDIN_CDP_URL` (Chrome CDP endpoint), `SCRAPELINKEDIN_API_KEY` (profile fallback API key).
