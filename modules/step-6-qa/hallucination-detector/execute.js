/**
 * Hallucination Detector -- Step 6 QA submodule
 *
 * Compares generated content claims against original source material to
 * flag statements that aren't supported by any source. Uses LLM-based
 * verification to handle paraphrasing, analysis-derived facts, and
 * general knowledge.
 *
 * Data operation: add (+) -- one QA-verdict item per entity, keyed by entity_name.
 * Data-shape routing: finds input by field presence, never by source_submodule.
 *
 * Process:
 *   1. Extract factual claims from content_markdown using heuristics
 *   2. Gather source text_content from scraped pages
 *   3. Batch claims and send to LLM with source text for verification
 *   4. Score: verified / total claims
 *   5. Pass/fail based on pass_threshold
 */

// ─── Code-locked verification prompt (W2.3) ───
//
// The truth-metric verification prompt is standardized system-wide and is NOT
// template-overridable -- a template must not be able to weaken the fact-check.
// It previously lived in a manifest `prompt` option (operator-editable in the
// UI); W2.3 inlined it here and removed that option. The example claims are
// domain-neutral (Rule 13 -- no content-type assumptions in module code).
const MANIFEST_DEFAULT_PROMPT = `You are a fact-checking assistant. You will be given a list of factual claims extracted from a generated article, and the original source material the article was based on.

For each claim, determine whether it is supported by the source material.

Rules:
- "supported" = the source material contains information that directly or clearly supports this claim, even if paraphrased
- "unsupported" = the source material does NOT contain information supporting this claim, and it is NOT general common knowledge
- "partial" = the source material partially supports the claim but key details (numbers, dates, specifics) differ or are missing
- A claim that pairs real elements in a way the sources CONTRADICT (the sources place the city in a different country, tie the award to a different product or year, or attribute the fact to a different subject) is "unsupported", NOT "partial" -- the false pairing IS the claim, even though each element appears somewhere in the sources.
- General knowledge claims (e.g. "Paris is the capital of France", "the global economy is growing") should be marked "supported" even if not explicitly in sources
- If the claim references data from an analysis or summary derived from the sources, mark it "supported"

Return a JSON array (no markdown fences, no extra text) with one object per claim:
[
  {
    "claim": "the exact claim text",
    "verdict": "supported" | "unsupported" | "partial",
    "quote": "the supporting quote from sources, or null if unsupported",
    "severity": "low" | "medium" | "high"
  }
]

Severity guide:
- "low" = general phrasing, opinion, or common knowledge that is hard to verify
- "medium" = specific factual claim (company name, product, feature) not found in sources
- "high" = specific number, date, statistic, or financial claim not found in sources, or a pairing of real elements that the sources contradict (the sources pair the city with a different country, the award with a different product or year, the fact with a different subject)

CLAIMS:
{{CLAIMS}}

SOURCE MATERIAL:
{{SOURCES}}`;

// The stable instruction block of the verification prompt -- everything BEFORE the
// CLAIMS/SOURCES sections. Reused verbatim by the cache-split path (COST_OPTIMISATION
// Unit B) so the code-locked rules text is provably identical to the single-prompt
// path; only the section ORDER changes there (sources before claims). Derived from
// the one constant above so the two can never drift.
const PROMPT_HEADER = MANIFEST_DEFAULT_PROMPT.split('\n\nCLAIMS:\n')[0];

// ─── Code-locked claim-extraction ceiling ───
//
// The claim-EXTRACTION call otherwise inherits ai.complete's 16384 default max_tokens.
// On a heavy draw (a rich profile's 150-200 claims PLUS sonnet-5's adaptive thinking,
// which is on when `thinking` is omitted and bills against the SAME output cap) that
// default overflows: the extraction JSON is truncated -> unparseable -> the module used
// to fall back SILENTLY to the regex extractor (~4 claims on a v3 draft) -> the severity
// floor never trips -> qa_pass:true. Seventh instance of this codebase's worst failure
// family, and the FIRST that fails OPEN (a fabrication published, not blocked).
//
// Raised to the model's real headroom: sonnet-5's output ceiling is 131072; the deployed
// draws emit only 4-7k extraction tokens for the fattest (200-claim) entity, so 65536 is
// ~4x the observed worst case plus generous room for the non-deterministic thinking tail,
// and half the hard limit. The adapter (stageWorker + buildBatchRequestParams) STREAMS and
// forwards max_tokens unclamped, so this is safe from HTTP timeouts. CODE-LOCKED (not a
// manifest option) for the same reason as the extraction prompt: a template must not be
// able to lower it back into the truncation hole. Same class as the analyzer ceiling
// (content-pipeline-specs template-v3/ceiling/CEILING.md); different model, different number.
// A truncation ABOVE this ceiling can no longer produce a verdict -- applyExtraction fails
// the entity loud (extractionFailedResult) rather than reverting to regex.
const EXTRACTION_MAX_TOKENS = 65536;

// ─── Code-locked claim-extraction prompt (B033, W2.3) ───
//
// Used only when claim_extraction:"llm". Like the verification prompt above it is
// inlined here, NOT a manifest option -- a template must not be able to weaken what
// counts as a claim. Reads the FULL draft (prose + markdown tables + lists), which the
// regex extractor cannot: v3 moves facts into Quick-Facts tables and bullet lists, so
// the prose-only regex collapses claim granularity (R0: 4 claims on push-gaming.md, one
// partial costing 12.5%). Domain-neutral (Rule 13 -- no content-type assumptions).
const CLAIM_EXTRACTION_PROMPT = `You are a claim-extraction assistant. You will be given the full text of a generated article in markdown, including headings, prose, tables, and bullet/numbered lists.

Extract every distinct, verifiable factual claim the article asserts -- a specific, checkable statement about a name, date, number, location, relationship, product, feature, certification, partnership, award, or any concrete assertion that could be true or false against source material.

Rules:
- Include claims stated in TABLES and LISTS, not only prose sentences. A table row that asserts a fact (e.g. "Founded | 2010") is a claim -- render it as a natural sentence ("Founded in 2010").
- One claim per array element. Split a compound sentence into separate claims.
- Exclude pure opinion, marketing adjectives, rhetorical framing, and general common knowledge with no specific checkable content.
- Do NOT judge whether a claim is true. Only extract the claims; a later stage verifies them.

Return a JSON array of strings and nothing else (no markdown fences, no commentary):
["claim 1", "claim 2", "claim 3"]

ARTICLE:
{{CONTENT}}`;

// ─── Heuristic patterns for factual claims ───

/**
 * Patterns that indicate a sentence contains a specific factual claim
 * worth verifying against sources. Each is tested case-insensitively.
 */
const FACTUAL_CLAIM_PATTERNS = [
  // Numbers and statistics
  /\b\d{1,3}(?:,\d{3})+\b/,                    // Large numbers: 1,000 or 1,000,000
  /\b\d+(?:\.\d+)?\s*(?:million|billion|trillion)\b/i,  // "5.2 million", "3 billion"
  /\b\d+(?:\.\d+)?\s*%/,                        // Percentages: "45%", "3.2%"
  /\$\s*\d+/,                                   // Dollar amounts
  /\b€\s*\d+/,                                  // Euro amounts
  /\b£\s*\d+/,                                  // Pound amounts
  /\bUSD\s*\d+/i,                               // "USD 500"
  /\bEUR\s*\d+/i,                               // "EUR 500"
  /\bGBP\s*\d+/i,                               // "GBP 500"

  // Dates and time-based claims
  /\bfounded\s+in\s+\d{4}\b/i,                  // "founded in 2005"
  /\bestablished\s+in\s+\d{4}\b/i,              // "established in 1998"
  /\blaunched\s+in\s+\d{4}\b/i,                 // "launched in 2020"
  /\bsince\s+\d{4}\b/i,                         // "since 2010"
  /\bin\s+\d{4}\b/,                              // "in 2015" (year references)

  // Company-specific claims
  /\bheadquartered\s+in\b/i,                    // "headquartered in Malta"
  /\bbased\s+in\b/i,                            // "based in London"
  /\bemploys?\s+(?:over\s+|more\s+than\s+|approximately\s+)?\d/i, // "employs 500"
  /\b\d+\s+employees?\b/i,                      // "500 employees"
  /\blicensed?\s+(?:by|in|from)\b/i,            // "licensed by the MGA"
  /\bregulated\s+by\b/i,                        // "regulated by the UKGC"
  /\bacquired\s+(?:by|for)\b/i,                 // "acquired by Entain"
  /\bmerged\s+with\b/i,                         // "merged with Ladbrokes"
  /\bpartnership\s+with\b/i,                    // "partnership with Evolution"
  /\bsponsors?\s+(?:of|the)\b/i,                // "sponsor of Arsenal"
  /\bpowered\s+by\b/i,                          // "powered by Pragmatic Play"
  /\boperates?\s+in\s+\d+/i,                    // "operates in 20 markets"
  /\bover\s+\d+\s+(?:brands?|markets?|countries|games?|titles?)\b/i, // "over 500 games"
];

/**
 * Patterns for general-knowledge sentences that should NOT be extracted
 * as claims requiring verification, even if they match factual patterns.
 */
const GENERAL_KNOWLEDGE_PATTERNS = [
  /\bigaming\s+is\b/i,
  /\bonline\s+gambling\s+is\b/i,
  /\bthe\s+industry\s+(?:is|has|continues)\b/i,
  /\bglobally\b/i,
  /\bgenerally\s+(?:speaking|considered)\b/i,
  /\bit\s+is\s+(?:widely|commonly|generally)\b/i,
  /\bas\s+(?:one\s+of\s+)?the\s+(?:largest|biggest|most)\b/i,
  /\bis\s+(?:a|an)\s+(?:popular|common|well-known|leading|major)\b/i,
  /\bplays?\s+(?:a|an)\s+(?:important|key|crucial|vital)\s+role\b/i,
  /\bcontinues?\s+to\s+(?:grow|expand|evolve)\b/i,
];

