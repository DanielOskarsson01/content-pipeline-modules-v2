/**
 * Search Discovery - Step 1 Discovery submodule
 *
 * Generic web-search discovery with pluggable providers (api-search precedent:
 * new provider = JSON config, not code).
 *
 * Provider kinds:
 *   - serp:   query-based search engine. Renders query templates per entity,
 *             calls the provider's endpoint for the selected vertical
 *             (web/news/images), maps result fields via field_map.
 *   - lookup: deterministic URL template rendered from entity fields,
 *             HEAD-verified (no query, no search).
 *
 * Search modes:
 *   - open:            each template runs as-is per entity
 *   - site_restricted: each template fans out per domain in the site list
 *                      (appends `site:{domain}` or uses the provider's
 *                      domain-filter param when configured)
 *
 * Zero vertical flavor in code or defaults (Rule 13) — site lists, query
 * flavor, and providers all arrive via options/template presets.
 */

// ── Option parsing (UI may store JSON options as strings) ────────────

function parseJsonOrArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed); } catch (err) { return []; }
    }
    return [];
  }
  return [];
}

function toNum(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function integerOption(value, fallback, min, max, name) {
  const n = value == null ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`search-discovery: ${name} must be an integer from ${min} to ${max}`);
  }
  return n;
}

function paginationConfig(provider, resultType, pageSize) {
  const p = provider.pagination;
  if (p == null) return null;
  if (typeof p !== 'object' || Array.isArray(p) || typeof p.param !== 'string' || !p.param.trim()) {
    throw new Error(`search-discovery: provider ${provider.id} needs pagination.param`);
  }
  const reserved = [provider.query_param, provider.num_param, provider.date_param?.name,
    provider.site_filter?.name, provider.auth?.type === 'query_param' ? provider.auth.key : null];
  if (reserved.includes(p.param)) throw new Error(`search-discovery: provider ${provider.id} pagination.param conflicts with a request parameter`);
  const start = integerOption(p.start, 1, 0, 1000000, 'pagination.start');
  if (p.step === 'page_size' && !provider.num_param) {
    throw new Error(`search-discovery: provider ${provider.id} page_size pagination requires num_param`);
  }
  const step = p.step === 'page_size'
    ? integerOption(provider.extra_params?.[provider.num_param], pageSize, 1, 1000000, 'pagination effective page size')
    : integerOption(p.step, 1, 1, 1000000, 'pagination.step');
  if (p.result_types != null && (!Array.isArray(p.result_types) || p.result_types.some(t => !['web', 'news', 'images'].includes(t)))) {
    throw new Error(`search-discovery: provider ${provider.id} pagination.result_types must list supported verticals`);
  }
  if (p.result_types && !p.result_types.includes(resultType)) return null;
  return { param: p.param, start, step };
}

function accountLimitRules(provider) {
  const rules = provider.account_limit_errors || [];
  if (!Array.isArray(rules) || rules.some(r => !r || !Number.isInteger(r.status) || r.status < 400 || r.status > 599 ||
    typeof r.message_path !== 'string' || !r.message_path.trim() || typeof r.contains !== 'string' || !r.contains.trim())) {
    throw new Error(`search-discovery: provider ${provider.id} account_limit_errors needs status, message_path and contains`);
  }
  return rules;
}

function isAccountLimit(provider, response) {
  if (!provider.account_limit_errors?.length) return false;
  let body;
  try { body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body; }
  catch { return false; }
  return provider.account_limit_errors.some(rule => {
    const message = getNestedValue(body, rule.message_path);
    return response.status === rule.status && typeof message === 'string' && message.toLowerCase().includes(rule.contains.toLowerCase());
  });
}

function retryDelay(headers, attempt) {
  const pair = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === 'retry-after');
  const value = pair?.[1];
  const seconds = value == null || value === '' ? NaN : Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Math.max(1000 * 2 ** attempt, Number.isFinite(delay) ? delay : 0);
}

