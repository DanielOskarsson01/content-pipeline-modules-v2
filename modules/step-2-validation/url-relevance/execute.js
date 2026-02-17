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

/**
 * Build the classification prompt for a batch of URLs.
 */
function buildPrompt(entityName, website, urls, options) {
  const confidenceInstruction = CONFIDENCE_INSTRUCTIONS[options.confidence_threshold] || CONFIDENCE_INSTRUCTIONS.balanced;

  const urlList = urls.map((item, i) => {
    const urlObj = safeParseUrl(item.url);
    const slug = urlObj ? urlObj.pathname + (urlObj.search || '') : item.url;
    const parts = [`${i + 1}. ${slug}`];
    if (item.link_text) parts.push(`  link_text: ${item.link_text}`);
    if (item.source_location) parts.push(`  source: ${item.source_location}`);
    return parts.join('\n');
  }).join('\n');

  return `You are a URL relevance classifier for a company research content pipeline.

Company: ${entityName}
Website: ${website || 'unknown'}

Your task: Classify each URL as KEEP, MAYBE, or DROP based on its relevance for creating a comprehensive company profile.

KEEP criteria (pages likely useful for company profile content):
${options.keep_criteria}

DROP criteria (pages unlikely to be useful):
${options.drop_criteria}

${confidenceInstruction}

URLs to classify:
${urlList}

Respond with ONLY one line per URL in this exact format:
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
  const { ai_model, ai_provider, max_urls_per_prompt } = options;
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

      // Batch URLs if they exceed max_urls_per_prompt
      const batches = chunk(items, max_urls_per_prompt);
      const allClassifications = new Map();
      let globalOffset = 0;

      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        if (batches.length > 1) {
          logger.info(`${entity.name}: batch ${b + 1}/${batches.length} (${batch.length} URLs)`);
        }

        const prompt = buildPrompt(entity.name, entity.website, batch, options);

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

      results.push({
        entity_name: entity.name,
        items: classifiedItems,
        meta: { total_found: items.length, kept, maybe, dropped, errors: 0 },
      });

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

      results.push({
        entity_name: entity.name,
        items: fallbackItems,
        error: err.message,
        meta: { total_found: items.length, kept: 0, maybe: items.length, dropped: 0, errors: 1 },
      });

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
