# Submodule Research Brief: AI Discovery Scout

**Step:** 1 — Discovery
**One-line purpose:** Use an LLM to generate intelligent, multi-query search strategies per entity, producing leads that downstream discovery submodules follow up on.

---

### What goes in?

Entity with basic metadata: name, website (optional), category (optional). This submodule should run FIRST in Step 1 — it's the scout that tells other submodules where to look.

### What comes out?

A list of discovered URLs and search leads, each tagged with what type of follow-up they need:
- Direct URLs (company pages, news articles) → go straight to Step 2
- YouTube channel URLs → YouTube discovery submodule picks these up
- LinkedIn company page URLs → LinkedIn discovery picks these up
- Podcast mentions → podcast discovery picks these up
- Image/logo URLs → image search picks these up

Each item includes: url, lead_type (direct|youtube|linkedin|podcast|image|news), search_query_used, snippet, confidence.

### Approach

1. Build a multi-query search strategy using LLM:
   - "Given entity [name] in [category], generate 5-10 search queries that would find: their official pages, news coverage, LinkedIn presence, YouTube content, podcast appearances, industry directory listings"
2. Execute each query via Google Custom Search API (or SERPApi)
3. LLM classifies each result: what type of lead is it? How confident?
4. Deduplicate across queries
5. Return tagged leads sorted by confidence

The LLM does two things: generates the queries (creative) and classifies the results (analytical). The actual searching is done by a search API.

### External Dependencies

- Google Custom Search API ($5/1000 queries) or SERPApi ($50/mo for 5000 searches)
- LLM API (Haiku for classification — cheap, fast)
- API key management via env vars

### Edge Cases and Failure Modes

- Entity with no category → LLM generates generic queries, lower quality results
- API rate limit → respect retry-after, queue remaining queries
- LLM returns garbage classifications → validate lead_type against allowed enum
- Zero search results for a query → skip, try next query
- Cost control: cap queries per entity (default 5, max 15)

### Cost Estimate

Per entity: ~5 API search queries × $0.005 = $0.025 + 1 LLM call for strategy + 1 for classification ≈ $0.05 total per entity. At 100 entities = ~$5 per run.

### Open Questions

1. Should the LLM generate queries in multiple languages for international companies?
2. Should results from AI scout be auto-approved into the pool, or require human review like other discovery submodules?
3. Should this submodule store the search strategy itself (the generated queries) for reuse/refinement?

### Example Output

```javascript
{
  entity_name: "Evolution Gaming",
  items: [
    { url: "https://www.evolution.com/about", lead_type: "direct", search_query_used: "Evolution Gaming company about", snippet: "Evolution is the world's leading...", confidence: 0.95 },
    { url: "https://linkedin.com/company/evolution-ab", lead_type: "linkedin", search_query_used: "Evolution Gaming LinkedIn", snippet: "Evolution AB | 10,001+ employees", confidence: 0.9 },
    { url: "https://youtube.com/c/EvolutionGaming", lead_type: "youtube", search_query_used: "Evolution Gaming YouTube channel", snippet: "Official Evolution channel", confidence: 0.85 },
    { url: "https://igamingbusiness.com/evolution-q3-results", lead_type: "news", search_query_used: "Evolution Gaming news igaming", snippet: "Evolution reports record Q3...", confidence: 0.8 },
  ],
  meta: { queries_generated: 8, queries_executed: 8, total_results: 47, unique_leads: 23, errors: 0 }
}
```
