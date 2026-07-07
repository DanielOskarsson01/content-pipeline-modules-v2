/**
 * AI Discovery Scout - Step 1 Discovery submodule.
 *
 * For each entity, an LLM (via tools.ai) proposes likely-authoritative URLs from
 * model knowledge. Every proposed URL is verified live via tools.http (HEAD, GET
 * fallback) before it enters the pool — verification is the anti-hallucination
 * gate (ON by default). Optionally the LLM also emits suggested search queries as
 * operator-facing metadata for feeding search-discovery.
 *
 * The scout runs NO search-API calls (that is search-discovery's job) — it
 * proposes from model knowledge and verifies. Rule 13: code = prompt assembly,
 * JSON parsing, verification, emission. All vertical flavor (which platforms to
 * prioritize) lives in the `prompt` preset.
 */

// ── JSON parsing (strict-array first, seo-planner v2.2.1 corrective-retry precedent) ──

function tryParseRegion(s) {
  // 1. direct parse
  try { return JSON.parse(s); } catch (e) { /* fall through */ }
  // 2. array region (the scout's canonical shape: [ {...}, ... ])
  const fb = s.indexOf('[');
  const lb = s.lastIndexOf(']');
  if (fb !== -1 && lb > fb) {
    try { return JSON.parse(s.slice(fb, lb + 1)); } catch (e) { /* fall through */ }
  }
  // 3. object region ({ leads: [...], suggested_queries: [...] }), with a
  //    defensive heading-strip pass for markdown-laced responses.
  const fo = s.indexOf('{');
  const lo = s.lastIndexOf('}');
  if (fo !== -1 && lo > fo) {
    const region = s.slice(fo, lo + 1);
    try { return JSON.parse(region); } catch (e) { /* fall through */ }
    const stripped = region.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
    try { return JSON.parse(stripped); } catch (e) { /* fall through */ }
  }
  const err = new Error('no valid JSON array/object found in response');
  err.rawText = s;
  throw err;
}

// Normalize a parsed response into { leads: [...], suggested_queries: [...] }.
function normalizeResponse(parsed) {
  let leads = [];
  let queries = [];
  if (Array.isArray(parsed)) {
    leads = parsed;
  } else if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.leads)) leads = parsed.leads;
    else {
      // First array-of-objects property is the leads array.
      const arrProp = Object.values(parsed).find(
        (v) => Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === 'object')
      );
      if (arrProp) leads = arrProp;
    }
    if (Array.isArray(parsed.suggested_queries)) {
      queries = parsed.suggested_queries.filter((q) => typeof q === 'string' && q.trim());
    }
  }
  return { leads: Array.isArray(leads) ? leads : [], suggested_queries: queries };
}

function parseLeadsResponse(text) {
  const original = typeof text === 'string' ? text : String(text ?? '');
  let cleaned = original.trim();
  const fence = cleaned.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/);
  if (fence) cleaned = fence[1].trim();
  else cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/, '').trim();
  try {
    return normalizeResponse(tryParseRegion(cleaned));
  } catch (err) {
    err.rawText = original;
    throw err;
  }
}

// Call the model, parse, with ONE corrective retry (seo-planner precedent).
async function completeWithJsonRetry(ai, baseOpts, logger, entityName) {
  const first = await ai.complete(baseOpts);
  try {
    return parseLeadsResponse(first.text);
  } catch (firstErr) {
    logger.warn(
      `${entityName}: scout response was not valid JSON (${firstErr.message}) — retrying once with a strict JSON-only correction.`
    );
    const correction =
      'Your previous response was NOT valid JSON — it contained markdown, headings, prose, or code fences.\n\n' +
      'Re-output the EXACT SAME information as ONLY valid JSON and nothing else: no markdown, no "#" headings, ' +
      'no "**" bold, no prose, no commentary, no code fences, no preamble. Your response MUST be a single JSON ' +
      'array (or object) and nothing else.\n\nYour previous (invalid) response was:\n' + (first.text || '');
    const second = await ai.complete({ ...baseOpts, prompt: correction, temperature: 0 });
    try {
      return parseLeadsResponse(second.text);
    } catch (secondErr) {
      secondErr.rawText = second.text;
      secondErr.firstAttemptText = first.text;
      throw secondErr;
    }
  }
}

