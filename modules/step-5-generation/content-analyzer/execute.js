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
 * Extract slug string from a category entry.
 * v1.3.0 uses {slug, why, source} objects; v1.2.0 used {slug, why}; v1.0.0 used plain strings.
 */
function catSlug(entry) {
  return typeof entry === 'string' ? entry : (entry?.slug || entry?.label || String(entry));
}

/**
 * Extract slug string from a tag entry.
 * v1.3.0/v1.2.0: existing = [{slug, why}], suggested_new = [{label, why, evidence}]
 * v1.0.0: existing/suggested = ["string"]
 */
function tagSlug(entry) {
  return typeof entry === 'string' ? entry : (entry?.slug || entry?.label || String(entry));
}

/**
 * Flatten analysis JSON into display-friendly fields for the output table.
 * Handles v1.3.0 (structural extraction, {detail, source} objects),
 * v1.2.0 ({slug, why} objects), and v1.0.0 (plain strings) schemas.
 */
function flattenAnalysis(analysis) {
  const categories = analysis.categories || {};
  const tags = analysis.tags || {};
  const facts = analysis.key_facts || {};

  // v1.3.0/v1.2.0: primary is array of {slug, why}; v1.0.0: primary is a string
  let primaryCats = Array.isArray(categories.primary) ? categories.primary : (categories.primary ? [categories.primary] : []);
  let secondaryCats = Array.isArray(categories.secondary) ? categories.secondary : [];
  // Promote secondary to primary if LLM returned empty primary
  if (primaryCats.length === 0 && secondaryCats.length > 0) {
    primaryCats = secondaryCats;
    secondaryCats = [];
  }
  const primaryCategory = primaryCats.map(catSlug).join(', ') || 'Unknown';

  // Tags: v1.2.0+ uses suggested_new; v1.0.0 uses suggested
  const existingTags = (tags.existing || []).map(tagSlug);
  const suggestedTags = (tags.suggested_new || tags.suggested || []).map(tagSlug);
  const allTags = [...existingTags, ...suggestedTags];
  const tagsPreview = allTags.slice(0, 5).join(', ') + (allTags.length > 5 ? ` (+${allTags.length - 5})` : '');

  const factParts = [];
  if (facts.founded) factParts.push(`Est. ${facts.founded}`);
  if (facts.headquarters || facts.hq) factParts.push(facts.headquarters || facts.hq);
  if (facts.employees) factParts.push(`~${facts.employees} employees`);
  const factsPreview = factParts.join(' · ') || 'No facts extracted';

  // Build detail text fields
  const categoriesText = [
    primaryCats.length ? `Primary: ${primaryCats.map(c => typeof c === 'string' ? c : `${c.slug} (${c.why})`).join(', ')}` : null,
    secondaryCats.length ? `Secondary: ${secondaryCats.map(c => typeof c === 'string' ? c : `${c.slug} (${c.why})`).join(', ')}` : null,
  ].filter(Boolean).join('\n') || 'No categories assigned';

  const tagsText = [
    existingTags.length ? `Existing: ${existingTags.join(', ')}` : null,
    suggestedTags.length ? `Suggested new: ${suggestedTags.join(', ')}` : null,
  ].filter(Boolean).join('\n') || 'No tags extracted';

  // Key people: v1.3.0 uses {name, role, source}; v1.2.0 uses {name, role}; v1.0.0 uses strings
  const keyPeople = (facts.key_people || []).map(p =>
    typeof p === 'string' ? p : `${p.name} — ${p.role}`
  );

  // Key facts text — handles both structured objects and plain strings
  const keyFactsParts = [];
  if (facts.founded) keyFactsParts.push(`Founded: ${facts.founded}`);
  if (facts.headquarters || facts.hq) keyFactsParts.push(`Headquarters: ${facts.headquarters || facts.hq}`);
  if (facts.employees) keyFactsParts.push(`Employees: ${facts.employees}`);
  if (keyPeople.length) keyFactsParts.push(`Key People: ${keyPeople.join(', ')}`);

  // v1.3.0: licenses/awards/partnerships are [{detail, source}]; v1.2.0: plain strings
  const licenses = (facts.licenses || []).map(l => typeof l === 'string' ? l : l.detail);
  if (licenses.length) keyFactsParts.push(`Licenses: ${licenses.join(', ')}`);

  const awards = (facts.awards || []).map(a => typeof a === 'string' ? a : a.detail);
  if (awards.length) keyFactsParts.push(`Awards: ${awards.join(', ')}`);

  const partnerships = (facts.partnerships || []).map(p => typeof p === 'string' ? p : p.detail);
  if (partnerships.length) keyFactsParts.push(`Partnerships: ${partnerships.join(', ')}`);

  // v1.3.0: offices array
  const offices = facts.offices || [];
  if (offices.length && offices.some(o => o !== null)) {
    keyFactsParts.push(`Offices: ${offices.filter(Boolean).join(', ')}`);
  }

  // v1.3.0: contact object
  const contact = facts.contact || {};
  const contactParts = [];
  if (contact.email) contactParts.push(`Email: ${contact.email}`);
  if (contact.phone) contactParts.push(`Phone: ${contact.phone}`);
  if (contact.website) contactParts.push(`Website: ${contact.website}`);
  if (contactParts.length) keyFactsParts.push(contactParts.join(', '));

  const keyFactsText = keyFactsParts.join('\n') || 'No facts extracted';

  // Citations: v1.3.0 uses [{index, url, title}]; v1.2.0 uses [{claim, sources}]; v1.0.0 uses strings
  const citations = analysis.source_citations || [];
  const citationsText = citations.length > 0
    ? citations.map((c, i) => {
        if (typeof c === 'string') return `${i + 1}. ${c}`;
        if (c.index !== undefined) return `[#${c.index}] ${c.url}${c.title ? ` — ${c.title}` : ''}`;
        return `${i + 1}. ${c.claim} — ${(c.sources || []).join(', ')}`;
      }).join('\n')
    : 'No citations';

  return {
    primary_category: primaryCategory,
    tags_preview: tagsPreview,
    facts_preview: factsPreview,
    categories_text: categoriesText,
    tags_text: tagsText,
    key_facts_text: keyFactsText,
    source_citations_text: citationsText,
  };
}

