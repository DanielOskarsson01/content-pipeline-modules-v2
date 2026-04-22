/**
 * API Search - Step 1 Discovery submodule
 *
 * Generic REST API job search with two provider modes:
 *   - search: one API call per keyword, server-side filtering (JobTech, Adzuna)
 *   - feed:   one API call total, client-side keyword filtering (RemoteOK, Remotive)
 *
 * Adding a new job board = adding a JSON provider config, not writing code.
 */

// ── Built-in provider configs ─────────────────────────────────────

const BUILTIN_PROVIDERS = {
  jobtech: {
    id: 'jobtech',
    name: 'JobTech / Platsbanken (Sweden)',
    mode: 'search',
    url: 'https://jobsearch.api.jobtechdev.se/search',
    keyword_param: 'q',
    limit_param: 'limit',
    results_path: 'hits',
    filter_fields: [],
    field_map: {
      url: ['webpage_url', 'application_details.url'],
      title: 'headline',
      company: 'employer.name',
      location: 'workplace_address.municipality',
      snippet: 'description.text',
      postedAt: 'publication_date',
      externalId: 'id'
    },
    auth: null
  },
  remoteok: {
    id: 'remoteok',
    name: 'RemoteOK',
    mode: 'feed',
    url: 'https://remoteok.com/api',
    results_path: '$slice_first',
    filter_fields: ['position', 'description'],
    field_map: {
      url: ['url', '$remoteok_slug'],
      title: 'position',
      company: 'company',
      location: 'location',
      snippet: 'description',
      postedAt: 'date',
      externalId: ['id', 'slug']
    },
    auth: null
  },
  remotive: {
    id: 'remotive',
    name: 'Remotive',
    mode: 'feed',
    url: 'https://remotive.com/api/remote-jobs',
    limit_param: 'limit',
    results_path: 'jobs',
    filter_fields: ['title', 'description'],
    field_map: {
      url: 'url',
      title: 'title',
      company: 'company_name',
      location: 'candidate_required_location',
      snippet: 'description',
      postedAt: 'publication_date',
      externalId: 'id'
    },
    auth: null
  }
};

// ── Helpers ────────────────────────────────────────────────────────

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

function stripHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function resolveFieldValue(rawItem, fieldSpec) {
  // fieldSpec can be a string (single path) or array (fallback paths)
  if (Array.isArray(fieldSpec)) {
    for (const spec of fieldSpec) {
      if (spec === '$remoteok_slug') {
        const slug = rawItem.slug;
        if (slug) return `https://remoteok.com/remote-jobs/${slug}`;
        continue;
      }
      const val = getNestedValue(rawItem, spec);
      if (val != null && val !== '') return val;
    }
    return null;
  }
  if (typeof fieldSpec === 'string') {
    return getNestedValue(rawItem, fieldSpec);
  }
  return null;
}

function mapItem(rawItem, provider) {
  const mapped = {
    source: provider.id,
    status: 'success'
  };

  for (const [canonical, fieldSpec] of Object.entries(provider.field_map)) {
    if (fieldSpec === null) {
      mapped[canonical] = null;
      continue;
    }
    let val = resolveFieldValue(rawItem, fieldSpec);
    // Strip HTML from snippet
    if (canonical === 'snippet' && val) {
      val = stripHtml(val).slice(0, 200);
    }
    mapped[canonical] = val;
  }

  // Build canonical externalId with provider prefix
  const rawId = mapped.externalId || '';
  mapped.externalId = `${provider.id}-${rawId}`;

  return mapped;
}

function extractResults(data, resultsPath) {
  if (!resultsPath) return Array.isArray(data) ? data : [];

  // Special: skip first element (RemoteOK metadata)
  if (resultsPath === '$slice_first') {
    return Array.isArray(data) ? data.slice(1) : [];
  }

  // Dot-notation path into the response
  return getNestedValue(data, resultsPath) || [];
}

