/**
 * Shared heading-marker parser — single canonical definition of the bracket
 * marker grammar used on markdown headings.
 *
 * Examples of markers this matches (the bracket immediately after the hashes):
 *   "## [Overview]"
 *   "## [Primary Category: casino-platforms]"
 *   "## [Tag: white-label]"
 *
 * Consumed by:
 *   - Step 8 bundlers (markdown-output, html-output) that STRIP these markers
 *     before rendering — they match with `headingMarkerRegex()`.
 *   - tone-seo-editor's post-edit gate (W1.5) that verifies the LLM edit did
 *     not drop or mangle any marker — it uses `extractHeadingMarkers()`.
 *
 * Why a single source: the gate's guarantee is "every marker the bundler can
 * parse in the input is still parseable in the output." If the validator used
 * its own regex and it drifted from the bundlers', the gate would pass markers
 * the bundlers can no longer parse — silently re-opening the exact hole the
 * gate exists to close. One definition keeps them in lockstep.
 *
 * Pipeline-agnostic: this knows only the markdown bracket-on-heading grammar.
 * It carries no content-type vocabulary (no notion of "category" vs "tag" vs
 * any specific slug) — callers interpret the matched content as they wish.
 */

/**
 * The canonical heading-marker regex. Returns a FRESH instance each call: the
 * `/g` flag is stateful (`lastIndex`), so a single shared instance reused
 * across callers (or across `.exec()` loops) would corrupt matching.
 *
 * Capture groups: [1] = the leading hashes, [2] = the bracket content.
 */
function headingMarkerRegex() {
  return /^(#{1,6})\s+\[([^\]]+)\]/gm;
}

/**
 * Extract every heading marker the bundlers can parse, in document order, as an
 * array of the raw bracket-content strings (without the surrounding `[]`).
 *
 * "## [Primary Category: casino-platforms]" → "Primary Category: casino-platforms"
 *
 * Returns [] for non-strings or markdown with no markers — so a content type
 * that uses no markers yields an empty list and any preservation check over it
 * passes trivially.
 */
function extractHeadingMarkers(markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0) return [];
  const out = [];
  const re = headingMarkerRegex();
  let m;
  while ((m = re.exec(markdown)) !== null) {
    out.push(m[2]);
  }
  return out;
}

module.exports = { headingMarkerRegex, extractHeadingMarkers };
