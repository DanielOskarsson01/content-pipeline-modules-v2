# Submodule Research Brief: LinkedIn Discovery

**Step:** 1 — Discovery
**One-line purpose:** Find a company's LinkedIn page URL and extract public metadata (headline, about snippet, location, employee count) without scraping LinkedIn directly.

---

### What goes in?

Entity with name (required). Optional: website.

### What comes out?

LinkedIn company page URL + lightweight metadata. Items: linkedin_url, headline, about_snippet, location, employee_range, industry.

**Important:** This submodule does NOT scrape LinkedIn. It finds the URL and captures metadata available from search results only. Full LinkedIn scraping is deferred (login walls, ToS issues).

### Approach

1. Google search: `site:linkedin.com/company "{company_name}"`
2. If website available: also try `site:linkedin.com/company "{domain}"`
3. Take top result URL — validate it's a /company/ page (not /in/ or /jobs/)
4. Extract metadata from Google search snippet (headline, location, employee count often shown)
5. Optionally: HEAD request the LinkedIn URL to confirm it's live (200/302 = valid)

### External Dependencies

- Google Custom Search API or SERPApi for the search query
- Cost: 1-2 queries per entity, pennies

### Edge Cases and Failure Modes

- Common company name → multiple LinkedIn results. Take the one whose headline/snippet best matches the entity's known category or website domain
- Company has no LinkedIn → return empty, tag as "no_linkedin_found"
- LinkedIn URL redirects to login wall → still store the URL, it's valid for metadata purposes
- Google deprioritizes LinkedIn in results → noted in the brutal critic review. Success rate may be 60-80%, not 100%. Document this honestly.

### Example Output

```javascript
{
  entity_name: "Evolution Gaming",
  items: [
    { linkedin_url: "https://linkedin.com/company/evolution-ab", headline: "Evolution AB", about_snippet: "Evolution is the world's leading provider of...", location: "Stockholm, Sweden", employee_range: "10,001+", industry: "Gambling & Casinos" }
  ],
  meta: { queries_executed: 2, linkedin_found: true, confidence: 0.9 }
}
```
