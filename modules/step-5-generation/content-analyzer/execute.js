/**
 * Content Analyzer — Step 5 Generation submodule
 *
 * Structural fact extraction from scraped content for each entity using an LLM.
 * Produces one structured analysis per entity: categories, tags,
 * key facts, and source citations.
 *
 * v1.3.0: Pure extraction — no summaries, opinions, or marketing prose.
 *
 * Data operation: ADD (+) — appends analysis alongside existing pool items.
 */

/**
 * Assemble all scraped page content for an entity into a single text block.
 * Each page is separated with a header showing URL and title.
 *
 * B029-1: `includePageIntent` (default false → byte-identical legacy framing)
 * switches the per-page header to the measured framing B — a numbered header
 * with url/title lines plus the item's Step-2 intent classification when
 * present (+~25 tokens/page). The intent line is omitted for items without
 * `page_intent`.
 *
 * B029-2: returns { text, totalChars, truncated } so the caller can surface
 * input truncation (previously only an in-prompt marker). The truncation
 * marker text itself is unchanged — prompt bytes are identical to before.
 */
function assembleEntityContent(items, maxChars, includePageIntent) {
  const parts = [];
  let n = 0;
  for (const item of items) {
    n++;
    let header;
    if (includePageIntent) {
      header = `--- PAGE ${n} ---\nurl: ${item.url}\ntitle: ${item.title || 'Untitled'}`;
      if (item.page_intent) {
        header += `\nintent: ${item.page_intent}`;
        if (item.intent_confidence !== undefined && item.intent_confidence !== null) {
          header += ` (confidence ${item.intent_confidence})`;
        }
      }
    } else {
      header = `--- Page: ${item.title || 'Untitled'} (${item.url}) ---`;
    }
    const content = item.text_content || '';
    parts.push(`${header}\n${content}`);
  }
  let assembled = parts.join('\n\n');
  const totalChars = assembled.length;
  const truncated = totalChars > maxChars;
  if (truncated) {
    assembled = assembled.substring(0, maxChars) + '\n\n[Content truncated at ' + maxChars + ' characters]';
  }
  return { text: assembled, totalChars, truncated };
}

/**
 * Resolve {doc:filename} reference-doc placeholders + strip any that go unmatched.
 * Shared by buildPrompt and buildCachedPrompt so both produce identical bytes.
 */
function resolveDocs(text, referenceDocs) {
  let out = text;
  // Replace {doc:filename} placeholders with actual doc content.
  // Function-form replacement: String.prototype.replace interprets $-patterns
  // ($$, $&, $`, $', $n) in a STRING replacement, which mangles doc content or
  // scraped text containing those sequences (ubiquitous — e.g. "$$" for money).
  // A replacer function inserts the value literally. This also fixes the
  // BACKLOG #21 cache split: buildPrompt (this path) and buildCachedPrompt's
  // plain concatenation now agree byte-for-byte on $-content, so the split
  // engages instead of falling back.
  if (referenceDocs && typeof referenceDocs === 'object') {
    for (const [filename, content] of Object.entries(referenceDocs)) {
      const str = String(content);
      out = out.replace(new RegExp(`\\{doc:${escapeRegex(filename)}\\}`, 'g'), () => str);
    }
  }
  // Clean up any unreplaced {doc:...} placeholders
  return out.replace(/\{doc:[^}]+\}/g, '');
}

/**
 * Replace prompt placeholders with actual content.
 * - {entity_content} → assembled scraped content
 * - {doc:filename} → reference doc content (from resolved options)
 */
function buildPrompt(promptTemplate, entityContent, referenceDocs) {
  // Function-form replacement so $-sequences in scraped entity content are
  // inserted literally (not interpreted as replacement patterns). See resolveDocs.
  return resolveDocs(promptTemplate.replace(/\{entity_content\}/g, () => entityContent), referenceDocs);
}

/**
 * Cache-aware variant (BACKLOG #21). Splits the assembled prompt at {entity_content}
 * so the STABLE head (instructions + reference-doc vocabulary, ~20K tokens for the
 * company-profile template) can be sent as an Anthropic prompt-cache block, and the
 * VARIABLE per-entity tail is the uncached remainder. Returns { prompt, cachePrefix }
 * where `prompt` is the variable tail and `cachePrefix` is the cacheable head;
 * `cachePrefix + prompt` is BYTE-IDENTICAL to buildPrompt() output (the model sees
 * the same input — caching changes billing only). Splits only when {entity_content}
 * occurs exactly once (the normal template shape); 0 or >1 occurrences fall back to
 * the full single prompt with an empty prefix (no caching, identical bytes). A prefix
 * below the model's cache minimum (Sonnet 4.5 1024 / Haiku 4.5 Opus 4.6 4096 tokens)
 * silently won't cache — harmless; the 20K reference docs clear it.
 *
 * DEPLOY-ORDER DEPENDENCY: the skeleton `ai.complete` must support `cache_prefix`
 * (skeleton #21) BEFORE this is live. An OLD skeleton ignores `cache_prefix` and
 * would send only the variable tail — DROPPING the reference-doc vocabulary, so the
 * model invents slugs. Deploy skeleton #21 first / together; never ship this alone.
 */
