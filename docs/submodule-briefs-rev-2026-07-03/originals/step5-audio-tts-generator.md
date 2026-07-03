# Submodule Research Brief: Audio/TTS Generator

**Step:** 5 — Generation
**One-line purpose:** Convert company profile text into narrated audio files using text-to-speech, for embedding on company pages or distributing as podcast content.

---

### What goes in?

Entity with content_markdown from content-writer. Optionally: tone/voice preferences from options.

### What comes out?

Audio file URLs in Supabase Storage. Items: audio_url, audio_type (full_profile|overview_only|faq), duration_seconds, voice_id, file_format (mp3|wav), transcript_text, file_size_kb.

### Approach

1. Extract sections from content_markdown suitable for narration (overview, category sections, FAQ)
2. Clean text for TTS: remove citations [#n], markdown formatting, expand abbreviations
3. Call TTS API with selected voice
4. Upload audio to Supabase Storage
5. Return URLs + metadata

### External Dependencies

- ElevenLabs API: ~$0.30 per 1000 characters. A 2000-word profile ≈ 12,000 chars ≈ $3.60
- OR Play.ht: ~$0.10-0.20 per 1000 chars (cheaper, fewer voice options)
- OR OpenAI TTS: ~$0.015 per 1000 chars (cheapest, limited voices)
- Supabase Storage for hosting audio files

### Edge Cases and Failure Modes

- Long profiles exceed TTS API limits → chunk into sections, concatenate audio
- TTS mispronounces company/product names → no automated fix in V1, user reviews
- Default OFF: high cost per entity, enable only when audio content is needed

### Example Output

```javascript
{
  entity_name: "Evolution Gaming",
  items: [
    { audio_url: "https://supabase.co/storage/evolution-profile.mp3", audio_type: "full_profile", duration_seconds: 180, voice_id: "adam", file_format: "mp3", file_size_kb: 2800 },
  ],
  meta: { audio_generated: 1, total_duration_seconds: 180, total_cost: 1.80 }
}
```