// ─── Text processing helpers ───

/**
 * Split markdown content into sentences, handling abbreviations and
 * markdown formatting. Strips structural elements (headings, lists, code).
 */
function splitIntoSentences(text) {
  if (!text || typeof text !== 'string') return [];

  // Remove markdown formatting
  let cleaned = text
    .replace(/^#+\s+.*$/gm, '')          // Headings
    .replace(/^---+$/gm, '')             // Horizontal rules
    .replace(/^>\s+/gm, '')              // Blockquote markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // Bold
    .replace(/\*([^*]+)\*/g, '$1')       // Italic
    .replace(/`[^`]+`/g, '')             // Inline code
    .replace(/```[\s\S]*?```/g, '')      // Code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links -> text
    .replace(/^-\s+/gm, '')             // List markers
    .replace(/^\d+\.\s+/gm, '')         // Numbered list markers
    .replace(/\[#?\d+\]/g, '');          // Citation references

  // Protect abbreviations from sentence splitting
  const protections = [
    [/\bDr\./g, 'Dr\x00'], [/\bMr\./g, 'Mr\x00'], [/\bMs\./g, 'Ms\x00'],
    [/\bInc\./g, 'Inc\x00'], [/\bLtd\./g, 'Ltd\x00'], [/\bCo\./g, 'Co\x00'],
    [/\bvs\./g, 'vs\x00'], [/\be\.g\./g, 'eg\x00'], [/\bi\.e\./g, 'ie\x00'],
    [/\betc\./g, 'etc\x00'], [/\bNo\./g, 'No\x00'],
  ];
  for (const [pattern, replacement] of protections) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  const rawSentences = cleaned.split(/(?<=[.!?])\s+/);

  return rawSentences
    .map(s => s.replace(/\x00/g, '.').trim())
    .filter(s => s.length > 15); // Skip very short fragments
}

/**
 * Check if a sentence contains a factual claim worth verifying.
 */
function isFactualClaim(sentence) {
  return FACTUAL_CLAIM_PATTERNS.some(pattern => pattern.test(sentence));
}

/**
 * Check if a sentence is general knowledge (does not need verification).
 */
function isGeneralKnowledge(sentence) {
  return GENERAL_KNOWLEDGE_PATTERNS.some(pattern => pattern.test(sentence));
}

/**
 * Extract factual claims from markdown content.
 * Returns array of claim strings.
 */
function extractClaims(markdown) {
  const sentences = splitIntoSentences(markdown);
  const claims = [];

  for (const sentence of sentences) {
    // Skip general knowledge
    if (isGeneralKnowledge(sentence)) continue;
    // Keep sentences with factual claim patterns
    if (isFactualClaim(sentence)) {
      // Truncate very long sentences for LLM context efficiency
      const claim = sentence.length > 200
        ? sentence.substring(0, 197) + '...'
        : sentence;
      claims.push(claim);
    }
  }

  return claims;
}

/**
 * Coerce an LLM extraction response into an array of claim strings. Accepts a raw
 * JSON array of strings, or of {claim|text|statement} objects. Truncates long claims
 * for verification-context efficiency (same 200-char cap the regex path applies).
 */
function parseExtractedClaims(responseText) {
  const arr = parseLlmResponse(responseText); // reuses fence-stripping + array recovery
  const out = [];
  for (const el of arr) {
    let s = typeof el === 'string' ? el : (el && (el.claim || el.text || el.statement)) || '';
    s = String(s).trim();
    if (!s) continue;
    out.push(s.length > 200 ? s.substring(0, 197) + '...' : s);
  }
  return out;
}

/**
 * True iff the response text parses to a JSON array (even an empty one) -- mirrors
 * parseLlmResponse's two parse attempts. Distinguishes a genuine empty/valid response
 * (`[]`) from a truncated/malformed one (0 claims recovered but NOT a valid array). Used
 * to fail loud on BATCH truncation, where the skeleton strips the stop_reason signal
 * (stageWorker.js normalises the extraction result to {ok,text}), leaving the unparseable
 * body as the only truncation trace.
 */
function parsesToArray(responseText) {
  if (!responseText || typeof responseText !== 'string') return false;
  let cleaned = responseText.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  try { if (Array.isArray(JSON.parse(cleaned))) return true; } catch { /* try array recovery */ }
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrayMatch) { try { return Array.isArray(JSON.parse(arrayMatch[0])); } catch { /* not an array */ } }
  return false;
}

/**
 * Combine source text_content items into a single string,
 * respecting max_source_chars limit. Truncates from the end.
 */
function combineSourceText(sourceItems, maxChars) {
  let combined = '';
  for (const item of sourceItems) {
    const text = item.text_content || '';
    if (!text) continue;

    // Add separator between sources
    const separator = combined ? '\n\n---SOURCE BOUNDARY---\n\n' : '';
    const addition = separator + text;

    if (combined.length + addition.length > maxChars) {
      // Add what fits
      const remaining = maxChars - combined.length;
      if (remaining > 100) { // Only add if meaningful amount remaining
        combined += addition.substring(0, remaining) + '\n[TRUNCATED]';
      }
      break;
    }
    combined += addition;
  }

  return combined;
}

// ─── Claim-anchored retrieval + honest window instrumentation (U1) ───
//
// DIAGNOSIS Task 2: combineSourceText() truncates the corpus HEAD at
// max_source_chars, so on a fat entity (Vermantia: 633,916 chars; the window saw
// 15.8%) the supporting page is frequently BEYOND the window and its claim is
// flagged "unsupported" as a pure truncation artifact (SNAITECH at char 320,933,
// Stanleybet/Vision NextGen at 155,069). source_selection:"claim_anchored" builds
// a per-batch window from the source chunks whose terms overlap the batch's claims
// -- deterministic lexical overlap, no second LLM pass -- so far evidence is SHOWN.
// Default "head" stays byte-identical (window-raise-only is head + a bigger
// max_source_chars; no code path change).

const CHUNK_SIZE = 4000;   // per-page chunking; pages <= this stay whole
const CHUNK_OVERLAP = 200; // applied only when splitting an oversized page
const SOURCE_SEP = '\n\n---SOURCE BOUNDARY---\n\n';

// Smallest useful stopword set -- only the highest-frequency function words.
// Over-filtering discards discriminating terms, so this stays deliberately tiny.
const STOPWORDS = new Set(['the','and','for','with','was','were','are','has','have','had','its','their','they','which','also','into','over','more','than','from','this','that','these','those','been','being']);

// Accept both true and "true": UI presets store booleans/selects as strings, so a
// naive `if (opt)` treats the string "false" as truthy. Coerce every boolean here.
function asBool(v) { return v === true || v === 'true'; }

// Word-boundary containment: "corp" must NOT match inside "zebracorp". Plain
// substring matching mislabels evidence for short common terms; this checks the
// chars around each occurrence are non-alphanumeric. Both args already lowercased.
function isWordChar(ch) { return ch >= 'a' && ch <= 'z' || ch >= '0' && ch <= '9'; }
function hasWord(haystack, term) {
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(term, from);
    if (i < 0) return false;
    const before = i === 0 ? '' : haystack[i - 1];
    const after = haystack[i + term.length] || '';
    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = i + 1;
  }
}

// Weighted match terms for a claim. Proper-noun / acronym tokens and numbers are
// discriminating (weight 2); ordinary content words weight 1. Lowercased keys.
//
// Possessive stems + digit-led tokens (the top-K retrieval unit): the writer's
// phrasing is possessive ("SoftSwiss's Game Aggregator") while the source states
// the bare name ("SoftSwiss") -- without the stem the claim's RAREST term never
// matches its own supporting page and a decoy outranks it (specimen ranks 94->5,
// 109->3 on the run-9821ed56 set). Digit-led tokens ("1X2", "8ms" from "13.8ms")
// were dropped entirely by both token passes for the same effect.
const depossess = t => t.replace(/[’']s$/, '').replace(/[’']$/, '');
function extractClaimTerms(claim) {
  const terms = new Map();
  const add = (t, w) => {
    const k = String(t).toLowerCase();
    if (k.length < 3 || STOPWORDS.has(k)) return;
    terms.set(k, Math.max(terms.get(k) || 0, w));
  };
  const addWithStem = (t, w) => { add(t, w); const s = depossess(t); if (s !== t) add(s, w); };
  for (const m of claim.match(/\b[A-Z][A-Za-z0-9&.'\-]{2,}\b/g) || []) addWithStem(m, 2); // SNAITECH, Stanleybet, AAMS
  for (const m of claim.match(/\b\d[\d,.]*\b/g) || []) add(m, 2);                 // years / stats
  for (const m of claim.match(/\b\d[A-Za-z0-9]{2,}\b/g) || []) add(m, 2);         // 1X2, 8ms
  for (const m of (claim.toLowerCase().match(/[a-z][a-z0-9'\-]{2,}/g) || [])) addWithStem(m, 1);
  return terms;
}

// Split source items into ordered chunks. Per-page granularity preserves page
// semantics; a page larger than CHUNK_SIZE is windowed (with overlap so a fact on
// a chunk seam isn't lost).
function chunkSources(sourceItems) {
  const chunks = [];
  let order = 0;
  for (let idx = 0; idx < sourceItems.length; idx++) {
    const text = sourceItems[idx].text_content || '';
    if (!text) continue;
    if (text.length <= CHUNK_SIZE) {
      chunks.push({ text, lower: text.toLowerCase(), order: order++, itemIdx: idx });
    } else {
      for (let s = 0; s < text.length; s += (CHUNK_SIZE - CHUNK_OVERLAP)) {
        const slice = text.slice(s, s + CHUNK_SIZE);
        chunks.push({ text: slice, lower: slice.toLowerCase(), order: order++, itemIdx: idx });
        if (s + CHUNK_SIZE >= text.length) break;
      }
    }
  }
  return chunks;
}

// Inverse document frequency across the corpus chunks, for the claims' terms. The
// entity name (in nearly every chunk) and common words approach idf 0 and STOP
// dominating the match; rare, discriminating terms (SNAITECH, in one chunk) carry
// the signal. Without this, "vermantia" being in every chunk makes every claim look
// covered/in-window -- the exact bug the ELK/Vermantia acceptance runs exposed.
function buildIdf(chunks, claims) {
  const N = chunks.length || 1;
  const terms = new Set();
  for (const cl of claims) for (const [t] of extractClaimTerms(cl)) terms.add(t);
  const idf = new Map();
  for (const t of terms) {
    let df = 0;
    for (const c of chunks) if (hasWord(c.lower, t)) df++;
    idf.set(t, df ? Math.max(0, Math.log(N / df)) : 0); // df===N (ubiquitous) -> 0
  }
  return idf;
}

// Weighted, IDF-scaled overlap of a claim against one chunk. A chunk that shares
// only the (ubiquitous) entity name scores ~0; one carrying a rare discriminating
// term scores high.
function scoreChunkForClaim(chunkLower, terms, idf) {
  let s = 0;
  for (const [t, w] of terms) if (hasWord(chunkLower, t)) s += w * (idf.get(t) || 0);
  return s;
}

// How many candidate chunks the supplement pulls per claim, and how many the
// repaired in_window instrument requires to be shown. K=5 sits at the knee of the
// measured rank-coverage curve on the 27-specimen set (run 9821ed56): the true
// supporting chunk ranks <=5 for 18/25 locatable specimens (K=3: 14, K=6+:
// plateau), while the supplement budget cap keeps the worst-case window size
// unchanged. Top-1 (the old behaviour) covered 2/25 -- a decoy chunk sharing many
// generic terms outranked the short page actually stating the fact, so the true
// support was never shown and corpus-true claims were flagged.
const SUPPLEMENT_TOP_K = 5;

// The claim's top-k scoring chunks, ranked by (score desc, corpus order asc) --
// the earliest-wins tie-break the old single-best selection had. Single source of
// truth for BOTH the supplement selection and classifyClaimEvidence, so the
// instrument can never disagree with the retrieval about what "best k" means.
function topChunksForClaim(claim, chunks, idf = buildIdf(chunks, [claim]), k = SUPPLEMENT_TOP_K) {
  const terms = extractClaimTerms(claim);
  const scored = [];
  for (const c of chunks) {
    const s = scoreChunkForClaim(c.lower, terms, idf);
    if (s > 0) scored.push({ chunk: c, score: s });
  }
  scored.sort((a, b) => b.score - a.score || a.chunk.order - b.chunk.order);
  return scored.slice(0, k);
}

// Build a per-batch source window. CRITICAL invariant: the window is a SUPERSET of
// the head window (at whole-chunk granularity) -- the verifier does not see LESS
// than head mode would show, so an entity whose evidence already sits in the head
// (e.g. ELK) cannot regress. (Head appends a partial trailing page; a claim that
// references it is pulled in WHOLE via the supplement, so it is covered even better
// -- the only theoretical gap is a partial-tail-only fact with zero discriminating
// terms, which a regex-extracted claim never is.) On top of the full head, pull in
// the single best (IDF-ranked) FAR chunk for each claim whose best evidence is
// BEYOND the head, up to an EQUAL supplement budget -- so the window is up to ~2x
// max_source_chars total (still far cheaper than a full-corpus window-raise). Cost
// is adaptive: evidence concentrated in the head (ELK) -> ~no supplement; scattered
// deep (Vermantia: SNAITECH at char 323k) -> the far pages come in. Purely lexical
// + positional -- deterministic, no second LLM pass.
function selectAnchoredWindow(chunks, claims, maxChars, idf = buildIdf(chunks, claims)) {
  // 1. Base = the head window, positional, up to maxChars (identical coverage to head mode).
  const base = [];
  let used = 0;
  for (const c of chunks) {
    const addLen = (base.length ? SOURCE_SEP.length : 0) + c.text.length;
    if (used + addLen > maxChars) break;
    base.push(c);
    used += addLen;
  }
  if (base.length === 0 && chunks.length && maxChars > 100) {
    base.push({ ...chunks[0], text: chunks[0].text.slice(0, maxChars) }); // first chunk bigger than budget
  }
  const baseOrders = new Set(base.map(c => c.order));

  // 2. For each claim, nominate its top-K chunks that sit BEYOND the head, tagged
  //    with the best (lowest) per-claim rank tier that nominated them. Top-1-only
  //    had two failure modes the 27-specimen set reproduced: a decoy chunk sharing
  //    many generic terms outranked the true supporting page (23/27), and a decoy
  //    that happened to sit in the head suppressed the supplement entirely.
  //    (IDF ranking means the entity name can't make a chunk win spuriously.)
  const suppTier = new Map(); // order -> best rank tier (0-based) across claims
  for (const claim of claims) {
    const ranked = topChunksForClaim(claim, chunks, idf, SUPPLEMENT_TOP_K);
    ranked.forEach(({ chunk }, tier) => {
      if (baseOrders.has(chunk.order)) return;
      const t = suppTier.get(chunk.order);
      if (t === undefined || tier < t) suppTier.set(chunk.order, tier);
    });
  }

  // 3. Supplement up to an equal maxChars budget on top of the base, filled by
  //    rank tier (every claim's rank-1 chunk before any claim's rank-2), then
  //    corpus order within a tier -- so a deeper nomination can never crowd out
  //    another claim's best chunk when the budget binds.
  const selected = [...base];
  let suppUsed = 0;
  const chunkByOrder = new Map(chunks.map(c => [c.order, c]));
  const nominated = [...suppTier.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (const [order] of nominated) {
    const c = chunkByOrder.get(order);
    const addLen = SOURCE_SEP.length + c.text.length;
    if (suppUsed + addLen > maxChars) continue;
    selected.push(c);
    suppUsed += addLen;
  }

  const selectedOrders = new Set(selected.map(s => s.order));
  const ordered = selected.slice().sort((a, b) => a.order - b.order);
  const text = ordered.map(c => c.text).join(SOURCE_SEP);
  // COST_OPTIMISATION Unit B: the base (head) window is identical for every batch of
  // an entity; the supplement varies. Emit them separately (each in corpus order) so
  // the caller can put the stable base in a cache_prefix and only re-send supplements.
  // selectedOrders is the UNION and is UNCHANGED -- the honest-window meta
  // (classifyClaimEvidence) depends only on it, so this addition is behavior-neutral.
  const baseText = base.map(c => c.text).join(SOURCE_SEP);
  const suppText = ordered.filter(c => !baseOrders.has(c.order)).map(c => c.text).join(SOURCE_SEP);
  return { text, selectedOrders, shownChars: text.length, baseText, suppText };
}

// Per-claim evidence location. REPAIRED INSTRUMENT (the top-K retrieval unit):
// the old test credited `in_window` when ANY selected chunk shared ANY single
// discriminating term with the claim -- so a decoy chunk carrying just the entity
// name plus one shared token produced `in_window` while the actual supporting page
// sat outside the window. Every one of the 43 flags in validation run 9821ed56 was
// tagged `in_window` this way; 23 of the 27 audited specimens had their real
// support BEYOND the window. The label concealed the retrieval miss for an entire
// validation run (FABRICATIONS_AND_FLAGS.md §B1).
//
// What the labels now mean (truthful, deterministic -- the instrument reports
// retrieval coverage, which is knowable, not semantic support, which is not):
//   in_window     -- ALL of the claim's top-K candidate chunks (the same ranked
//                    set the supplement pulls from) were shown to the verifier.
//                    Retrieval showed everything it ranked best; the verdict is
//                    as informed as this retrieval can make it.
//   beyond_window -- at least one top-K candidate was NOT shown (budget eviction,
//                    or -- pre-fix -- decoy selection). The flag may be a
//                    retrieval artifact.
//   absent        -- no chunk anywhere carries discriminating evidence (candidate
//                    fabrication). Unchanged; load-bearing for
//                    severity_model=evidence_absent.
function classifyClaimEvidence(claim, chunks, selectedOrders, idf = buildIdf(chunks, [claim])) {
  const terms = extractClaimTerms(claim);
  // Discriminating terms (idf > 0) stop the ubiquitous entity name from counting
  // as "evidence". But on a small corpus every term can be in every chunk
  // (idf 0 for all) -- there, fall back to raw presence so genuine in-window evidence
  // isn't mislabelled "absent" (a confidently-wrong "candidate fabrication").
  const hasDiscriminating = [...terms.keys()].some(t => (idf.get(t) || 0) > 0);
  if (!hasDiscriminating) {
    let anywhere = false;
    for (const c of chunks) {
      if (![...terms.keys()].some(t => hasWord(c.lower, t))) continue;
      anywhere = true;
      if (selectedOrders.has(c.order)) return 'in_window';
    }
    return anywhere ? 'beyond_window' : 'absent';
  }
  // hasDiscriminating implies some chunk scores > 0, so top is never empty.
  const top = topChunksForClaim(claim, chunks, idf, SUPPLEMENT_TOP_K);
  return top.every(({ chunk }) => selectedOrders.has(chunk.order)) ? 'in_window' : 'beyond_window';
}

/**
 * Split claims into batches of the specified size.
 */
function batchClaims(claims, batchSize) {
  const batches = [];
  for (let i = 0; i < claims.length; i += batchSize) {
    batches.push(claims.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Parse LLM response text into structured JSON.
 * Handles markdown code fences and raw JSON.
 */
function parseLlmResponse(responseText) {
  if (!responseText || typeof responseText !== 'string') return [];

  let cleaned = responseText.trim();

  // Remove markdown code fences if present
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    // Try to extract JSON array from the response
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return [];
      }
    }
    return [];
  }
}


// ─── QA-pass decision incl. the evidence-absent severity model (UNIT B) ───
//
// Pure: given the score, the unsupported verdicts, the per-claim evidence map and
// the two floor knobs, decide pass + whether the floor tripped + the (possibly
// regraded) unsupported list used for the flagged output/summary.
//
//   severity_model 'current'         -> severity untouched; the SAME verdict
//                                       objects flow through (byte-identical).
//   severity_model 'evidence_absent' -> a HIGH unsupported claim whose subject is
//                                       present in the corpus (evidence
//                                       in_window|beyond_window) is regraded to
//                                       MEDIUM; a claim absent everywhere STAYS
//                                       HIGH. Only `severity` changes — `verdict`
//                                       is never touched (this is a re-grade, not
//                                       a re-verification).
// The floor force-fails only on a HIGH that survives the regrade; otherwise the
// honest ratio decides. The score is severity-independent, so re-grading can
// never change it.
function decideHallucinationPass({ hallucinationScore, unsupportedClaims, claimEvidence, passThreshold, severityFloor, severityModel }) {
  const regraded = unsupportedClaims.map(v => {
    if (severityModel === 'evidence_absent' && (v.severity || 'medium') === 'high') {
      const ev = claimEvidence && claimEvidence[v.claim];
      if (ev && ev !== 'absent') return { ...v, severity: 'medium' }; // grounded subject -> not a fabrication
    }
    return v; // unchanged reference -> byte-identical output under 'current'
  });
  const highSevUnsupported = regraded.filter(v => (v.severity || 'medium') === 'high');
  const floorTripped = severityFloor && highSevUnsupported.length > 0;
  const qaPass = floorTripped ? false : (hallucinationScore >= passThreshold);
  return { qaPass, floorTripped, highSevUnsupported, regraded };
}

// ─── Severity-floor confirmation pass (v1.9.0, option `floor_confirmation`) ───
//
// At production claim volume (150-200 claims/entity) the per-batch window budget is shared
// across 25 claims, capping each claim's effective top-K at 1-2 chunks -- so corpus-true
// claims routinely grade unsupported/HIGH (retrieval starvation, not fabrication) and the
// all-or-nothing floor blocks clean drafts: run 9821ed56 measured 13 of 16 floor HIGHs as
// corpus-true FPs and auto-approve at 1/6. The repaired in_window instrument CANNOT gate
// the floor: at full volume genuine fabrications read beyond_window exactly like the FPs
// (hdtopk evidence -- Málaga/Sweden, BetMGM 17-Aug, the £50m program, and all three injected
// corpus-absent controls), while the few in_window tags sit on FPs. So this pass gates on
// RE-VERIFICATION instead: the floor-tripping HIGH claims are re-verified in small batches
// (uncontended retrieval -- each claim gets its full top-K supplement), and the floor stands
// only on a HIGH that survives. Specimen evidence (hdtopk fixed/): genuine fabrications stay
// HIGH on 13/13 small-batch draw-slots; 21/27 corpus-true FP specimens clear. No severity is
// ever regraded from an evidence tag (the weld-unsafe hole severity_model 'evidence_absent'
// has) -- the only release path is the same verifier + code-locked prompt (incl. the v1.8.0
// weld rule) affirmatively grading the claim below unsupported/HIGH. Fail-closed: an errored
// call, unparseable response, or missing verdict CONFIRMS those claims (the block stands) --
// a fabrication must never escape because a confirmation call failed (§5 discipline: the
// main verification completed; an unavailable confirmation leaves its verdict standing).

// Confirmation batch size. 8 mirrors the specimen batch that measured clean discrimination
// (LeoVegas: 8 claims -> FPs cleared, weld HIGH, 4/4 draws); at 11-12 claims the iGP batches
// already showed contention onset (injected controls classifying beyond_window).
const FLOOR_CONFIRM_BATCH_SIZE = 8;

async function confirmFloorHighs(entity, cfg, ctx, entityResult, tools) {
  const { ai, logger } = tools;
  const item = entityResult.items[0];
  const meta = entityResult.meta;
  const highClaims = (item.flagged_claims || []).filter(f => f.severity === 'high').map(f => f.claim);

  const confCfg = { ...cfg, claims_per_batch: Math.min(FLOOR_CONFIRM_BATCH_SIZE, cfg.claims_per_batch) };
  // Guards inside cannot fire here: the floor only trips after a completed verification,
  // which requires sources and at least one claim.
  const conf = stageVerifyPrepare(entity, confCfg, highClaims, ctx, logger);
  const { batches, claimEvidence } = conf.verifyCtx;

  const confirmed = new Set();
  const confVerdicts = {}; // claim -> {verdict, severity} from the confirmation draw (audit trail)
  const responses = [];
  for (let b = 0; b < conf.verifyRequests.length; b++) {
    try {
      const r = await ai.complete(conf.verifyRequests[b].args);
      responses.push({ ok: true, text: r.text });
    } catch (err) {
      logger.warn(
        `${entity.name}: floor-confirmation call ${b + 1}/${conf.verifyRequests.length} failed ` +
        `(${err.message}) -- its claims stay confirmed (fail-closed); remaining batches skipped ` +
        `(the floor stands regardless, further spend is moot)`
      );
      responses.push({ ok: false, error: err.message });
      break;
    }
  }
  for (let b = 0; b < batches.length; b++) {
    const resp = responses[b];
    if (!resp || resp.ok === false) {
      for (const c of batches[b]) confirmed.add(c);
      continue;
    }
    for (const v of buildBatchVerdicts(resp.text, batches[b])) {
      // Release requires re-verified SEVERITY below high -- regardless of verdict. A
      // verdict-based release (cleared if no longer 'unsupported') lets a weld escape by
      // flipping to 'partial': measured on the BC £50m/€50m currency error -- substance
      // true, currency false -- which re-verifies partial/HIGH on 2/2 small-batch draws.
      // Severity is what the floor gates on, and the v1.8.0 weld rule grades severity on
      // the evidence, so severity-below-high is the release test.
      const stillHigh = (v.severity || 'medium') === 'high';
      const affirmative = !v._parse_error && !v._missing_verdict;
      if (affirmative) confVerdicts[v.claim] = { verdict: v.verdict, severity: v.severity || 'medium' };
      if (!affirmative || stillHigh) confirmed.add(v.claim);
    }
  }

  const confirmedCount = highClaims.filter(c => confirmed.has(c)).length;
  const clearedCount = highClaims.length - confirmedCount;
  const qaPass = confirmedCount > 0 ? false : meta.qa_pass_at_threshold === true;

  item.flagged_claims = item.flagged_claims.map(f =>
    f.severity === 'high' ? { ...f, floor_confirmed: confirmed.has(f.claim) } : f);
  item.qa_pass = qaPass;
  meta.qa_pass = qaPass;
  delete meta.floor_confirmation_pending;
  delete meta.qa_pass_at_threshold;
  meta.floor_confirmation = {
    highs_initial: highClaims.length,
    highs_confirmed: confirmedCount,
    highs_cleared: clearedCount,
    batches: batches.length,
    claims: highClaims.map(c => ({
      claim: c,
      confirmed: confirmed.has(c),
      ...(confVerdicts[c] || { verdict: 'unverified', severity: 'high' }), // no affirmative verdict -> fail-closed
      // evidence tag under the CONFIRMATION window (diagnostic only, never a gate)
      evidence: claimEvidence[c] || 'unknown',
    })),
  };
  item.summary_text += confirmedCount > 0
    ? ` FLOOR CONFIRMATION: ${confirmedCount} of ${highClaims.length} high-severity claim(s) ` +
      `re-verified as unsupported/high in a focused batch (uncontended retrieval) -- the floor stands.`
    : ` FLOOR CONFIRMATION: 0 of ${highClaims.length} high-severity claim(s) survived focused ` +
      `re-verification (uncontended retrieval) -- retrieval-starved false positives; the floor is ` +
      `released and the score decides (${qaPass ? 'PASS' : 'FAIL at threshold'}). Flags retained for review.`;

  logger.info(
    `${entity.name}: floor confirmation -- ${confirmedCount}/${highClaims.length} HIGH(s) confirmed, ` +
    `${clearedCount} cleared, qa_pass=${qaPass}`
  );
  return entityResult;
}

// ─── Main execute function ───
//
// Phase 2B refactor: the per-entity body is split into pure STAGES
// (stageExtractPrepare → applyExtraction → stageVerifyPrepare → stageFinalize) so the
// SAME code serves both the synchronous path (execute, default, byte-identical to before)
// AND the Anthropic Message Batches path (prepareExtractionRequests / prepareVerificationRequests
// / parseResults, used by the skeleton's step-6 batch executor). A parsed batch verdict is
// therefore byte-identical to the sync verdict given the same LLM responses -- the only
// difference is WHEN the response arrives (now vs a batch return up to 24h later). A failed
// or never-run verification request HARD-FAILS the entity loudly in BOTH modes (v1.7.0):
// sync previously degraded a failed batch's claims to verdict:'unsupported', which reported
// an INFRASTRUCTURE failure (rate limit, network blip, refused call) as a CONTENT verdict --
// the offering-slot draw-2 incident: 2 of 4 batches refused pre-network by a budget guard
// produced hallucination 0.495 + a spurious QA FAIL on a draft whose every flagged claim
// greps true in the corpus. ENGINEERING_CONTRACT §5: throw rather than degrade.
// Nothing about the verdict logic, severity floor, or scoring changes.

// Resolve + normalize all options once. Shared by execute() and the batch entry points so
// both derive an IDENTICAL config -- the sync-vs-batch equivalence rests on this single source.
function resolveDetectorOptions(options) {
  const { ai_model, ai_provider, ...otherOptions } = options;
  const {
    pass_threshold = 0.9,
    max_source_chars = 100000,
    claims_per_batch = 10,
    allow_empty_content = false,
    no_sources_behavior = 'fail',
    flag_zero_claims_over_chars = 500,
    claim_extraction = 'regex',
    severity_floor = false,
    severity_model = 'current',
    source_selection = 'head',
    extraction_model = null,
    extraction_provider = null,
    cache_base_window = false,
    floor_confirmation = false,
  } = otherOptions;
  const severityModel = severity_model === 'evidence_absent' ? 'evidence_absent' : 'current';
  const resolvedProvider = ai_provider === undefined ? 'anthropic' : ai_provider;
  return {
    ai_model, ai_provider,
    pass_threshold, max_source_chars, claims_per_batch,
    no_sources_behavior, flag_zero_claims_over_chars,
    extraction_model, extraction_provider,
    useLlmExtraction: claim_extraction === 'llm',
    severityFloor: asBool(severity_floor),
    allowEmptyContent: asBool(allow_empty_content),
    claimAnchored: source_selection === 'claim_anchored',
    useCacheSplit: asBool(cache_base_window) && resolvedProvider === 'anthropic',
    severityModel,
    floorConfirmation: asBool(floor_confirmation),
    verificationPrompt: MANIFEST_DEFAULT_PROMPT,
    _severityModelRaw: severity_model,
  };
}

// The one-per-call config logs (info + the two severity_model warnings). Side-effect only --
// never affects the returned result, so it is factored out of the pure stages.
function logConfig(cfg, logger) {
  if (cfg._severityModelRaw && cfg._severityModelRaw !== cfg.severityModel) {
    logger.warn(`Unknown severity_model="${cfg._severityModelRaw}" -- using "current" (no severity re-grading).`);
  }
  if (cfg.severityModel === 'evidence_absent' && !cfg.claimAnchored) {
    logger.warn('severity_model=evidence_absent needs source_selection=claim_anchored to classify evidence; with source_selection=head no HIGH claim can be regraded (behaves as "current").');
  }
  logger.info(
    `Config: pass_threshold=${cfg.pass_threshold}, model=${cfg.ai_model || 'default'}, ` +
    `provider=${cfg.ai_provider || 'default'}, max_source_chars=${cfg.max_source_chars}, ` +
    `claims_per_batch=${cfg.claims_per_batch}`
  );
}

// STAGE A -- content guard + extraction setup. No LLM call here; the caller (sync or batch)
// owns it. Returns {final} (no-content guard -> a finished result), {extractionArgs, ctx}
// (claim_extraction:'llm' -- caller runs one LLM call, then applyExtraction), or {claims, ctx}
// (regex -- claims already in hand).
function stageExtractPrepare(entity, cfg, logger) {
  const contentItems = (entity.items || []).filter(item => item.content_markdown);
  const sourceItems = (entity.items || []).filter(item => item.text_content);

  if (contentItems.length === 0) {
    if (cfg.allowEmptyContent) {
      logger.warn(`${entity.name}: no content_markdown found -- skipping (allow_empty_content=true)`);
      return { final: {
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          qa_pass: true,
          hallucination_score: 1,
          verified_claims_count: 0,
          partial_claims_count: 0,
          total_claims_count: 0,
          flagged_claims_count: 0,
          flagged_claims: [],
          flagged_claims_text: '',
          partial_claims_text: '',
          summary_text: 'No content_markdown found -- nothing to verify. Skipped (allow_empty_content=true).',
        }],
        meta: { qa_pass: true, hallucination_score: 1, skipped: true, skip_reason: 'no_content_allowed' },
      } };
    }

    logger.error(
      `${entity.name}: no content_markdown found -- failing closed ` +
      `(content expected but absent; set allow_empty_content to skip with a pass)`
    );
    return { final: {
      entity_name: entity.name,
      items: [{
        entity_name: entity.name,
        qa_pass: false,
        hallucination_score: 0,
        verified_claims_count: 0,
        partial_claims_count: 0,
        total_claims_count: 0,
        flagged_claims_count: 0,
        flagged_claims: [],
        flagged_claims_text: '',
        partial_claims_text: '',
        summary_text: 'No content_markdown found -- content was expected but is absent, so no claims could be verified. Failing closed (unverifiable is not verified). Set allow_empty_content to skip with a pass.',
      }],
      meta: { qa_pass: false, hallucination_score: 0, error: 'no_content' },
    } };
  }

  const allMarkdown = contentItems.at(-1).content_markdown;
  const extractionModel = cfg.extraction_model || cfg.ai_model;
  const extractionProvider = cfg.extraction_provider || cfg.ai_provider;
  const ctx = { name: entity.name, sourceItems, allMarkdown };

  if (cfg.useLlmExtraction) {
    const prompt = CLAIM_EXTRACTION_PROMPT.replace('{{CONTENT}}', allMarkdown);
    return { extractionArgs: { prompt, model: extractionModel, provider: extractionProvider, max_tokens: EXTRACTION_MAX_TOKENS }, ctx };
  }
  return { claims: extractClaims(allMarkdown), ctx };
}

// Apply an extraction LLM response. Returns {claims} to proceed, or {degraded, detail} to
// HARD-FAIL the entity loud (extractionFailedResult) -- NEVER a silent regex fallback that
// produces a verdict.
//
// TRUNCATION is the catastrophic case (fails OPEN): a cut-off extraction returns FEWER
// claims -- the missing ones may be the fabrications -- yet the old code fell back to the
// regex extractor (~4 claims on a v3 draft) and the entity could PASS. It is now an INFRA
// failure (v1.7.0 discipline, mirroring a failed verification batch), so a degraded
// extraction can never yield qa_pass:true. Two truncation signals:
//   - stop_reason==='max_tokens' -- definitive; present in SYNC (the skeleton strips it in
//     batch by normalising the result to {ok,text}).
//   - a NON-EMPTY response that does not parse to a claim array -- the only trace left in
//     BATCH mode (a truncated JSON array has no closing bracket -> parsesToArray false).
// PRESERVED (settled, NOT truncation, byte-identical to before): an errored call still falls
// back to regex (a transient blip), and a genuine empty `[]` still falls back to regex ->
// the H21 zero-claims guard (which already fails-closed on substantial content).
// resp = {ok:true, text, stop_reason?} | {ok:false, error}. (Regex-mode entities never call this.)
function applyExtraction(ctx, resp, logger) {
  if (resp && resp.ok !== false && resp.stop_reason === 'max_tokens') {
    return { degraded: 'extraction_truncated',
      detail: `hit the ${EXTRACTION_MAX_TOKENS}-token extraction ceiling (stop_reason=max_tokens)` };
  }
  if (!resp || resp.ok === false) {
    const msg = (resp && resp.error) || 'no response';
    logger.warn(`${ctx.name}: LLM claim extraction failed (${msg}) -- falling back to regex extractor`);
    return { claims: extractClaims(ctx.allMarkdown) };
  }
  const claims = parseExtractedClaims(resp.text);
  if (claims.length === 0) {
    // A non-empty response that yielded no parseable claim array is a degraded (likely
    // truncated) extraction -- in batch mode the skeleton strips stop_reason, so this is the
    // only truncation signal left. A genuine empty `[]` (or empty text) parses fine and
    // falls through to the settled regex fallback -> H21.
    if ((resp.text || '').trim().length > 0 && !parsesToArray(resp.text)) {
      return { degraded: 'extraction_truncated',
        detail: 'response present but no claim array could be parsed (likely truncated)' };
    }
    logger.warn(`${ctx.name}: LLM claim extraction returned no claims -- falling back to regex extractor`);
    return { claims: extractClaims(ctx.allMarkdown) };
  }
  logger.info(`${ctx.name}: LLM claim extraction found ${claims.length} claim(s)`);
  return { claims };
}

// STAGE B -- source guards + window building + verification-request construction. No LLM call.
// Returns {final} (no-sources / zero-claims guards) or {verifyRequests, verifyCtx}. Each
// verifyRequest.args is EXACTLY the {prompt[,cache_prefix],model,provider} object the sync path
// hands to ai.complete -- so a batched verification request is byte-identical to the sync call.
function stageVerifyPrepare(entity, cfg, claims, ctx, logger) {
  const sourceItems = ctx.sourceItems;
  const allMarkdown = ctx.allMarkdown;

  // --- H20: no source text_content -- cannot verify anything ---
  if (sourceItems.length === 0) {
    if (cfg.no_sources_behavior === 'pass') {
      logger.warn(`${entity.name}: no source text_content -- skipping with pass (no_sources_behavior=pass)`);
      return { final: {
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          qa_pass: true,
          hallucination_score: 1,
          verified_claims_count: 0, partial_claims_count: 0, total_claims_count: claims.length,
          flagged_claims_count: 0, flagged_claims: [], flagged_claims_text: '', partial_claims_text: '',
          summary_text: `No source text_content available -- ${claims.length} claim(s) unverifiable. Skipped with pass (no_sources_behavior=pass).`,
        }],
        meta: { qa_pass: true, hallucination_score: 1, skipped: true, skip_reason: 'no_sources', total_claims: claims.length },
      } };
    }
    const flagOnly = cfg.no_sources_behavior === 'flag';
    const summary = `No source text_content available -- ${claims.length} extracted claim(s) are unverifiable ` +
      `(nothing to ground them against). ` +
      (flagOnly
        ? 'Flagged for manual review (no_sources_behavior=flag).'
        : 'Failing closed: unverifiable is not verified. Set no_sources_behavior=flag or =pass to soften.');
    logger[flagOnly ? 'warn' : 'error'](`${entity.name}: ${summary}`);
    return { final: {
      entity_name: entity.name,
      items: [{
        entity_name: entity.name,
        qa_pass: flagOnly,
        needs_review: true,
        hallucination_score: 0,
        verified_claims_count: 0, partial_claims_count: 0, total_claims_count: claims.length,
        flagged_claims_count: claims.length, flagged_claims: [], flagged_claims_text: '', partial_claims_text: 'None.',
        summary_text: summary,
      }],
      meta: { qa_pass: flagOnly, needs_review: true, hallucination_score: 0, total_claims: claims.length, skip_reason: 'no_sources' },
    } };
  }

  // --- H21: zero extractable claims is NOT a clean green ---
  if (claims.length === 0) {
    const substantial = allMarkdown.length > cfg.flag_zero_claims_over_chars;
    const zeroBase = {
      entity_name: entity.name,
      needs_review: true,
      verified_claims_count: 0, partial_claims_count: 0, total_claims_count: 0,
      flagged_claims_count: 0, flagged_claims: [], flagged_claims_text: '', partial_claims_text: '',
    };
    if (substantial) {
      const summary = `No verifiable factual claims could be extracted from ${allMarkdown.length} chars of content. ` +
        `The extractor recognizes only enumerated numeric/date/company claims, so purely qualitative content yields ` +
        `zero claims -- this substantial content cannot be certified as fact-checked (padding-blind signature). ` +
        `Failing closed pending the LLM-faithfulness extractor (UNIT_50 #51).`;
      logger.warn(`${entity.name}: ${summary}`);
      return { final: {
        entity_name: entity.name,
        items: [{ ...zeroBase, qa_pass: false, hallucination_score: 0, summary_text: summary }],
        meta: { qa_pass: false, needs_review: true, hallucination_score: 0, total_claims: 0, zero_claims: true },
      } };
    }
    const summary = `No factual claims detected in a short (${allMarkdown.length} chars) content body -- nothing to ` +
      `verify. Low-confidence pass (needs_review); the regex extractor cannot see qualitative claims (UNIT_50 #51).`;
    logger.info(`${entity.name}: ${summary}`);
    return { final: {
      entity_name: entity.name,
      items: [{ ...zeroBase, qa_pass: true, hallucination_score: 1, summary_text: summary }],
      meta: { qa_pass: true, needs_review: true, hallucination_score: 1, total_claims: 0, zero_claims: true },
    } };
  }

  // --- Prepare source context ---
  const corpusChars = sourceItems.reduce((n, it) => n + (it.text_content || '').length, 0);
  const chunks = cfg.claimAnchored ? chunkSources(sourceItems) : null;
  const idf = cfg.claimAnchored ? buildIdf(chunks, claims) : null;
  const sourceText = cfg.claimAnchored ? null : combineSourceText(sourceItems, cfg.max_source_chars);

  logger.info(
    `${entity.name}: ${claims.length} claims extracted, ` +
    `${sourceItems.length} source(s), ` +
    (cfg.claimAnchored
      ? `${corpusChars} corpus chars, claim-anchored windows <= ${cfg.max_source_chars} chars`
      : `${sourceText.length} chars of source text`)
  );

  // --- Build one verification request per claim batch (no LLM call) ---
  const batches = batchClaims(claims, cfg.claims_per_batch);
  const claimEvidence = {}; // claim -> 'in_window' | 'beyond_window' | 'absent' (claim_anchored only)
  let maxShownChars = 0;
  const verifyRequests = [];

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const claimsText = batch.map((c, idx) => `${idx + 1}. ${c}`).join('\n');

    let batchSourceText, baseSourceText, suppSourceText;
    if (cfg.claimAnchored) {
      const win = selectAnchoredWindow(chunks, batch, cfg.max_source_chars, idf);
      batchSourceText = win.text;
      baseSourceText = win.baseText;
      suppSourceText = win.suppText;
      maxShownChars = Math.max(maxShownChars, win.shownChars);
      for (const c of batch) {
        if (!(c in claimEvidence)) claimEvidence[c] = classifyClaimEvidence(c, chunks, win.selectedOrders, idf);
      }
    } else {
      batchSourceText = sourceText;
      baseSourceText = sourceText; // head mode: the whole shared window IS the base
      suppSourceText = '';
    }

    let args;
    if (cfg.useCacheSplit) {
      const cachePrefix = `${PROMPT_HEADER}\n\nSOURCE MATERIAL:\n${baseSourceText}`;
      const tail = (suppSourceText ? SOURCE_SEP + suppSourceText : '') + `\n\nCLAIMS:\n${claimsText}`;
      args = { prompt: tail, cache_prefix: cachePrefix, model: cfg.ai_model, provider: cfg.ai_provider };
    } else {
      const filledPrompt = cfg.verificationPrompt
        .replace('{{CLAIMS}}', claimsText)
        .replace('{{SOURCES}}', batchSourceText);
      args = { prompt: filledPrompt, model: cfg.ai_model, provider: cfg.ai_provider };
    }
    verifyRequests.push({ args });
  }

  return {
    verifyRequests,
    verifyCtx: { batches, claimEvidence, claimAnchored: cfg.claimAnchored, corpusChars, maxShownChars },
  };
}

