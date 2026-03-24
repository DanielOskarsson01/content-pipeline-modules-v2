/**
 * Intent Tagger v2 -- Step 4 Filtering submodule
 *
 * Classifies each scraped page against user-defined intent categories using LLM.
 * Categories are fully configurable per run via the "intents" option.
 *
 * Data operation: TRANSFORM (=) -- same items in, same items out, with intent fields added.
 */

// -------------------------------------------------------------------------
// Parse the intents textarea into structured categories
// Format per line: "name | description" or just "name"
// -------------------------------------------------------------------------

function parseIntents(raw) {
  if (!raw || typeof raw !== 'string') return [];

  const intents = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const pipeIndex = trimmed.indexOf('|');
    if (pipeIndex !== -1) {
      const name = trimmed.substring(0, pipeIndex).trim().toLowerCase().replace(/\s+/g, '_');
      const description = trimmed.substring(pipeIndex + 1).trim();
      if (name) intents.push({ name, description });
    } else {
      const name = trimmed.toLowerCase().replace(/\s+/g, '_');
      if (name) intents.push({ name, description: '' });
    }
  }

  // Always ensure "other" exists as catch-all
  if (!intents.find((i) => i.name === 'other')) {
    intents.push({ name: 'other', description: 'Does not fit any of the above categories' });
  }

  return intents;
}

// -------------------------------------------------------------------------
// Parse comma-separated string into trimmed array
// -------------------------------------------------------------------------

function parseList(str) {
  if (!str || typeof str !== 'string') return [];
  return str.split(',').map((s) => s.trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean);
}

// -------------------------------------------------------------------------
// Build classification prompt
// -------------------------------------------------------------------------

function buildPrompt(intents, pages) {
  const categoryList = intents
    .map((i) => i.description ? `- ${i.name}: ${i.description}` : `- ${i.name}`)
    .join('\n');

  const pageList = pages
    .map((p, idx) => {
      const title = p.title || '(no title)';
      const snippet = (p.text_content || '').substring(0, 400).replace(/\n+/g, ' ').trim() || '(no content)';
      return `[${idx}] URL: ${p.url}\nTitle: ${title}\nContent: ${snippet}`;
    })
    .join('\n\n');

  return `Classify each web page into exactly ONE of these content categories:

${categoryList}

Pages to classify:

${pageList}

Respond with ONLY a JSON array. Each element must have: index (number), intent (string matching a category name), confidence (0.0-1.0), reasoning (brief explanation, max 15 words).

Example: [{"index": 0, "intent": "news", "confidence": 0.9, "reasoning": "Reports on recent regulatory change"}]`;
}

// -------------------------------------------------------------------------
// Parse LLM response -- extract JSON array
// -------------------------------------------------------------------------

