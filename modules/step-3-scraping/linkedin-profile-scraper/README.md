# LinkedIn Profile Scraper

> Scrape full LinkedIn personal profiles -- experience, education, skills, languages -- and produce structured biographical data for content generation.

**Module ID:** `linkedin-profile-scraper` | **Step:** 3 (Scraping) | **Category:** linkedin | **Cost:** expensive
**Version:** 1.0.0 | **Data Operation:** add (+)

---

## What This Module Does

This module takes LinkedIn profile URLs and extracts complete professional data -- full job descriptions with tasks and results, education history, skills, languages, and the About summary. The output feeds into downstream content generation (Step 4/5) to produce biographical articles, "People to Know" features, leadership spotlights, and "Key People" sections in company profiles.

The module uses **Playwright + Voyager API XHR interception** as its primary method. LinkedIn's frontend calls an internal REST API called Voyager to render profile pages. Instead of parsing the HTML (which LinkedIn changes every 2-4 weeks), we navigate to the profile with a real browser and intercept the structured JSON response that LinkedIn's own frontend fetches. This returns all profile data in a stable, structured format -- no CSS selectors to maintain.

When the primary method fails (expired session cookie, CAPTCHA, or LinkedIn rate limit), the module falls back to the **ScrapeLinkedIn API** ($0.01/profile) -- a paid service that uses its own AI agent to scrape profiles.

```
Seed CSV / linkedin-discovery (Step 1)
    ↓ entities with linkedin_url
linkedin-profile-scraper (this module)
    ↓ structured profile data
content-analyzer (Step 4) → content-writer (Step 5) → biographical articles
```

### How the Voyager Approach Works

1. Launch Playwright Chromium with a LinkedIn session cookie (`li_at`)
2. Navigate to `linkedin.com/in/{slug}/` -- just like a human clicking a profile
3. Intercept the XHR response from `voyager/api/identity/dash/profiles` -- the same JSON LinkedIn's frontend uses to render the page
4. Parse the flat `included` array of entities (Profile, Position, Education, Skill, Language, Certification) differentiated by `$type`
5. Rate limit to ~3 min between page loads (20/hour default) with random jitter

### Safety Features

**Session validation:** Before scraping, navigates to `/feed/` to verify the session cookie is active. If redirected to login, skips Voyager entirely and routes all profiles to the ScrapeLinkedIn fallback.

**Circuit breaker:** If 3 consecutive profiles fail via Voyager, the module stops browser scraping and queues all remaining profiles for the ScrapeLinkedIn fallback. Prevents burning time on a dead session.

**Completeness scoring:** Every scraped profile gets a 0-100 score based on which sections were captured. Profiles scoring below 50 are flagged as "incomplete" in the results.

## When to Use

**Always run when:**
- You have entities with `linkedin_url` fields (from seed CSV or linkedin-discovery)
- You need biographical data for content generation -- executive profiles, people directory, leadership spotlights
- You're building company profiles that need "Key People" sections

**Skip when:**
- Entities don't have LinkedIn profile URLs (this module requires `linkedin_url` column)
- You only need company-level data -- use the LinkedIn Company Scraper (B015) instead
- The `LINKEDIN_LI_AT` cookie has expired and you haven't refreshed it

**Tune the settings when:**
- Scraping more than 50 profiles -- consider lowering rate to 15/hr for safety
- Running during business hours on a shared LinkedIn account -- lower rate to 10/hr
- Budget is a concern -- disable `fallback_to_scrapelinkedin` to avoid paid API costs

## Options Guide

