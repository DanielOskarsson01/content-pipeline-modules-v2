/**
 * Content Delivery — Step 9 Distribution submodule
 *
 * Delivers each entity's bundled artifact to a configured endpoint. The code is
 * pipeline-agnostic (Rule 13): it knows HTTP verbs, payload assembly, header
 * interpolation, and error capture — nothing about any specific destination.
 * Destinations are provider config a template supplies; the code never branches
 * on a provider's name or id, only on its `type` field (the transport verb).
 *
 * Deliverable selection is by FIELD SHAPE (the pool item carrying `final_json`,
 * written by json-output), never by source_submodule — same discipline as Step 8.
 *
 * v1: one transport verb, `json_post` (assemble a JSON body, POST it). Single
 * pass, no retry loop. Failures are captured as items, never thrown, so one bad
 * delivery cannot lose the others.
 */

// Interpolate {env:VAR} tokens against process.env. Function replacement (not a
// string replacement) so an env value containing $ sequences ($&, $$, $1) cannot
// corrupt the output. A missing var interpolates to '' (callers pre-skip on missing).
function interpolateEnvTokens(value) {
  return String(value).replace(/\{env:([A-Za-z0-9_]+)\}/g, (_, name) => process.env[name] || '');
}

// Collect the env var names referenced by {env:VAR} tokens across strings/maps.
// Used to skip a provider up-front when a referenced credential is unset (so we
// never POST to an empty URL or send an empty/garbled auth header).
function collectEnvRefs(...values) {
  const refs = [];
  for (const value of values) {
    const strings = value && typeof value === 'object' ? Object.values(value) : [value];
    for (const s of strings) {
      if (s == null) continue;
      for (const m of String(s).matchAll(/\{env:([A-Za-z0-9_]+)\}/g)) refs.push(m[1]);
    }
  }
  return refs;
}

// Build the request headers for a provider, interpolating {env:VAR} in each value.
function buildHeaders(headersMap) {
  const headers = {};
  if (headersMap && typeof headersMap === 'object') {
    for (const [name, value] of Object.entries(headersMap)) {
      headers[name] = interpolateEnvTokens(value);
    }
  }
  return headers;
}

// A pool field may hold a JSON string (json-output's final_json) or already be an
// object. Parse a JSON string into an object; otherwise pass the value through.
function coerceJson(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

// Providers may arrive as a JSON string (UI stores JSON options as strings).
function parseProviders(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

async function execute(input, options, tools) {
  const entities = input.entities || [];
  const runId = input.run_id || null;
  const { logger, progress, http } = tools;

  // Select active providers. Skip (loudly) any without an id, with an unsupported
  // verb, or referencing an unset {env:VAR} in its endpoint or headers.
  const activeProviders = parseProviders(options.providers).filter(p => {
    if (!p || !p.id) { logger.warn('content-delivery: a provider config was dropped — missing required "id"'); return false; }
    const type = p.type || 'json_post';
    if (type !== 'json_post') {
      logger.warn(`Provider "${p.id}" skipped: unsupported type "${type}" (only json_post in v1)`);
      return false;
    }
    if (!p.endpoint) {
      logger.warn(`Provider "${p.id}" skipped: missing "endpoint"`);
      return false;
    }
    const missing = collectEnvRefs(p.endpoint, p.headers).filter(name => !process.env[name]);
    if (missing.length > 0) {
      logger.warn(`Provider "${p.id}" skipped: missing env var(s) ${missing.join(', ')} referenced by endpoint/headers`);
      return false;
    }
    return true;
  });

  if (activeProviders.length === 0) {
    logger.warn('content-delivery: no active delivery providers configured — nothing delivered');
    return {
      results: entities.map(e => ({ entity_name: e.name, items: [], meta: { delivered: 0, failed: 0, skipped: 0, providers: 0 } })),
      summary: {
        total_entities: entities.length,
        total_items: 0,
        description: 'No active delivery providers — nothing delivered',
        errors: [],
      },
    };
  }

  const results = [];
  let delivered = 0, failed = 0, skipped = 0;

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Delivering ${entity.name}`);

    // Deliverable = the latest pool item carrying final_json (field-shape routing).
    const deliverable = (entity.items || []).filter(it => it && it.final_json != null).at(-1);
    if (!deliverable) {
      skipped++;
      logger.warn(`${entity.name}: skipped — no deliverable item (no final_json) in the pool`);
      const item = { entity_name: entity.name, delivery_status: 'skipped', reason: 'no deliverable item (no final_json) in pool' };
      results.push({ entity_name: entity.name, items: [item], meta: { delivered: 0, failed: 0, skipped: 1 } });
      if (tools._partialItems) tools._partialItems.push(item);
      continue;
    }

    const entityItems = [];
    for (const provider of activeProviders) {
      // ponytail: endpoint resolves {env:VAR} only. Pool-item {field} templating
      // into the URL (design §1.3) is deferred — unused by U1, untested; add a
      // second interpolate pass against `deliverable` here when a provider needs it.
      const url = interpolateEnvTokens(provider.endpoint || '');
      const headers = buildHeaders(provider.headers);
      const sourceField = provider.source_field || 'final_json';
      const payload = coerceJson(deliverable[sourceField]);
      const body = provider.envelope
        ? { entity_name: entity.name, run_id: runId, delivered_at: new Date().toISOString(), payload }
        : payload;

      // Never log the resolved endpoint or headers — either can carry a secret
      // (a capability URL, an auth token). Log the provider id only.
      try {
        const res = await http.post(url, body, { timeout: 20000, headers });
        if (res.status >= 200 && res.status < 300) {
          delivered++;
          entityItems.push({ entity_name: entity.name, provider_id: provider.id, delivery_status: 'delivered', http_status: res.status });
          logger.info(`${entity.name}: delivered via "${provider.id}" (HTTP ${res.status})`);
        } else {
          failed++;
          entityItems.push({ entity_name: entity.name, provider_id: provider.id, delivery_status: 'failed', http_status: res.status, error: `HTTP ${res.status}` });
          logger.error(`${entity.name}: delivery via "${provider.id}" failed (HTTP ${res.status})`);
        }
      } catch (err) {
        failed++;
        entityItems.push({ entity_name: entity.name, provider_id: provider.id, delivery_status: 'failed', http_status: null, error: err.message });
        logger.error(`${entity.name}: delivery via "${provider.id}" errored (${err.message})`);
      }
    }

    results.push({ entity_name: entity.name, items: entityItems, meta: { delivered: entityItems.filter(x => x.delivery_status === 'delivered').length, failed: entityItems.filter(x => x.delivery_status === 'failed').length, skipped: 0 } });
    if (tools._partialItems) tools._partialItems.push(...entityItems);
  }

  const failedItems = results.flatMap(r => r.items).filter(i => i.delivery_status === 'failed');
  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: results.reduce((n, r) => n + r.items.length, 0),
      description: `${delivered} delivered, ${failed} failed, ${skipped} skipped across ${entities.length} entities`,
      errors: failedItems.map(i => `${i.entity_name}: ${i.error}`),
    },
  };
}

module.exports = execute;
module.exports.__testing = { interpolateEnvTokens, collectEnvRefs, buildHeaders, coerceJson, parseProviders };