function parseLlmResponse(responseText, validIntents) {
  try {
    // Find JSON array in the response
    const match = responseText.match(/\[[\s\S]*\]/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return null;

    const validNames = new Set(validIntents.map((i) => i.name));

    return parsed.map((item) => ({
      index: typeof item.index === 'number' ? item.index : -1,
      intent: validNames.has(item.intent) ? item.intent : 'other',
      confidence: typeof item.confidence === 'number'
        ? Math.min(1.0, Math.max(0, item.confidence))
        : 0.5,
      reasoning: typeof item.reasoning === 'string' ? item.reasoning.substring(0, 200) : '',
    }));
  } catch {
    return null;
  }
}

// -------------------------------------------------------------------------
// Main execute function
// -------------------------------------------------------------------------

async function execute(input, options, tools) {
  const { entities } = input;
  const { ai_model, ai_provider, ...otherOptions } = options;
  const { logger, progress, ai } = tools;

  const {
    intents: intentsRaw = '',
    priority_intents = 'news, product_info, review',
  } = otherOptions;

  const intents = parseIntents(intentsRaw);
  const priorityList = parseList(priority_intents);
  const BATCH_SIZE = 10; // pages per LLM call to reduce API calls

  if (intents.length === 0) {
    throw new Error('No intent categories defined. Add at least one intent in the options.');
  }

  const intentNames = intents.map((i) => i.name).join(', ');
  logger.info(`Intent Tagger v2: ${intents.length} categories [${intentNames}], batch size ${BATCH_SIZE}`);

  const results = [];
  let totalItems = 0;
  let llmCalls = 0;
  let llmFails = 0;
  const intentCounts = {};

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Classifying ${entity.name}`);

    const allItems = (entity.items || []).filter((item) => item.text_content || item.url);

    if (allItems.length === 0) {
      logger.warn(`${entity.name}: no items with text_content or url — skipping`);
      results.push({
        entity_name: entity.name,
        items: [],
        meta: { total: 0, intent_breakdown: {}, llm_calls: 0, skipped_maybe: 0 },
      });
      continue;
    }

    // Split by upstream relevance: LLM-tag KEEPs, pass MAYBEs through as unclassified
    // Items without a relevance field (e.g. url-relevance wasn't run) are treated as KEEP
    const scrapedItems = allItems.filter((item) => !item.relevance || item.relevance === 'KEEP');
    const maybeItems = allItems.filter((item) => item.relevance === 'MAYBE');

    if (maybeItems.length > 0) {
      logger.info(`${entity.name}: ${scrapedItems.length} KEEP pages for LLM tagging, ${maybeItems.length} MAYBE pages passed through as unclassified`);
    } else {
      logger.info(`${entity.name}: classifying ${scrapedItems.length} pages in batches of ${BATCH_SIZE}`);
    }

    // Initialize intent results for all items
    const itemIntents = new Array(scrapedItems.length).fill(null);

    // Process in batches
    for (let batchStart = 0; batchStart < scrapedItems.length; batchStart += BATCH_SIZE) {
      const batch = scrapedItems.slice(batchStart, batchStart + BATCH_SIZE);
      const prompt = buildPrompt(intents, batch);

      try {
        const response = await ai.complete({
          prompt,
          model: ai_model,
          provider: ai_provider,
        });

        const classifications = parseLlmResponse(response.text, intents);
        llmCalls++;

        if (classifications) {
          for (const classification of classifications) {
            const globalIdx = batchStart + classification.index;
            if (globalIdx >= 0 && globalIdx < scrapedItems.length) {
              itemIntents[globalIdx] = classification;
            }
          }

          // Push partial results so they survive timeouts
          if (tools._partialItems) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE, scrapedItems.length);
            for (let k = batchStart; k < batchEnd; k++) {
              const cls = itemIntents[k];
              tools._partialItems.push({
                ...scrapedItems[k],
                page_intent: cls ? cls.intent : 'other',
                intent_confidence: cls ? cls.confidence : 0,
                intent_reasoning: cls ? cls.reasoning : 'Classification failed',
                entity_name: entity.name,
              });
            }
          }
        } else {
          logger.warn(`${entity.name}: failed to parse LLM response for batch starting at ${batchStart}`);
          llmFails++;
        }
      } catch (err) {
        logger.warn(`${entity.name}: LLM batch failed at ${batchStart}: ${err.message}`);
        llmCalls++;
        llmFails++;
      }
    }

    // Build tagged items from LLM-classified KEEPs
    const taggedItems = scrapedItems.map((item, idx) => {
      totalItems++;

      const classification = itemIntents[idx];
      const page_intent = classification ? classification.intent : 'other';
      const intent_confidence = classification ? classification.confidence : 0;
      const intent_reasoning = classification
        ? classification.reasoning
        : 'Classification failed — defaulted to other';

      intentCounts[page_intent] = (intentCounts[page_intent] || 0) + 1;

      return {
        ...item,
        page_intent,
        intent_confidence,
        intent_reasoning,
        entity_name: entity.name,
      };
    });

    // Append MAYBE items as unclassified — content preserved for downstream use
    const unclassifiedItems = maybeItems.map((item) => {
      totalItems++;
      intentCounts['unclassified'] = (intentCounts['unclassified'] || 0) + 1;

      return {
        ...item,
        page_intent: 'unclassified',
        intent_confidence: 0,
        intent_reasoning: 'Skipped — upstream relevance was MAYBE',
        entity_name: entity.name,
      };
    });

    const allTaggedItems = [...taggedItems, ...unclassifiedItems];

    // Sort: priority intents first, then by confidence descending, unclassified last
    allTaggedItems.sort((a, b) => {
      if (a.page_intent === 'unclassified' && b.page_intent !== 'unclassified') return 1;
      if (b.page_intent === 'unclassified' && a.page_intent !== 'unclassified') return -1;

      const aPriority = priorityList.indexOf(a.page_intent);
      const bPriority = priorityList.indexOf(b.page_intent);

      if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
      if (aPriority !== -1) return -1;
      if (bPriority !== -1) return 1;
      return b.intent_confidence - a.intent_confidence;
    });

    // Per-entity intent breakdown
    const intentBreakdown = {};
    for (const item of allTaggedItems) {
      intentBreakdown[item.page_intent] = (intentBreakdown[item.page_intent] || 0) + 1;
    }

    results.push({
      entity_name: entity.name,
      items: allTaggedItems,
      meta: {
        total: allTaggedItems.length,
        intent_breakdown: intentBreakdown,
        llm_calls: llmCalls,
        skipped_maybe: maybeItems.length,
      },
    });
  }

  // Summary
  const intentParts = Object.entries(intentCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([intent, count]) => `${count} ${intent}`)
    .join(', ');

  const description = `${totalItems} pages classified across ${entities.length} entities: ${intentParts} | ${llmCalls} LLM calls${llmFails > 0 ? ` (${llmFails} failed)` : ''}`;

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      intent_breakdown: intentCounts,
      llm_calls: llmCalls,
      llm_failures: llmFails,
      errors: [],
      description,
    },
  };
}

module.exports = execute;
