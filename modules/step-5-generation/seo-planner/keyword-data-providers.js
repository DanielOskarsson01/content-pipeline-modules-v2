/**
 * seo-planner — keyword_data_providers layer (v2.3.0, unit 4.6)
 *
 * ADDITIVE extension to seo-planner. Grounds the keyword plan in REAL numbers
 * (search volume, difficulty, own-site rank/impressions/clicks) from configurable
 * providers, ALONGSIDE the existing qualitative (Perplexity) research layer.
 *
 * Design (per docs/submodule-briefs-rev-2026-07-03/step5-seo-keyword-researcher.md):
 *   - Two orthogonal research layers feed the planning prompt. This file is the
 *     QUANTITATIVE one. Empty `keyword_data_providers` (the default) → fully inert,
 *     zero I/O, output byte-identical to today.
 *   - Provider = config + thin handler. A provider config names a `kind` that
 *     selects a small generic handler; everything else (endpoint, auth env var,
 *     params, cost) is config. New provider of an existing kind = config only.
 *   - Two roles: `expansion` (widen the seed set) and `metrics` (score keywords
 *     with real numbers). Expansion runs first, then metrics on the widened set.
 *   - Cost guards: max_seed_keywords, max_metric_lookups_per_entity, per_run_budget_usd.
 *   - metrics_required: when set and nothing is produced, warn LOUDLY (W1.1 discipline)
 *     — never silent.
 *
 * Rule 1/3: standalone, no skeleton imports; all HTTP via `tools.http`. `crypto`
 * (RS256 JWT for GSC) and `fs` (reading the GSC service-account key file) are Node
 * built-ins — the same `fs` pattern csv-discovery already uses.
 *
 * Rule 13: this file is 100% pipeline-agnostic. It names no content type, no
 * vertical, no domain. GSC site URLs, DataForSEO locale, and provider selection
 * are entirely template `preset_map` config.
 */

const crypto = require('crypto');
const fs = require('fs');

// Normalized keyword-metric schema. Providers fill what they have; the rest stay null.
const METRIC_FIELDS = ['keyword', 'search_volume', 'difficulty', 'cpc', 'competition', 'current_rank', 'impressions', 'clicks', 'source'];

// Which role each provider kind plays. Expansion widens the seed set; metrics
// score keywords with real numbers. A kind absent from this map is "unknown".
const KIND_ROLES = {
  autocomplete: 'expansion',
  gsc: 'metrics',
  dataforseo: 'metrics',
};

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Case-insensitive dedupe preserving first-seen casing; drops empties. */
function dedupeStrings(arr) {
  const seen = new Set();
  const out = [];
  for (const raw of arr || []) {
    if (raw == null) continue;
    const s = String(raw).trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Coerce a category/tag entry (string | {name} | {slug} | {value}) to a string. */
function coerceTerm(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'object') return String(v.name || v.slug || v.value || v.label || '').trim();
  return '';
}

/**
 * Build seed keywords for an entity — GENERIC (Rule 13). Always includes the
 * entity name, then best-effort pulls from a small set of CONVENTIONAL analysis
 * fields (the same defensive multi-field approach seo-planner already uses in
 * buildEntityContext). No pipeline-specific deep paths. Returns [entity.name]
 * when the analysis carries none of these fields.
 */
function deriveSeedKeywords(entity, analyzerItem, maxSeeds = 25) {
  const analysis = (analyzerItem && (analyzerItem.analysis_json || analyzerItem)) || {};
  const terms = [];
  if (entity && entity.name) terms.push(entity.name);

  for (const field of ['primary_category', 'industry', 'vertical', 'sector']) {
    if (typeof analysis[field] === 'string') terms.push(analysis[field]);
  }
  for (const field of ['categories', 'tags', 'keywords', 'topics']) {
    const val = analysis[field];
    if (Array.isArray(val)) {
      for (const entry of val) {
        const t = coerceTerm(entry);
        if (t) terms.push(t);
      }
    }
  }
  return dedupeStrings(terms).slice(0, Math.max(1, maxSeeds));
}

/** Normalize a partial metric object into the full documented schema. */
function normalizeMetricRow(partial, source) {
  const row = {};
  for (const f of METRIC_FIELDS) {
    row[f] = partial && partial[f] != null ? partial[f] : null;
  }
  row.keyword = partial && partial.keyword != null ? String(partial.keyword) : null;
  row.source = source || (partial && partial.source) || null;
  return row;
}

/** Merge a metric row into an accumulator map keyed by lowercased keyword. */
function mergeMetricRow(map, row) {
  if (!row || !row.keyword) return;
  const key = row.keyword.toLowerCase();
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { ...row });
    return;
  }
  for (const f of METRIC_FIELDS) {
    if (f === 'keyword') continue;
    if (f === 'source') {
      const sources = dedupeStrings([...(String(existing.source || '').split('+')), row.source]);
      existing.source = sources.join('+');
      continue;
    }
    if (existing[f] == null && row[f] != null) existing[f] = row[f];
  }
}

