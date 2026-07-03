# Submodule Research Brief: Image Generator

**Step:** 5 — Generation
**One-line purpose:** Generate branded company visuals, editorial images, and profile illustrations using AI image generation.

---

### What goes in?

Entity with items from content-writer (content_markdown) and content-analyzer (analysis_json with categories, key_facts). Optional: logo URL from image-logo-search.

### What comes out?

Generated image URLs stored in Supabase Storage. Items: image_url, image_type (hero|category_illustration|social_card|editorial), prompt_used, dimensions, file_format.

### Approach

1. Build image prompts from entity data:
   - Hero image: company positioning + category visual concept
   - Category illustrations: one per primary/secondary category
   - Social cards: company name + tagline + brand colors (if logo colors extracted)
2. Call image generation API (Stable Diffusion XL via Replicate, or DALL-E 3)
3. Upload generated images to Supabase Storage
4. Return storage URLs + metadata

### External Dependencies

- Replicate API (Stable Diffusion XL): ~$0.02-0.05 per image
- OR OpenAI DALL-E 3: ~$0.04-0.08 per image
- Supabase Storage for hosting generated images
- Cost: 3-5 images per entity × $0.05 = ~$0.25 per entity

### Edge Cases and Failure Modes

- Image generation fails (content policy, API error) → skip, log, entity gets no generated images
- Generated image is low quality → no automated detection in V1, user reviews in Step 6
- Default OFF: only enable for top-N profiles or when explicitly requested (cost control)

### Open Questions

1. Brand consistency: should all images for one company share a color palette? (Extract from logo?)
2. Should this run after Step 6 QA approval (only generate images for approved content)?

### Example Output

```javascript
{
  entity_name: "Evolution Gaming",
  items: [
    { image_url: "https://supabase.co/storage/evolution-hero.png", image_type: "hero", prompt_used: "Professional corporate visual for live casino technology company...", dimensions: "1200x630", file_format: "png" },
    { image_url: "https://supabase.co/storage/evolution-social.png", image_type: "social_card", dimensions: "1200x630" },
  ],
  meta: { images_generated: 3, total_cost: 0.15, errors: 0 }
}
```
