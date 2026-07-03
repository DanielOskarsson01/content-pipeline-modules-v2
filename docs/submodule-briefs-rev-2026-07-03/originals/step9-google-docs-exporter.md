# Submodule Research Brief: Google Docs Exporter

**Step:** 9 — Distribution
**One-line purpose:** Create a Google Doc per entity from the markdown content, preserving headings, citations, and structure for editorial review.

---

### What goes in?

Entity with content_markdown from content-writer. Optionally: meta fields, QA status, version info for the header block.

### What comes out?

Google Doc URLs per entity. Items: entity_name, doc_url, doc_id, doc_title, export_status.

### Approach

1. Convert content_markdown to Google Docs format:
   - Headings (##, ###) → Google Docs heading styles
   - Inline citations [#n] → preserved as text (or converted to footnotes)
   - Bullets/lists → Google Docs lists
   - Bold/italic → preserved
2. Add header block: company name, generation date, profile version, QA status
3. If suggested categories exist: add review banners
4. Create doc in configured Google Drive folder
5. Set sharing: comment-only for editorial team (configurable)

### External Dependencies

- Google Drive API + Google Docs API (OAuth2 service account)
- Setup: service account with Drive access, configured folder ID
- Env vars: GOOGLE_SERVICE_ACCOUNT_KEY, GOOGLE_DRIVE_FOLDER_ID
- Cost: free (within Google Workspace quotas)

### Edge Cases

- OAuth token expired → refresh automatically (service accounts handle this)
- Drive folder doesn't exist → create it, or fail with clear error
- Doc already exists for this entity → create new version with date suffix, or update existing (configurable)
- Markdown contains images → upload to Drive, embed in doc (or skip with placeholder)

### Example Output

```javascript
{
  entity_name: "Evolution Gaming",
  items: [{
    entity_name: "Evolution Gaming",
    doc_url: "https://docs.google.com/document/d/1abc123/edit",
    doc_id: "1abc123",
    doc_title: "Evolution Gaming — Company Profile v1 — 2026-03-20",
    export_status: "created",
  }],
  meta: { status: "success", docs_created: 1 }
}
```
