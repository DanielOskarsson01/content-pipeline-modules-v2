When modifying this submodule — fixing bugs, changing logic, adjusting options, altering output schema — update README.md to reflect the changes. The README is the contract operators and downstream modules rely on. Stale docs are worse than no docs.

## Module-Specific Notes

- **Three modes**: `bio` (scrape personal profiles, ADD), `company_people` (scrape employee profiles, ADD), `job_description` (enrich pool items with full LinkedIn job text, TRANSFORM).
- **Profile API delegation**: All modes call the LinkedIn Profile API at `localhost:3847` (managed by PM2 as `profile-api`). The profile-api handles CDP connection, session management, Chrome auto-recovery, and Voyager API calls. This submodule is a thin HTTP client.
- **Profile API endpoints**: `GET /api/profile/:slug` (profiles), `GET /api/job/:jobId` (job descriptions), `GET /api/health` (session check). Requires `x-api-key` header.
- **Rate limiting**: `requests_per_hour` option (default 20) — controls pacing between API calls. The profile-api has its own rate limit (30/min per key) but the submodule rate is the LinkedIn-safe throttle.
- **Job mode input**: Reads pool items from `entity.items[]` — only processes items whose `url` contains `linkedin.com/jobs/view/`. Non-LinkedIn items pass through unchanged.
- **Job mode output**: Enriches existing items with `text_content` (full description), `workplace_type`, `employment_type`, `seniority_level`, `industries`, `job_functions`. Also updates `title`/`company`/`location` from Voyager if available.
- **Profile fallback**: ScrapeLinkedIn API ($0.01/profile) when `fallback_to_scrapelinkedin` is enabled. Only applies to bio/company_people modes.
- **Environment vars**: `LINKEDIN_API_URL` (Profile API base URL, default `http://localhost:3847`), `LINKEDIN_API_KEY` (API key, default `oig-pipeline-2026`), `SCRAPELINKEDIN_API_KEY` (profile fallback API key).