// Build verdict objects for ONE batch from its response text. Mirrors the sync ok-response
// handling exactly: unparseable -> _parse_error on every claim; fewer verdicts than claims ->
// _missing_verdict on the tail.
function buildBatchVerdicts(responseText, batch) {
  const verdicts = parseLlmResponse(responseText);
  const out = [];
  if (verdicts.length === 0) {
    for (const claim of batch) {
      out.push({ claim, verdict: 'unsupported', quote: null, severity: 'medium', _parse_error: true });
    }
  } else {
    for (let v = 0; v < batch.length; v++) {
      if (v < verdicts.length) {
        out.push({
          claim: batch[v],
          verdict: verdicts[v].verdict || 'unsupported',
          quote: verdicts[v].quote || null,
          severity: verdicts[v].severity || 'medium',
        });
      } else {
        out.push({
          claim: batch[v],
          verdict: 'unsupported',
          quote: null,
          severity: 'medium',
          _missing_verdict: true,
        });
      }
    }
  }
  return out;
}

// Loud-fail result (BOTH modes, v1.7.0) when one or more of an entity's verification
// requests errored, expired, or was never attempted. meta.status:'error' makes the
// skeleton's deriveEntityRunStatus mark the run 'failed' (surfaced in failed_count) -- an
// INFRA failure to be retried, never a content verdict: a fact-check that did not complete
// is NOT a clean pass, NOT a soft qa_pass:false, and above all NOT "these claims are
// fabricated". No claim from a failed batch is ever reported as 'unsupported'; the score
// never moves because of a call that did not happen (ENGINEERING_CONTRACT §5).
// failures = [{batch: 0-based idx, error}]; notAttempted = [0-based idx] (sync stops
// calling after the first failure -- further spend is discarded on retry anyway).
// An extraction that did not complete cleanly (truncated at the token ceiling, or a
// truncated batch response with the stop_reason stripped) is an INFRA failure, never a
// content verdict: a degraded extraction examines FEWER claims than the draft contains, so
// the missing claims -- which may be the fabrications -- would go unverified. meta.status:'error'
// makes the skeleton's deriveEntityRunStatus mark the run 'failed' (surfaced in failed_count),
// so the degradation is impossible to miss and the entity can NEVER produce qa_pass:true.
// Mirrors verificationFailedResult (v1.7.0). ENGINEERING_CONTRACT §5: throw rather than degrade.
function extractionFailedResult(entity, reason, detail, logger) {
  const summary = `Claim extraction did not complete (${reason}${detail ? ': ' + detail : ''}). ` +
    `Failing closed -- a degraded extraction examines FEWER claims than the draft contains, so ` +
    `the missing claims (which may be the fabrications) would go unverified. This is an ` +
    `INFRASTRUCTURE failure (retry the run at the raised ceiling), not a content verdict: no ` +
    `fabrication was found and nothing is a clean pass.`;
  if (logger) logger.error(`${entity.name}: ${summary}`);
  return {
    entity_name: entity.name,
    items: [{
      entity_name: entity.name,
      // status on the ITEM too: a timeout-salvaged _partialItems copy (Rule 10) carries no
      // meta, so without this the salvage would read as a content FAIL at score 0.
      status: 'error',
      qa_pass: false,
      needs_review: true,
      hallucination_score: 0,
      verified_claims_count: 0, partial_claims_count: 0, total_claims_count: 0,
      flagged_claims_count: 0, flagged_claims: [], flagged_claims_text: '', partial_claims_text: 'None.',
      summary_text: summary,
    }],
    meta: {
      status: 'error',
      qa_pass: false,
      needs_review: true,
      hallucination_score: 0,
      total_claims: 0,
      error: reason,
    },
  };
}

