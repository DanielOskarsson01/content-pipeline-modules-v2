# Submodule Research Brief: LinkedIn Company Scraper

**Step:** 3 — Scraping
**One-line purpose:** Fetch structured company data from LinkedIn company pages via Bright Data's LinkedIn Company Information API.

---

### What goes in?

Entity with `linkedin` field (URL to LinkedIn company page, e.g., `https://www.linkedin.com/company/betsson-group`). Set by Step 1 discovery (linkedin-discovery submodule or seed CSV column).

### What comes out?

Structured company profile data. Items: `about`, `specialties`, `company_size`, `organization_type`, `industries`, `founded`, `headquarters`, `funding`, `employees_sample`, `similar_companies`, `recent_posts`, `followers`, `slogan`, `logo_url`, `website`.

### Approach

1. **Input validation:** Check entity has `linkedin` field with a `/company/` URL. Skip entities with personal profile URLs (`/in/`) — those need a different scraper.
2. **API call:** POST to Bright Data's LinkedIn Company Information dataset (`gd_l1viktl72bvl7bjuj0` or company-specific dataset ID). Use synchronous mode for small batches, async for large runs.
3. **Parse response:** Extract structured fields from the JSON response. Bright Data returns: `name`, `about`, `specialties`, `company_size`, `organization_type`, `industries`, `website`, `founded`, `headquarters`, `funding`, `employees` (sample), `similar` (competitors), `updates` (recent posts), `followers`, `logo`, `image`, `slogan`, `locations`.
4. **Normalize:** Map Bright Data fields to pipeline-standard item schema. Flatten nested objects where needed (e.g., `funding.last_round_raised` → `funding_last_round`).
5. **Extract recent posts:** Bright Data returns ~10 recent LinkedIn posts with full text, images, dates, and engagement counts. Store as separate items tagged `source_type: "linkedin_post"` — useful for content-analyzer to gauge company tone/activity.
6. **Extract similar companies:** The `similar` array contains competitor names and LinkedIn URLs. Store as items tagged `source_type: "linkedin_similar"` — can feed back into Step 1 for discovery expansion.
7. **Extract employee sample:** Store top employees (names, titles, profile links) as `source_type: "linkedin_employee"` items — useful for company profile generation (key people section).

### External Dependencies

- **Bright Data LinkedIn Company Information API** — $1.50/1,000 records (pay-as-you-go). API key via `BRIGHTDATA_API_KEY` env var.
- No Playwright/browser needed — Bright Data handles the scraping infrastructure.
- No proxy needed — Bright Data manages proxy rotation internally.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `include_posts` | boolean | `true` | Include recent LinkedIn posts in output |
| `include_similar` | boolean | `true` | Include similar companies in output |
| `include_employees` | boolean | `true` | Include employee sample in output |
| `max_posts` | number | `10` | Maximum number of recent posts to include |

### Edge Cases and Failure Modes

- **Company page doesn't exist** → Bright Data returns `error: "4XX page - dead page"`. Mark item as `status: "dead_link"` and continue. (Observed with `cherry-ab` — URL may have changed.)
- **Company page redirects** → Bright Data follows redirects; check if `url` in response differs from input URL.
- **Rate limiting** → Bright Data handles rate limits internally. For large batches (500+), use async mode to avoid timeout.
- **Missing fields** → Some companies have sparse profiles (no funding, no specialties). Return what's available, don't fail.
- **UTF-8 encoding issues** → Bright Data returns Unicode characters for non-ASCII names (e.g., "Taʼ Xbiex"). Preserve as-is; downstream modules handle encoding.
- **Personal profile URL passed in** → Detect `/in/` in URL, skip with warning. Personal profiles return null for most fields — not useful.

### Why Bright Data Instead of Direct Scraping?

Direct scraping (HTTP, Playwright, ScrapFly) all hit LinkedIn's auth wall for company pages. Even with stealth plugins and JS rendering, LinkedIn masks data server-side and requires login for full content. Bright Data's dedicated LinkedIn dataset bypasses this by maintaining authenticated sessions at scale. At $1.50/1,000 records, the cost is negligible (~$1.80 for our full iGaming database of ~1,200 companies).