function buildCachedPrompt(promptTemplate, entityContent, referenceDocs) {
  const full = buildPrompt(promptTemplate, entityContent, referenceDocs);
  const parts = promptTemplate.split('{entity_content}');
  if (parts.length === 2) {
    const cachePrefix = resolveDocs(parts[0], referenceDocs);
    const prompt = resolveDocs(entityContent + parts[1], referenceDocs);
    // BULLETPROOF GUARD: only cache-split when it reassembles to the EXACT
    // single-prompt bytes. Caching is billing-only — it must never change what
    // the model sees. As of the $-sequence fix (buildPrompt/resolveDocs now use
    // function-form replacement), the $-content divergence is gone: buildPrompt
    // and this concatenation agree on $$/$&/$`/$' content, so the split engages.
    // The guard remains as defense-in-depth — it still catches the residual
    // divergence case (b): a template nesting {entity_content} inside a {doc:...}
    // token, where the two paths resolve tokens in different order. That falls
    // back to the full prompt (no caching, identical bytes).
    if (cachePrefix + prompt === full) return { prompt, cachePrefix };
  }
  // 0 or >1 {entity_content}, or a divergent split → no caching, identical bytes.
  return { prompt: full, cachePrefix: '' };
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse JSON from LLM response, handling markdown code fences.
 * Handles: complete fences, truncated fences (missing closing ```),
 * preamble text before JSON, and case-insensitive fence labels.
 */
function parseJsonResponse(text) {
  let cleaned = text.trim();

  // 1. Try complete fence: ```json ... ```
  const fenceMatch = cleaned.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  } else {
    // 2. Fallback: strip opening fence (handles truncated responses where
    //    the model hit max_tokens before closing the fence)
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/, '').trim();
  }

  // 3. Extract outermost JSON object — handles preamble text or trailing text
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}

/**
 * Common acronyms that should be uppercased in auto-derived labels.
 */
const ACRONYMS = new Set(['llm', 'ai', 'url', 'api', 'id', 'cta', 'roi', 'seo', 'qa', 'ui', 'ux', 'serp', 'pse', 'csv', 'json', 'html', 'css', 'sql', 'http', 'ip', 'dns']);

/**
 * Convert a snake_case or camelCase key to a human-readable label.
 * Handles acronyms: 'llm_response' → 'LLM Response', 'ai_model' → 'AI Model'.
 */
function keyToLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(word => ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

const MAX_SECTION_CHARS = 2000;

/**
 * Render any JSON value as human-readable text for display.
 * Depth-limited to prevent runaway recursion on deeply nested LLM output.
 */
function renderValue(value, depth = 0) {
  if (value === null || value === undefined) return 'Not available';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  // At max depth, fall back to compact JSON
  if (depth >= 2) {
    const json = JSON.stringify(value);
    return json.length > 200 ? json.substring(0, 200) + '...' : json;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return 'None';
    // Array of primitives → comma-separated
    if (value.every(v => typeof v === 'string' || typeof v === 'number')) {
      return value.join(', ');
    }
    // Array of objects → one line per entry, pick readable fields
    return value.map(item => {
      if (typeof item === 'string' || typeof item === 'number') return String(item);
      if (typeof item === 'object' && item !== null) {
        // Pick display-friendly fields, skip metadata like 'source', 'evidence'
        const parts = Object.entries(item)
          .filter(([k]) => k !== 'source' && k !== 'evidence')
          .map(([k, v]) => {
            if (typeof v === 'string' || typeof v === 'number') return `${v}`;
            return renderValue(v, depth + 1);
          })
          .filter(Boolean);
        return parts.join(' — ');
      }
      return String(item);
    }).join('\n');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== null && v !== undefined);
    if (entries.length === 0) return 'Not available';
    return entries.map(([k, v]) => {
      const label = keyToLabel(k);
      const rendered = renderValue(v, depth + 1);
      return `${label}: ${rendered}`;
    }).join('\n');
  }

  return String(value);
}

/**
 * Build a short preview string from the first few meaningful values in the analysis.
 * Used in the card list view for at-a-glance scanning.
 */
function buildPreview(analysis) {
  const previews = [];
  for (const [, value] of Object.entries(analysis)) {
    if (previews.length >= 3) break;
    if (typeof value === 'string' && value.length > 0 && value.length < 100) {
      previews.push(value);
    } else if (Array.isArray(value) && value.length > 0) {
      const items = value
        .map(v => typeof v === 'string' ? v : (v?.slug || v?.label || v?.name || v?.detail || ''))
        .filter(Boolean)
        .slice(0, 3);
      if (items.length > 0) previews.push(items.join(', '));
    } else if (typeof value === 'number') {
      previews.push(String(value));
    }
    // Skip objects — not useful for preview
  }
  return previews.join(' · ') || 'Analysis complete';
}

/**
 * Auto-flatten any LLM JSON response into display fields and dynamic section definitions.
 * No hardcoded knowledge of specific schemas — adapts to whatever the prompt produces.
 */
function flattenAnalysis(analysis) {
  const result = {
    summary_preview: buildPreview(analysis),
    _dynamic_sections: [],
  };

  for (const [key, value] of Object.entries(analysis)) {
    const label = keyToLabel(key);
    let text = renderValue(value);

    // Cap section text length
    if (text.length > MAX_SECTION_CHARS) {
      text = text.substring(0, MAX_SECTION_CHARS) + '\n... (truncated)';
    }

    const fieldName = `section_${key}`;
    result[fieldName] = text;
    result._dynamic_sections.push({
      field: fieldName,
      label,
      display: text.includes('\n') ? 'prose' : 'text',
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// M2 / A4 — hollow-analysis CONTENT gate (pipeline-agnostic)
//
// parseJsonResponse validates JSON SHAPE only; a valid-but-empty object is a
// HOLLOW analysis. Same class as seo-planner's C2/A1, one module UPSTREAM.
// "Usable" is defined from the downstream consumer requirement, not arbitrarily:
// content-writer (assembleEntityContent) and seo-planner both serialize the
// ENTIRE analysis_json into their LLM prompt, so the analysis is usable iff it
// carries at least ONE real extracted value anywhere in its structure. The
// schema is fully dynamic (flattenAnalysis adapts to whatever the prompt
// produces), so — per Rule 13 — the gate names NO field; it checks for any
// non-empty content leaf (the same notion buildPreview uses to decide there is
// something to preview). Empty object, or an object whose every leaf is
// null/""/[]/{} → hollow. One real string/number/boolean anywhere → usable.
// ---------------------------------------------------------------------------

/** True iff `value` is (or recursively contains) a real, non-empty content leaf. */
function hasContentLeaf(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;      // an explicit boolean is a fact
  if (Array.isArray(value)) return value.some(hasContentLeaf);
  if (typeof value === 'object') return Object.values(value).some(hasContentLeaf);
  return false;
}

/** A parsed analysis is usable iff it is an object carrying ≥1 content leaf. */
function hasUsableAnalysis(analysis) {
  return !!analysis && typeof analysis === 'object' && hasContentLeaf(analysis);
}

// ---------------------------------------------------------------------------
// W1.3 — vocabulary-fidelity gate helpers (pipeline-agnostic)
//
// These helpers carry NO content-type knowledge. The paths and doc names come
// from the per-template `vocabulary_checks` option; an empty option makes the
// gate inert. This mirrors content-writer's `allowed_slug_paths` mechanism.
// ---------------------------------------------------------------------------

/**
 * Walk a tiny dot-notation path with `[]` array iteration into a structured
 * object, returning an array of string leaves. Identical semantics to
 * content-writer's walkSlugPath (kept local — modules are self-contained).
 */
function walkSlugPath(obj, path) {
  if (obj == null || typeof path !== 'string' || path.length === 0) return [];
  const segments = path.split('.');
  let curr = obj;
  for (let i = 0; i < segments.length; i++) {
    let seg = segments[i];
    if (curr == null) return [];
    const arrayIter = seg.endsWith('[]');
    if (arrayIter) seg = seg.slice(0, -2);
    const nextField = seg.length > 0 ? curr[seg] : curr;
    if (arrayIter) {
      if (!Array.isArray(nextField)) return [];
      const restPath = segments.slice(i + 1).join('.');
      if (restPath === '') {
        return nextField.map(x => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
      }
      return nextField.flatMap(item => walkSlugPath(item, restPath));
    }
    curr = nextField;
  }
  if (typeof curr === 'string') return [curr.trim()].filter(Boolean);
  if (Array.isArray(curr)) return curr.filter(x => typeof x === 'string').map(s => s.trim()).filter(Boolean);
  return [];
}

/**
 * Parse the `vocabulary_checks` textarea option into [{ path, doc }] entries.
 * Format: one entry per line, `<analysis_json.path[].slug>=<reference_doc_name>`.
 * Blank lines and `#` comments ignored. Returns [] when empty/missing — in
 * which case the gate is inert.
 */
function parseVocabularyChecks(configStr) {
  if (!configStr || typeof configStr !== 'string') return [];
  return configStr
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .map(line => {
      const eq = line.indexOf('=');
      if (eq < 1) return null;
      const path = line.slice(0, eq).trim();
      const doc = line.slice(eq + 1).trim();
      if (!path || !doc) return null;
      return { path, doc };
    })
    .filter(Boolean);
}

/**
 * Resolve a reference doc's content by name from the reference_docs object,
 * tolerating filename/path/case variation. Returns the content string or
 * undefined. reference_docs may be `[]` (the manifest default) → treated as none.
 */
function resolveReferenceDoc(referenceDocs, docName) {
  if (!referenceDocs || typeof referenceDocs !== 'object' || Array.isArray(referenceDocs)) return undefined;
  if (Object.prototype.hasOwnProperty.call(referenceDocs, docName)) return referenceDocs[docName];
  const lower = String(docName).toLowerCase();
  const key = Object.keys(referenceDocs).find(k => {
    const kl = k.toLowerCase();
    return kl === lower || kl.includes(lower) || lower.includes(kl);
  });
  return key ? referenceDocs[key] : undefined;
}

/**
 * Extract the set of slug-shaped tokens present in a vocabulary doc. Generic
 * and format-agnostic: any maximal `[a-z0-9&]+(-[a-z0-9&]+)*` run (length >= 2,
 * containing a letter), lowercased. `&` is a slug char so a legit tag like `m&a`
 * tokenizes whole, not split into `m`+`a` (both dropped by the length>=2 filter).
 * Deliberately lenient — it must NEVER
 * false-fail a valid slug that appears in the doc; it still catches grossly-
 * invented multi-word slugs (which won't appear as a token in the doc at all).
 */
function extractVocabSlugs(docContent) {
  const set = new Set();
  if (typeof docContent !== 'string' || docContent.length === 0) return set;
  const matches = docContent.toLowerCase().match(/[a-z0-9&]+(?:-[a-z0-9&]+)*/g);
  if (matches) {
    for (const tok of matches) {
      if (tok.length >= 2 && /[a-z]/.test(tok)) set.add(tok);
    }
  }
  return set;
}

/**
 * Citation-map stability across loop re-runs (B2). The article's inline [#n]
 * refs are minted against a specific source_citations numbering. A loop pass
 * re-runs the analyzer, which regenerates the map nondeterministically
 * (observed live: 52 entries -> 19 on byte-similar input), and the add-upsert
 * destroys the numbering every existing ref was written against. Preserving
 * the previous map verbatim and appending only genuinely new URLs makes the
 * map append-only across iterations, so earlier refs stay resolvable.
 */
function findPreviousSourceCitations(items) {
  // §7b hydration broadcasts analysis_json onto every entity-keyed item, so
  // several (possibly stale) copies of the map can coexist in the pool. The
  // most-evolved map is the one with the highest max index — under append-only
  // merging a newer map is always a superset, so highest max wins.
  let best = null;
  let bestMax = -1;
  for (const item of items || []) {
    const cites = item && item.analysis_json && item.analysis_json.source_citations;
    if (!Array.isArray(cites) || cites.length === 0) continue;
    // Legacy map shapes (plain URL strings, {claim, sources}) predate the
    // {index, url} contract — merging them would corrupt the map (spread on a
    // string yields char-index objects; missing indices collide with the
    // checker's positional fallback). Not a usable previous map: skip, and the
    // merge disengages to pre-v1.5.0 behavior.
    if (!cites.every(c => c && typeof c === 'object' && c.url && Number(c.index) > 0)) continue;
    const max = cites.reduce((m, c) => Math.max(m, Number(c.index) || 0), 0);
    if (max > bestMax) { bestMax = max; best = cites; }
  }
  return best;
}

function mergeSourceCitations(prev, next) {
  const merged = prev.map(c => ({ ...c }));
  const seen = new Set(prev.map(c => String(c.url || '').trim()).filter(Boolean));
  let maxIndex = prev.reduce((m, c) => Math.max(m, Number(c.index) || 0), 0);
  for (const c of Array.isArray(next) ? next : []) {
    const url = String((c && c.url) || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    merged.push({ ...c, index: ++maxIndex });
  }
  return merged;
}

// ---------------------------------------------------------------------------
// S1 — deterministic source-check gate (pipeline-agnostic, DEFAULT OFF)
//
// CURRENCY cite-or-null enforcement against the page each fact cites. The
// analyzer's own prompt already carries a cite-or-null rule ("state the value
// exactly as the source gives it; null if the source gives none"); this makes
// that rule MECHANICAL instead of trusting the model to self-police. For every
// object that carries a `source` http(s) URL — found by RECURSIVE WALK, so NO
// schema path is hardcoded and it works for any content type / prompt shape — a
// currency+amount the fact asserts must appear on the FULL text of the page it
// cites (item.text_content, the exact page the model was shown) with the SAME
// currency ADJACENT to the amount (±25 chars). Amount present but the claimed
// currency not adjacent to it anywhere → a currency SUBSTITUTION → drop the whole
// element (currency is embedded in prose; it cannot be surgically nulled without
// mangling the sentence). If the amount is not on the cited page at all, or the
// page is absent from the window, the fact is left untouched (uncheckable, never
// a flag).
//
// A removed fact NEVER reaches the writer (analysis_json is what the writer
// serializes) AND the removal is recorded on meta.source_check — visible +
// countable. A meta-only flag was rejected: the writer reads analysis_json, not
// meta, so a flag alone would not keep a bad fact out of the draft without a
// cross-module writer change this unit does not own.
//
// SCOPE — this catches the ONE cite-or-null class the run-9821ed56 re-audit
// (content-pipeline-specs template-v3/quality/DEFECT_REAUDIT.md, 2026-09-19)
// proved catchable single-page with ZERO false positives across 855 real cited
// facts: BC "£50m" where the cited page says €50m (currency substitution). The
// re-audit's other genuine defects were each evaluated against the real banked
// analyses and deliberately LEFT OUT — every one would null legitimate facts:
//
//   - DATE cite-or-null (BC PariuriX "2016" on an undated page). Built, then
//     REMOVED on evidence: the check "cited page lacks the asserted year" fired
//     on 18 real facts — 1 genuine (PariuriX) and 17 world-TRUE dates whose
//     cited page simply does not carry the year in scraped form (Step-3 scrapers
//     strip publication dates — re-audit §5; the date lives in the URL path, a
//     news-index page, or a stripped press-release dateline). Deterministically,
//     "year absent from cited page" cannot separate a world-false uncited date
//     from a world-true uncited date, so shipping it would null 17 legitimate
//     dates. FP-safe date checking needs the scraper to preserve publication
//     dates first — a data-layer change out of this unit's scope.
//   - subject/category weld (Push "Best High Volatility Game (Dinopolis)") — the
//     game name IS on the cited page; only the award CATEGORY is welded.
//   - person→company weld   (BC Søgaard Exec-of-the-Year) — the company IS on
//     the cited (person) page; catching it needs cross-attribution inference.
//   - uncited relation      (PayRetailers Kuady "proprietary wallet") — the
//     subject "Kuady" IS on the page; only the relation is unsupported.
//   A NAMED-SUBJECT presence check was also built and rejected on evidence: on
//   `name` fields it FLAGS the refuted Vixio Woolfrey "(former)" (name absent
//   from its own cited page) — a false positive on a REFUTED case; on
//   parentheticals it catches none of the above (their subjects are all present).
//   All of these route to human review, not blind patching — the same call the
//   re-audit made for the Woolfrey/OC7 cross-page cases.
// ---------------------------------------------------------------------------

// Currency canonical-form matchers (word-boundary safe so "compound" ≠ "pound").
const CURRENCY_FORMS = {
  GBP: /£|\bGBP\b|\bpounds?\b|\bsterling\b/i,
  EUR: /€|\bEUR\b|\bmEUR\b|\beuros?\b/i,
  USD: /\$|\bUSD\b|\bdollars?\b/i,
};

/** Canonicalise a currency marker to an ISO code, or null. */
function canonCurrency(marker) {
  const m = String(marker).toLowerCase();
  if (m === '£' || m.includes('gbp') || m.includes('pound') || m.includes('sterling')) return 'GBP';
  if (m === '€' || m.includes('eur')) return 'EUR';
  if (m === '$' || m.includes('usd') || m.includes('dollar')) return 'USD';
  return null;
}

/** Build a page-side regex matching the amount (magnitude required if present,
 *  so a bare "50" never matches "50 employees"). */
function amountRegex(num, mag) {
  const nEsc = String(num).replace(/,/g, '').replace(/\.0+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let magAlt = '';
  if (mag) {
    const g = String(mag).toLowerCase();
    if (/^(m|mn|million)$/.test(g)) magAlt = '\\s?(?:m|mn|million)';
    else if (/^(bn|billion)$/.test(g)) magAlt = '\\s?(?:bn|billion)';
    else if (/^(k|thousand)$/.test(g)) magAlt = '\\s?(?:k|thousand)';
  }
  return new RegExp(`\\b${nEsc}${magAlt}\\b`, 'gi');
}

/** Parse currency+amount expressions the fact ASSERTS (currency-prefixed form,
 *  e.g. "£50m", "EUR 50 million"). Returns [{ currency, amountRe }].
 *  MAGNITUDE-BEARING ONLY (m/mn/million/bn/billion/k/thousand): a bare-number
 *  amount ("£5") would build a page regex `\b5\b` that matches any "5" on the
 *  page ("5 free spins"), so on a currency-sparse page it could wrongly remove a
 *  legitimate fact. A magnitude makes the amount distinctive enough to reliably
 *  co-locate with its currency, keeping the fact-DELETING path false-positive
 *  safe. ponytail: bare-number currency amounts are intentionally uncheckable —
 *  upgrade to proximity-scored matching only if bare amounts prove worth the FP risk. */
function parseMoneyExpressions(str) {
  if (typeof str !== 'string') return [];
  const out = [];
  const cur = '£|€|\\$|GBP|EUR|mEUR|USD';
  const num = '\\d[\\d,]*(?:\\.\\d+)?';
  const mag = 'm|mn|million|bn|billion|k|thousand';
  // The magnitude needs a trailing \b or a bare "m" would eat the first letter of
  // a following word ("£5 minimum" → false "£5m"). \b anchors it to a real unit.
  const re = new RegExp(`(${cur})\\s?(${num})(?:\\s?(${mag})\\b)?`, 'gi');
  let m;
  while ((m = re.exec(str)) !== null) {
    const c = canonCurrency(m[1]);
    if (c && m[3]) out.push({ currency: c, amountRe: amountRegex(m[2], m[3]) }); // require a magnitude
  }
  return out;
}

/** Does the claimed currency appear ADJACENT to the amount on the page?
 *  Returns { sawAmount, found }. sawAmount=false ⇒ uncheckable (never a flag). */
function currencyNearAmount(pageText, currency, amountRe) {
  amountRe.lastIndex = 0;
  let m, sawAmount = false, found = false;
  const form = CURRENCY_FORMS[currency];
  while ((m = amountRe.exec(pageText)) !== null) {
    sawAmount = true;
    const start = Math.max(0, m.index - 25);
    const end = Math.min(pageText.length, m.index + m[0].length + 25);
    if (form && form.test(pageText.slice(start, end))) { found = true; break; }
    if (m.index === amountRe.lastIndex) amountRe.lastIndex++; // zero-width guard
  }
  return { sawAmount, found };
}

const SOURCE_CHECK_REMOVE = Symbol('source-check-remove');

/** url → full page text, trailing-slash tolerant, from the analyzer's own items. */
function buildPageIndex(items) {
  const idx = new Map();
  for (const it of items || []) {
    if (it && typeof it.url === 'string' && typeof it.text_content === 'string') {
      const u = it.url.trim();
      if (!idx.has(u)) idx.set(u, it.text_content);
      const noslash = u.replace(/\/+$/, '');
      if (!idx.has(noslash)) idx.set(noslash, it.text_content);
    }
  }
  return idx;
}
function lookupPage(idx, url) {
  if (idx.has(url)) return idx.get(url);
  const noslash = url.replace(/\/+$/, '');
  return idx.has(noslash) ? idx.get(noslash) : undefined;
}

/**
 * Verify every cited fact against its cited page. Returns
 * { cleaned, violations, stats } — `cleaned` is a NEW structure (input not
 * mutated); a currency substitution removes the whole element; a cited page
 * absent from the window, or an amount not on the cited page, is uncheckable
 * (never a violation). Pipeline-agnostic: keyed only on the generic `source` URL.
 */
function runSourceCheck(analysis, items) {
  const pageIndex = buildPageIndex(items);
  const violations = [];
  const stats = { cited: 0, uncheckable: 0, removed: 0 };

  function clean(node, path) {
    if (Array.isArray(node)) {
      const out = [];
      node.forEach((el, i) => {
        const c = clean(el, `${path}[${i}]`);
        if (c !== SOURCE_CHECK_REMOVE) out.push(c);
      });
      return out;
    }
    if (node && typeof node === 'object') {
      const obj = {};
      for (const [k, v] of Object.entries(node)) {
        const c = clean(v, path ? `${path}.${k}` : k);
        obj[k] = (c === SOURCE_CHECK_REMOVE) ? null : c;
      }
      const src = (typeof obj.source === 'string' && /^https?:\/\//i.test(obj.source)) ? obj.source.trim() : null;
      if (!src) return obj;
      stats.cited++;
      const pageText = lookupPage(pageIndex, src);
      if (pageText == null) { stats.uncheckable++; return obj; }

      // CURRENCY substitution check: amount present on the cited page but the
      // claimed currency not adjacent to it → drop the whole element.
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'source' || typeof v !== 'string') continue;
        for (const money of parseMoneyExpressions(v)) {
          const { sawAmount, found } = currencyNearAmount(pageText, money.currency, money.amountRe);
          if (sawAmount && !found) {
            stats.removed++;
            violations.push({ path, source: src, kind: 'currency', field: k, offending: v.slice(0, 160), reason: `${money.currency} amount not attributed to ${money.currency} on cited page` });
            return SOURCE_CHECK_REMOVE;
          }
        }
      }
      return obj;
    }
    return node;
  }

  const cleaned = clean(analysis, '');
  return { cleaned, violations, stats };
}

async function execute(input, options, tools) {
  const { entities } = input;
  const { ai_model, ai_provider, max_content_chars, prompt: promptTemplate, reference_docs, temperature, max_tokens, vocabulary_checks, include_page_intent, json_retry, source_check } = options;
  const { logger, progress, ai } = tools;

  // Warn if critical reference docs are missing — the prompt relies on {doc:master_categories.md}
  // and {doc:master_tags.md} to provide the fixed taxonomy. Without them, the LLM invents categories.
  const refDocNames = reference_docs && typeof reference_docs === 'object' ? Object.keys(reference_docs) : [];
  const hasMasterCategories = refDocNames.some(n => n.toLowerCase().includes('master_categories') || n.toLowerCase().includes('categories'));
  const hasMasterTags = refDocNames.some(n => n.toLowerCase().includes('master_tags') || n.toLowerCase().includes('tags'));
  if (!hasMasterCategories) {
    logger.warn('WARNING: master_categories.md not selected in reference docs. The LLM will invent category slugs instead of using the fixed taxonomy. Upload and select master_categories.md for accurate classification.');
  }
  if (!hasMasterTags) {
    logger.warn('WARNING: master_tags.md not selected in reference docs. The LLM will invent tag slugs instead of using the master tag list. Upload and select master_tags.md for accurate tagging.');
  }

  const results = [];
  const errors = [];

  // W1.3 pre-flight: when vocabulary_checks is configured, every referenced
  // vocab doc must resolve to non-empty content BEFORE we spend tokens. A
  // missing/empty doc means the fidelity gate cannot validate slugs (it would
  // reject everything), so fail fast with a clear, actionable error. Inert when
  // vocabulary_checks is empty (generic content types unaffected).
  const vocabChecks = parseVocabularyChecks(vocabulary_checks);
  if (vocabChecks.length > 0) {
    const missingDocs = [...new Set(vocabChecks.map(c => c.doc))].filter(docName => {
      const content = resolveReferenceDoc(reference_docs, docName);
      return typeof content !== 'string' || content.trim().length === 0;
    });
    if (missingDocs.length > 0) {
      const errMsg = `vocabulary reference doc(s) missing or empty for content-analyzer: ${missingDocs.join(', ')} — required by vocabulary_checks. Attach the doc(s) in this template's content-analyzer reference documents, or remove the corresponding line(s) from vocabulary_checks.`;
      logger.error(`content-analyzer refused run: ${errMsg}`);
      for (const entity of entities) {
        errors.push(`${entity.name}: ${errMsg}`);
        results.push({
          entity_name: entity.name,
          items: [{
            entity_name: entity.name,
            status: 'error',
            summary_preview: '',
            word_count: 0,
            model_used: `${ai_provider}/${ai_model}`,
            error: errMsg,
            _dynamic_sections: [{ field: 'error', label: 'Error', display: 'text' }],
            analysis_json: null,
          }],
          meta: { pages_analyzed: 0, status: 'error' },
        });
      }
      if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }
      return {
        results,
        summary: {
          total_entities: entities.length,
          total_items: 0,
          description: `0/${entities.length} entities analyzed — refused: ${missingDocs.length} vocabulary doc(s) missing/empty`,
          errors,
        },
      };
    }
  }

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Analyzing ${entity.name || 'entity'}`);

    const items = entity.items;
    if (!items || items.length === 0) {
      logger.info(`${entity.name}: no items to analyze, skipping`);
      results.push({
        entity_name: entity.name,
        items: [],
        meta: { pages_analyzed: 0, status: 'skipped' },
      });
      if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }
      continue;
    }

    try {
      // Count total source words
      const totalWords = items.reduce((sum, item) => sum + (item.word_count || 0), 0);
      logger.info(`${entity.name}: analyzing ${items.length} pages (${totalWords} words) with ${ai_provider}/${ai_model}`);

      // Assemble all page content. B029-2: surface input truncation — the
      // 200k head-keep used to be visible only as an in-prompt marker.
      const assembled = assembleEntityContent(items, max_content_chars, include_page_intent === true);
      const entityContent = assembled.text;
      if (assembled.truncated) {
        logger.warn(`${entity.name}: assembled source content truncated — ${assembled.totalChars} chars total, ${max_content_chars} kept (raise max_content_chars or trim the source pool)`);
      }

      // Build prompt; split the stable reference-doc prefix for Anthropic prompt
      // caching (BACKLOG #21). cachePrefix + prompt is byte-identical to the old
      // single-prompt output. Requires skeleton #21 (ai.complete cache_prefix
      // support) live — see buildCachedPrompt's DEPLOY-ORDER note.
      const { prompt, cachePrefix } = buildCachedPrompt(promptTemplate, entityContent, reference_docs);

      // Call AI
      const response = await ai.complete({
        prompt,
        cache_prefix: cachePrefix || undefined,
        model: ai_model,
        provider: ai_provider,
        temperature,
        max_tokens,
      });

      // Parse JSON response — fall back to raw text display if parsing fails
      let analysis;
      let flat;
      try {
        analysis = parseJsonResponse(response.text);
        flat = flattenAnalysis(analysis);
      } catch (parseErr) {
        if (json_retry === true) {
          // B029-3: corrective JSON retry + fail-loud (port of seo-planner's
          // v2.2.1 completeWithJsonRetry). One temperature-0 re-ask embedding
          // the invalid response — a reformat, which models comply with far
          // more reliably than a fresh generation. On a second failure, throw
          // into the outer catch → meta.status:'error', analysis_json:null —
          // instead of the default degraded success that ships raw prose to
          // the writer with the root cause invisible.
          logger.warn(`${entity.name}: LLM returned non-JSON (${parseErr.message}) — retrying once with a strict JSON-only correction (json_retry)`);
          const correction =
            'Your previous response was NOT valid JSON — it contained markdown, headings, prose, or code fences.\n\n' +
            'Re-output the EXACT SAME information as ONLY a single valid JSON object and nothing else: ' +
            'no markdown, no "#" headings, no "**" bold, no prose, no commentary, no code fences, no preamble. ' +
            'Your response MUST start with "{" and end with "}".\n\n' +
            'Your previous (invalid) response was:\n' + (response.text || '');
          // cache_prefix stripped: the correction prompt is standalone —
          // prepending the cached template head would change what the model sees.
          const second = await ai.complete({
            prompt: correction,
            model: ai_model,
            provider: ai_provider,
            temperature: 0,
            max_tokens,
            cache_prefix: undefined,
          });
          try {
            analysis = parseJsonResponse(second.text);
            flat = flattenAnalysis(analysis);
          } catch (secondErr) {
            throw new Error(`LLM returned non-JSON after corrective retry: ${secondErr.message}`);
          }
        } else {
          // Default path (json_retry off): LLM returned non-JSON (prose,
          // markdown, etc.) — display as single section (degraded success)
          logger.warn(`${entity.name}: LLM returned non-JSON, displaying as raw text`);
          analysis = null;
          const rawText = response.text || '(empty response)';
          flat = {
            summary_preview: rawText.substring(0, 100) + (rawText.length > 100 ? '...' : ''),
            section_analysis: rawText,
            _dynamic_sections: [{ field: 'section_analysis', label: 'Analysis', display: 'prose' }],
          };
        }
      }

      // CONTENT gate (M2 / A4): the parse above validated JSON shape only. A
      // valid-but-empty analysis (a parsed object with no usable extracted
      // value) is HOLLOW — content-writer and seo-planner serialize the whole
      // analysis_json into their prompt, so an empty object ships a hollow
      // profile one step downstream. Fail LOUD here at the source, mirroring
      // seo-planner's A1 content gate: throw into the outer catch, which emits
      // meta.status:'error' (skeleton honors it —
      // content-pipeline-v2/server/utils/entityRunStatus.js:23 → entity
      // 'failed'), turning the entity red at the source with no skeleton change.
      // NOT a salvage: no default substitution, no retry-into-empty, no warning
      // downgrade. Scope is the parsed-but-hollow case only: a non-JSON response
      // (analysis === null) keeps its existing raw-text path — its raw model
      // text is carried on section_analysis and still flows to content-writer
      // via that consumer's whole-item fallback, so it is degraded, not empty.
      if (analysis !== null && !hasUsableAnalysis(analysis)) {
        throw new Error(
          'Analysis is empty — model returned valid JSON with no usable extracted content (hollow analysis)'
        );
      }

      // B2 citation-map stability: on a loop re-run the input pool carries this
      // module's own previous analysis (hydrated via requires_columns). Merge
      // AFTER the hollow gate so preserved citations can never rescue a hollow
      // analysis, and re-flatten so the display sections show the merged map.
      const prevCitations = findPreviousSourceCitations(items);
      if (prevCitations && analysis !== null && typeof analysis === 'object') {
        analysis.source_citations = mergeSourceCitations(prevCitations, analysis.source_citations);
        flat = flattenAnalysis(analysis);
      }

      // W1.3 fidelity gate: every assigned slug at each configured path must
      // exist in the named vocabulary doc injected for this run. Out-of-
      // vocabulary slugs mean the model invented values the downstream pipeline
      // cannot resolve — fail the entity loud instead of passing them through.
      if (vocabChecks.length > 0 && analysis && typeof analysis === 'object') {
        const violations = [];
        for (const { path, doc } of vocabChecks) {
          const assigned = walkSlugPath(analysis, path);
          if (assigned.length === 0) continue;
          const allowed = extractVocabSlugs(resolveReferenceDoc(reference_docs, doc));
          for (const slug of assigned) {
            if (!allowed.has(String(slug).toLowerCase())) {
              violations.push(`"${slug}" (path ${path}, not in ${doc})`);
            }
          }
        }
        if (violations.length > 0) {
          const errMsg = `Out-of-vocabulary slug(s) assigned by content-analyzer: ${violations.join('; ')}. The analyzer assigned slug values not present in the injected vocabulary — fix the source/prompt or the vocabulary docs before proceeding.`;
          logger.error(`${entity.name}: ${errMsg}`);
          errors.push(`${entity.name}: ${errMsg}`);
          results.push({
            entity_name: entity.name,
            items: [{
              entity_name: entity.name,
              status: 'error',
              summary_preview: '',
              word_count: totalWords,
              model_used: `${ai_provider}/${ai_model}`,
              error: errMsg,
              _dynamic_sections: [{ field: 'error', label: 'Error', display: 'text' }],
              analysis_json: analysis,
            }],
            meta: { pages_analyzed: items.length, status: 'error' },
          });
          if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }
          continue;
        }
      }

      // S1 source-check gate (default OFF → byte-identical). Verify each cited
      // fact against the page it cites; remove currency-substituted elements so
      // they never reach the writer. Runs after the vocab gate so it only sees an
      // accepted analysis. Re-flatten so the display sections reflect the cleaned
      // analysis (mirrors the citation-merge path above). Actions recorded on
      // meta.source_check (visible + countable).
      let scMeta = null;
      if (source_check === true && analysis && typeof analysis === 'object') {
        const sc = runSourceCheck(analysis, items);
        analysis = sc.cleaned;
        flat = flattenAnalysis(analysis);
        scMeta = { checked: sc.stats.cited, uncheckable: sc.stats.uncheckable, removed: sc.stats.removed, violations: sc.violations };
        if (sc.violations.length > 0) {
          logger.warn(`${entity.name}: source-check removed ${sc.stats.removed} currency-substituted element(s) across ${sc.stats.cited} cited facts (${sc.stats.uncheckable} uncheckable — cited page not in window)`);
        } else {
          logger.info(`${entity.name}: source-check clean — ${sc.stats.cited} cited facts verified (${sc.stats.uncheckable} uncheckable)`);
        }
      }

      // B029-2: input-truncation visibility — additive fields, only stamped
      // when the assembled source exceeded max_content_chars.
      const truncationFields = assembled.truncated
        ? {
            content_truncated: true,
            content_chars_total: assembled.totalChars,
            content_chars_kept: max_content_chars,
          }
        : {};

      const resultItem = {
        entity_name: entity.name,
        status: 'analyzed',
        summary_preview: flat.summary_preview,
        word_count: totalWords,
        model_used: `${ai_provider}/${ai_model}`,
        // Dynamic section fields (section_categories, section_tags, etc.)
        ...Object.fromEntries(Object.entries(flat).filter(([k]) => k.startsWith('section_'))),
        // Section definitions for dynamic detail modal
        _dynamic_sections: flat._dynamic_sections,
        // Full JSON carried to pool for downstream submodules
        analysis_json: analysis,
        ...truncationFields,
      };

      results.push({
        entity_name: entity.name,
        items: [resultItem],
        meta: { pages_analyzed: items.length, total_words: totalWords, status: 'success', ...truncationFields, ...(scMeta ? { source_check: scMeta } : {}) },
      });

      logger.info(`${entity.name}: analysis complete — ${flat.summary_preview}`);
      if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }

    } catch (err) {
      logger.error(`${entity.name}: analysis failed — ${err.message}`);
      errors.push(`${entity.name}: ${err.message}`);

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          status: 'error',
          summary_preview: '',
          word_count: 0,
          model_used: `${ai_provider}/${ai_model}`,
          error: err.message,
          _dynamic_sections: [{ field: 'error', label: 'Error', display: 'text' }],
          analysis_json: null,
        }],
        meta: { pages_analyzed: 0, status: 'error' },
      });
      if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }
    }
  }

  const successCount = results.filter(r => r.meta.status === 'success').length;
  const description = errors.length > 0
    ? `${successCount}/${entities.length} entities analyzed — ${errors.length} error(s)`
    : `${successCount} entities analyzed successfully`;

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: successCount,
      description,
      errors,
    },
  };
}

module.exports = execute;
// Exported for unit tests (BACKLOG #21 cache-split byte-identity proof).
module.exports.buildPrompt = buildPrompt;
module.exports.buildCachedPrompt = buildCachedPrompt;
// Exported for test harness use only — not part of the public submodule interface.
module.exports.__testing = {
  walkSlugPath,
  parseVocabularyChecks,
  resolveReferenceDoc,
  extractVocabSlugs,
  assembleEntityContent,
  // S1 source-check gate
  parseMoneyExpressions,
  currencyNearAmount,
  runSourceCheck,
};