function verificationFailedResult(entity, batches, failures, notAttempted) {
  const totalClaims = batches.reduce((n, b) => n + b.length, 0);
  const unverifiedClaims = failures.reduce((n, f) => n + batches[f.batch].length, 0) +
    notAttempted.reduce((n, b) => n + batches[b].length, 0);
  const failedDesc = failures
    .map(f => `${f.batch + 1}/${batches.length} (${f.error || 'unknown'})`)
    .join(', ');
  const skippedDesc = notAttempted.length
    ? ` Batch(es) ${notAttempted.map(b => b + 1).join(', ')} not attempted after the first failure.`
    : '';
  const summary = `Verification did not complete: batch ${failedDesc} errored or expired.${skippedDesc} ` +
    `${unverifiedClaims} of ${totalClaims} claim(s) were never examined. Failing closed -- ` +
    `this is an INFRASTRUCTURE failure (retry the run), not a content verdict: no unverified ` +
    `claim is reported as unsupported and no fabrication was found.`;
  return {
    entity_name: entity.name,
    items: [{
      entity_name: entity.name,
      // status on the ITEM too: a timeout-salvaged _partialItems copy (Rule 10) carries no
      // meta, so without this the salvage would read as a content FAIL at score 0.
      status: 'error',
      qa_pass: false,
      needs_review: true,
      hallucination_score: 0,
      verified_claims_count: 0, partial_claims_count: 0, total_claims_count: totalClaims,
      flagged_claims_count: 0, flagged_claims: [], flagged_claims_text: '', partial_claims_text: 'None.',
      summary_text: summary,
    }],
    meta: {
      status: 'error',
      qa_pass: false,
      needs_review: true,
      hallucination_score: 0,
      total_claims: totalClaims,
      error: 'verification_incomplete',
      failed_batches: failures.map(f => ({ batch: f.batch + 1, of: batches.length, error: f.error || 'unknown' })),
      ...(notAttempted.length ? { batches_not_attempted: notAttempted.map(b => b + 1) } : {}),
      claims_unverified: unverifiedClaims,
    },
  };
}

