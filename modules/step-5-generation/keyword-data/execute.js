/**
 * keyword-data — Step 5 pre-planner keyword-metrics fetcher.
 *
 * Runs BEFORE seo-planner (template submodules_per_step order). For each entity it
 * derives candidate head terms — from the latest pool item carrying analysis_json
 * (field shape, not source_submodule) when present, from the entity's own seed
 * fields when not — then asks the configured metrics provider for search volume,
 * keyword difficulty and CPC (one bulk overview call per market) and related
 * terms for the top-N terms by measured volume (primary market only).
 *
 * Emits one item per entity with the enriched field:
 *   keyword_data: { terms: [{term, volume, difficulty, cpc, competition, source,
 *                   related: [...]}], market, language_code, provider, fetched_at,
 *                   other_markets?, gsc_terms: [] }
 * gsc_terms stays an empty placeholder here — the skeleton's GSC hydration
 * (PIECE 3, spec'd in specs template-v3/keyword-data/) fills it from the site's
 * own Search Console tables. Modules never touch the DB (Rule 2).
 *
 * Failure discipline: missing credentials, provider auth/quota errors and a
 * tripped per-entity cost cap are all LOUD (status=error items, meta.status
 * 'error') — never a silent empty that reports approved downstream. Per-call
 * cost is read from the provider response (tasks[].cost) onto meta.api_usage.
 *
 * All provider knowledge (base URL, auth env names, endpoint paths) lives in the
 * `provider` option (Rule 13) — this file is the generic engine.
 */

const DEFAULT_PROVIDER = {
  id: 'dataforseo_labs',
  base_url: 'https://api.dataforseo.com',
  auth: { type: 'basic_env', login_env: 'DATAFORSEO_LOGIN', password_env: 'DATAFORSEO_PASSWORD' },
  endpoints: {
    overview: '/v3/dataforseo_labs/google/keyword_overview/live',
    related: '/v3/dataforseo_labs/google/related_keywords/live',
  },
};

// ── option parsing ─────────────────────────────────────────────────

const PARSE_FAILURE = Symbol('parse-failure');

function parseJsonOpt(v, fallback) {
  if (v == null || v === '') return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return PARSE_FAILURE; }
}

function parseMarkets(v, fallback) {
  if (v == null || v === '') return fallback;
  if (Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean);
  if (typeof v === 'string') {
    try {
      const j = JSON.parse(v);
      if (Array.isArray(j)) return j.map((s) => String(s).trim()).filter(Boolean);
    } catch (e) { /* not JSON — fall through to delimiter split */ }
    return v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  }
  return fallback;
}

function toNumber(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

// ── candidate term derivation ──────────────────────────────────────

// Conventional generic field names only (Rule 13) — mirrors seo-planner's
// shape-agnostic seed harvest, no pipeline-specific paths.
const STRING_FIELDS = ['primary_category', 'category', 'industry', 'vertical', 'sector'];
const ARRAY_FIELDS = ['categories', 'tags', 'keywords', 'topics'];

function coerceTerm(v) {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object') return String(v.name || v.slug || v.term || v.title || '').trim();
  return '';
}

function harvestTerms(obj, out) {
  if (!obj || typeof obj !== 'object') return;
  for (const f of STRING_FIELDS) {
    const t = coerceTerm(obj[f]);
    if (t) out.push(t);
  }
  for (const f of ARRAY_FIELDS) {
    const v = obj[f];
    if (Array.isArray(v)) {
      for (const e of v) {
        const t = coerceTerm(e);
        if (t) out.push(t);
      }
    } else if (v && typeof v === 'object') {
      // Grouped taxonomies: a conventional field holding an object of arrays
      // (e.g. categories.{primary,secondary}[], tags.{existing,new}[]). Group
      // names are not interpreted — every array-valued property is harvested.
      for (const group of Object.values(v)) {
        if (!Array.isArray(group)) continue;
        for (const e of group) {
          const t = coerceTerm(e);
          if (t) out.push(t);
        }
      }
    }
  }
}

function deriveTerms(entity, maxTerms) {
  const raw = [];
  let derivation = 'seed_fields';

  // latest pool item carrying analysis_json — field shape, not source_submodule
  const analyzerItem = (entity.items || []).slice().reverse().find((it) => it && it.analysis_json);
  if (analyzerItem) {
    let analysis = analyzerItem.analysis_json;
    if (typeof analysis === 'string') {
      try { analysis = JSON.parse(analysis); } catch (e) { analysis = null; }
    }
    if (analysis && typeof analysis === 'object') {
      derivation = 'analysis_json';
      harvestTerms(analysis, raw);
    }
  }
  if (derivation === 'seed_fields') harvestTerms(entity, raw);

  const name = coerceTerm(entity.name);
  if (name) raw.unshift(name); // brand head term is always a candidate

  const seen = new Set();
  const terms = [];
  for (const t of raw) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    terms.push(t);
    if (terms.length >= maxTerms) break;
  }
  return { terms, derivation };
}

