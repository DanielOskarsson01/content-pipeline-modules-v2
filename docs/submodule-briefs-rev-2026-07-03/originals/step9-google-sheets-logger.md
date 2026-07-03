# Submodule Research Brief: Google Sheets Logger

**Step:** 9 — Distribution
**One-line purpose:** Upsert a control panel row per entity in a Google Sheet with profile status, QA metrics, links, and editorial tracking fields.

---

### What goes in?

Entity with items from across the pipeline: json-output (structured data), meta-output (SEO meta), QA results (if Step 6 ran), doc_url (if Google Docs exporter ran), strapi_url (if Strapi publisher ran).

### What comes out?

Sheet row status per entity. Items: entity_name, sheet_row_number, sheet_url, upsert_status (created|updated).

### Approach

1. Connect to configured Google Sheet (by sheet ID)
2. For each entity, build row data:
   - Core: company_name, domain, version, date_generated
   - Status: qa_pass, qa_route (if failed)
   - SEO: keyword_score, meta_title_ok, meta_description_ok, negatives_found
   - Citations: citation_coverage_score
   - Suggested: suggested_category_count, confidence_avg, needs_manual_review
   - Editorial: decision (empty — reviewer fills in), notes, assignee, due_date
   - Links: doc_url, html_preview_url, strapi_url, supabase_id, logo_url
3. Upsert: match by company_name or entity_slug. Update if exists, append if new.

### External Dependencies

- Google Sheets API (OAuth2 service account, same as Google Docs exporter)
- Env vars: GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_SHEET_ID
- Cost: free

### Edge Cases

- Sheet doesn't exist or wrong ID → clear error message
- Row already exists → update (upsert by company_name column)
- Sheet has manual edits (reviewer notes) → preserve columns not managed by this submodule
- Too many entities (500+) → batch writes using Sheets API batchUpdate (up to 100 rows per call)

### Example Output

```javascript
{
  entity_name: "Betsson",
  items: [{
    entity_name: "Betsson",
    sheet_row_number: 47,
    sheet_url: "https://docs.google.com/spreadsheets/d/1xyz/edit#gid=0&range=A47",
    upsert_status: "updated",
  }],
  meta: { status: "success", rows_created: 0, rows_updated: 1 }
}
```
