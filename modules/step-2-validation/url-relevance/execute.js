/**
 * URL Relevance Filter — Step 2 Validation submodule
 *
 * Uses an LLM to classify URLs as KEEP, MAYBE, or DROP based on
 * relevance to a content creation goal. Runs after url-dedup and
 * url-filter to minimize token usage.
 *
 * Returns ALL URLs with a relevance field — the user reviews
 * everything in the pane and approves what they want.
 */

const CONFIDENCE_INSTRUCTIONS = {
  keep_most: 'When uncertain about a URL, classify it as KEEP. Err on the side of inclusion.',
  balanced: 'When uncertain about a URL, classify it as MAYBE. Only use DROP for clearly irrelevant pages.',
  aggressive: 'When uncertain about a URL, classify it as DROP. Only KEEP pages that are clearly relevant.',
};

/** Accept a real boolean or the string "true" (string-typed-preset bug class). */
function asBool(v) {
  return v === true || v === 'true';
}

/**
 * Build the classification prompt for a batch of URLs.
 *
 * `includeHostname` controls whether each URL shows its full host (so the model
 * can tell the entity's own pages from third-party pages about other companies)
 * or, as before, only the pathname+search. `website` is the entity's own domain
 * shown to the model — either a real seed value or the pool-derived own domain.
 */
function buildPrompt(entityName, website, urls, options, metadataFields) {
  const confidenceInstruction = CONFIDENCE_INSTRUCTIONS[options.confidence_threshold] || CONFIDENCE_INSTRUCTIONS.balanced;
  const promptContext = options.prompt_context ||
    'You are a URL relevance classifier for a company research content pipeline.\nClassify each URL based on its relevance for creating a comprehensive company profile.';
  const includeHostname = asBool(options.include_hostname);

  const urlList = urls.map((item, i) => {
    const urlObj = safeParseUrl(item.url);
    const slug = urlObj
      ? (includeHostname ? urlObj.host : '') + urlObj.pathname + (urlObj.search || '')
      : item.url;
    const parts = [`${i + 1}. ${slug}`];
    if (item.link_text) parts.push(`  link_text: ${item.link_text}`);
    if (item.source_location) parts.push(`  source: ${item.source_location}`);
    for (const field of metadataFields) {
      const val = item[field];
      if (val != null && val !== '') parts.push(`  ${field}: ${val}`);
    }
    return parts.join('\n');
  }).join('\n');

  return `${promptContext}

Entity: ${entityName}
Website: ${website || 'unknown'}

KEEP criteria:
${options.keep_criteria}

DROP criteria:
${options.drop_criteria}

${confidenceInstruction}

Items to classify:
${urlList}

Respond with ONLY one line per item in this exact format:
<number>. <KEEP|MAYBE|DROP>

Example:
1. KEEP
2. DROP
3. MAYBE

Do not include any other text, explanations, or reasoning.`;
}

/**
 * Parse a URL safely, returning null on failure.
 */
function safeParseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

// ── Own-domain derivation (entity_domain_source: "pool_dominant_host") ──────
// The entity's seed website doesn't survive past step 1 (the per-step entity is
// rebuilt from the pool with only {entity_name}), so the prompt otherwise reads
// "Website: unknown". For a thin, ambiguously-named entity that lets the model
// keep third-party pages about a DIFFERENT same-named company and drop the
// entity's own homepage (Gate-1: Pocket Rockets). Deriving the own domain from
// the entity's OWN-CRAWL pool items gives the model that missing anchor.
// Mirrors api-fetcher B034's host normalization (copied, not imported — Rule 4).

// Own-crawl provenance: own-site crawlers (sitemap-parser, page-links,
// browser-crawler, seed-url-builder) leave found_via absent; web search/scout
// modules stamp it (search-discovery:*, ai_scout). So own-crawl == no search/scout.
function isOwnCrawl(item) {
  const fv = item && typeof item.found_via === 'string' ? item.found_via : '';
  return !/(search|scout)/i.test(fv);
}

