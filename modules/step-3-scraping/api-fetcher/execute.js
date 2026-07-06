/**
 * API Fetcher - Step 3 structured-source enrichment submodule.
 *
 * Given an entity carrying an API identifier (a channel id, a podcast feed URL,
 * a company registry number), fetch structured records from the corresponding
 * API and add them to the pool as items with source_api / data_json / raw_text /
 * fetch_date / status. Downstream Step 5 consumes raw_text / data_json exactly
 * like scraped text_content.
 *
 * Adding a new API source = a JSON provider config, not writing code. All
 * provider knowledge (endpoints, params, field maps, auth, RSS tag names) lives
 * in the `providers` option; this file is the generic engine only (Rule 13).
 */

// ── Generic value / field helpers ──────────────────────────────────

function getNestedValue(obj, path) {
  if (!path || obj == null) return null;
  const parts = String(path).split('.');
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

// field_map value may be a single dot-path string or a fallback array of paths.
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

// Map one raw API/feed record to the provider's canonical field names.
function mapRecord(rawItem, fieldMap) {
  const mapped = {};
  if (!fieldMap || typeof fieldMap !== 'object') return mapped;
  for (const [canonical, fieldSpec] of Object.entries(fieldMap)) {
    if (fieldSpec === null) {
      mapped[canonical] = null;
      continue;
    }
    mapped[canonical] = resolveFieldValue(rawItem, fieldSpec);
  }
  return mapped;
}

function extractResults(data, resultsPath) {
  let out;
  if (!resultsPath) {
    out = Array.isArray(data) ? data : data != null ? [data] : [];
  } else {
    out = getNestedValue(data, resultsPath);
  }
  if (out == null) return [];
  // XML with a single child element yields an object, not an array — coerce.
  return Array.isArray(out) ? out : [out];
}

// ── Placeholder substitution (endpoint chaining) ───────────────────
//
// Replaces {identifier}, {max_items}, and {endpoint_id.field} tokens.
// Returns { text, unresolved } so the caller can skip an endpoint whose
// chained placeholder could not be resolved.
function substitutePlaceholders(template, ctx) {
  const unresolved = [];
  const text = String(template).replace(/\{([^}]+)\}/g, (match, key) => {
    let val;
    if (key === 'identifier') val = ctx.identifier;
    else if (key === 'max_items') val = ctx.max_items;
    else if (key.includes('.')) val = getNestedValue(ctx.chain, key);
    else if (ctx.chain && ctx.chain[key] !== undefined) val = ctx.chain[key];
    else val = undefined;

    if (val == null || val === '') {
      unresolved.push(key);
      return '';
    }
    return String(val);
  });
  return { text, unresolved };
}

// ── raw_text flattening ─────────────────────────────────────────────

function stringifyValue(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }
  return String(v);
}