// STAGE C -- assemble verdicts across batches, score, decide, build the entity result. This is
// the pre-refactor scoring/decision/output block verbatim. batchResponses[b] = {ok:true, text}
// | {ok:false, error} | undefined (sync stopped calling after an earlier failure). ANY failed
// or unattempted batch HARD-FAILS the entity (both modes, v1.7.0) -- an unverified claim is
// not an unsupported claim, so a refused/errored request must never become claim verdicts.
function stageFinalize(entity, cfg, verifyCtx, batchResponses, logger) {
  const { batches, claimEvidence, claimAnchored, corpusChars, maxShownChars } = verifyCtx;

  const failures = [];
  const notAttempted = [];
  for (let b = 0; b < batches.length; b++) {
    const resp = batchResponses[b];
    if (!resp) notAttempted.push(b);
    else if (resp.ok === false) failures.push({ batch: b, error: resp.error });
  }
  if (failures.length > 0 || notAttempted.length > 0) {
    return verificationFailedResult(entity, batches, failures, notAttempted);
  }

  const allVerdicts = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const resp = batchResponses[b];
    const bv = buildBatchVerdicts(resp.text, batch);
    // Truth-critical diagnostic (parity with the pre-refactor sync path + now also in
    // batch): a RECEIVED-but-unparseable response marks the whole batch _parse_error.
    if (logger && bv.length > 0 && bv.every(v => v._parse_error)) {
      logger.warn(
        `${entity.name}: batch ${b + 1} returned unparseable response -- ` +
        `treating ${batch.length} claims as unverified`
      );
    }
    allVerdicts.push(...bv);
  }

  // --- Calculate scores ---
  const totalClaims = allVerdicts.length;
  const supportedClaims = allVerdicts.filter(v => v.verdict === 'supported');
  const partialClaims = allVerdicts.filter(v => v.verdict === 'partial');
  const unsupportedClaims = allVerdicts.filter(v => v.verdict === 'unsupported');

  const verifiedValue = supportedClaims.length + partialClaims.length * 0.5;
  const hallucinationScore = totalClaims > 0
    ? verifiedValue / totalClaims
    : 1;

  const { qaPass: qaPassed, floorTripped: severityFloorTripped, highSevUnsupported, regraded: unsupportedRegraded } =
    decideHallucinationPass({
      hallucinationScore, unsupportedClaims, claimEvidence,
      passThreshold: cfg.pass_threshold, severityFloor: cfg.severityFloor, severityModel: cfg.severityModel,
    });

  const flaggedClaims = unsupportedRegraded.map(v => (
    claimAnchored
      ? { claim: v.claim, severity: v.severity, evidence: claimEvidence[v.claim] || 'unknown' }
      : { claim: v.claim, severity: v.severity }
  ));

  const flaggedClaimsText = unsupportedRegraded.length > 0
    ? unsupportedRegraded
        .map((v, idx) => {
          const tag = claimAnchored ? ` {${claimEvidence[v.claim] || 'unknown'}}` : '';
          return `${idx + 1}. [${(v.severity || 'medium').toUpperCase()}]${tag} ${v.claim}`;
        })
        .join('\n')
    : 'None -- all claims are supported by source material.';

  const partialClaimsText = partialClaims.length > 0
    ? partialClaims
        .map((v, idx) => {
          const quotePart = v.quote ? ` (source: "${v.quote}")` : '';
          return `${idx + 1}. ${v.claim}${quotePart}`;
        })
        .join('\n')
    : 'None.';

  const summaryParts = [
    `${totalClaims} factual claim(s) extracted from content.`,
    `${supportedClaims.length} fully supported, ${partialClaims.length} partially supported, ${unsupportedClaims.length} unsupported.`,
  ];

  if (unsupportedClaims.length > 0) {
    const highSeverity = unsupportedRegraded.filter(v => v.severity === 'high').length;
    const mediumSeverity = unsupportedRegraded.filter(v => v.severity === 'medium').length;
    const lowSeverity = unsupportedRegraded.filter(v => v.severity === 'low').length;
    const severityParts = [];
    if (highSeverity > 0) severityParts.push(`${highSeverity} high`);
    if (mediumSeverity > 0) severityParts.push(`${mediumSeverity} medium`);
    if (lowSeverity > 0) severityParts.push(`${lowSeverity} low`);
    summaryParts.push(`Unsupported severity: ${severityParts.join(', ')}.`);
  }

  summaryParts.push(
    `Hallucination score: ${(hallucinationScore * 100).toFixed(1)}% ` +
    `(threshold: ${(cfg.pass_threshold * 100).toFixed(1)}%).`
  );

  if (severityFloorTripped) {
    summaryParts.push(
      `SEVERITY FLOOR: ${highSevUnsupported.length} high-severity unsupported claim(s) ` +
      `force-fail this check regardless of the score.`
    );
  }

  const evBeyond = claimAnchored ? unsupportedClaims.filter(v => claimEvidence[v.claim] === 'beyond_window').length : 0;
  const evAbsent = claimAnchored ? unsupportedClaims.filter(v => claimEvidence[v.claim] === 'absent').length : 0;
  const evInWindow = claimAnchored ? unsupportedClaims.filter(v => claimEvidence[v.claim] === 'in_window').length : 0;
  if (claimAnchored && unsupportedClaims.length > 0) {
    summaryParts.push(
      `Evidence location of flagged claims: ${evInWindow} in-window, ${evBeyond} beyond-window ` +
      `(likely truncation), ${evAbsent} absent from source (candidate fabrication).`
    );
  }

  const summaryText = summaryParts.join(' ');

  return {
    entity_name: entity.name,
    items: [{
      entity_name: entity.name,
      qa_pass: qaPassed,
      hallucination_score: parseFloat(hallucinationScore.toFixed(3)),
      verified_claims_count: supportedClaims.length,
      partial_claims_count: partialClaims.length,
      total_claims_count: totalClaims,
      flagged_claims_count: unsupportedClaims.length,
      flagged_claims: flaggedClaims,
      flagged_claims_text: flaggedClaimsText,
      partial_claims_text: partialClaimsText,
      summary_text: summaryText,
    }],
    meta: {
      qa_pass: qaPassed,
      hallucination_score: parseFloat(hallucinationScore.toFixed(3)),
      total_claims: totalClaims,
      supported: supportedClaims.length,
      partial: partialClaims.length,
      unsupported: unsupportedClaims.length,
      batches_sent: batches.length,
      ...(severityFloorTripped ? { severity_floor_tripped: true } : {}),
      // Handshake for the sync-path confirmation pass (v1.9.0): carries the EXACT
      // unrounded threshold decision so a released floor never re-decides off the
      // rounded stored score. Gated on the option -- absent = byte-identical output.
      ...(severityFloorTripped && cfg.floorConfirmation ? {
        floor_confirmation_pending: true,
        qa_pass_at_threshold: hallucinationScore >= cfg.pass_threshold,
      } : {}),
      ...(cfg.severityModel === 'evidence_absent' ? { severity_model: 'evidence_absent' } : {}),
      ...(claimAnchored ? {
        source_selection: 'claim_anchored',
        source_corpus_chars: corpusChars,
        source_chars_shown: maxShownChars,
        evidence_in_window: evInWindow,
        evidence_beyond_window: evBeyond,
        evidence_absent: evAbsent,
      } : {}),
    },
  };
}

