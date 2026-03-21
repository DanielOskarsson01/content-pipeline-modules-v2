# API Scraper (ScrapFly)

Step 3 scraping submodule — paid API fallback for Cloudflare-protected and hard-to-scrape sites.

## When to use

Run **after** page-scraper and browser-scraper. This submodule only processes pages that still have `status: "error"` or `word_count < threshold` after both free scrapers have tried. It never wastes API credits on pages that were already scraped successfully.

## How it works

1. Filters input for failed/low-content pages
2. Calls [ScrapFly API](https://scrapfly.io/) with Anti-Scraping Protection (ASP) + JavaScript rendering
3. Extracts text using the same Readability → CMS DOM → regex chain as browser-scraper
4. Passes through all already-successful pages unchanged

## Setup

Set the `SCRAPFLY_KEY` environment variable on the server:

```bash
# In your .env file
SCRAPFLY_KEY=scp-live-your-key-here
```

## Cost

Each request uses ~30 ScrapFly credits (ASP + JS rendering). The `$30/mo` plan includes 50,000 credits (~1,600 pages). The `$59/mo` plan includes 150,000 credits (~5,000 pages).

You are only charged for successful API calls — failed requests don't consume credits.

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `min_word_threshold` | 50 | Only re-scrape pages below this word count |
| `max_content_length` | 50,000 | Truncate extracted text |
| `concurrency` | 2 | Simultaneous API requests (keep low) |
| `request_timeout` | 45,000ms | API timeout per request |
| `country` | GB | Geo-location for requests |

## Output

Same schema as page-scraper and browser-scraper. Adds:
- `scrape_method: "scrapfly"` — identifies pages scraped via API
- `scrapfly_credits` — credits consumed per page

## Data flow

```
page-scraper (HTTP + Readability) — handles ~70% of sites
    ↓ pages with status "error" or low word_count
browser-scraper (Playwright + Wayback) — recovers ~15-20%
    ↓ pages still failing
api-scraper (ScrapFly API) — recovers remaining hard cases
    ↓
Step 4 (content filtering)
```