| Option | Default | When to Change | What It Does |
|--------|---------|----------------|--------------|
| `requests_per_hour` | 20 | Lower to 10-15 if LinkedIn shows warnings; raise to 30-40 for faster throughput (riskier) | Minimum time between page loads. 20/hr = ~3 min between profiles. LinkedIn may flag accounts above 50/hr |
| `mode` | `bio` | Switch to `company_people` when entities are companies with employee links from B015 | `bio` = entity is a person, scrape their profile. `company_people` = entity is a company, scrape employee profiles from employee link arrays |
| `max_profiles_per_entity` | 5 | Raise to 10-15 for comprehensive company coverage; lower to 2-3 for quick executive-only scraping | Only used in `company_people` mode. Limits how many employee profiles to scrape per company entity |
| `fallback_to_scrapelinkedin` | true | Disable if you don't have API credits or prefer to retry later with a fresh session | When Voyager fails for a profile, tries ScrapeLinkedIn API ($0.01/profile). Requires `SCRAPELINKEDIN_API_KEY` env var |

**Most impactful option:** `requests_per_hour` directly controls throughput vs. detection risk. At 20/hr, a batch of 100 profiles takes ~5 hours. At 40/hr it takes ~2.5 hours but increases the chance of LinkedIn flagging the account.

## Recommended Configurations

### Standard (Bio Mode)
For scraping a curated list of iGaming executives:
```
requests_per_hour: 20
mode: bio
max_profiles_per_entity: 5
fallback_to_scrapelinkedin: true
```

### Conservative
When using a personal LinkedIn account or scraping during business hours:
```
requests_per_hour: 10
mode: bio
max_profiles_per_entity: 5
fallback_to_scrapelinkedin: true
```

### Fast Batch
When using a dedicated scraping account and need results quickly:
```
requests_per_hour: 40
mode: bio
max_profiles_per_entity: 5
fallback_to_scrapelinkedin: true
```

### Company People
When enriching company profiles with executive bios (entities are companies with B015 employee links):
```
requests_per_hour: 20
mode: company_people
max_profiles_per_entity: 5
fallback_to_scrapelinkedin: true
```

### No-Cost Only
When ScrapeLinkedIn credits are unavailable or you want zero spend:
```
requests_per_hour: 20
mode: bio
max_profiles_per_entity: 5
fallback_to_scrapelinkedin: false
```

## What Good Output Looks Like

**Healthy result for a well-populated profile:**
- `completeness_score`: 80-100
- `experience_count`: 5-15 positions with full descriptions
- `education_count`: 2-4 entries
- `skills_count`: 10-50
- `scrape_method`: `voyager` (primary method succeeded)
- `status`: `success`

**Output fields:**
- `linkedin_url` -- the profile URL (unique key)
- `full_name` -- first and last name from profile
- `headline` -- LinkedIn headline text
- `location` -- resolved geographic location (e.g., "Stockholm, Stockholm County, Sweden")
- `summary` -- full About section text
- `experience_count` -- number of positions captured
- `experience_text` -- formatted text of all positions with dates and descriptions
- `education_count` -- number of education entries
- `education_text` -- formatted education entries
- `skills_count` -- number of skills captured
- `skills_text` -- comma-separated skills list
- `languages_text` -- comma-separated languages (if available in profile)
- `certifications_text` -- comma-separated certifications
- `completeness_score` -- 0-100 quality score
- `scrape_method` -- `voyager` (primary) or `scrapelinkedin` (fallback)
- `status` -- `success`, `incomplete` (score < 50), or `error`
- `positions` -- structured array of position objects (for downstream content generation)
- `education` -- structured array of education objects
- `skills`, `languages`, `certifications` -- arrays for downstream use

**Warning signs:**
- `voyager_status: "session_expired"` in summary -- refresh the `LINKEDIN_LI_AT` cookie. Log into LinkedIn in Chrome, open DevTools (F12), go to Application → Cookies, copy `li_at` value, update the env var
- All profiles showing `scrape_method: "scrapelinkedin"` -- Voyager failed completely, likely expired cookie
- `completeness_score` below 50 on multiple profiles -- either profiles are genuinely thin, or the scraper is being blocked
- `status: "error"` with "Voyager API response not intercepted" -- LinkedIn page didn't trigger the expected API call. May indicate a page structure change

