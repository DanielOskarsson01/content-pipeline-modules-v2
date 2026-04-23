When modifying this submodule — fixing bugs, changing logic, adjusting options, altering output schema — update README.md to reflect the changes. The README is the contract operators and downstream modules rely on. Stale docs are worse than no docs.

## Module-Specific Notes

- **CDP connection**: Uses Playwright `chromium.connectOverCDP()` to connect to a running Chrome instance at `LINKEDIN_CDP_URL` (default `http://localhost:9222`). Chrome must be pre-authenticated with LinkedIn — the module does NOT handle login.
- **Voyager API**: Calls LinkedIn's internal Voyager REST API from within the browser context. If Voyager fails, falls back to ScrapeLinkedIn API ($0.01/profile) when `fallback_to_scrapelinkedin` is enabled.
- **Rate limiting**: `requests_per_hour` option (default 20) — LinkedIn is aggressive about detecting automation. Keep this low.
- **Data operation**: ADD (+) — produces new profile items from entity `linkedin` or `linkedin_url` field. Does not transform existing pool items.
- **Options**: `requests_per_hour` (20), `mode` ('bio'), `max_profiles_per_entity` (5), `fallback_to_scrapelinkedin` (true).
- **Environment vars**: `LINKEDIN_CDP_URL` (Chrome CDP endpoint), `SCRAPELINKEDIN_API_KEY` (fallback API key).