// ── Prompt assembly ─────────────────────────────────────────────────

function buildEntityContext(entity) {
  // All entity columns except name/website and internal pool fields, joined.
  const skip = new Set(['name', 'website', 'items']);
  return Object.entries(entity)
    .filter(([k, v]) => !skip.has(k) && v != null && v !== '' && typeof v !== 'object')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

function buildPrompt(template, entity, maxUrls, emitQueries) {
  const website = entity.website || '';
  const context = buildEntityContext(entity);
  // Function replacements (not string replacements): entity values may contain
  // $-sequences ($&, $$, $1 — e.g. brand names, query-string URLs) which
  // String.replace interprets specially in a replacement STRING. A function's
  // return value is used verbatim. (Same fix pattern content-analyzer uses.)
  let prompt = String(template)
    .replace(/\{max\}/g, () => String(maxUrls))
    .replace(/\{entity_name\}/g, () => entity.name || '')
    .replace(/\{entity_website\}/g, () => website)
    .replace(/\{entity_context\}/g, () => context);

  // Always append the structured entity block so the model has the raw data
  // even when a template preset didn't reference the placeholders inline.
  prompt +=
    `\n\n---\nEntity: ${entity.name || '(unnamed)'}\n` +
    `Website: ${website || '(none)'}\n` +
    `Additional context:\n${context || '(none)'}`;

  if (emitQueries) {
    prompt +=
      '\n\nAdditionally, return a JSON OBJECT with two keys instead of a bare array: ' +
      '"leads" (the array of lead objects described above) and "suggested_queries" ' +
      '(an array of up to 5 web-search query strings that would surface more authoritative ' +
      'sources about this entity). Return ONLY that JSON object.';
  }
  return prompt;
}

// ── Verification (anti-hallucination gate) ──────────────────────────

function decodeEntities(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

function extractTitle(body) {
  if (typeof body !== 'string') return '';
  const m = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim().slice(0, 300) : '';
}

function isLive(status) {
  return typeof status === 'number' && status >= 200 && status < 400;
}

// HEAD first; GET fallback when HEAD is inconclusive (throws, or 405/501 method
// issues). A definitive 4xx/5xx from HEAD is trusted (dead), no GET. Title is
// best-effort — only available on the GET path.
async function verifyUrl(url, timeout, http, logger) {
  let headStatus = null;
  try {
    const res = await http.head(url, { timeout });
    headStatus = res ? res.status : null;
    if (isLive(headStatus)) return { verified: true, status_code: headStatus, title: '' };
  } catch (e) {
    headStatus = null; // inconclusive -> GET fallback
  }

  const needsGet = headStatus == null || headStatus === 405 || headStatus === 501;
  if (!needsGet) return { verified: false, status_code: headStatus, title: '' };

  try {
    const res = await http.get(url, { timeout });
    const status = res ? res.status : 0;
    if (isLive(status)) return { verified: true, status_code: status, title: extractTitle(res.body) };
    return { verified: false, status_code: status, title: '' };
  } catch (e) {
    logger.warn(`verification failed for ${url}: ${e.message}`);
    return { verified: false, status_code: 0, title: '' };
  }
}

// Concurrency-limited map (respects max_concurrent_verifications).
async function mapLimit(items, limit, fn) {
  const out = [];
  const size = limit > 0 ? limit : 1;
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const res = await Promise.all(chunk.map(fn));
    out.push(...res);
  }
  return out;
}

// ── Option helpers ───────────────────────────────────────────────────

function toNumber(val, fallback) {
  const n = typeof val === 'number' ? val : parseFloat(val);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(val) {
  return val === true || val === 'true';
}

function coerceConfidence(v) {
  const n = toNumber(v, NaN);
  return Number.isFinite(n) ? n : null;
}

// ── Main execute ─────────────────────────────────────────────────────

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress, ai, http } = tools;

  const promptTemplate = typeof options.prompt === 'string' ? options.prompt : '';
  const model = options.ai_model || 'haiku';
  const provider = options.ai_provider || 'anthropic';
  const maxUrls = toNumber(options.max_urls_per_entity, 10);
  const minConfidence = toNumber(options.min_confidence, 0);
  const keepUnverified = toBool(options.keep_unverified);
  const emitQueries = toBool(options.emit_suggested_queries);
  const verificationTimeout = toNumber(options.verification_timeout, 5000);
  const maxConcurrent = toNumber(options.max_concurrent_verifications, 5);

  // Blank prompt -> loud no-op (never call the LLM with nothing).
  if (!promptTemplate.trim()) {
    logger.warn('ai-discovery-scout: prompt is blank — nothing to do (loud no-op)');
    return {
      results: entities.map((e) => ({
        entity_name: e.name || 'unknown',
        items: [],
        meta: { total_found: 0, dropped: 0, errors: 0 },
      })),
      summary: {
        total_entities: entities.length,
        total_items: 0,
        description: 'No prompt configured — nothing proposed',
        errors: [],
      },
    };
  }

  const results = [];

  for (let ei = 0; ei < entities.length; ei++) {
    const entity = entities[ei];
    const entityName = entity.name || 'unknown';
    progress.update(ei + 1, entities.length, `Scouting ${entityName}`);

    const prompt = buildPrompt(promptTemplate, entity, maxUrls, emitQueries);

    let parsed;
    try {
      parsed = await completeWithJsonRetry(ai, { prompt, model, provider }, logger, entityName);
    } catch (err) {
      const snippet = (err.rawText || '').slice(0, 500);
      logger.error(`${entityName}: scout JSON parse failed after corrective retry — ${err.message}. Raw: ${snippet}`);
      results.push({
        entity_name: entityName,
        items: [],
        error: `LLM did not return valid JSON after retry: ${err.message}`,
        meta: { total_found: 0, dropped: 0, errors: 1 },
      });
      continue;
    }

    // Normalize + confidence-filter + cap BEFORE verification (saves HTTP).
    const candidates = [];
    for (const raw of parsed.leads) {
      if (!raw || typeof raw !== 'object') continue;
      const url = typeof raw.url === 'string' ? raw.url.trim() : '';
      if (!/^https?:\/\//i.test(url)) continue; // must be a real http(s) URL
      const conf = coerceConfidence(raw.confidence);
      if (minConfidence > 0 && conf != null && conf < minConfidence) continue;
      candidates.push({
        url,
        lead_type: raw.lead_type != null ? String(raw.lead_type) : '',
        rationale: raw.rationale != null ? String(raw.rationale) : '',
        confidence: conf != null ? String(conf) : (raw.confidence != null ? String(raw.confidence) : ''),
      });
    }
    const capped = candidates.slice(0, maxUrls);

    // Verify liveness (concurrency-capped).
    const verified = await mapLimit(capped, maxConcurrent, async (lead) => {
      const v = await verifyUrl(lead.url, verificationTimeout, http, logger);
      return { ...lead, ...v };
    });

    let dropped = 0;
    const items = [];
    for (const lead of verified) {
      if (!lead.verified && !keepUnverified) { dropped++; continue; }
      items.push({
        url: lead.url,
        title: lead.title || '',
        lead_type: lead.lead_type,
        rationale: lead.rationale,
        confidence: lead.confidence,
        verified: lead.verified ? 'true' : 'false',
        status_code: lead.status_code || 0,
        found_via: 'ai_scout',
        source: 'ai-discovery-scout',
        entity_name: entityName,
      });
    }

    const meta = {
      total_found: items.length,
      proposed: parsed.leads.length,
      dropped,
      errors: 0,
    };
    if (emitQueries) meta.suggested_queries = (parsed.suggested_queries || []).join('\n');

    results.push({ entity_name: entityName, items, meta });

    // Rule 10: persist partials after each entity (LLM + verification are slow).
    if (tools._partialItems) tools._partialItems.push(...items);

    logger.info(`${entityName}: ${items.length} verified lead(s) from ${parsed.leads.length} proposed (${dropped} dropped)`);
  }

  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
  const failed = results.filter((r) => r.error);

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      description: failed.length > 0
        ? `${totalItems} verified leads across ${entities.length} entities (${failed.length} failed)`
        : `${totalItems} verified leads across ${entities.length} entities`,
      errors: failed.map((r) => `${r.entity_name}: ${r.error}`),
    },
  };
}

module.exports = execute;
module.exports.__testing = { parseLeadsResponse, completeWithJsonRetry, buildPrompt, verifyUrl, normalizeResponse };
