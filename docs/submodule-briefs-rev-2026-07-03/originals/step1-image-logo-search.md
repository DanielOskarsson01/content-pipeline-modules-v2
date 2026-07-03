# Submodule Research Brief: Image & Logo Search

**Step:** 1 — Discovery
**One-line purpose:** Find company logos, product images, and branded visuals via image search and website scraping.

---

### What goes in?

Entity with name (required). Optional: website.

### What comes out?

Image URLs with metadata. Items: image_url, source_page_url, alt_text, image_type (logo|product|screenshot|photo|brand_asset), dimensions (if available), file_format.

### Approach

1. Google Images search: `"{company_name}" logo igaming` → find logos
2. If website available: scrape homepage for logo (check `<link rel="icon">`, og:image meta, header img tags)
3. Check known logo sources: Clearbit Logo API (free), company's press/media page
4. For product images: Google Images `"{company_name}" product screenshot platform`
5. Classify each image: logo vs product vs screenshot vs photo (by URL pattern and context)
6. Validate image URLs are accessible (HEAD request)

### External Dependencies

- Google Custom Search API with image search enabled
- Clearbit Logo API (free: `https://logo.clearbit.com/{domain}`)
- No other paid services needed

### Edge Cases and Failure Modes

- Logo is SVG embedded in page (not a separate URL) → extract SVG src or skip
- Multiple logo variants (dark/light/icon/full) → keep all, tag by variant if detectable
- Image URL returns 403/404 → skip, log
- Company has no public images → return empty, entity profile will have no visual assets

### Example Output

```javascript
{
  entity_name: "Play'n GO",
  items: [
    { image_url: "https://logo.clearbit.com/playngo.com", source_page_url: "clearbit", alt_text: "Play'n GO logo", image_type: "logo", file_format: "png" },
    { image_url: "https://playngo.com/media/playngo-logo-dark.svg", source_page_url: "https://playngo.com/press", alt_text: "Play'n GO", image_type: "logo", file_format: "svg" },
  ],
  meta: { images_found: 4, logos_found: 2, errors: 0 }
}
```
