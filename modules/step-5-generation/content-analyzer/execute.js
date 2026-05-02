/**
 * Content Analyzer — Step 5 Generation submodule
 *
 * Structural fact extraction from scraped content for each entity using an LLM.
 * Produces one structured analysis per entity: categories, tags,
 * key facts, and source citations.
 *
 * v1.3.0: Pure extraction — no summaries, opinions, or marketing prose.
 *
 * Data operation: ADD (+) — appends analysis alongside existing pool items.
 */

/**
 * Assemble all scraped page content for an entity into a single text block.
 * Each page is separated with a header showing URL and title.
 */
function assembleEntityContent(items, maxChars) {
  const parts = [];
  for (const item of items) {
    const header = `--- Page: ${item.title || 'Untitled'} (${item.url}) ---`;
    const content = item.text_content || '';
    parts.push(`${header}\n${content}`);
  }
  let assembled = parts.join('\n\n');
  if (assembled.length > maxChars) {
    assembled = assembled.substring(0, maxChars) + '\n\n[Content truncated at ' + maxChars + ' characters]';
  }
  return assembled;
}

/**
 * Replace prompt placeholders with actual content.
 * - {entity_content} → assembled scraped content
 * - {doc:filename} → reference doc content (from resolved options)
 */
function buildPrompt(promptTemplate, entityContent, referenceDocs) {
  let prompt = promptTemplate.replace(/\{entity_content\}/g, entityContent);

  // Replace {doc:filename} placeholders with actual doc content
  if (referenceDocs && typeof referenceDocs === 'object') {
    for (const [filename, content] of Object.entries(referenceDocs)) {
      prompt = prompt.replace(new RegExp(`\\{doc:${escapeRegex(filename)}\\}`, 'g'), String(content));
    }
  }

  // Clean up any unreplaced {doc:...} placeholders
  prompt = prompt.replace(/\{doc:[^}]+\}/g, '');

  return prompt;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse JSON from LLM response, handling markdown code fences.
 * Handles: complete fences, truncated fences (missing closing ```),
 * preamble text before JSON, and case-insensitive fence labels.
 */
function parseJsonResponse(text) {
  let cleaned = text.trim();

  // 1. Try complete fence: ```json ... ```
  const fenceMatch = cleaned.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  } else {
    // 2. Fallback: strip opening fence (handles truncated responses where
    //    the model hit max_tokens before closing the fence)
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/, '').trim();
  }

  // 3. Extract outermost JSON object — handles preamble text or trailing text
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}

/**
 * Common acronyms that should be uppercased in auto-derived labels.
 */
const ACRONYMS = new Set(['llm', 'ai', 'url', 'api', 'id', 'cta', 'roi', 'seo', 'qa', 'ui', 'ux', 'serp', 'pse', 'csv', 'json', 'html', 'css', 'sql', 'http', 'ip', 'dns']);

/**
 * Convert a snake_case or camelCase key to a human-readable label.
 * Handles acronyms: 'llm_response' → 'LLM Response', 'ai_model' → 'AI Model'.
 */
function keyToLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(word => ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

const MAX_SECTION_CHARS = 2000;

/**
 * Render any JSON value as human-readable text for display.
 * Depth-limited to prevent runaway recursion on deeply nested LLM output.
 */
function renderValue(value, depth = 0) {
  if (value === null || value === undefined) return 'Not available';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  // At max depth, fall back to compact JSON
  if (depth >= 2) {
    const json = JSON.stringify(value);
    return json.length > 200 ? json.substring(0, 200) + '...' : json;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return 'None';
    // Array of primitives → comma-separated
    if (value.every(v => typeof v === 'string' || typeof v === 'number')) {
      return value.join(', ');
    }
    // Array of objects → one line per entry, pick readable fields
    return value.map(item => {
      if (typeof item === 'string' || typeof item === 'number') return String(item);
      if (typeof item === 'object' && item !== null) {
        // Pick display-friendly fields, skip metadata like 'source', 'evidence'
        const parts = Object.entries(item)
          .filter(([k]) => k !== 'source' && k !== 'evidence')
          .map(([k, v]) => {
            if (typeof v === 'string' || typeof v === 'number') return `${v}`;
            return renderValue(v, depth + 1);
          })
          .filter(Boolean);
        return parts.join(' — ');
      }
      return String(item);
    }).join('\n');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== null && v !== undefined);
    if (entries.length === 0) return 'Not available';
    return entries.map(([k, v]) => {
      const label = keyToLabel(k);
      const rendered = renderValue(v, depth + 1);
      return `${label}: ${rendered}`;
    }).join('\n');
  }

  return String(value);
}

/**
 * Build a short preview string from the first few meaningful values in the analysis.
 * Used in the card list view for at-a-glance scanning.
 */
function buildPreview(analysis) {
  const previews = [];
  for (const [, value] of Object.entries(analysis)) {
    if (previews.length >= 3) break;
    if (typeof value === 'string' && value.length > 0 && value.length < 100) {
      previews.push(value);
    } else if (Array.isArray(value) && value.length > 0) {
      const items = value
        .map(v => typeof v === 'string' ? v : (v?.slug || v?.label || v?.name || v?.detail || ''))
        .filter(Boolean)
        .slice(0, 3);
      if (items.length > 0) previews.push(items.join(', '));
    } else if (typeof value === 'number') {
      previews.push(String(value));
    }
    // Skip objects — not useful for preview
  }
  return previews.join(' · ') || 'Analysis complete';
}

/**
 * Auto-flatten any LLM JSON response into display fields and dynamic section definitions.
 * No hardcoded knowledge of specific schemas — adapts to whatever the prompt produces.
 */
function flattenAnalysis(analysis) {
  const result = {
    summary_preview: buildPreview(analysis),
    _dynamic_sections: [],
  };

  for (const [key, value] of Object.entries(analysis)) {
    const label = keyToLabel(key);
    let text = renderValue(value);

    // Cap section text length
    if (text.length > MAX_SECTION_CHARS) {
      text = text.substring(0, MAX_SECTION_CHARS) + '\n... (truncated)';
    }

    const fieldName = `section_${key}`;
    result[fieldName] = text;
    result._dynamic_sections.push({
      field: fieldName,
      label,
      display: text.includes('\n') ? 'prose' : 'text',
    });
  }

  return result;
}

async function execute(input, options, tools) {
  const { entities } = input;
  const { ai_model, ai_provider, max_content_chars, prompt: promptTemplate, reference_docs, temperature, max_tokens } = options;
  const { logger, progress, ai } = tools;

  // Warn if critical reference docs are missing — the prompt relies on {doc:master_categories.md}
  // and {doc:master_tags.md} to provide the fixed taxonomy. Without them, the LLM invents categories.
  const refDocNames = reference_docs && typeof reference_docs === 'object' ? Object.keys(reference_docs) : [];
  const hasMasterCategories = refDocNames.some(n => n.toLowerCase().includes('master_categories') || n.toLowerCase().includes('categories'));
  const hasMasterTags = refDocNames.some(n => n.toLowerCase().includes('master_tags') || n.toLowerCase().includes('tags'));
  if (!hasMasterCategories) {
    logger.warn('WARNING: master_categories.md not selected in reference docs. The LLM will invent category slugs instead of using the fixed taxonomy. Upload and select master_categories.md for accurate classification.');
  }
  if (!hasMasterTags) {
    logger.warn('WARNING: master_tags.md not selected in reference docs. The LLM will invent tag slugs instead of using the master tag list. Upload and select master_tags.md for accurate tagging.');
  }

  const results = [];
  const errors = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Analyzing ${entity.name || 'entity'}`);

    const items = entity.items;
    if (!items || items.length === 0) {
      logger.info(`${entity.name}: no items to analyze, skipping`);
      results.push({
        entity_name: entity.name,
        items: [],
        meta: { pages_analyzed: 0, status: 'skipped' },
      });
      if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }
      continue;
    }

    try {
      // Count total source words
      const totalWords = items.reduce((sum, item) => sum + (item.word_count || 0), 0);
      logger.info(`${entity.name}: analyzing ${items.length} pages (${totalWords} words) with ${ai_provider}/${ai_model}`);

      // Assemble all page content
      const entityContent = assembleEntityContent(items, max_content_chars);

      // Build prompt with placeholders replaced
      const prompt = buildPrompt(promptTemplate, entityContent, reference_docs);

      // Call AI
      const response = await ai.complete({
        prompt,
        model: ai_model,
        provider: ai_provider,
        temperature,
        max_tokens,
      });

      // Parse JSON response — fall back to raw text display if parsing fails
      let analysis;
      let flat;
      try {
        analysis = parseJsonResponse(response.text);
        flat = flattenAnalysis(analysis);
      } catch (parseErr) {
        // LLM returned non-JSON (prose, markdown, etc.) — display as single section
        logger.warn(`${entity.name}: LLM returned non-JSON, displaying as raw text`);
        analysis = null;
        const rawText = response.text || '(empty response)';
        flat = {
          summary_preview: rawText.substring(0, 100) + (rawText.length > 100 ? '...' : ''),
          section_analysis: rawText,
          _dynamic_sections: [{ field: 'section_analysis', label: 'Analysis', display: 'prose' }],
        };
      }

      const resultItem = {
        entity_name: entity.name,
        status: 'analyzed',
        summary_preview: flat.summary_preview,
        word_count: totalWords,
        model_used: `${ai_provider}/${ai_model}`,
        // Dynamic section fields (section_categories, section_tags, etc.)
        ...Object.fromEntries(Object.entries(flat).filter(([k]) => k.startsWith('section_'))),
        // Section definitions for dynamic detail modal
        _dynamic_sections: flat._dynamic_sections,
        // Full JSON carried to pool for downstream submodules
        analysis_json: analysis,
      };

      results.push({
        entity_name: entity.name,
        items: [resultItem],
        meta: { pages_analyzed: items.length, total_words: totalWords, status: 'success' },
      });

      logger.info(`${entity.name}: analysis complete — ${flat.summary_preview}`);
      if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }

    } catch (err) {
      logger.error(`${entity.name}: analysis failed — ${err.message}`);
      errors.push(`${entity.name}: ${err.message}`);

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          status: 'error',
          summary_preview: '',
          word_count: 0,
          model_used: `${ai_provider}/${ai_model}`,
          error: err.message,
          _dynamic_sections: [{ field: 'error', label: 'Error', display: 'text' }],
          analysis_json: null,
        }],
        meta: { pages_analyzed: 0, status: 'error' },
      });
      if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }
    }
  }

  const successCount = results.filter(r => r.meta.status === 'success').length;
  const description = errors.length > 0
    ? `${successCount}/${entities.length} entities analyzed — ${errors.length} error(s)`
    : `${successCount} entities analyzed successfully`;

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: successCount,
      description,
      errors,
    },
  };
}

module.exports = execute;