### Example Output

```javascript
{
  entity_name: "Betsson Group",
  items: [
    {
      source_type: "linkedin_company",
      name: "Betsson Group",
      about: "From a single slot machine in 1963 to a Nasdaq Stockholm-listed organisation...",
      specialties: "Technology, Sport, Casino, Online, Marketing, and Customer Service",
      company_size: "1,001-5,000 employees",
      organization_type: "Public Company",
      industries: "Entertainment Providers",
      founded: 1963,
      headquarters: "Ta' Xbiex",
      country_code: "MT",
      website: "https://www.betssongroup.com/",
      slogan: "A Game Changing Employee Experience",
      followers: 259795,
      employees_in_linkedin: 2699,
      funding_rounds: 2,
      funding_last_round: "US$ 80.4M",
      funding_last_type: "Post IPO debt",
      logo_url: "https://media.licdn.com/dms/image/...",
      linkedin_url: "https://www.linkedin.com/company/betsson-group",
      crunchbase_url: "https://www.crunchbase.com/organization/betsson-6165"
    },
    {
      source_type: "linkedin_post",
      title: "Italian Gaming Awards 2026",
      text: "We're proud to announce that Betsson Group has been recognised with three awards...",
      date: "2026-04-15T17:41:28.975Z",
      likes_count: 44,
      comments_count: 1,
      post_url: "https://www.linkedin.com/posts/betsson-group_betssongroup-..."
    },
    {
      source_type: "linkedin_similar",
      name: "bet365",
      linkedin_url: "https://uk.linkedin.com/company/bet365",
      industry: "Gambling Facilities and Casinos",
      location: "Stoke-on-Trent, Staffordshire"
    },
    {
      source_type: "linkedin_employee",
      name: "Martin Öhman",
      title: "CFO",
      linkedin_url: "https://se.linkedin.com/in/martin-öhman-93a29a",
      followers: 902
    }
  ],
  meta: {
    api_provider: "brightdata",
    posts_count: 10,
    similar_count: 10,
    employees_count: 4,
    cost_usd: 0.0015
  }
}
```

### Enrichment Loop (Second Pass for Thin Content)

Companies with small websites may have richer content on LinkedIn than on their own site. When Step 6 QA detects shallow content (e.g., < 500 words, few citations), `loop-router` (Step 7) can route the entity back for a second scraping round focused on LinkedIn post history.

**Second-pass strategy:**
1. QA flags entity as `needs_enrichment` (thin content)
2. Loop-router sends entity back to Step 1/3
3. **LinkedIn posts scraper** — use Bright Data's dedicated [LinkedIn Posts Scraper](https://brightdata.com/products/web-scraper/linkedin/post) ($1.50/1K posts) to fetch deeper post history beyond the ~10 included in the company scrape. Requires individual post URLs — these can be extracted from the company activity feed.
4. **News search** — `google-pse-news` (Step 1) discovers recent news articles about the company
5. Steps 4-6 re-run with the enriched content pool

This second pass only runs for flagged entities, not the full database — keeping costs minimal. The company scraper's initial ~10 posts are sufficient for the first pass; the dedicated posts endpoint is reserved for enrichment.

### Relationship to Other Submodules

- **Upstream:** `linkedin-discovery` (Step 1) provides the `linkedin` URL on each entity.
- **Downstream:** `content-analyzer` (Step 4) uses the `about`, `specialties`, and `posts` to build company profiles. `seo-planner` (Step 4) uses `similar` companies for competitive context.
- **Parallel:** `page-scraper` and `browser-crawler` (Step 3) handle website scraping. This module handles LinkedIn-specific data that those scrapers cannot access.
- **Enrichment loop:** `loop-router` (Step 7) can trigger a second pass using the dedicated LinkedIn Posts Scraper + `google-pse-news` for entities flagged as thin content by Step 6 QA.