function matchesKeywords(rawItem, keywords, filterFields) {
  if (!keywords || keywords.length === 0) return true;
  if (!filterFields || filterFields.length === 0) return true;

  const keywordsLower = keywords.map(k => k.toLowerCase());

  for (const field of filterFields) {
    const val = getNestedValue(rawItem, field);
    if (!val) continue;
    const text = stripHtml(String(val)).toLowerCase();
    for (const kw of keywordsLower) {
      if (text.includes(kw)) return true;
    }
  }
  return false;
}

function buildRequestUrl(provider, keyword, maxResults, extraParams) {
  const params = new URLSearchParams();

  // Keyword param (search mode only)
  if (keyword && provider.keyword_param) {
    params.set(provider.keyword_param, keyword);
  }

  // Limit param
  if (maxResults && provider.limit_param) {
    params.set(provider.limit_param, String(maxResults));
  }

  // Extra provider-specific params
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      params.set(k, String(v));
    }
  }

  // Auth via query param
  if (provider.auth && provider.auth.type === 'query_param') {
    const envVal = process.env[provider.auth.env_var];
    if (envVal) {
      params.set(provider.auth.key, envVal);
    }
  }

  const qs = params.toString();
  return qs ? `${provider.url}?${qs}` : provider.url;
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
        return new Promise(resolve => setTimeout(resolve, waitMs));
      }
    });
    return waitQueue;
  };
}

// ── Main execute ───────────────────────────────────────────────────