// Normalized host (scheme/path/port/userinfo stripped, lowercased, no www.), or null.
function hostFromUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  let s = url.trim();
  const scheme = s.indexOf('://');
  if (scheme !== -1) s = s.slice(scheme + 3);
  else if (s.startsWith('//')) s = s.slice(2);
  s = s.split(/[/?#]/)[0];            // strip path/query/fragment
  const at = s.indexOf('@');
  if (at !== -1) s = s.slice(at + 1);  // strip userinfo
  s = s.split(':')[0].toLowerCase();   // strip port
  if (s.startsWith('www.')) s = s.slice(4);
  if (!s || s.indexOf('.') === -1 || /[\s@]/.test(s)) return null;
  return s;
}

// Dominant host among the entity's OWN-CRAWL pool items. Returns the clear
// winner, or null when the own-crawl set is empty or has no strict top (a tie) —
// so an ambiguous pool degrades loudly rather than naming a wrong domain.
function deriveDominantOwnHost(items) {
  const own = Array.isArray(items) ? items.filter(isOwnCrawl) : [];
  const counts = new Map();
  for (const item of own) {
    const host = hostFromUrl(item && item.url);
    if (host) counts.set(host, (counts.get(host) || 0) + 1);
  }
  let best = null, bestN = 0, tie = false;
  for (const [host, n] of counts) {
    if (n > bestN) { best = host; bestN = n; tie = false; }
    else if (n === bestN) { tie = true; }
  }
  return { host: best && !tie ? best : null, ownCrawlCount: own.length, hostsSeen: counts.size, ambiguous: tie };
}

/**
 * Parse the LLM response, matching numbered lines back to URLs.
 * Returns a Map of index → relevance.
 */
function parseResponse(responseText, totalUrls) {
  const classifications = new Map();
  const lines = responseText.split('\n');

  for (const line of lines) {
    const match = line.trim().match(/^(\d+)\.\s*(KEEP|MAYBE|DROP)/i);
    if (match) {
      const index = parseInt(match[1], 10) - 1; // 0-based
      if (index >= 0 && index < totalUrls) {
        classifications.set(index, match[2].toUpperCase());
      }
    }
  }

  return classifications;
}

/**
 * Split an array into chunks of a given size.
 */
function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function execute(input, options, tools) {
  const { entities } = input;
  const { ai_model, ai_provider, max_urls_per_prompt, metadata_fields: rawMetadataFields = [] } = options;
  const metadataFields = Array.isArray(rawMetadataFields) ? rawMetadataFields : [];
  const domainSource = options.entity_domain_source === 'pool_dominant_host' ? 'pool_dominant_host' : 'none';
  const { logger, progress, ai } = tools;

  const results = [];
  let totalItems = 0;
  const errors = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Classifying URLs for ${entity.name || 'entity'}`);

    const items = entity.items;
    if (!items || items.length === 0) {
      logger.info(`${entity.name}: no URLs to classify, skipping`);
      results.push({
        entity_name: entity.name,
        items: [],
        meta: { total_found: 0, kept: 0, maybe: 0, dropped: 0, errors: 0 },
      });
      continue;
    }

    try {
      logger.info(`${entity.name}: classifying ${items.length} URLs with ${ai_provider}/${ai_model}`);

      // Resolve the entity's own domain shown to the model. Default: the seed
      // website (absent at step 2 → "unknown"). With pool_dominant_host, derive it
      // from the entity's own-crawl pool items; degrade loudly (keep unknown, warn)
      // if the own-crawl set is empty or ambiguous — never name a wrong domain.
      let resolvedWebsite = entity.website;
      if (domainSource === 'pool_dominant_host') {
        const d = deriveDominantOwnHost(items);
        if (d.host) {
          resolvedWebsite = entity.website || d.host;
          logger.info(`${entity.name}: entity_domain_source=pool_dominant_host derived "${d.host}" from ${d.ownCrawlCount} own-crawl pool item(s)`);
        } else {
          logger.warn(`${entity.name}: entity_domain_source=pool_dominant_host could not derive a domain (${d.ownCrawlCount} own-crawl item(s), ${d.hostsSeen} distinct host(s), ambiguous=${d.ambiguous}) — Website stays "${entity.website || 'unknown'}", no silent wrong domain`);
        }
      }

      // Batch URLs if they exceed max_urls_per_prompt
      const batches = chunk(items, max_urls_per_prompt);
      const allClassifications = new Map();
      let globalOffset = 0;

      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        if (batches.length > 1) {
          logger.info(`${entity.name}: batch ${b + 1}/${batches.length} (${batch.length} URLs)`);
        }

        const prompt = buildPrompt(entity.name, resolvedWebsite, batch, options, metadataFields);

        const response = await ai.complete({
          prompt,
          model: ai_model,
          provider: ai_provider,
        });

        const batchClassifications = parseResponse(response.text, batch.length);

        // Merge batch results into global map with offset
        for (const [idx, relevance] of batchClassifications) {
          allClassifications.set(globalOffset + idx, relevance);
        }

        globalOffset += batch.length;
      }

      // Build result items — ALL URLs returned with relevance field
      const classifiedItems = items.map((item, idx) => ({
        url: item.url,
        link_text: item.link_text || '',
        source_location: item.source_location || '',
        relevance: allClassifications.get(idx) || 'MAYBE', // Unparsed → MAYBE
        entity_name: entity.name,
      }));

      const kept = classifiedItems.filter(i => i.relevance === 'KEEP').length;
      const maybe = classifiedItems.filter(i => i.relevance === 'MAYBE').length;
      const dropped = classifiedItems.filter(i => i.relevance === 'DROP').length;

      logger.info(`${entity.name}: ${kept} KEEP, ${maybe} MAYBE, ${dropped} DROP`);

      const entityResult = {
        entity_name: entity.name,
        items: classifiedItems,
        meta: { total_found: items.length, kept, maybe, dropped, errors: 0 },
      };
      results.push(entityResult);
      if (tools._partialItems) tools._partialItems.push(...classifiedItems);

      totalItems += classifiedItems.length;

    } catch (err) {
      logger.error(`${entity.name}: AI classification failed — ${err.message}`);
      // Return all URLs as MAYBE on failure so nothing is lost
      const fallbackItems = items.map(item => ({
        url: item.url,
        link_text: item.link_text || '',
        source_location: item.source_location || '',
        relevance: 'MAYBE',
        entity_name: entity.name,
      }));

      const fallbackResult = {
        entity_name: entity.name,
        items: fallbackItems,
        error: err.message,
        meta: { total_found: items.length, kept: 0, maybe: items.length, dropped: 0, errors: 1 },
      };
      results.push(fallbackResult);
      if (tools._partialItems) tools._partialItems.push(...fallbackItems);

      totalItems += fallbackItems.length;
      errors.push(`${entity.name}: ${err.message}`);
    }
  }

  const totalKept = results.reduce((sum, r) => sum + (r.meta?.kept || 0), 0);
  const totalMaybe = results.reduce((sum, r) => sum + (r.meta?.maybe || 0), 0);
  const totalDropped = results.reduce((sum, r) => sum + (r.meta?.dropped || 0), 0);

  const description = errors.length > 0
    ? `${totalItems} URLs classified (${totalKept} KEEP, ${totalMaybe} MAYBE, ${totalDropped} DROP) — ${errors.length} entity error(s)`
    : `${totalItems} URLs classified: ${totalKept} KEEP, ${totalMaybe} MAYBE, ${totalDropped} DROP`;

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      description,
      errors,
    },
  };
}

module.exports = execute;
