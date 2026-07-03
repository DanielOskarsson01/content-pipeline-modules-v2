# Submodule Research Brief: Strapi Publisher

**Step:** 9 — Distribution
**One-line purpose:** Push approved company profiles to Strapi CMS via REST API, creating or updating content entries with all fields, tags, categories, and media.

---

### What goes in?

Entity with items from Step 8 bundlers: json-output (structured data), html-output (rendered HTML), meta-output (SEO meta), company-media (logo/images). All available via the entity pool.

### What comes out?

Publication status per entity. Items: entity_name, strapi_id (created/updated entry ID), strapi_url, publish_status (created|updated|failed), fields_mapped, media_uploaded[].

### Approach

1. Load Strapi field mapping from options (textarea or reference doc mapping entity JSON fields → Strapi content type fields)
2. For each entity:
   - Check if entity already exists in Strapi (search by company_slug or name)
   - If exists: UPDATE via PUT /api/companies/:id
   - If new: CREATE via POST /api/companies
3. Map fields: overview → description, categories → category relations, tags → tag relations, meta_title → seo.metaTitle, etc.
4. Upload media: logo, generated images → Strapi Media Library, link to entry
5. Set publication status (draft by default, publish only if option set)

### External Dependencies

- Strapi REST API (self-hosted on OnlyiGaming infrastructure)
- Strapi API token via env var: STRAPI_API_URL, STRAPI_API_TOKEN
- Network access from Hetzner to Strapi host

### Edge Cases and Failure Modes

- Strapi is down → fail gracefully, log, user retries later
- Field mapping mismatch (JSON field doesn't match Strapi content type) → log warning, skip unmapped fields
- Media upload fails → create entry without media, flag for manual upload
- Strapi validation rejects entry (missing required fields) → detailed error with which fields failed
- Rate limiting → respect headers, queue remaining entities

### Open Questions

1. Should this create entries as "draft" or "published"? Configurable via option.
2. How are Strapi categories/tags referenced? By ID or by slug? Need to sync tag lists.
3. Should updates overwrite all fields or only changed fields (PATCH vs PUT)?

### Example Output

```javascript
{
  entity_name: "Betsson",
  items: [{
    entity_name: "Betsson",
    strapi_id: 1247,
    strapi_url: "https://cms.onlyigaming.com/api/companies/1247",
    publish_status: "updated",
    fields_mapped: 18,
    media_uploaded: ["logo.png"],
  }],
  meta: { status: "success", created: 0, updated: 1, failed: 0 }
}
```