// _partialItems push mirrors the pre-refactor pattern exactly: every result EXCEPT the two
// skip-with-pass results (meta.skipped) was pushed (Rule 10 timeout resilience).
function pushPartial(tools, result) {
  if (tools._partialItems && !(result.meta && result.meta.skipped)) {
    tools._partialItems.push(...result.items);
  }
}

// Build the run summary from the per-entity results (verbatim from the pre-refactor tail).
function buildSummary(results, totalEntities) {
  const passCount = results.filter(r => r.items.length > 0 && r.items[0].qa_pass === true).length;
  const failCount = results.filter(r => r.items.length > 0 && r.items[0].qa_pass === false).length;
  const skippedCount = results.filter(r => r.meta && r.meta.skipped).length;
  const avgScore = results.length > 0
    ? results.reduce((sum, r) => sum + (r.items[0]?.hallucination_score || 0), 0) / results.length
    : 0;

  let description;
  if (failCount === 0) {
    description = `All ${passCount} entities passed hallucination detection (avg score: ${(avgScore * 100).toFixed(1)}%)`;
  } else {
    const parts = [];
    if (passCount > 0) parts.push(`${passCount} passed`);
    if (failCount > 0) parts.push(`${failCount} failed`);
    if (skippedCount > 0) parts.push(`${skippedCount} skipped`);
    description = `${parts.join(', ')} of ${totalEntities} entities (avg score: ${(avgScore * 100).toFixed(1)}%)`;
  }

  return {
    total_entities: totalEntities,
    total_items: results.reduce((sum, r) => sum + r.items.length, 0),
    passed: passCount,
    failed: failCount,
    skipped: skippedCount,
    average_score: parseFloat(avgScore.toFixed(3)),
    description,
  };
}