## Cost

**Primary method (Playwright + Voyager):** Free. Uses an authenticated session cookie -- no API charges. Only cost is compute time (~5 seconds per profile for browser navigation).

**Fallback (ScrapeLinkedIn API):** $0.01 per profile ($10 per 1,000). Only used when Voyager fails. Expected fallback rate is <5% under normal conditions (healthy session, reasonable rate).

**Throughput:**
| Rate | Profiles/Hour | Profiles/Day | 100 Profiles |
|------|---------------|--------------|--------------|
| 10/hr (conservative) | 10 | 240 | ~10 hours |
| 20/hr (default) | 20 | 480 | ~5 hours |
| 40/hr (fast) | 40 | 960 | ~2.5 hours |

## Limitations

- **Requires manual cookie setup** -- `li_at` must be extracted from browser DevTools and set as `LINKEDIN_LI_AT` env var. Cookie lasts 3-12 months but must be refreshed manually when expired
- **One profile at a time** -- no concurrency. LinkedIn tracks page loads and concurrent sessions look suspicious
- **Rate limited by design** -- 20 profiles/hour is intentionally slow. Faster rates risk account restrictions
- **Languages may not be captured** -- some Voyager API decorations don't include language entities. Depends on LinkedIn's current response format
- **Private profiles** -- returns empty positions/education. Marked as `status: "incomplete"` with low completeness score
- **ScrapeLinkedIn fallback is non-deterministic** -- uses an AI agent that sometimes misses sections. Known to return incomplete data (tested: 1 of 6 roles for Max Drebov)
- **Company_people mode depends on upstream** -- requires employee profile URLs from B015 company scraper or seed CSV with employee links
- **Playwright must be installed** -- requires `playwright` npm package and Chromium browser (`npx playwright install chromium --with-deps`)
- **GDPR consideration** -- profiles of public figures (CEOs, founders) fall under Legitimate Interest. Published content should include an attribution link back to the LinkedIn profile (stored in `linkedin_url`)

## What Happens Next

The structured profile data flows into **Step 4 (content-analyzer)** which assesses the data quality and prepares it for generation. Then **Step 5 (content-writer)** transforms the raw profile data into polished biographical content -- articles, leadership spotlights, "People to Know" features, or "Key People" sections in company profiles.

The `positions` and `education` arrays provide structured data that content-writer can selectively emphasize -- e.g., highlighting iGaming-relevant roles, recent positions, or notable companies. The `experience_text` and `education_text` fields provide pre-formatted text that can be used directly or as source material.

For company profiles, executive data from this module populates the "Key People" section, giving readers context about leadership background and career trajectory.

## Technical Reference

- **Step:** 3 (Scraping)
- **Category:** linkedin
- **Cost:** expensive -- 30 min timeout, 1 retry, low BullMQ priority
- **Data operation:** add (+) -- produces new profile items from entity URLs
- **Required input columns:** `linkedin_url`
- **Depends on:** none (runs independently in Step 3, alongside other scrapers)
- **Input:** `input.entities[]` with `linkedin_url` field
- **Output:** `{ results[], summary }` grouped by entity_name
- **Selectable:** false -- all profiles are generally wanted
- **Detail view:** header (linkedin_url as link, full_name, headline, location, status badge, completeness_score, scrape_method) + sections (About, Experience, Education, Skills as prose)
- **Error handling:** session pre-check → per-profile Voyager with circuit breaker (3 failures) → ScrapeLinkedIn fallback → error. Partial success supported
- **External dependencies:** `playwright` (browser automation), `tools.http` (ScrapeLinkedIn API calls), `tools.logger`, `tools.progress`, `tools._partialItems`
- **Environment variables:** `LINKEDIN_LI_AT` (required), `SCRAPELINKEDIN_API_KEY` (optional, for fallback)