// ── provider call ──────────────────────────────────────────────────

function buildAuthHeader(provider) {
  const auth = provider.auth || {};
  if (auth.type !== 'basic_env') return { error: `unsupported auth.type "${auth.type}" (only basic_env)` };
  const login = process.env[auth.login_env];
  const password = process.env[auth.password_env];
  if (!login || !password) {
    return { error: `missing credentials: env ${auth.login_env} and/or ${auth.password_env} not set` };
  }
  return { header: 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64') };
}

// POST one task to a DataForSEO-shaped endpoint (body = array of one task).
// Returns { ok, cost, items, error } — cost read from the response even on task
// errors, so a rejected task still counts against the cap.
async function providerPost(http, provider, authHeader, path, payload, logger) {
  const url = String(provider.base_url).replace(/\/+$/, '') + path;
  let res;
  try {
    res = await http.post(url, [payload], {
      timeout: 30000,
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, cost: 0, items: [], error: `network: ${err.message}` };
  }
  if (!res || res.status < 200 || res.status >= 300) {
    const status = res ? res.status : 'no response';
    return { ok: false, cost: 0, items: [], error: `HTTP ${status}${status === 401 || status === 402 || status === 429 ? ' (auth/quota)' : ''}` };
  }
  let data;
  try {
    data = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
  } catch (err) {
    return { ok: false, cost: 0, items: [], error: `parse failure: ${err.message}` };
  }
  const task = (data.tasks || [])[0];
  if (!task) return { ok: false, cost: 0, items: [], error: `no task in response (status ${data.status_code})` };
  const cost = Number(task.cost) || 0;
  if (task.status_code !== 20000) {
    return { ok: false, cost, items: [], error: `provider ${task.status_code}: ${task.status_message}` };
  }
  const items = ((task.result || [])[0] || {}).items || [];
  return { ok: true, cost, items, error: null };
}

function mapOverviewItems(items) {
  const byTerm = new Map();
  for (const it of items) {
    const term = it.keyword;
    if (!term) continue;
    const ki = it.keyword_info || {};
    const kp = it.keyword_properties || {};
    byTerm.set(term.toLowerCase(), {
      term,
      volume: ki.search_volume ?? null,
      difficulty: kp.keyword_difficulty ?? null,
      cpc: ki.cpc ?? null,
      competition: ki.competition ?? null,
    });
  }
  return byTerm;
}

// ── main ───────────────────────────────────────────────────────────

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress, http } = tools;

  const provider = parseJsonOpt(options.provider, DEFAULT_PROVIDER);
  const markets = parseMarkets(options.markets, ['United Kingdom']);
  const languageCode = options.language_code || 'en';
  const maxTerms = toNumber(options.max_terms, 12);
  const relatedFor = toNumber(options.related_terms_for, 2);
  const relatedLimit = toNumber(options.related_limit, 10);
  const costCap = toNumber(options.cost_cap_usd, 0.15);
  const emptyIsError = options.empty_is_error === true || options.empty_is_error === 'true';

  const fail = (msg) => ({
    results: entities.map((e) => ({
      entity_name: e.name || 'unknown',
      items: [{ entity_name: e.name || 'unknown', status: 'error', error: msg, derivation: '', terms_count: 0, market: '', cost_usd: 0, keyword_data: null }],
      meta: { total_found: 1, errors: 1, status: 'error', api_usage: { calls: [], total_cost_usd: 0 } },
    })),
    summary: {
      total_entities: entities.length,
      total_items: entities.length,
      description: `keyword-data failed: ${msg}`,
      errors: [msg],
    },
  });

  // Config + credential validation — loud, never a silent skip (the LinkedIn-401
  // that reported 'approved' is the failure class this guards against).
  if (provider === PARSE_FAILURE) {
    return fail('invalid provider config: JSON parse failure — refusing to fall back to the default provider');
  }
  if (!provider || !provider.base_url || !provider.endpoints || !provider.endpoints.overview) {
    return fail('invalid provider config: base_url and endpoints.overview are required');
  }
  const authRes = buildAuthHeader(provider);
  if (authRes.error) return fail(authRes.error);
  const authHeader = authRes.header;

  const results = [];
  let totalCost = 0;

  for (let ei = 0; ei < entities.length; ei++) {
    const entity = entities[ei];
    const entityName = entity.name || 'unknown';
    progress.update(ei + 1, entities.length, `Keyword data for ${entityName}`);

    const { terms: candidates, derivation } = deriveTerms(entity, maxTerms);
    const calls = [];
    let spent = 0;
    let entityError = null;
    const notes = [];

    const item = {
      entity_name: entityName,
      status: 'success',
      derivation,
      terms_count: 0,
      top_term: '',
      market: markets[0],
      cost_usd: 0,
      keyword_data: null,
    };

    if (candidates.length === 0) {
      const msg = `no candidate terms derivable (${derivation}) for "${entityName}"`;
      logger.warn(`keyword-data: ${msg}`);
      if (emptyIsError) {
        item.status = 'error';
        item.error = msg;
      } else {
        item.keyword_data = {
          terms: [], market: markets[0], language_code: languageCode,
          provider: provider.id, fetched_at: new Date().toISOString(), gsc_terms: [],
        };
        notes.push(msg);
      }
      results.push({
        entity_name: entityName, items: [item],
        meta: { total_found: 1, errors: item.status === 'error' ? 1 : 0, status: item.status === 'error' ? 'error' : 'ok', notes, api_usage: { calls, total_cost_usd: 0 } },
      });
      if (tools._partialItems) tools._partialItems.push(item);
      continue;
    }

    // 1) one bulk overview call per market
    const perMarket = [];
    for (const market of markets) {
      if (spent >= costCap) { entityError = `cost cap $${costCap} reached before overview(${market}) — spent $${spent.toFixed(4)}`; break; }
      const r = await providerPost(http, provider, authHeader, provider.endpoints.overview, {
        keywords: candidates, location_name: market, language_code: languageCode,
      }, logger);
      spent += r.cost;
      calls.push({ endpoint: 'overview', market, keywords_sent: candidates.length, items: r.items.length, cost_usd: r.cost });
      if (!r.ok) { entityError = `overview(${market}): ${r.error}`; break; }
      perMarket.push({ market, byTerm: mapOverviewItems(r.items) });
    }

    // Assemble whatever was fetched — a secondary-market or related failure must
    // not discard the primary market's already-billed data (status still error).
    if (perMarket.length > 0) {
      const primary = perMarket[0];
      const terms = candidates.map((term) => {
        const hit = primary.byTerm.get(term.toLowerCase());
        return {
          term,
          volume: hit ? hit.volume : null,
          difficulty: hit ? hit.difficulty : null,
          cpc: hit ? hit.cpc : null,
          competition: hit ? hit.competition : null,
          related: [],
        };
      });

      // 2) related terms for top-N by measured volume, primary market only.
      // Skipped when an earlier call already failed — no further spend after an error.
      if (!entityError && relatedFor > 0 && provider.endpoints.related) {
        const ranked = terms.slice().sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1)).slice(0, relatedFor);
        for (const t of ranked) {
          if (spent >= costCap) { entityError = `cost cap $${costCap} reached before related("${t.term}") — spent $${spent.toFixed(4)}`; break; }
          const r = await providerPost(http, provider, authHeader, provider.endpoints.related, {
            keyword: t.term, location_name: primary.market, language_code: languageCode, depth: 1, limit: relatedLimit,
          }, logger);
          spent += r.cost;
          calls.push({ endpoint: 'related', market: primary.market, seed: t.term, items: r.items.length, cost_usd: r.cost });
          if (!r.ok) { entityError = `related("${t.term}"): ${r.error}`; break; }
          t.related = r.items
            .map((i) => (i.keyword_data && i.keyword_data.keyword) || i.keyword || '')
            .filter((k) => k && k.toLowerCase() !== t.term.toLowerCase())
            .slice(0, relatedLimit);
        }
      }

      const withMetrics = terms.filter((t) => t.volume != null);
      if (withMetrics.length === 0 && emptyIsError && !entityError) {
        entityError = `provider returned no metrics for any of ${terms.length} terms`;
      }

      item.keyword_data = {
        terms,
        market: primary.market,
        language_code: languageCode,
        provider: provider.id,
        fetched_at: new Date().toISOString(),
        gsc_terms: [],
      };
      if (perMarket.length > 1) {
        item.keyword_data.other_markets = perMarket.slice(1).map((m) => ({
          market: m.market,
          terms: candidates.map((term) => {
            const hit = m.byTerm.get(term.toLowerCase());
            return hit ? { term, volume: hit.volume, difficulty: hit.difficulty, cpc: hit.cpc } : { term, volume: null, difficulty: null, cpc: null };
          }),
        }));
      }
      item.terms_count = terms.length;
      const top = terms.slice().sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1))[0];
      if (top) item.top_term = `${top.term} (vol ${top.volume ?? '?'}, kd ${top.difficulty ?? '?'})`;
    }

    if (entityError) {
      item.status = 'error';
      item.error = entityError;
      logger.error(`keyword-data ${entityName}: ${entityError}`);
    } else {
      logger.info(`keyword-data ${entityName}: ${item.terms_count} terms (${derivation}), $${spent.toFixed(4)}`);
    }
    item.cost_usd = Number(spent.toFixed(6));
    totalCost += spent;

    results.push({
      entity_name: entityName,
      items: [item],
      meta: {
        total_found: 1,
        errors: item.status === 'error' ? 1 : 0,
        status: item.status === 'error' ? 'error' : 'ok',
        notes,
        api_usage: { calls, total_cost_usd: Number(spent.toFixed(6)) },
      },
    });
    if (tools._partialItems) tools._partialItems.push(item);
  }

  const totalErrors = results.reduce((s, r) => s + (r.meta.errors || 0), 0);
  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: results.reduce((s, r) => s + r.items.length, 0),
      description: totalErrors > 0
        ? `keyword data for ${entities.length} entities, ${totalErrors} error(s), $${totalCost.toFixed(4)} provider spend`
        : `keyword data for ${entities.length} entities, $${totalCost.toFixed(4)} provider spend`,
      errors: results.flatMap((r) => r.items.filter((i) => i.status === 'error').map((i) => `${r.entity_name}: ${i.error}`)),
    },
  };
}

module.exports = execute;