// SYNCHRONOUS path (default, byte-identical to pre-refactor). Runs each stage inline, making
// the extraction + verification LLM calls through tools.ai.complete exactly as before.
async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress, ai } = tools;
  const cfg = resolveDetectorOptions(options);
  logConfig(cfg, logger);

  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Processing ${entity.name}`);

    const a = stageExtractPrepare(entity, cfg, logger);
    if (a.final) {
      results.push(a.final);
      pushPartial(tools, a.final);
      continue;
    }

    let claims;
    if (a.extractionArgs) {
      let resp;
      try {
        const r = await ai.complete({ prompt: a.extractionArgs.prompt, model: a.extractionArgs.model, provider: a.extractionArgs.provider, max_tokens: a.extractionArgs.max_tokens });
        resp = { ok: true, text: r.text, stop_reason: r.stop_reason };
      } catch (err) {
        resp = { ok: false, error: err.message };
      }
      const ex = applyExtraction(a.ctx, resp, logger);
      if (ex.degraded) {
        const er = extractionFailedResult(entity, ex.degraded, ex.detail, logger);
        results.push(er);
        pushPartial(tools, er);
        continue;
      }
      claims = ex.claims;
    } else {
      claims = a.claims;
    }

    const bstage = stageVerifyPrepare(entity, cfg, claims, a.ctx, logger);
    if (bstage.final) {
      results.push(bstage.final);
      pushPartial(tools, bstage.final);
      continue;
    }

    const batchResponses = [];
    for (let b = 0; b < bstage.verifyRequests.length; b++) {
      progress.update(
        i + 1, entities.length,
        `${entity.name}: verifying batch ${b + 1}/${bstage.verifyRequests.length}`
      );
      try {
        const r = await ai.complete(bstage.verifyRequests[b].args);
        batchResponses.push({ ok: true, text: r.text });
      } catch (err) {
        logger.warn(
          `${entity.name}: LLM call failed for verification batch ${b + 1}/${bstage.verifyRequests.length}: ` +
          `${err.message} -- failing this entity closed (INFRA failure, not a content verdict)`
        );
        batchResponses.push({ ok: false, error: err.message });
        // The entity hard-fails regardless; the remaining batches' results would be
        // discarded, so stop spending on them (they are reported as not attempted).
        break;
      }
    }

    let entityResult = stageFinalize(entity, cfg, bstage.verifyCtx, batchResponses, logger);
    if (cfg.floorConfirmation && entityResult.meta.severity_floor_tripped) {
      progress.update(i + 1, entities.length, `${entity.name}: confirming severity-floor HIGH claim(s)`);
      entityResult = await confirmFloorHighs(entity, cfg, a.ctx, entityResult, tools);
    }
    const it = entityResult.items[0];
    logger[it.qa_pass ? 'info' : 'warn'](
      `${entity.name}: hallucination_score=${(it.hallucination_score * 100).toFixed(1)}% ` +
      `(${it.qa_pass ? 'PASS' : 'FAIL'}) -- ` +
      `${it.verified_claims_count} supported, ${it.partial_claims_count} partial, ` +
      `${it.flagged_claims_count} unsupported of ${it.total_claims_count} claims`
    );
    results.push(entityResult);
    pushPartial(tools, entityResult);
  }

  return { results, summary: buildSummary(results, entities.length) };
}

// ─── Batch mode (Phase 2B) — Anthropic Message Batches prepare/parse entry points ───
//
// The skeleton's step-6 batch executor drives ALL the step's entities through two Message
// Batches (round 1 extractions, round 2 verifications -- verification needs the extracted
// claims). These three functions are PURE (no LLM call). The skeleton owns batch submit/poll
// and assigns every custom_id (this module never sees entity_submodule_run_id). They reuse the
// SAME stages as execute(), so a parsed verdict is byte-identical to the sync verdict given the
// same responses. `state` is threaded across the three calls (held in-memory by the skeleton's
// single batch job):  { cfg, perEntity: [ { name, done?, final?, ctx?, claims?, needExtraction?, verifyCtx? } ] }.
//
// Request objects returned:  { entityIdx[, batchIdx], args:{prompt[,cache_prefix],model,provider} }.
// Response objects expected back: extractionByEntityIdx[i] = {ok:true,text} | {ok:false,error} |
// undefined(regex, none needed); verificationByEntityIdx[i] = [ {ok:true,text}|{ok:false,error}, ... ]
// (one per batchIdx, in order).

const NOOP_LOGGER = { info() {}, warn() {}, error() {} };

function prepareExtractionRequests(entities, options, tools) {
  const logger = (tools && tools.logger) || NOOP_LOGGER;
  let cfg = resolveDetectorOptions(options);
  logConfig(cfg, logger);
  if (cfg.floorConfirmation) {
    // The confirmation pass needs a third synchronous round-trip; the Message-Batches flow
    // has exactly two (extract, verify). Force it off here so the floor keeps today's
    // all-or-nothing behaviour in batch mode -- conservative: nothing escapes, and
    // stageFinalize never emits the pending-handshake meta on a path that cannot resolve it.
    logger.warn(
      'floor_confirmation is sync-only -- Message-Batches mode keeps the unconfirmed ' +
      'all-or-nothing severity floor (a tripped floor blocks without re-verification).'
    );
    cfg = { ...cfg, floorConfirmation: false };
  }
  const perEntity = [];
  const extractionRequests = [];
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const a = stageExtractPrepare(entity, cfg, logger);
    if (a.final) {
      perEntity.push({ name: entity.name, done: true, final: a.final });
    } else if (a.extractionArgs) {
      perEntity.push({ name: entity.name, ctx: a.ctx, needExtraction: true });
      extractionRequests.push({ entityIdx: i, args: a.extractionArgs });
    } else {
      perEntity.push({ name: entity.name, ctx: a.ctx, claims: a.claims });
    }
  }
  return { state: { cfg, perEntity }, extractionRequests };
}

function prepareVerificationRequests(entities, options, state, extractionByEntityIdx, tools) {
  const logger = (tools && tools.logger) || NOOP_LOGGER;
  const { cfg, perEntity } = state;
  const verificationRequests = [];
  for (let i = 0; i < entities.length; i++) {
    const pe = perEntity[i];
    if (pe.done) continue;
    let claims = pe.claims;
    if (pe.needExtraction) {
      const ex = applyExtraction(pe.ctx, extractionByEntityIdx ? extractionByEntityIdx[i] : null, logger);
      if (ex.degraded) {
        pe.done = true;
        pe.final = extractionFailedResult(entities[i], ex.degraded, ex.detail, logger);
        continue;
      }
      claims = ex.claims;
    }
    const bstage = stageVerifyPrepare(entities[i], cfg, claims, pe.ctx, logger);
    if (bstage.final) {
      pe.done = true;
      pe.final = bstage.final;
      continue;
    }
    pe.verifyCtx = bstage.verifyCtx;
    bstage.verifyRequests.forEach((req, batchIdx) => {
      verificationRequests.push({ entityIdx: i, batchIdx, args: req.args });
    });
  }
  return { state, verificationRequests };
}

function parseResults(entities, options, state, verificationByEntityIdx, tools) {
  const logger = (tools && tools.logger) || NOOP_LOGGER;
  const { cfg, perEntity } = state;
  const results = [];
  for (let i = 0; i < entities.length; i++) {
    const pe = perEntity[i];
    if (pe.done && pe.final) {
      results.push(pe.final);
      continue;
    }
    // Map the entity's batch responses back in batch order; a missing response is a failure
    // (loud) -- stageFinalize hard-fails the entity on any {ok:false} batch.
    const byBatch = (verificationByEntityIdx && verificationByEntityIdx[i]) || [];
    const batchResponses = pe.verifyCtx.batches.map((_unused, b) =>
      byBatch[b] || { ok: false, error: 'missing_batch_response' });
    results.push(stageFinalize(entities[i], cfg, pe.verifyCtx, batchResponses, logger));
  }
  return { results, summary: buildSummary(results, entities.length) };
}

module.exports = execute;
// Exported for the W2.3 code-lock tests (behavior-equivalence + neutrality).
module.exports.MANIFEST_DEFAULT_PROMPT = MANIFEST_DEFAULT_PROMPT;
// Exported for the Unit B cache-split tests (prompt-restructure equivalence).
module.exports.PROMPT_HEADER = PROMPT_HEADER;
// Exported for the U1 claim-anchored retrieval tests.
module.exports.asBool = asBool;
module.exports.extractClaimTerms = extractClaimTerms;
module.exports.chunkSources = chunkSources;
module.exports.selectAnchoredWindow = selectAnchoredWindow;
module.exports.classifyClaimEvidence = classifyClaimEvidence;
// Exported for the top-K retrieval tests.
module.exports.topChunksForClaim = topChunksForClaim;
// Exported for the UNIT B evidence-absent severity-model tests.
module.exports.decideHallucinationPass = decideHallucinationPass;
// Phase 2B batch-mode entry points (used by the skeleton's step-6 batch executor).
module.exports.prepareExtractionRequests = prepareExtractionRequests;
module.exports.prepareVerificationRequests = prepareVerificationRequests;
module.exports.parseResults = parseResults;