function flattenRawText(mapped, endpoint, maxChars) {
  let text;
  if (endpoint.raw_text_template) {
    const { text: t } = substitutePlaceholders(endpoint.raw_text_template, { chain: mapped });
    text = t;
  } else {
    text = Object.entries(mapped)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${k}: ${stringifyValue(v)}`)
      .join('\n');
  }
  const limit = maxChars > 0 ? maxChars : 20000;
  return text.length > limit ? text.slice(0, limit) : text;
}

// ── Auth ─────────────────────────────────────────────────────────────

function providerAuthEnvVar(provider) {
  return provider.auth && provider.auth.env_var ? provider.auth.env_var : null;
}

// Returns { params: {extra query params}, headers: {} } for a provider's auth.
function buildAuth(provider) {
  const out = { params: {}, headers: {} };
  const auth = provider.auth;
  if (!auth || auth.type === 'none' || !auth.type) return out;
  const val = auth.env_var ? process.env[auth.env_var] : null;
  if (!val) return out; // caller decides skip-vs-run via skip_providers_without_auth
  if (auth.type === 'query_param') {
    out.params[auth.key || 'key'] = val;
  } else if (auth.type === 'header') {
    out.headers[auth.key || 'Authorization'] = val;
  } else if (auth.type === 'basic') {
    // Companies House pattern: API key as username, empty password.
    out.headers.Authorization = 'Basic ' + Buffer.from(`${val}:`).toString('base64');
  }
  return out;
}

// ── Rate limiter (token-bucket, global) ─────────────────────────────

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
      if (waitMs > 0) return new Promise((resolve) => setTimeout(resolve, waitMs));
    });
    return waitQueue;
  };
}

// ── XML / RSS -> JSON (generic; RSS tag knowledge lives in provider config) ──

function decodeEntities(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function parseTag(tagContent) {
  const trimmed = tagContent.trim();
  const spaceIdx = trimmed.search(/\s/);
  const name = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
  const attrs = {};
  if (spaceIdx !== -1) {
    const attrStr = trimmed.slice(spaceIdx);
    const re = /([\w:.-]+)\s*=\s*"([^"]*)"|([\w:.-]+)\s*=\s*'([^']*)'/g;
    let m;
    while ((m = re.exec(attrStr)) !== null) {
      const key = m[1] || m[3];
      const value = m[2] !== undefined ? m[2] : m[4];
      attrs[key] = decodeEntities(value);
    }
  }
  return { name, attrs };
}

// Recursive-descent XML parser: elements -> keys, repeated siblings -> arrays,
// attributes -> "@name" keys, CDATA/text -> string values.
function xmlToObject(xml) {
  if (typeof xml !== 'string') return {};
  let s = xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  let pos = 0;

  function parseNodes() {
    const nodes = [];
    while (pos < s.length) {
      const lt = s.indexOf('<', pos);
      if (lt === -1) {
        const t = s.slice(pos).trim();
        if (t) nodes.push({ text: decodeEntities(t) });
        pos = s.length;
        break;
      }
      if (lt > pos) {
        const t = s.slice(pos, lt).trim();
        if (t) nodes.push({ text: decodeEntities(t) });
      }
      pos = lt;
      if (s.startsWith('<![CDATA[', pos)) {
        const end = s.indexOf(']]>', pos);
        const cdata = s.slice(pos + 9, end === -1 ? s.length : end);
        nodes.push({ text: cdata });
        pos = end === -1 ? s.length : end + 3;
        continue;
      }
      if (s.startsWith('</', pos)) {
        // Closing tag — belongs to the caller; stop here.
        return nodes;
      }
      const gt = s.indexOf('>', pos);
      if (gt === -1) { pos = s.length; break; }
      let tagContent = s.slice(pos + 1, gt);
      const selfClosing = tagContent.endsWith('/');
      if (selfClosing) tagContent = tagContent.slice(0, -1);
      const { name, attrs } = parseTag(tagContent);
      pos = gt + 1;
      const node = { name, attrs, children: [] };
      if (!selfClosing) {
        node.children = parseNodes();
        // Consume the matching closing tag.
        const close = s.indexOf('>', pos);
        pos = close === -1 ? s.length : close + 1;
      }
      nodes.push(node);
    }
    return nodes;
  }

  function nodeToValue(node) {
    const attrs = node.attrs || {};
    const hasAttrs = Object.keys(attrs).length > 0;
    const childElems = node.children.filter((c) => c.name);
    const text = node.children
      .filter((c) => c.text !== undefined)
      .map((c) => c.text)
      .join('')
      .trim();

    if (childElems.length === 0 && !hasAttrs) return text;

    const obj = {};
    for (const [k, v] of Object.entries(attrs)) obj['@' + k] = v;
    for (const child of childElems) {
      const val = nodeToValue(child);
      if (obj[child.name] === undefined) obj[child.name] = val;
      else {
        if (!Array.isArray(obj[child.name])) obj[child.name] = [obj[child.name]];
        obj[child.name].push(val);
      }
    }
    if (text) obj['#text'] = text;
    return obj;
  }

  const roots = parseNodes().filter((n) => n.name);
  const result = {};
  for (const root of roots) {
    const val = nodeToValue(root);
    if (result[root.name] === undefined) result[root.name] = val;
    else {
      if (!Array.isArray(result[root.name])) result[root.name] = [result[root.name]];
      result[root.name].push(val);
    }
  }
  return result;
}

// ── Option parsers (UI may store JSON fields as strings) ─────────────

function parseJsonOrArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const t = val.trim();
    if (t.startsWith('[')) { try { return JSON.parse(t); } catch (e) { return []; } }
  }
  return [];
}

function parseJsonOrObj(val) {
  if (val && typeof val === 'object' && !Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const t = val.trim();
    if (t.startsWith('{')) { try { return JSON.parse(t); } catch (e) { return {}; } }
  }
  return {};
}

function toNumber(val, fallback) {
  const n = typeof val === 'number' ? val : parseInt(val, 10);
  return Number.isFinite(n) ? n : fallback;
}

// ── Identifier resolution ────────────────────────────────────────────
// Entity seed field first, then any pool-item field. Returns unique list.
function resolveIdentifiers(entity, identifierSource) {
  const src = identifierSource || {};
  const ids = [];
  if (src.entity_field) {
    const v = entity[src.entity_field];
    if (Array.isArray(v)) ids.push(...v.filter(Boolean).map(String));
    else if (v != null && v !== '') ids.push(String(v));
  }
  if (src.item_field && Array.isArray(entity.items)) {
    for (const item of entity.items) {
      const v = item && item[src.item_field];
      if (v != null && v !== '') ids.push(String(v));
    }
  }
  return [...new Set(ids)];
}

// ── Endpoint execution for one identifier ────────────────────────────
// Returns { items, errorCount, notes }.
async function runEndpointsForIdentifier(provider, identifier, authParts, extraParams, options, tools, rateLimiter, entityName) {
  const { logger, http } = tools;
  const items = [];
  let errorCount = 0;
  const notes = [];
  const chain = {}; // endpoint_id -> first mapped record (for {endpoint.field})
  const responseFormat = provider.response_format === 'xml' ? 'xml' : 'json';

  for (let epIdx = 0; epIdx < (provider.endpoints || []).length; epIdx++) {
    const endpoint = provider.endpoints[epIdx];
    const ctx = { identifier, max_items: options.max_items, chain };

    // Resolve the URL. Placeholders in the URL string (path) are substituted raw,
    // NOT url-encoded: an identifier is often an entire URL (a podcast feed_url in
    // `"url": "{identifier}"`), which encodeURIComponent would corrupt. Path-segment
    // identifiers (channel ids, Q-ids, company numbers) are URL-safe by construction.
    // Query params, by contrast, go through URLSearchParams below and ARE encoded.
    const urlRes = substitutePlaceholders(endpoint.url || '', ctx);
    if (urlRes.unresolved.length > 0) {
      const reason = `${provider.id}.${endpoint.id}: skipped — unresolved placeholder(s) {${urlRes.unresolved.join(', ')}}`;
      logger.warn(reason);
      notes.push(reason);
      continue;
    }

    // Build query params (endpoint.params + provider_params + auth query params).
    const params = new URLSearchParams();
    let paramUnresolved = null;
    for (const [k, v] of Object.entries(endpoint.params || {})) {
      const r = substitutePlaceholders(String(v), ctx);
      if (r.unresolved.length > 0) { paramUnresolved = { key: k, keys: r.unresolved }; break; }
      params.set(k, r.text);
    }
    if (paramUnresolved) {
      const reason = `${provider.id}.${endpoint.id}: skipped — unresolved placeholder(s) {${paramUnresolved.keys.join(', ')}} in param "${paramUnresolved.key}"`;
      logger.warn(reason);
      notes.push(reason);
      continue;
    }
    for (const [k, v] of Object.entries(extraParams || {})) params.set(k, String(v));
    for (const [k, v] of Object.entries(authParts.params || {})) params.set(k, String(v));

    const qs = params.toString();
    const requestUrl = qs ? `${urlRes.text}${urlRes.text.includes('?') ? '&' : '?'}${qs}` : urlRes.text;

    // Fetch.
    let res;
    try {
      await rateLimiter();
      logger.info(`${provider.id}.${endpoint.id}: GET ${urlRes.text}`);
      res = await http.get(requestUrl, { timeout: 20000, headers: authParts.headers || {} });
    } catch (err) {
      errorCount++;
      logger.error(`${provider.id}.${endpoint.id}: ${err.message}`);
      notes.push(`${provider.id}.${endpoint.id}: ${err.message}`);
      break; // network failure on a chained request — don't run dependents
    }

    if (!res || res.status !== 200) {
      const status = res ? res.status : 'no response';
      // Quota exhaustion (e.g. YouTube 403 quotaExceeded) — surface loudly, stop this provider.
      const quota = res && (res.status === 403 || res.status === 429);
      errorCount++;
      logger.warn(`${provider.id}.${endpoint.id}: HTTP ${status}${quota ? ' (quota/rate)' : ''}`);
      notes.push(`${provider.id}.${endpoint.id}: HTTP ${status}`);
      break;
    }

    // Parse.
    let data;
    const body = typeof res.body === 'string' ? res.body : String(res.body);
    try {
      data = responseFormat === 'xml' ? xmlToObject(body) : JSON.parse(body);
    } catch (err) {
      errorCount++;
      const preview = body.slice(0, 200);
      logger.error(`${provider.id}.${endpoint.id}: parse failure (${err.message}); body starts: ${preview}`);
      notes.push(`${provider.id}.${endpoint.id}: parse failure`);
      break;
    }

    let rawRecords = extractResults(data, endpoint.results_path);
    if (options.max_items > 0 && rawRecords.length > options.max_items) {
      rawRecords = rawRecords.slice(0, options.max_items);
    }

    // Empty first endpoint -> identifier resolved to nothing (dead id).
    if (rawRecords.length === 0 && epIdx === 0) {
      items.push({
        source_api: provider.id,
        url: `apifetch://${provider.id}/${encodeURIComponent(identifier)}`,
        externalId: `${provider.id}:${identifier}:not_found`,
        title: '',
        data_json: '{}',
        raw_text: '',
        fetch_date: new Date().toISOString().slice(0, 10),
        status: 'not_found',
      });
      logger.info(`${provider.id}.${endpoint.id}: identifier "${identifier}" returned no records (not_found)`);
      break;
    }

    // Map records; populate chain context from the first record.
    for (let ri = 0; ri < rawRecords.length; ri++) {
      const mapped = mapRecord(rawRecords[ri], endpoint.field_map);
      if (ri === 0) chain[endpoint.id] = mapped;

      // Determine the item url. url_template (if present) synthesizes/normalizes
      // from mapped fields + {identifier} — this is how bare ids (videoId, Q-id)
      // become canonical URLs. Otherwise the field_map url is used directly.
      let url;
      if (endpoint.url_template) {
        const r = substitutePlaceholders(endpoint.url_template, { identifier, max_items: options.max_items, chain: mapped });
        url = r.unresolved.length === 0 ? r.text : null;
      } else {
        url = mapped.url;
      }
      if (url == null || url === '') continue; // chain-only record (no key) — used for chaining only

      items.push({
        source_api: provider.id,
        url: String(url),
        externalId: mapped.externalId != null ? `${provider.id}:${mapped.externalId}` : `${provider.id}:${url}`,
        title: mapped.title != null ? String(mapped.title) : '',
        data_json: JSON.stringify(mapped),
        raw_text: flattenRawText(mapped, endpoint, options.raw_text_max_chars),
        fetch_date: new Date().toISOString().slice(0, 10),
        status: 'success',
      });
    }
  }

  return { items, errorCount, notes };
}

