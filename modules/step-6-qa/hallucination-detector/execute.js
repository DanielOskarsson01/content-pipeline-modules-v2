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
- "high" = specific number, date, statistic, or financial claim not found in sources

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
 * LLM claim extraction (claim_extraction:"llm"). Sends the FULL draft (prose +
 * tables + lists) to the code-locked extraction prompt and returns claim strings.
 * On an empty/unparseable result or an LLM error, falls back to the regex extractor
 * (logged) so the entity stays gradeable -- a degraded extraction reverts to the old
 * behavior rather than silently green-lighting or hard-erroring. The zero-claims
 * guard (H21) still fires downstream if regex also finds nothing.
 */
async function extractClaimsLlm(markdown, ai, model, provider, logger, entityName) {
  const prompt = CLAIM_EXTRACTION_PROMPT.replace('{{CONTENT}}', markdown);
  try {
    const response = await ai.complete({ prompt, model, provider });
    const claims = parseExtractedClaims(response.text);
    if (claims.length === 0) {
      logger.warn(`${entityName}: LLM claim extraction returned no claims -- falling back to regex extractor`);
      return extractClaims(markdown);
    }
    logger.info(`${entityName}: LLM claim extraction found ${claims.length} claim(s)`);
    return claims;
  } catch (err) {
    logger.warn(`${entityName}: LLM claim extraction failed (${err.message}) -- falling back to regex extractor`);
    return extractClaims(markdown);
  }
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
function extractClaimTerms(claim) {
  const terms = new Map();
  const add = (t, w) => {
    const k = String(t).toLowerCase();
    if (k.length < 3 || STOPWORDS.has(k)) return;
    terms.set(k, Math.max(terms.get(k) || 0, w));
  };
  for (const m of claim.match(/\b[A-Z][A-Za-z0-9&.'\-]{2,}\b/g) || []) add(m, 2); // SNAITECH, Stanleybet, AAMS
  for (const m of claim.match(/\b\d[\d,.]*\b/g) || []) add(m, 2);                 // years / stats
  for (const m of (claim.toLowerCase().match(/[a-z][a-z0-9'\-]{2,}/g) || [])) add(m, 1);
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

function bestChunkForClaim(claim, chunks, idf) {
  const terms = extractClaimTerms(claim);
  let best = null, bestScore = 0;
  for (const c of chunks) {
    const s = scoreChunkForClaim(c.lower, terms, idf);
    if (s > bestScore) { bestScore = s; best = c; }
  }
  return { best, bestScore };
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

  // 2. For each claim whose single best chunk is BEYOND the head, pull that chunk in.
  //    (IDF ranking means the entity name can't make a head chunk win spuriously.)
  const suppOrders = new Set();
  for (const claim of claims) {
    const { best, bestScore } = bestChunkForClaim(claim, chunks, idf);
    if (best && bestScore > 0 && !baseOrders.has(best.order)) suppOrders.add(best.order);
  }

  // 3. Supplement (in corpus order) up to an equal maxChars budget on top of the base.
  const selected = [...base];
  let suppUsed = 0;
  for (const c of chunks) {
    if (baseOrders.has(c.order) || !suppOrders.has(c.order)) continue;
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

// Per-claim evidence location: does the corpus carry the claim's DISCRIMINATING
// evidence (IDF-scored > 0, so the entity name alone doesn't count), and if so was
// it inside the selected window? Distinguishes a truncation-driven "unsupported"
// from a real fabrication:
//   in_window     -- discriminating evidence is in a shown chunk (a genuine verdict)
//   beyond_window -- it exists but was dropped from the window (truncation artifact)
//   absent        -- no chunk carries discriminating evidence (candidate fabrication)
function classifyClaimEvidence(claim, chunks, selectedOrders, idf = buildIdf(chunks, [claim])) {
  const terms = extractClaimTerms(claim);
  // Prefer discriminating terms (idf > 0) so the ubiquitous entity name can't mark a
  // chunk as "evidence". But on a small corpus every term can be in every chunk
  // (idf 0 for all) -- there, fall back to raw presence so genuine in-window evidence
  // isn't mislabelled "absent" (a confidently-wrong "candidate fabrication").
  const hasDiscriminating = [...terms.keys()].some(t => (idf.get(t) || 0) > 0);
  const present = (lower) => hasDiscriminating
    ? [...terms].some(([t]) => (idf.get(t) || 0) > 0 && hasWord(lower, t))
    : [...terms.keys()].some(t => hasWord(lower, t));
  let anywhere = false;
  for (const c of chunks) {
    if (!present(c.lower)) continue;
    anywhere = true;
    if (selectedOrders.has(c.order)) return 'in_window';
  }
  return anywhere ? 'beyond_window' : 'absent';
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


// ─── Main execute function ───

async function execute(input, options, tools) {
  const { entities } = input;
  const { ai_model, ai_provider, ...otherOptions } = options;
  const { logger, progress, ai } = tools;
  const {
    pass_threshold = 0.9,
    max_source_chars = 100000,
    claims_per_batch = 10,
    allow_empty_content = false,
    // H20: what to do when there is NO source material to verify against.
    // 'fail' (default) = fail closed -- unverifiable is not verified (UNIT_50
    // Decision 1, "THE SEVERE ONE"). 'flag' = pass but needs_review. 'pass' =
    // legacy skip-with-pass for pipelines that legitimately have no sources.
    no_sources_behavior = 'fail',
    // H21: content this long (chars) that yields ZERO extractable claims is the
    // padding-blind signature -- it fails closed instead of auto-passing. Shorter
    // no-claim content is a low-confidence pass (needs_review). Calibration knob:
    // measure the trip rate; do not dial down to silence a genuine halt.
    flag_zero_claims_over_chars = 500,
    // B033: extraction strategy. "regex" (default) = the enumerated numeric/date/
    // company regex path (byte-identical to today). "llm" = a code-locked LLM pass
    // that reads the FULL draft incl. tables/lists -- restores claim granularity on
    // v3 drafts where facts live in Quick-Facts tables the regex cannot see.
    claim_extraction = 'regex',
    // B033: severity floor. When true, any claim verified as unsupported AND rated
    // high-severity force-fails the check regardless of the numeric ratio (B031/M3
    // pattern). Closes the "1 hard fabrication in 10 claims = exactly 0.9 = PASS"
    // hole (STEP6 sec 0.4). Emits through the same qa_pass:false -> hallucination:fail
    // routing key -- no new fail key.
    severity_floor = false,
    // U1: source selection strategy. "head" (default) = combineSourceText, the
    // corpus-head truncation, byte-identical to today (window-raise-only is this
    // mode with a bigger max_source_chars -- no code change). "claim_anchored" =
    // per-batch window built from the source chunks whose terms overlap the batch's
    // claims, so evidence beyond the head window is SHOWN (DIAGNOSIS Task 2 fix).
    // Claim-anchored mode also emits honest-window meta (corpus/shown chars +
    // per-flagged-claim evidence location) so a truncation artifact is never again
    // indistinguishable from a fabrication.
    source_selection = 'head',
    // COST_OPTIMISATION Unit A: the claim-EXTRACTION call (claim_extraction:"llm")
    // is parsing-grade and can run on a cheaper model than verification. Null/absent
    // (default) inherits ai_model/ai_provider -- byte-identical to today. Set both to
    // route extraction elsewhere (e.g. openrouter/gpt-oss-120b); VERIFICATION is
    // untouched (it is the referee that grades every module).
    extraction_model = null,
    extraction_provider = null,
    // COST_OPTIMISATION Unit B: reuse the stable base (head) window across an
    // entity's verification batches via a cache_prefix, instead of re-sending it in
    // every batch. Default false = byte-identical to today (single filled prompt, no
    // cache_prefix). When true, the verification prompt is restructured so the
    // instructions + base window sit in a cache_prefix and only the per-batch
    // supplement + claims vary -- the model sees the SAME content, only reordered
    // (sources before claims). ANTHROPIC-ONLY: non-anthropic verification providers
    // ignore cache_prefix, so the split silently falls back to the single prompt for
    // them (never drops the base window).
    cache_base_window = false,
  } = otherOptions;

  const useLlmExtraction = claim_extraction === 'llm';
  // Coerce every boolean through asBool (the string-typed-preset bug class):
  // "false" is a truthy string, so a naive read would silently enable the option.
  const severityFloor = asBool(severity_floor);
  const allowEmptyContent = asBool(allow_empty_content);
  const claimAnchored = source_selection === 'claim_anchored';
  const cacheBaseWindow = asBool(cache_base_window);
  // Unit B cache-split is safe only for anthropic: ai.complete honors cache_prefix
  // ONLY when the resolved provider === 'anthropic', and it resolves an UNDEFINED
  // provider to 'anthropic' (destructuring default) but leaves an explicit null as
  // null. So we mirror that exactly: undefined -> anthropic (cache honored), null or
  // any other value -> NOT anthropic. A plain `?? 'anthropic'` would wrongly treat
  // null as anthropic and enable the split -- the skeleton would then DROP the
  // cache_prefix and the verifier would grade against a stripped source window.
  const resolvedProvider = ai_provider === undefined ? 'anthropic' : ai_provider;
  const useCacheSplit = cacheBaseWindow && resolvedProvider === 'anthropic';

  // Verification prompt is code-locked (W2.3) -- NOT template-overridable.
  // Any `prompt` a template supplies lands in otherOptions and is ignored.
  const verificationPrompt = MANIFEST_DEFAULT_PROMPT;

  logger.info(
    `Config: pass_threshold=${pass_threshold}, model=${ai_model || 'default'}, ` +
    `provider=${ai_provider || 'default'}, max_source_chars=${max_source_chars}, ` +
    `claims_per_batch=${claims_per_batch}`
  );

  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Processing ${entity.name}`);

    // --- Data-shape routing: find content and source items by field presence ---
    const contentItems = (entity.items || []).filter(item => item.content_markdown);
    const sourceItems = (entity.items || []).filter(item => item.text_content);

    // --- Edge case: no content_markdown -- fail closed (A3 / MODERATE M1) ---
    // content_markdown is base-hydrated and requires_items skips empty-pool
    // entities upstream, so reaching here with no content means generation
    // produced nothing -- content was expected but is absent, an ERROR, not
    // "nothing to check." A QA gate must never emit "pass" for content it never
    // read: this is the silent-salvage class in its most dangerous form. Fail
    // closed with qa_pass:false (a QA verdict that routes/flags like any other
    // fail -- NOT meta.status:error). allow_empty_content restores the legacy
    // skip-with-pass for pipelines that legitimately have no content to check.
    if (contentItems.length === 0) {
      if (allowEmptyContent) {
        logger.warn(`${entity.name}: no content_markdown found -- skipping (allow_empty_content=true)`);
        results.push({
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
        });
        continue;
      }

      logger.error(
        `${entity.name}: no content_markdown found -- failing closed ` +
        `(content expected but absent; set allow_empty_content to skip with a pass)`
      );
      const noContentResult = {
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
      };
      results.push(noContentResult);
      if (tools._partialItems) tools._partialItems.push(...noContentResult.items);
      continue;
    }

    // --- Select the content_markdown to grade (H18b) ---
    // content-writer and tone-seo-editor BOTH emit inline content_markdown under
    // add with different source_submodule, so both drafts survive the pool. The
    // step-8 output modules publish only the latest (.at(-1) -- tone-seo-editor
    // refines content-writer: markdown-output:189 / html-output:182 /
    // json-output:151). Grade the SAME draft, not both concatenated, or the
    // verdict is about text that was never published.
    const allMarkdown = contentItems.at(-1).content_markdown;

    // --- Extract factual claims (BEFORE the source guard, so a no-sources ---
    // --- failure can report how many claims went unverifiable) ---
    // B033: llm mode routes extraction through the code-locked LLM pass (reads
    // tables/lists), falling back to regex on empty/error. Default is regex --
    // byte-identical to the prior contract.
    // Unit A: extraction can run on a cheaper model; null/absent inherits the
    // verification model/provider (byte-identical). Verification stays on ai_model.
    const extractionModel = extraction_model || ai_model;
    const extractionProvider = extraction_provider || ai_provider;
    const claims = useLlmExtraction
      ? await extractClaimsLlm(allMarkdown, ai, extractionModel, extractionProvider, logger, entity.name)
      : extractClaims(allMarkdown);

    // --- H20: no source text_content -- cannot verify anything ---
    // UNIT_50 Decision 1 ("THE SEVERE ONE"): content asserting claims with no
    // grounding to check against is the most dangerous silent pass. Fail closed
    // by default; no_sources_behavior carves out flag/pass.
    if (sourceItems.length === 0) {
      if (no_sources_behavior === 'pass') {
        logger.warn(`${entity.name}: no source text_content -- skipping with pass (no_sources_behavior=pass)`);
        results.push({
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
        });
        continue;
      }
      const flagOnly = no_sources_behavior === 'flag';
      const summary = `No source text_content available -- ${claims.length} extracted claim(s) are unverifiable ` +
        `(nothing to ground them against). ` +
        (flagOnly
          ? 'Flagged for manual review (no_sources_behavior=flag).'
          : 'Failing closed: unverifiable is not verified. Set no_sources_behavior=flag or =pass to soften.');
      logger[flagOnly ? 'warn' : 'error'](`${entity.name}: ${summary}`);
      const noSrcResult = {
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
      };
      results.push(noSrcResult);
      if (tools._partialItems) tools._partialItems.push(...noSrcResult.items);
      continue;
    }

    // --- H21: zero extractable claims is NOT a clean green ---
    // The regex extractor only keeps enumerated numeric/date/company claims, so
    // purely qualitative content yields zero claims. Substantial content with
    // zero claims is the padding-blind signature -- fail closed (needs_review).
    // Short no-claim content is a low-confidence pass (needs_review), not a
    // confident score:1. The full remedy (LLM faithfulness extractor + de-dup of
    // the regex shared with citation-coverage) is UNIT_50 #51 -- NOT attempted
    // here; a regex broadening would manufacture false confidence (UNIT_50 OQ7).
    if (claims.length === 0) {
      const substantial = allMarkdown.length > flag_zero_claims_over_chars;
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
        const r = {
          entity_name: entity.name,
          items: [{ ...zeroBase, qa_pass: false, hallucination_score: 0, summary_text: summary }],
          meta: { qa_pass: false, needs_review: true, hallucination_score: 0, total_claims: 0, zero_claims: true },
        };
        results.push(r);
        if (tools._partialItems) tools._partialItems.push(...r.items);
        continue;
      }
      const summary = `No factual claims detected in a short (${allMarkdown.length} chars) content body -- nothing to ` +
        `verify. Low-confidence pass (needs_review); the regex extractor cannot see qualitative claims (UNIT_50 #51).`;
      logger.info(`${entity.name}: ${summary}`);
      const r = {
        entity_name: entity.name,
        items: [{ ...zeroBase, qa_pass: true, hallucination_score: 1, summary_text: summary }],
        meta: { qa_pass: true, needs_review: true, hallucination_score: 1, total_claims: 0, zero_claims: true },
      };
      results.push(r);
      if (tools._partialItems) tools._partialItems.push(...r.items);
      continue;
    }

    // --- Prepare source context ---
    // Head (default): one head-truncated window shared by every batch, byte-identical.
    // Claim-anchored: per-batch windows built below from ranked chunks of the corpus.
    const corpusChars = sourceItems.reduce((n, it) => n + (it.text_content || '').length, 0);
    const chunks = claimAnchored ? chunkSources(sourceItems) : null;
    // IDF is corpus-wide, so build it once per entity (over all claims' terms) and
    // share it across batches rather than recomputing per batch.
    const idf = claimAnchored ? buildIdf(chunks, claims) : null;
    const sourceText = claimAnchored ? null : combineSourceText(sourceItems, max_source_chars);

    logger.info(
      `${entity.name}: ${claims.length} claims extracted, ` +
      `${sourceItems.length} source(s), ` +
      (claimAnchored
        ? `${corpusChars} corpus chars, claim-anchored windows <= ${max_source_chars} chars`
        : `${sourceText.length} chars of source text`)
    );

    // --- Batch claims and verify with LLM ---
    const batches = batchClaims(claims, claims_per_batch);
    const allVerdicts = [];
    const claimEvidence = {}; // claim text -> 'in_window' | 'beyond_window' | 'absent' (claim_anchored only)
    let maxShownChars = 0;

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      progress.update(
        i + 1, entities.length,
        `${entity.name}: verifying batch ${b + 1}/${batches.length}`
      );

      const claimsText = batch.map((c, idx) => `${idx + 1}. ${c}`).join('\n');

      // Head mode reuses the shared window; claim_anchored builds a focused window
      // for THIS batch's claims and records where each claim's evidence sits.
      // baseText = the stable head window (identical every batch); suppText = the
      // per-batch far chunks (claim_anchored only). Kept separate for Unit B caching.
      let batchSourceText, baseSourceText, suppSourceText;
      if (claimAnchored) {
        const win = selectAnchoredWindow(chunks, batch, max_source_chars, idf);
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

      // Unit B: split the stable block (instructions + base window) into a
      // cache_prefix and send only the per-batch tail (supplement + claims) as the
      // varying prompt. The model concatenates them with no separator, so it sees the
      // SAME instructions + SAME source chunks + SAME claims as the single-prompt path
      // -- only the section ORDER differs (sources before claims; supplements after
      // the base instead of interleaved by corpus order). Default (useCacheSplit
      // false) keeps the exact single filled prompt below, byte-identical to today.
      let completeArgs;
      if (useCacheSplit) {
        const cachePrefix = `${PROMPT_HEADER}\n\nSOURCE MATERIAL:\n${baseSourceText}`;
        // SOURCE_SEP goes BEFORE the supplement (the base|supp seam), matching the
        // single-prompt join `chunks.join(SOURCE_SEP)` -- so every page boundary is
        // preserved and no spurious separator lands before CLAIMS. (Head mode:
        // suppSourceText is '' so the tail is just the claims block.)
        const tail = (suppSourceText ? SOURCE_SEP + suppSourceText : '') + `\n\nCLAIMS:\n${claimsText}`;
        completeArgs = { prompt: tail, cache_prefix: cachePrefix, model: ai_model, provider: ai_provider };
      } else {
        const filledPrompt = verificationPrompt
          .replace('{{CLAIMS}}', claimsText)
          .replace('{{SOURCES}}', batchSourceText);
        completeArgs = { prompt: filledPrompt, model: ai_model, provider: ai_provider };
      }

      try {
        const response = await ai.complete(completeArgs);

        const verdicts = parseLlmResponse(response.text);

        if (verdicts.length === 0) {
          logger.warn(
            `${entity.name}: batch ${b + 1} returned unparseable response -- ` +
            `treating ${batch.length} claims as unverified`
          );
          // Treat unparseable response as all claims being unverifiable
          for (const claim of batch) {
            allVerdicts.push({
              claim,
              verdict: 'unsupported',
              quote: null,
              severity: 'medium',
              _parse_error: true,
            });
          }
        } else {
          // Match verdicts back to claims by position
          for (let v = 0; v < batch.length; v++) {
            if (v < verdicts.length) {
              allVerdicts.push({
                claim: batch[v], // Use our original claim text
                verdict: verdicts[v].verdict || 'unsupported',
                quote: verdicts[v].quote || null,
                severity: verdicts[v].severity || 'medium',
              });
            } else {
              // LLM returned fewer verdicts than claims
              allVerdicts.push({
                claim: batch[v],
                verdict: 'unsupported',
                quote: null,
                severity: 'medium',
                _missing_verdict: true,
              });
            }
          }
        }
      } catch (err) {
        logger.warn(
          `${entity.name}: LLM call failed for batch ${b + 1}: ${err.message} -- ` +
          `treating ${batch.length} claims as unverified`
        );
        for (const claim of batch) {
          allVerdicts.push({
            claim,
            verdict: 'unsupported',
            quote: null,
            severity: 'medium',
            _error: err.message,
          });
        }
      }
    }

    // --- Calculate scores ---
    const totalClaims = allVerdicts.length;
    const supportedClaims = allVerdicts.filter(v => v.verdict === 'supported');
    const partialClaims = allVerdicts.filter(v => v.verdict === 'partial');
    const unsupportedClaims = allVerdicts.filter(v => v.verdict === 'unsupported');

    // Half-weighting of partials lives ONLY in the score. The counts report
    // supported/partial/unsupported separately and sum to total -- never a
    // rounded blend that disagrees with meta.supported.
    const verifiedValue = supportedClaims.length + partialClaims.length * 0.5;
    const hallucinationScore = totalClaims > 0
      ? verifiedValue / totalClaims
      : 1;

    // B033 severity floor (B031/M3 force-fail pattern): a hard, high-severity
    // fabrication force-fails the check regardless of the numeric ratio. The SCORE
    // still reports the honest ratio (never masked); only qa_pass is forced false,
    // and it emits through the same hallucination:fail key -- no new fail key.
    const highSevUnsupported = unsupportedClaims.filter(v => (v.severity || 'medium') === 'high');
    const severityFloorTripped = severityFloor && highSevUnsupported.length > 0;
    const qaPassed = severityFloorTripped ? false : (hallucinationScore >= pass_threshold);

    // --- Build flagged claims output ---
    // Head mode emits {claim, severity} exactly as before (byte-identical). Claim-
    // anchored adds the evidence location so a truncation artifact is visible.
    const flaggedClaims = unsupportedClaims.map(v => (
      claimAnchored
        ? { claim: v.claim, severity: v.severity, evidence: claimEvidence[v.claim] || 'unknown' }
        : { claim: v.claim, severity: v.severity }
    ));

    const flaggedClaimsText = unsupportedClaims.length > 0
      ? unsupportedClaims
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

    // --- Summary ---
    const summaryParts = [
      `${totalClaims} factual claim(s) extracted from content.`,
      `${supportedClaims.length} fully supported, ${partialClaims.length} partially supported, ${unsupportedClaims.length} unsupported.`,
    ];

    if (unsupportedClaims.length > 0) {
      const highSeverity = unsupportedClaims.filter(v => v.severity === 'high').length;
      const mediumSeverity = unsupportedClaims.filter(v => v.severity === 'medium').length;
      const lowSeverity = unsupportedClaims.filter(v => v.severity === 'low').length;
      const severityParts = [];
      if (highSeverity > 0) severityParts.push(`${highSeverity} high`);
      if (mediumSeverity > 0) severityParts.push(`${mediumSeverity} medium`);
      if (lowSeverity > 0) severityParts.push(`${lowSeverity} low`);
      summaryParts.push(`Unsupported severity: ${severityParts.join(', ')}.`);
    }

    summaryParts.push(
      `Hallucination score: ${(hallucinationScore * 100).toFixed(1)}% ` +
      `(threshold: ${(pass_threshold * 100).toFixed(1)}%).`
    );

    if (severityFloorTripped) {
      summaryParts.push(
        `SEVERITY FLOOR: ${highSevUnsupported.length} high-severity unsupported claim(s) ` +
        `force-fail this check regardless of the score.`
      );
    }

    // Claim-anchored only: split the flagged claims by where their evidence sits, so
    // a truncation artifact (beyond-window) reads differently from a fabrication (absent).
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

    const logFn = qaPassed ? 'info' : 'warn';
    logger[logFn](
      `${entity.name}: hallucination_score=${(hallucinationScore * 100).toFixed(1)}% ` +
      `(${qaPassed ? 'PASS' : 'FAIL'}) -- ` +
      `${supportedClaims.length} supported, ${partialClaims.length} partial, ` +
      `${unsupportedClaims.length} unsupported of ${totalClaims} claims`
    );

    const entityResult = {
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
        // Only present when the floor actually fired -- keeps default output byte-identical.
        ...(severityFloorTripped ? { severity_floor_tripped: true } : {}),
        // U1 honest-window instrumentation -- claim_anchored only, so head output
        // stays byte-identical. Distinguishes truncation artifacts from fabrications.
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
    results.push(entityResult);
    if (tools._partialItems) tools._partialItems.push(...entityResult.items);
  }

  // --- Build summary ---
  const totalEntities = entities.length;
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
    results,
    summary: {
      total_entities: totalEntities,
      total_items: results.reduce((sum, r) => sum + r.items.length, 0),
      passed: passCount,
      failed: failCount,
      skipped: skippedCount,
      average_score: parseFloat(avgScore.toFixed(3)),
      description,
    },
  };
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
