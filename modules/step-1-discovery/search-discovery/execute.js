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
    return queries.slice(0, maxQueries);
  }
  return queries;
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
  if (!path) return Array.isArray(data) ? data : [];
  return getNestedValue(data, path) || [];
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
    maxResultsPerQuery: toNum(options.max_results_per_query, 10),
    maxQueriesPerEntity: toNum(options.max_queries_per_entity, 20),
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
    const auth = providerAuth(p, logger);
    if (auth === null) continue;
    providers.push({ config: p, auth });
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

  for (let ei = 0; ei < entities.length; ei++) {
    const entity = entities[ei];
    progress.update(ei + 1, entities.length, `Searching: ${entity.name}`);

    const seen = new Map(); // normalized url -> item
    const errors = [];
    let apiCalls = 0;

    const queries = buildQueries(entity, templates, cfg.mode, sites, cfg.maxQueriesPerEntity, logger);

    for (const { config: provider, auth } of providers) {
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
          const res = await http.head(rendered, { timeout: 10000, headers: auth.headers });
          apiCalls++;
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

        try {
          await rateLimiter();
          const params = buildParams(provider, { finalQuery, siteFilterParam }, cfg);
          Object.assign(params, auth.queryParams);

          let res;
          if ((provider.method || 'GET').toUpperCase() === 'POST') {
            res = await http.post(endpoint, params, { timeout: 20000, headers: auth.headers });
          } else {
            const qs = new URLSearchParams();
            for (const [k, v] of Object.entries(params)) qs.set(k, Array.isArray(v) ? v.join(',') : String(v));
            res = await http.get(`${endpoint}?${qs.toString()}`, { timeout: 20000, headers: auth.headers });
          }
          apiCalls++;

          if (res.status === 401 || res.status === 403) {
            // Auth failure is provider-wide, not query-specific — stop hammering it.
            logger.warn(`${provider.id}: HTTP ${res.status} (auth) — skipping remaining queries for this provider`);
            errors.push(`${provider.id}: HTTP ${res.status} (auth) — provider skipped`);
            break;
          }
          if (res.status !== 200) {
            logger.warn(`${provider.id} "${finalQuery}": HTTP ${res.status}`);
            errors.push(`${provider.id}: HTTP ${res.status}`);
            continue;
          }

          const data = typeof res.body === 'string' ? JSON.parse(res.body) : res.body;
          const rawItems = extractRawResults(data, provider, cfg.resultType);

          const newItems = [];
          for (const rawItem of rawItems) {
            const mapped = mapResult(rawItem, provider, { resultType: cfg.resultType, query: finalQuery, mode: cfg.mode });
            if (!mapped) continue;
            const key = normalizeUrl(mapped.url);
            if (seen.has(key)) continue;
            seen.set(key, mapped);
            newItems.push(mapped);
          }

          // Rule 10: partial results survive a timeout — push after EVERY query
          if (tools._partialItems && newItems.length > 0) tools._partialItems.push(...newItems);

          logger.info(`${provider.id} "${finalQuery}": ${rawItems.length} raw, ${newItems.length} new (${seen.size} unique total)`);
        } catch (err) {
          logger.error(`${provider.id} "${finalQuery}": ${err.message}`);
          errors.push(`${provider.id}: ${err.message}`);
        }
      }
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
        queries_run: queries.length,
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