// ── Main execute ─────────────────────────────────────────────────────

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress } = tools;

  const providers = parseJsonOrArray(options.providers).filter((p) => {
    if (p && p.id) return true;
    if (p) logger.warn('api-fetcher: a provider config was dropped — missing required "id"');
    return false;
  });
  const providerParams = parseJsonOrObj(options.provider_params);
  const opts = {
    max_items: toNumber(options.max_items, 25),
    requests_per_minute: toNumber(options.requests_per_minute, 30),
    raw_text_max_chars: toNumber(options.raw_text_max_chars, 20000),
  };
  const skipWithoutAuth = options.skip_providers_without_auth !== false;

  // Filter providers whose auth env var is missing (when configured to skip).
  const activeProviders = providers.filter((p) => {
    const envVar = providerAuthEnvVar(p);
    if (envVar && skipWithoutAuth && !process.env[envVar]) {
      logger.warn(`Provider "${p.id}" skipped: missing env var ${envVar}`);
      return false;
    }
    return true;
  });

  if (activeProviders.length === 0) {
    logger.warn('api-fetcher: no active providers configured or available');
    return {
      results: entities.map((e) => ({
        entity_name: e.name || 'unknown',
        items: [],
        meta: { total_found: 0, providers_used: 0, errors: 0 },
      })),
      summary: {
        total_entities: entities.length,
        total_items: 0,
        description: 'No providers configured — nothing fetched',
        errors: [],
      },
    };
  }

  logger.info(`api-fetcher active providers: ${activeProviders.map((p) => p.id).join(', ')}`);
  const rateLimiter = createRateLimiter(opts.requests_per_minute);
  const results = [];

  for (let ei = 0; ei < entities.length; ei++) {
    const entity = entities[ei];
    const entityName = entity.name || 'unknown';
    progress.update(ei + 1, entities.length, `Fetching for ${entityName}`);

    const entityItems = [];
    const notes = [];
    let errorCount = 0;

    for (const provider of activeProviders) {
      const authParts = buildAuth(provider);
      const extraParams = providerParams[provider.id] || {};
      const identifiers = resolveIdentifiers(entity, provider.identifier_source);

      if (identifiers.length === 0) {
        const note = `${provider.id}: no identifier for "${entityName}"`;
        logger.info(note);
        notes.push(note);
        continue;
      }

      const providerItems = [];
      for (const identifier of identifiers) {
        try {
          const r = await runEndpointsForIdentifier(
            provider, identifier, authParts, extraParams, opts, tools, rateLimiter, entityName
          );
          providerItems.push(...r.items);
          errorCount += r.errorCount;
          notes.push(...r.notes);
        } catch (err) {
          errorCount++;
          logger.error(`${provider.id} [${identifier}]: ${err.message}`);
          notes.push(`${provider.id} [${identifier}]: ${err.message}`);
        }
      }

      // Attach entity_name for downstream regrouping and partial recovery.
      for (const it of providerItems) it.entity_name = entityName;
      entityItems.push(...providerItems);

      // Rule 10: persist partials after every provider fetch per entity.
      if (tools._partialItems) tools._partialItems.push(...providerItems);
    }

    results.push({
      entity_name: entityName,
      items: entityItems,
      meta: {
        total_found: entityItems.length,
        providers_used: activeProviders.length,
        errors: errorCount,
        notes: notes.length,
      },
    });

    logger.info(`${entityName}: ${entityItems.length} items from ${activeProviders.length} provider(s), ${errorCount} error(s)`);
  }

  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
  const totalErrors = results.reduce((sum, r) => sum + (r.meta?.errors || 0), 0);
  const providerNames = activeProviders.map((p) => p.id).join(', ');

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      description: totalErrors > 0
        ? `${totalItems} structured items from ${providerNames} (${totalErrors} error${totalErrors === 1 ? '' : 's'})`
        : `${totalItems} structured items from ${providerNames}`,
      errors: results.flatMap((r) => {
        const errs = r.meta?.errors || 0;
        return errs > 0 ? [`${r.entity_name}: ${errs} error${errs === 1 ? '' : 's'}`] : [];
      }),
    },
  };
}

module.exports = execute;