async function execute(input, options, tools) {
  const { entities } = input;
  const {
    keywords = [],
    exclude_keywords = [],
    max_results = 50,
    active_providers = ['jobtech'],
    custom_providers = [],
    provider_params = {},
    requests_per_minute = 30
  } = options;
  const { logger, http, progress } = tools;

  // Merge built-in + custom providers, filter to active
  const allProviders = { ...BUILTIN_PROVIDERS };
  for (const cp of custom_providers) {
    if (cp && cp.id) allProviders[cp.id] = cp;
  }

  const providers = active_providers
    .map(id => allProviders[id])
    .filter(p => {
      if (!p) return false;
      // Validate auth
      if (p.auth && p.auth.type === 'query_param' && p.auth.env_var) {
        if (!process.env[p.auth.env_var]) {
          logger.warn(`Provider "${p.id}" skipped: missing env var ${p.auth.env_var}`);
          return false;
        }
      }
      return true;
    });

  if (providers.length === 0) {
    logger.warn('No active providers configured or available');
    return {
      results: entities.map(e => ({
        entity_name: e.name,
        items: [],
        meta: { total_found: 0, providers_used: 0, api_calls: 0, errors: 0 }
      })),
      summary: {
        total_entities: entities.length,
        total_items: 0,
        description: 'No active providers available',
        errors: []
      }
    };
  }

  logger.info(`Active providers: ${providers.map(p => p.id).join(', ')}`);
  const excludeSet = new Set(exclude_keywords.map(k => k.toLowerCase()));
  const rateLimiter = createRateLimiter(requests_per_minute);
  const results = [];

  for (let ei = 0; ei < entities.length; ei++) {
    const entity = entities[ei];
    const allItems = new Map(); // externalId -> item
    let totalCalls = 0;
    const errors = [];

    for (const provider of providers) {
      const extraParams = provider_params[provider.id] || {};

      try {
        if (provider.mode === 'feed') {
          // Feed mode: single API call, client-side filtering
          await rateLimiter();
          progress.update(ei + 1, entities.length, `Fetching: ${provider.name}`);

          const url = buildRequestUrl(provider, null, max_results, extraParams);
          logger.info(`${provider.id}: GET ${url}`);
          const res = await http.get(url, { timeout: 15000 });
          totalCalls++;

          if (res.status !== 200) {
            logger.warn(`${provider.id}: HTTP ${res.status}`);
            errors.push(`${provider.id}: HTTP ${res.status}`);
            continue;
          }

          const body = typeof res.body === 'string' ? res.body : String(res.body);
          const data = JSON.parse(body);
          const rawItems = extractResults(data, provider.results_path);

          let added = 0;
          for (const rawItem of rawItems) {
            // Client-side keyword filter
            if (keywords.length > 0 && !matchesKeywords(rawItem, keywords, provider.filter_fields)) {
              continue;
            }

            const mapped = mapItem(rawItem, provider);
            if (allItems.has(mapped.externalId)) continue;

            // Exclude filter
            const titleLower = (mapped.title || '').toLowerCase();
            if (excludeSet.size > 0 && [...excludeSet].some(ex => titleLower.includes(ex))) {
              continue;
            }

            allItems.set(mapped.externalId, mapped);
            added++;
          }

          logger.info(`${provider.id}: ${rawItems.length} total, ${added} matched keywords & passed filters (${allItems.size} unique total)`);

        } else {
          // Search mode: one API call per keyword
          if (keywords.length === 0) {
            logger.warn(`${provider.id}: No keywords configured for search mode - skipping`);
            continue;
          }

          for (let ki = 0; ki < keywords.length; ki++) {
            const keyword = keywords[ki];
            progress.update(ki + 1, keywords.length, `${provider.name}: "${keyword}"`);

            try {
              await rateLimiter();
              const url = buildRequestUrl(provider, keyword, max_results, extraParams);
              const res = await http.get(url, { timeout: 15000 });
              totalCalls++;

              if (res.status !== 200) {
                logger.warn(`${provider.id} "${keyword}": HTTP ${res.status}`);
                errors.push(`${provider.id} "${keyword}": HTTP ${res.status}`);
                continue;
              }

              const body = typeof res.body === 'string' ? res.body : String(res.body);
              const data = JSON.parse(body);
              const rawItems = extractResults(data, provider.results_path);

              let added = 0;
              for (const rawItem of rawItems) {
                const mapped = mapItem(rawItem, provider);
                if (allItems.has(mapped.externalId)) continue;

                // Exclude filter
                const titleLower = (mapped.title || '').toLowerCase();
                if (excludeSet.size > 0 && [...excludeSet].some(ex => titleLower.includes(ex))) {
                  continue;
                }

                allItems.set(mapped.externalId, mapped);
                added++;
              }

              logger.info(`${provider.id} "${keyword}": ${rawItems.length} hits, ${added} new (${allItems.size} unique total)`);

              // Save partial results after each keyword for timeout resilience
              if (tools._partialItems) {
                tools._partialItems = Array.from(allItems.values());
              }
            } catch (err) {
              logger.error(`${provider.id} "${keyword}": ${err.message}`);
              errors.push(`${provider.id} "${keyword}": ${err.message}`);
            }
          }
        }
      } catch (err) {
        logger.error(`${provider.id}: ${err.message}`);
        errors.push(`${provider.id}: ${err.message}`);
      }

      // Save partial results for timeout resilience (feed mode saves here after single call)
      if (tools._partialItems) {
        tools._partialItems = Array.from(allItems.values());
      }
    }

    const items = Array.from(allItems.values());

    results.push({
      entity_name: entity.name,
      items,
      meta: {
        total_found: items.length,
        providers_used: providers.length,
        api_calls: totalCalls,
        keywords_searched: keywords.length,
        errors: errors.length
      }
    });

    logger.info(`${entity.name}: ${items.length} unique items from ${providers.length} provider(s), ${totalCalls} API calls`);
  }

  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
  const totalErrors = results.reduce((sum, r) => sum + (r.meta?.errors || 0), 0);
  const providerNames = providers.map(p => p.id).join(', ');

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      description: totalErrors > 0
        ? `${totalItems} items from ${providerNames} (${totalErrors} errors)`
        : `${totalItems} items from ${providerNames}`,
      errors: results.flatMap(r => {
        const meta = r.meta || {};
        return meta.errors > 0 ? [`${r.entity_name}: ${meta.errors} errors`] : [];
      })
    }
  };
}

module.exports = execute;