function parseLines(val) {
  return String(val ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

// ── Generic helpers (api-search precedent) ───────────────────────────

function getNestedValue(obj, path) {
  if (!path || !obj) return null;
  const parts = path.split('.');
  let val = obj;
  for (const part of parts) {
    if (val == null) return null;
    val = val[part];
  }
  return val ?? null;
}

function resolveFieldValue(rawItem, fieldSpec) {
  if (Array.isArray(fieldSpec)) {
    for (const spec of fieldSpec) {
      const val = getNestedValue(rawItem, spec);
      if (val != null && val !== '') return val;
    }
    return null;
  }
  if (typeof fieldSpec === 'string') return getNestedValue(rawItem, fieldSpec);
  return null;
}

function createRateLimiter(rpm) {
  if (!rpm || rpm <= 0) return () => Promise.resolve();
  const minIntervalMs = Math.ceil(60000 / rpm);
  let lastRequestTime = 0;
  let waitQueue = Promise.resolve();

  return () => {
    waitQueue = waitQueue.then(() => {
      const now = Date.now();
      const elapsed = now - lastRequestTime;
      const waitMs = Math.max(0, minIntervalMs - elapsed);
      lastRequestTime = now + waitMs;
      if (waitMs > 0) {
        return new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    });
    return waitQueue;
  };
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    let path = u.pathname.replace(/\/+$/, '');
    return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch (err) {
    return url;
  }
}

function domainOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (err) {
    return '';
  }
}

function websiteDomain(website) {
  if (!website || typeof website !== 'string') return '';
  let w = website.trim();
  if (!/^https?:\/\//i.test(w)) w = `https://${w}`;
  try {
    return new URL(w).hostname.toLowerCase().replace(/^www\./, '');
  } catch (err) {
    return '';
  }
}

// ── Templating ───────────────────────────────────────────────────────

/**
 * Renders a query template. Returns null if a referenced placeholder has no
 * value for this entity (caller warns + skips).
 */
function renderTemplate(template, values) {
  let missing = null;
  const rendered = template.replace(/\{(entity_name|alt_names|website_domain|site)\}/g, (_, key) => {
    const val = values[key];
    if (val == null || val === '') {
      missing = key;
      return '';
    }
    return val;
  });
  return missing ? { rendered: null, missing } : { rendered, missing: null };
}

function altNames(entity) {
  const raw = entity.alt_names;
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
  return list.map((n) => `"${n}"`).join(' OR ');
}

/**
 * Builds the (query, site) pairs for one entity: templates x sites in
 * site_restricted mode, plain templates in open mode. Capped at
 * maxQueries with a loud warning.
 */
function buildQueries(entity, templates, mode, sites, maxQueries, logger) {
  const values = {
    entity_name: entity.name || '',
    alt_names: altNames(entity),
    website_domain: websiteDomain(entity.website),
    site: null, // filled per site below
  };

  const combos = [];
  for (const template of templates) {
    if (mode === 'site_restricted') {
      for (const site of sites) {
        combos.push({ template, site });
      }
    } else {
      combos.push({ template, site: null });
    }
  }

  const queries = [];
  let skipped = 0;
  for (const { template, site } of combos) {
    const { rendered, missing } = renderTemplate(template, { ...values, site: site || '' });
    if (rendered === null) {
      skipped++;
      logger.warn(`${entity.name}: template "${template}" skipped — no value for {${missing}}`);
      continue;
    }
    queries.push({ query: rendered, site, template });
  }

  if (queries.length > maxQueries) {
    logger.warn(`${entity.name}: ${queries.length} query combinations capped to max_queries_per_entity=${maxQueries}`);
    return { queries: queries.slice(0, maxQueries), planned: queries.length, skipped, truncated: queries.length - maxQueries };
  }
  return { queries, planned: queries.length, skipped, truncated: 0 };
}

// ── Provider plumbing ────────────────────────────────────────────────

function providerAuth(provider, logger) {
  // Returns { headers, queryParams } or null when a required env var is missing.
  const auth = provider.auth;
  if (!auth) return { headers: {}, queryParams: {} };
  const envVal = auth.env_var ? process.env[auth.env_var] : null;
  if (auth.env_var && !envVal) {
    logger.warn(`Provider "${provider.id}" skipped: missing env var ${auth.env_var}`);
    return null;
  }
  if (auth.type === 'header') return { headers: { [auth.header]: envVal }, queryParams: {} };
  if (auth.type === 'bearer') return { headers: { Authorization: `Bearer ${envVal}` }, queryParams: {} };
  if (auth.type === 'query_param') return { headers: {}, queryParams: { [auth.key]: envVal } };
  logger.warn(`Provider "${provider.id}": unknown auth.type "${auth.type}" — proceeding without auth`);
  return { headers: {}, queryParams: {} };
}

function buildParams(provider, q, cfg) {
  // Common param assembly for GET (query string) and POST (JSON body).
  const params = {};
  if (provider.query_param) params[provider.query_param] = q.finalQuery;
  if (provider.num_param) params[provider.num_param] = cfg.maxResultsPerQuery;
  if (cfg.dateRange !== 'any' && provider.date_param && provider.date_param.map) {
    const mapped = provider.date_param.map[cfg.dateRange];
    if (mapped) params[provider.date_param.name] = mapped;
  }
  if (q.siteFilterParam) {
    params[q.siteFilterParam.name] =
      q.siteFilterParam.format === 'array' ? [q.siteFilterParam.value] : q.siteFilterParam.value;
  }
  if (provider.extra_params && typeof provider.extra_params === 'object') {
    Object.assign(params, provider.extra_params);
  }
  return params;
}

function extractRawResults(data, provider, resultType) {
  const rp = provider.results_path;
  const path = rp && typeof rp === 'object' ? rp[resultType] : rp;
  if (!path) return data;
  return getNestedValue(data, path);
}

function mapResult(rawItem, provider, ctx) {
  const mapped = {
    source: provider.id,
    result_type: ctx.resultType,
    query_used: ctx.query,
    found_via: `search-discovery:${ctx.mode}`,
  };
  const fieldMap = provider.field_map || {};
  for (const [canonical, fieldSpec] of Object.entries(fieldMap)) {
    mapped[canonical] = resolveFieldValue(rawItem, fieldSpec);
  }
  if (!mapped.url || typeof mapped.url !== 'string') return null;
  mapped.domain = domainOf(mapped.url);
  return mapped;
}

// ── Main execute ─────────────────────────────────────────────────────

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, http, progress } = tools;

  const cfg = {
    mode: options.search_mode === 'site_restricted' ? 'site_restricted' : 'open',
    resultType: ['web', 'news', 'images'].includes(options.result_type) ? options.result_type : 'web',
    dateRange: options.date_range || 'any',
    maxResultsPerQuery: integerOption(options.max_results_per_query, 10, 1, 100, 'max_results_per_query'),
    maxQueriesPerEntity: integerOption(options.max_queries_per_entity, 20, 1, 500, 'max_queries_per_entity'),
    maxPages: integerOption(options.max_pages_per_query, 1, 1, 100, 'max_pages_per_query'),
    maxRequests: integerOption(options.max_search_requests_per_entity, 0, 0, 10000, 'max_search_requests_per_entity'),
    emptyPages: integerOption(options.empty_pages_to_stop, 2, 1, 10, 'empty_pages_to_stop'),
    duplicatePages: integerOption(options.duplicate_pages_to_stop, 3, 1, 10, 'duplicate_pages_to_stop'),
    retries: integerOption(options.max_rate_limit_retries, 2, 0, 5, 'max_rate_limit_retries'),
    verifyLiveness: options.verify_liveness === true || options.verify_liveness === 'true',
  };

  const templates = parseJsonOrArray(options.query_templates).filter((t) => typeof t === 'string' && t.trim());
  const providersConfig = parseJsonOrArray(options.providers).filter((p) => p && p.id);

  // Site list: reference doc wins over textarea
  let siteListSource = options.site_list;
  const docs = options.site_list_doc;
  if (docs && typeof docs === 'object' && !Array.isArray(docs)) {
    const docContents = Object.values(docs).filter((c) => typeof c === 'string' && c.trim());
    if (docContents.length > 0) siteListSource = docContents.join('\n');
  }
  const sites = parseLines(siteListSource);

  if (cfg.mode === 'site_restricted' && sites.length === 0) {
    throw new Error('search-discovery: search_mode "site_restricted" requires site_list (or site_list_doc) — configure a domain list or switch to "open"');
  }

  // Resolve auth up-front; drop providers with missing env vars (loud)
  const providers = [];
  for (const p of providersConfig) {
    accountLimitRules(p);
    const auth = providerAuth(p, logger);
    if (auth === null) continue;
    providers.push({ config: p, auth, pagination: p.kind === 'lookup' ? null : paginationConfig(p, cfg.resultType, cfg.maxResultsPerQuery) });
  }

  if (providers.length === 0) {
    logger.warn('search-discovery: no providers configured or available — nothing to search');
    return {
      results: entities.map((e) => ({
        entity_name: e.name,
        items: [],
        meta: { total_found: 0, providers_used: 0, api_calls: 0, errors: 0, note: 'No providers configured — add provider configs in options' },
      })),
      summary: {
        total_entities: entities.length,
        total_items: 0,
        description: 'No search providers configured — add provider configs (see search-discovery README)',
        errors: [],
      },
    };
  }

  const rateLimiter = createRateLimiter(toNum(options.requests_per_minute, 30));
  const results = [];
  const disabledProviders = new Map();

  for (let ei = 0; ei < entities.length; ei++) {
    const entity = entities[ei];
    progress.update(ei + 1, entities.length, `Searching: ${entity.name}`);

    const seen = new Map(); // normalized url -> item
    const errors = [];
    let apiCalls = 0;

    const queryPlan = buildQueries(entity, templates, cfg.mode, sites, cfg.maxQueriesPerEntity, logger);
    const { queries } = queryPlan;
    const jobs = [];
    let searchRequests = 0;
    const providerSkips = [];


    for (const { config: provider, auth, pagination } of providers) {
      if (provider.kind === 'lookup') {
        // Deterministic URL template, HEAD-verified — no query involved.
        const { rendered, missing } = renderTemplate(provider.url_template || '', {
          entity_name: entity.name || '',
          alt_names: altNames(entity),
          website_domain: websiteDomain(entity.website),
          site: '',
        });
        if (rendered === null) {
          logger.warn(`${entity.name}: lookup provider "${provider.id}" skipped — no value for {${missing}}`);
          continue;
        }
        try {
          await rateLimiter();
          apiCalls++;
          const res = await http.head(rendered, { timeout: 10000, headers: auth.headers });
          if (res.status < 400) {
            const item = {
              url: rendered,
              title: null,
              snippet: null,
              domain: domainOf(rendered),
              source: provider.id,
              result_type: cfg.resultType,
              pub_date: null,
              query_used: null,
              found_via: 'search-discovery:lookup',
              entity_name: entity.name,
            };
            const key = normalizeUrl(rendered);
            if (!seen.has(key)) {
              seen.set(key, item);
              if (tools._partialItems) tools._partialItems.push(item);
            }
          } else {
            logger.info(`${entity.name}: lookup "${provider.id}" HTTP ${res.status} — dropped`);
          }
        } catch (err) {
          logger.error(`${entity.name}: lookup "${provider.id}": ${err.message}`);
          errors.push(`${provider.id}: ${err.message}`);
        }
        continue;
      }

      // serp kind
      const endpoints = provider.endpoints || {};
      const endpoint = endpoints[cfg.resultType];
      if (!endpoint) {
        providerSkips.push({ provider: provider.id, reason: 'missing_endpoint' });
        logger.warn(`Provider "${provider.id}" skipped: no endpoint for result_type "${cfg.resultType}"`);
        continue;
      }

      const siteFilterCfg = provider.site_filter && provider.site_filter.type === 'param' ? provider.site_filter : null;

      for (const q of queries) {
        // Site handling: template's own {site}, provider param, or site: operator
        let finalQuery = q.query;
        let siteFilterParam = null;
        if (cfg.mode === 'site_restricted' && q.site) {
          if (q.template.includes('{site}')) {
            // already substituted during rendering
          } else if (siteFilterCfg) {
            siteFilterParam = { name: siteFilterCfg.name, format: siteFilterCfg.format, value: q.site };
          } else {
            finalQuery = `${q.query} site:${q.site}`;
          }
        }

        jobs.push({ provider, auth, pagination, endpoint, finalQuery, siteFilterParam,
          seen: new Set(), empty: 0, duplicates: 0,
          ledger: { provider: provider.id, query: finalQuery, site: q.site,
            pagination_configured: !!pagination, pages: [], stop_reason: null } });
      }
    }

    // Breadth first: every query/provider gets page 1 before any gets page 2.
    // Otherwise one deep query could consume the whole thin-entity rescue budget.
    for (let page = 1; page <= cfg.maxPages; page++) {
      for (const job of jobs) {
        const { provider, auth, pagination, endpoint, finalQuery, siteFilterParam, ledger } = job;
        if (ledger.stop_reason) continue;
        if (disabledProviders.has(provider.id)) {
          ledger.stop_reason = disabledProviders.get(provider.id);
          continue;
        }
        const pageValue = pagination ? pagination.start + (page - 1) * pagination.step : null;
        const entry = { page, page_value: pageValue, attempts: 0, statuses: [], raw_results: 0, new_urls: 0, new_query_urls: 0 };
        ledger.pages.push(entry);
        try {
          const params = buildParams(provider, { finalQuery, siteFilterParam }, cfg);
          if (pagination) params[pagination.param] = pageValue;
          Object.assign(params, auth.queryParams);
          let res;
          for (let attempt = 0; attempt <= cfg.retries; attempt++) {
            if (cfg.maxRequests && searchRequests >= cfg.maxRequests) {
              ledger.stop_reason = 'request_limit';
              break;
            }
            await rateLimiter();
            searchRequests++;
            apiCalls++;
            entry.attempts++;
            if ((provider.method || 'GET').toUpperCase() === 'POST') {
              res = await http.post(endpoint, params, { timeout: 20000, headers: auth.headers });
            } else {
              const url = new URL(endpoint);
              for (const [k, v] of Object.entries(params)) url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v));
              res = await http.get(url.toString(), { timeout: 20000, headers: auth.headers });
            }
            entry.statuses.push(res.status);
            if (res.status !== 429 || attempt === cfg.retries) break;
            if (cfg.maxRequests && searchRequests >= cfg.maxRequests) {
              ledger.stop_reason = 'request_limit';
              break;
            }
            const delay = retryDelay(res.headers, attempt);
            // Do not ignore long server cooldowns or occupy the worker indefinitely.
            if (delay > 60000) {
              ledger.stop_reason = 'provider_cooldown';
              disabledProviders.set(provider.id, ledger.stop_reason);
              break;
            }
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          if (ledger.stop_reason) {
            if (res?.status === 429) errors.push(`${provider.id}: HTTP 429 (${ledger.stop_reason})`);
            continue;
          }
          if (res.status !== 200) {
            const accountLimit = res.status === 402 || isAccountLimit(provider, res);
            ledger.stop_reason = accountLimit ? 'provider_account_limit'
              : [401, 403].includes(res.status) ? 'provider_auth_error'
              : res.status === 429 ? 'provider_rate_limit'
              : 'provider_http_error';
            if (accountLimit || [401, 403, 429].includes(res.status)) disabledProviders.set(provider.id, ledger.stop_reason);
            logger.warn(`${provider.id} page ${page}: HTTP ${res.status} — ${ledger.stop_reason}`);
            errors.push(`${provider.id}: HTTP ${res.status}`);
            continue;
          }
          let data;
          try { data = typeof res.body === 'string' ? JSON.parse(res.body) : res.body; }
          catch { ledger.stop_reason = 'invalid_response'; errors.push(`${provider.id}: invalid JSON response`); continue; }
          const rawItems = extractRawResults(data, provider, cfg.resultType);
          if (!Array.isArray(rawItems)) {
            ledger.stop_reason = 'invalid_response';
            errors.push(`${provider.id}: results_path did not resolve to an array`);
            continue;
          }
          entry.raw_results = rawItems.length;
          let validResults = 0;
          for (const rawItem of rawItems) {
            const mapped = mapResult(rawItem, provider, { resultType: cfg.resultType, query: finalQuery, mode: cfg.mode });
            if (!mapped) continue;
            validResults++;
            const key = normalizeUrl(mapped.url);
            if (!job.seen.has(key)) { job.seen.add(key); entry.new_query_urls++; }
            const provenance = { provider: provider.id, query: finalQuery, site: ledger.site, page, page_value: pageValue };
            if (seen.has(key)) {
              const existing = seen.get(key);
              // Lookup HEAD checks establish liveness only. A real search result
              // enriches that placeholder with its full metadata and attribution.
              // Mutate the shared object so the partial-results buffer stays current.
              if (existing.found_via === 'search-discovery:lookup') Object.assign(existing, mapped);
              existing.search_provenance ||= [];
              if (!existing.search_provenance.some(p => p.provider === provenance.provider && p.query === provenance.query && p.site === provenance.site && p.page === page)) {
                existing.search_provenance.push(provenance);
              }
              // Preserve full snippets when a later result supplies richer evidence.
              for (const field of ['title', 'snippet']) {
                if (typeof mapped[field] === 'string' && mapped[field].length > (existing[field] || '').length) existing[field] = mapped[field];
              }
              continue;
            }
            mapped.entity_name = entity.name;
            mapped.search_provenance = [provenance];
            seen.set(key, mapped);
            entry.new_urls++;
            // Rule 10: every completed page is recoverable before the next request.
            if (tools._partialItems) tools._partialItems.push(mapped);
          }
          if (rawItems.length && !validResults) {
            ledger.stop_reason = 'invalid_response';
            errors.push(`${provider.id}: results contained no mapped URLs`);
            continue;
          }
          job.empty = rawItems.length === 0 ? job.empty + 1 : 0;
          job.duplicates = rawItems.length > 0 && entry.new_query_urls === 0 ? job.duplicates + 1 : 0;
          if (!pagination && cfg.maxPages > 1) ledger.stop_reason = 'pagination_not_configured';
          else if (job.empty >= cfg.emptyPages) ledger.stop_reason = 'empty_pages';
          else if (job.duplicates >= cfg.duplicatePages) ledger.stop_reason = 'duplicate_pages';
          else if (page >= cfg.maxPages) ledger.stop_reason = 'page_limit';
          // Short nonempty pages are never taken as proof of exhaustion.
          logger.info(`${provider.id} "${finalQuery}" page ${page}: ${entry.raw_results} raw, ${entry.new_urls} new (${seen.size} unique total)`);
        } catch (err) {
          ledger.stop_reason = 'request_error';
          // Transport errors can embed URLs with query-param credentials. Do not log them.
          errors.push(`${provider.id}: search request failed`);
          logger.error(`${provider.id} page ${page}: search request failed`);
        }
      }
      if (jobs.every(job => job.ledger.stop_reason)) break;
    }
    for (const { ledger } of jobs) {
      logger.info(`${entity.name}: ${ledger.provider} "${ledger.query}" stopped: ${ledger.stop_reason}`);
    }

    let items = Array.from(seen.values());

    // Optional liveness check: drop hard-dead links only (404/410).
    // 403/5xx are kept — bot walls and hiccups are not dead links.
    if (cfg.verifyLiveness && items.length > 0) {
      const kept = [];
      for (const item of items) {
        try {
          await rateLimiter();
          const res = await http.head(item.url, { timeout: 10000 });
          if (res.status === 404 || res.status === 410) {
            logger.info(`${entity.name}: dropped dead link (HTTP ${res.status}): ${item.url}`);
            continue;
          }
        } catch (err) {
          logger.warn(`${entity.name}: liveness check failed for ${item.url} (${err.message}) — keeping`);
        }
        kept.push(item);
      }
      items = kept;
    }

    items = items.map((item) => ({ ...item, entity_name: entity.name }));

    results.push({
      entity_name: entity.name,
      items,
      meta: {
        total_found: items.length,
        providers_used: providers.length,
        api_calls: apiCalls,
        queries_run: jobs.filter(j => j.ledger.pages.some(p => p.attempts > 0)).length,
        queries_planned_per_provider: queryPlan.planned,
        queries_selected_per_provider: queries.length,
        queries_truncated_per_provider: queryPlan.truncated,
        templates_skipped: queryPlan.skipped,
        search_requests: searchRequests,
        search_limits: { max_pages_per_query: cfg.maxPages, max_search_requests_per_entity: cfg.maxRequests,
          max_results_per_page: cfg.maxResultsPerQuery, max_queries_per_entity: cfg.maxQueriesPerEntity },
        search_routes: jobs.map(j => j.ledger),
        providers_skipped: providerSkips,
        errors: errors.length,
      },
    });

    logger.info(`${entity.name}: ${items.length} unique URLs from ${providers.length} provider(s), ${apiCalls} API calls`);
  }

  const totalItems = results.reduce((s, r) => s + r.items.length, 0);
  const totalErrors = results.reduce((s, r) => s + (r.meta.errors || 0), 0);
  const providerNames = providers.map((p) => p.config.id).join(', ');

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      description: totalErrors > 0
        ? `${totalItems} URLs from ${providerNames} (${totalErrors} errors)`
        : `${totalItems} URLs from ${providerNames}`,
      errors: results.flatMap((r) => (r.meta.errors > 0 ? [`${r.entity_name}: ${r.meta.errors} errors`] : [])),
    },
  };
}

module.exports = execute;