async function execute(input, options, tools) {
  const { entities } = input;
  const { ai_model, ai_provider, max_content_chars, prompt: promptTemplate, reference_docs } = options;
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
      });

      // Parse JSON response
      const analysis = parseJsonResponse(response.text);

      // Flatten for display
      const flat = flattenAnalysis(analysis);

      const resultItem = {
        entity_name: entity.name,
        status: 'analyzed',
        primary_category: flat.primary_category,
        tags_preview: flat.tags_preview,
        facts_preview: flat.facts_preview,
        word_count: totalWords,
        model_used: `${ai_provider}/${ai_model}`,
        // Detail fields
        categories_text: flat.categories_text,
        tags_text: flat.tags_text,
        key_facts_text: flat.key_facts_text,
        source_citations_text: flat.source_citations_text,
        // Full JSON carried to pool for downstream submodules
        analysis_json: analysis,
      };

      results.push({
        entity_name: entity.name,
        items: [resultItem],
        meta: { pages_analyzed: items.length, total_words: totalWords, status: 'success' },
      });

      logger.info(`${entity.name}: analysis complete — ${flat.primary_category}, ${flat.tags_preview}`);

    } catch (err) {
      logger.error(`${entity.name}: analysis failed — ${err.message}`);
      errors.push(`${entity.name}: ${err.message}`);

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          status: 'error',
          primary_category: '',
          tags_preview: '',
          facts_preview: '',
          word_count: 0,
          model_used: `${ai_provider}/${ai_model}`,
          categories_text: '',
          tags_text: '',
          key_facts_text: '',
          source_citations_text: '',
          error: err.message,
          analysis_json: null,
        }],
        meta: { pages_analyzed: 0, status: 'error' },
      });
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
