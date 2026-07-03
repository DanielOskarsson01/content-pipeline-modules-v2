# Submodule Research Brief: Google PSE News Search

**Step:** 1 — Discovery
**One-line purpose:** Search curated iGaming news site whitelist via Google Custom Search (Programmable Search Engine) to find news articles about each entity.

---

### What goes in?

Entity with name (required). Optional: alt_names, category. The PSE is pre-configured with a whitelist of trusted iGaming news domains.

### What comes out?

URLs of news articles about the entity, with title, snippet, publication date where available. Each tagged with source_type: "news".

Items: url, title, snippet, pub_date (if available), domain, search_query_used.

### Approach

1. Build search queries: `"{company_name}" OR "{alt_name}"` limited to PSE news whitelist
2. Execute via Google Custom Search API (PSE endpoint)
3. Collect 10-30 URLs per entity (configurable)
4. Extract metadata from search results (title, snippet, date)
5. Tag all items with found_via: "pse_news"

The PSE whitelist is configured in Google's Custom Search console — not in the submodule code. The submodule just calls the API with the PSE ID. Adding/removing news sites from the whitelist is done in the Google console.

### External Dependencies

- Google Custom Search API: $5 per 1000 queries. At 10 queries per entity × 100 entities = 1000 queries = $5 per run.
- PSE ID configured in Google Custom Search console
- API key via env var: GOOGLE_CSE_API_KEY, GOOGLE_CSE_NEWS_ID

### Edge Cases and Failure Modes

- Company with common name ("Evolution") → too many irrelevant results. Mitigation: add category terms to query ("Evolution Gaming igaming")
- API quota exceeded → fail gracefully, log, return partial results
- Zero results → normal for smaller/newer companies. Return empty items with meta noting "no news coverage found"
- Teaser pages (list pages, tag pages) → these get filtered in Step 2, not here

### Open Questions

1. Should the PSE whitelist be version-controlled or managed entirely in Google console?
2. How many queries per entity? Fixed or based on company size/importance?

### Example Output

```javascript
{
  entity_name: "Betsson",
  items: [
    { url: "https://igamingbusiness.com/betsson-q3-2025", title: "Betsson reports strong Q3", snippet: "Betsson Group reported...", pub_date: "2025-10-15", domain: "igamingbusiness.com", search_query_used: "Betsson igaming" },
    { url: "https://gamblinginsider.com/betsson-expansion", title: "Betsson expands to LatAm", snippet: "The operator announced...", pub_date: "2025-09-22", domain: "gamblinginsider.com", search_query_used: "Betsson igaming" },
  ],
  meta: { queries_executed: 3, total_results: 18, unique_urls: 14, errors: 0 }
}
```
