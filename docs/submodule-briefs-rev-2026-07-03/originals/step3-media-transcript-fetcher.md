# Submodule Research Brief: Media Transcript Fetcher

**Step:** 3 — Scraping
**One-line purpose:** Fetch transcripts from YouTube videos, podcast episodes, and other media sources discovered in Step 1.

---

### What goes in?

Entity with items containing media URLs (youtube_video, podcast_episode from YouTube/Podcast Discovery submodule). Each item has: url, media_type, title.

### What comes out?

Transcript text for each media item. Items: url, title, transcript_text, transcript_source (cc|asr|show_notes|rss_description), duration_seconds, language, word_count.

### Approach

**YouTube transcripts:**
1. Extract video ID from URL
2. Try YouTube CC (closed captions) via `youtube-transcript-api` or direct API
3. If no CC: try ASR (auto-generated) captions
4. If neither: extract description text as fallback
5. Clean transcript: remove timestamps, join into paragraphs

**Podcast transcripts:**
1. If RSS feed available: check for `<podcast:transcript>` tag (Podcasting 2.0 standard)
2. If episode page URL: scrape page for embedded transcript or show notes
3. Fallback: use episode description from RSS as lightweight content

**No audio-to-text in V1.** Transcription services (Whisper, Deepgram) are expensive and slow. Only fetch existing transcripts.

### External Dependencies

- YouTube Data API v3 (for captions list) — free tier
- youtube-transcript-api npm package or equivalent
- No paid transcription services in V1

### Edge Cases and Failure Modes

- Video has no captions (CC or ASR) → return description text only, flag as "no_transcript"
- Podcast has no transcript → return show notes/description, flag accordingly
- YouTube API quota exceeded → fail gracefully, return partial results
- Non-English transcripts → keep them, tag with detected language

### Example Output

```javascript
{
  entity_name: "Evolution Gaming",
  items: [
    { url: "https://youtube.com/watch?v=abc123", title: "Evolution Q3 Presentation", transcript_text: "Good morning everyone. Today we're presenting...", transcript_source: "cc", duration_seconds: 1800, language: "en", word_count: 4200 },
    { url: "https://igamingdaily.com/ep-234", title: "Evolution CEO Interview", transcript_text: "Welcome to iGaming Daily...", transcript_source: "show_notes", word_count: 800 },
  ],
  meta: { media_processed: 5, transcripts_found: 3, fallback_descriptions: 2, errors: 0 }
}
```
