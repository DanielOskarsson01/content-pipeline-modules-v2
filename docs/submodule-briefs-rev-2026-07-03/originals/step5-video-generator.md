# Submodule Research Brief: Video Generator

**Step:** 5 — Generation
**One-line purpose:** Generate short explainer videos or brand highlight reels from company profile content using AI video generation.

---

### What goes in?

Entity with content_markdown (from content-writer) and optionally generated images (from image-generator).

### What comes out?

Video file URLs in Supabase Storage. Items: video_url, video_type (explainer|highlight_reel|summary), duration_seconds, script_used, thumbnail_url.

### Approach

1. Generate video script from content_markdown (LLM: condense profile into 60-90 second narration)
2. Generate video using AI video API:
   - Runway Gen-3: text-to-video or image-to-video
   - OR Pika Labs: similar capabilities
   - OR HeyGen: avatar-based presenter videos
3. Upload to Supabase Storage
4. Generate thumbnail from first frame

### External Dependencies

- Runway API: ~$0.50-2.00 per video (depending on length/quality)
- OR Pika Labs API: similar pricing
- OR HeyGen: $0.10-0.50 per minute of avatar video
- Supabase Storage
- **High cost, low priority.** Default OFF. Enable only for flagship profiles.

### Edge Cases and Failure Modes

- Video generation is slow (1-5 minutes per video) → expensive tier timeout (10min) should cover it
- Generated video is poor quality → user reviews in Step 6
- API availability: video gen APIs are newer and less stable than text/image APIs

### Open Questions

1. Is this worth building now? Video generation quality and cost may not justify it for B2B company profiles.
2. Should this wait until the platform has a video player/embed solution?

### Example Output

```javascript
{
  entity_name: "Betsson",
  items: [
    { video_url: "https://supabase.co/storage/betsson-explainer.mp4", video_type: "explainer", duration_seconds: 75, script_used: "Betsson Group is one of Europe's...", thumbnail_url: "https://supabase.co/storage/betsson-thumb.jpg" },
  ],
  meta: { videos_generated: 1, total_cost: 1.20, generation_time_seconds: 180 }
}
```