/** Render keyword_metrics[] as a compact text table for prompt injection. */
function renderKeywordMetricsTable(metrics) {
  if (!Array.isArray(metrics) || metrics.length === 0) return '';
  const cell = (v) => (v == null ? '-' : String(v));
  const header = 'keyword | volume | difficulty | cpc | competition | rank | impressions | clicks | source';
  const lines = metrics.map((m) =>
    [m.keyword, m.search_volume, m.difficulty, m.cpc, m.competition, m.current_rank, m.impressions, m.clicks, m.source].map(cell).join(' | '));
  return `${header}\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// GSC (Google Search Console) — kind `gsc`, role metrics, free ($0)
// Service-account JWT (RS256) → OAuth2 access token → Search Analytics query.
// Requires GSC Search Console API + scope webmasters.readonly; the service
// account must be a user on the property. Returns the property's own queries
// with real rank / impressions / clicks. Inert if the key path env var is unset
// or the key file is unreadable, or site_url is missing.
// ---------------------------------------------------------------------------

function buildGscJwt(serviceAccount, { scope, nowSec }) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: serviceAccount.client_email,
    scope,
    aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(serviceAccount.private_key);
  return `${signingInput}.${base64url(signature)}`;
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

async function gscHandler(config, ctx, tools, logger) {
  const envVar = (config.auth && config.auth.env_var) || 'GSC_SERVICE_ACCOUNT_KEY_PATH';
  const keyPath = process.env[envVar];
  const siteUrl = config.site_url;
  const label = `gsc provider "${config.id || 'gsc'}"`;

  if (!keyPath) return { role: 'metrics', metrics: [], warnings: [`${label} inert: ${envVar} not set in environment`] };
  if (!siteUrl) return { role: 'metrics', metrics: [], warnings: [`${label} inert: config.site_url is missing`] };

  let sa;
  try {
    sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  } catch (e) {
    return { role: 'metrics', metrics: [], warnings: [`${label} inert: cannot read/parse key file at ${envVar} (${e.message})`] };
  }
  if (!sa.client_email || !sa.private_key) {
    return { role: 'metrics', metrics: [], warnings: [`${label} inert: service-account key missing client_email/private_key`] };
  }

  const scope = config.scope || 'https://www.googleapis.com/auth/webmasters.readonly';
  const jwt = buildGscJwt(sa, { scope, nowSec: Math.floor(Date.now() / 1000) });

  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const tokenBody = `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`;
  const tokenRes = await tools.http.post(tokenUri, tokenBody, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 20000,
  });
  const tokenJson = typeof tokenRes.body === 'string' ? safeJson(tokenRes.body) : tokenRes.body;
  if (tokenRes.status >= 400 || !tokenJson || !tokenJson.access_token) {
    throw new Error(`${label}: OAuth token exchange failed (HTTP ${tokenRes.status}${tokenJson && tokenJson.error ? ` — ${tokenJson.error}` : ''})`);
  }

  const days = Number(config.date_range_days) > 0 ? Number(config.date_range_days) : 90;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const rowLimit = Math.min(Number(config.row_limit) > 0 ? Number(config.row_limit) : 100, 25000);

  const queryUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const queryRes = await tools.http.post(queryUrl, { startDate: ymd(start), endDate: ymd(end), dimensions: ['query'], rowLimit }, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    timeout: 30000,
  });
  const queryJson = typeof queryRes.body === 'string' ? safeJson(queryRes.body) : queryRes.body;
  if (queryRes.status >= 400) {
    const msg = queryJson && queryJson.error ? (queryJson.error.message || JSON.stringify(queryJson.error)) : '';
    throw new Error(`${label}: Search Analytics query failed (HTTP ${queryRes.status} — ${msg})`);
  }

  const rows = queryJson && Array.isArray(queryJson.rows) ? queryJson.rows : [];
  const metrics = rows
    .filter((r) => r && Array.isArray(r.keys) && r.keys[0])
    .map((r) => normalizeMetricRow({
      keyword: r.keys[0],
      current_rank: r.position != null ? Math.round(r.position) : null,
      impressions: r.impressions != null ? r.impressions : null,
      clicks: r.clicks != null ? r.clicks : null,
    }, config.id || 'gsc'));

  const warnings = rows.length === 0
    ? [`${label}: no Search Console query data for ${siteUrl} in the last ${days}d (new/small property, or service account not added to the property?)`]
    : [];
  return { role: 'metrics', metrics, warnings };
}

// ---------------------------------------------------------------------------
// DataForSEO — kind `dataforseo`, role metrics, PAID. Google-Ads search-volume
// LIVE endpoint (never the standard queue — its 1–3h latency would blow the
// 30-min timeout). Basic auth from DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD.
// Inert if either credential is missing (config-present-but-inert).
// ---------------------------------------------------------------------------

async function dataforseoHandler(config, ctx, tools, logger) {
  const loginEnv = (config.auth && config.auth.login_env) || 'DATAFORSEO_LOGIN';
  const passEnv = (config.auth && config.auth.password_env) || 'DATAFORSEO_PASSWORD';
  const login = process.env[loginEnv];
  const password = process.env[passEnv];
  const label = `dataforseo provider "${config.id || 'dataforseo'}"`;

  if (!login || !password) {
    return { role: 'metrics', metrics: [], warnings: [`${label} inert: credentials not configured (${loginEnv} / ${passEnv})`] };
  }

  const keywords = dedupeStrings(ctx.candidate || []).slice(0, 1000); // Google-Ads live task cap
  if (keywords.length === 0) return { role: 'metrics', metrics: [], warnings: [] };

  const auth = Buffer.from(`${login}:${password}`).toString('base64');
  const endpoint = config.endpoint || 'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live';
  const body = [{
    keywords,
    location_code: config.location_code != null ? config.location_code : 2840,
    language_code: config.language_code || 'en',
  }];

  const res = await tools.http.post(endpoint, body, {
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    timeout: 60000,
  });
  const json = typeof res.body === 'string' ? safeJson(res.body) : res.body;
  if (res.status >= 400) {
    throw new Error(`${label}: HTTP ${res.status}${json && json.status_message ? ` — ${json.status_message}` : ''}`);
  }
  const task = json && Array.isArray(json.tasks) ? json.tasks[0] : null;
  if (task && task.status_code && task.status_code >= 40000) {
    throw new Error(`${label}: task error ${task.status_code} — ${task.status_message || ''}`);
  }
  const resultItems = task && Array.isArray(task.result) ? task.result : [];
  const metrics = resultItems
    .filter((it) => it && it.keyword)
    .map((it) => normalizeMetricRow({
      keyword: it.keyword,
      search_volume: it.search_volume != null ? it.search_volume : null,
      cpc: it.cpc != null ? it.cpc : null,
      competition: it.competition != null ? it.competition : (it.competition_index != null ? it.competition_index : null),
      difficulty: it.keyword_difficulty != null ? it.keyword_difficulty : null,
    }, config.id || 'dataforseo'));

  return { role: 'metrics', metrics, warnings: [] };
}

// ---------------------------------------------------------------------------
// Google Autocomplete — kind `autocomplete`, role expansion, free ($0, no auth).
// Suggestion strings only (seed expansion). Unofficial; 429 on abuse → warn,
// never fail the run.
// ---------------------------------------------------------------------------

async function autocompleteHandler(config, ctx, tools, logger) {
  const seeds = dedupeStrings(ctx.seeds || []).slice(0, Number(config.max_seeds) > 0 ? Number(config.max_seeds) : 10);
  const suggestions = new Set();
  const warnings = [];
  const hl = config.hl || 'en';

  for (const seed of seeds) {
    try {
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=${encodeURIComponent(hl)}&q=${encodeURIComponent(seed)}`;
      const res = await tools.http.get(url, { timeout: 10000 });
      if (res.status === 429) {
        warnings.push(`autocomplete throttled (HTTP 429) on "${seed}" — skipped`);
        continue;
      }
      if (res.status >= 400) {
        warnings.push(`autocomplete HTTP ${res.status} on "${seed}" — skipped`);
        continue;
      }
      const arr = typeof res.body === 'string' ? safeJson(res.body) : res.body;
      const list = Array.isArray(arr) && Array.isArray(arr[1]) ? arr[1] : [];
      for (const s of list) if (typeof s === 'string' && s.trim()) suggestions.add(s.trim());
    } catch (e) {
      warnings.push(`autocomplete failed on "${seed}": ${e.message}`);
    }
  }
  return { role: 'expansion', keywords: [...suggestions], warnings };
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

const HANDLERS = {
  gsc: gscHandler,
  dataforseo: dataforseoHandler,
  autocomplete: autocompleteHandler,
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Fetch quantitative keyword data across configured providers.
 *
 * INERT CONTRACT: if `providers` is not a non-empty array, returns
 * { keyword_metrics: [], warnings: [], provider_ids: [] } with ZERO I/O.
 * This is the guarantee that empty `keyword_data_providers` (the default) leaves
 * seo-planner behaving exactly as before.
 *
 * A provider that throws or is inert (missing creds) → warning + skip; NEVER
 * throws out of this function (mirrors the existing "research failures don't fail
 * the module" behavior). metrics_required makes emptiness LOUD, not silent.
 *
 * @returns {Promise<{keyword_metrics: object[], warnings: string[], provider_ids: string[]}>}
 */
async function fetchKeywordData(params, tools) {
  const {
    entityName = '',
    seeds: rawSeeds = [],
    budgetUsd = 1.0,
    maxSeedKeywords = 25,
    maxMetricLookups = 100,
    metricsRequired = false,
  } = params || {};

  let providers = params && params.providers;
  if (typeof providers === 'string') providers = safeJson(providers);
  if (!Array.isArray(providers) || providers.length === 0) {
    return { keyword_metrics: [], warnings: [], provider_ids: [] };
  }

  const logger = (tools && tools.logger) || { info() {}, warn() {}, error() {} };
  const warnings = [];
  const providerIds = [];
  let spentUsd = 0;

  const seeds = dedupeStrings(rawSeeds).slice(0, Math.max(1, maxSeedKeywords));

  const expansionProviders = providers.filter((p) => p && KIND_ROLES[p.kind] === 'expansion');
  const metricsProviders = providers.filter((p) => p && KIND_ROLES[p.kind] === 'metrics');
  for (const p of providers) {
    if (!p || !KIND_ROLES[p.kind]) {
      warnings.push(`keyword_data provider "${(p && p.id) || '?'}": unknown kind "${p && p.kind}" — skipped`);
    }
  }

  // Budget check for a single provider given the keyword count it will process.
  const overBudget = (p, count) => {
    const est = (Number(p.est_cost_per_lookup) || 0) * count;
    if (est > 0 && spentUsd + est > budgetUsd) {
      warnings.push(`Budget cap $${budgetUsd} reached — skipping paid provider "${p.id || p.kind}" (est $${est.toFixed(4)})`);
      return true;
    }
    return { est };
  };

  // 1. Expansion — widen the seed set.
  const expansionKeywords = [];
  for (const p of expansionProviders) {
    const budget = overBudget(p, seeds.length);
    if (budget === true) continue;
    try {
      const out = await HANDLERS[p.kind](p, { seeds, candidate: seeds, entityName }, tools, logger);
      for (const k of out.keywords || []) expansionKeywords.push(k);
      for (const w of out.warnings || []) warnings.push(w);
      spentUsd += budget.est;
      providerIds.push(p.id || p.kind);
    } catch (e) {
      warnings.push(`keyword_data provider "${p.id || p.kind}" (${p.kind}) failed: ${e.message}`);
    }
  }

  const candidate = dedupeStrings([...seeds, ...expansionKeywords]).slice(0, Math.max(1, maxMetricLookups));

  // 2. Metrics — score the candidate set with real numbers.
  const rowsByKeyword = new Map();
  for (const p of metricsProviders) {
    const budget = overBudget(p, candidate.length);
    if (budget === true) continue;
    try {
      const out = await HANDLERS[p.kind](p, { seeds, candidate, entityName }, tools, logger);
      for (const row of out.metrics || []) mergeMetricRow(rowsByKeyword, row);
      for (const w of out.warnings || []) warnings.push(w);
      spentUsd += budget.est;
      providerIds.push(p.id || p.kind);
    } catch (e) {
      warnings.push(`keyword_data provider "${p.id || p.kind}" (${p.kind}) failed: ${e.message}`);
    }
  }

  const keyword_metrics = [...rowsByKeyword.values()];

  if (metricsRequired && keyword_metrics.length === 0) {
    warnings.push('metrics_required is set but no keyword metrics were produced (all metrics providers failed, were inert, over budget, or returned empty). Review this output before publishing.');
  }

  return { keyword_metrics, warnings, provider_ids: dedupeStrings(providerIds) };
}

module.exports = {
  fetchKeywordData,
  deriveSeedKeywords,
  normalizeMetricRow,
  renderKeywordMetricsTable,
  buildGscJwt,
  dedupeStrings,
  KIND_ROLES,
  METRIC_FIELDS,
  __handlers: { gsc: gscHandler, dataforseo: dataforseoHandler, autocomplete: autocompleteHandler },
};
