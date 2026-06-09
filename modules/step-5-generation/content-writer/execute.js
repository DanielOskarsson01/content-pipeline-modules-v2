/**
 * Content Writer — Step 5 Generation submodule
 *
 * Writes content using up to THREE inputs:
 * 1. Content analysis (required — what to write about)
 * 2. SEO plan (optional — keyword distribution, FAQs)
 * 3. Scraped source content (raw material for specific, detailed prose)
 *
 * v1.4.0: seo-planner dependency is optional. Writer warns and proceeds
 * without SEO plan section when seo-planner has not run upstream.
 *
 * Data operation: ADD (+) — adds written content alongside analysis.
 * Requires content-analyzer. seo-planner is optional.
 */

/**
 * Replace prompt placeholders with actual content.
 */
function buildPrompt(promptTemplate, entityContent, referenceDocs) {
  let prompt = promptTemplate.replace(/\{entity_content\}/g, entityContent);

  // Replace {doc:filename} placeholders
  if (referenceDocs && typeof referenceDocs === 'object') {
    for (const [filename, content] of Object.entries(referenceDocs)) {
      prompt = prompt.replace(new RegExp(`\\{doc:${escapeRegex(filename)}\\}`, 'g'), String(content));
    }
  }

  // Clean up unreplaced {doc:...} placeholders
  prompt = prompt.replace(/\{doc:[^}]+\}/g, '');

  return prompt;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Count words in a text string.
 */
function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Count markdown heading sections (## or ###).
 */
function countSections(markdown) {
  const headings = markdown.match(/^#{2,3}\s+/gm);
  return headings ? headings.length : 0;
}

/**
 * Check if content contains [#n] citation patterns (v1.2.0+ format).
 * Also checks older patterns for backwards compatibility.
 */
function hasCitations(text) {
  // v1.2.0+: [#n] inline citation format
  return /\[#\d+\]/.test(text)
    // Fallback: markdown links, (Source:...), etc.
    || /\[.*?\]\(https?:\/\/.*?\)/.test(text)
    || /\(Source:/.test(text);
}

/**
 * Assemble scraped page content into a text block, truncated to maxChars.
 */
function assembleSourceContent(scrapedItems, maxChars) {
  const parts = [];
  for (const item of scrapedItems) {
    const header = `--- Page: ${item.title || 'Untitled'} (${item.url || 'unknown'}) ---`;
    const content = item.text_content || '';
    parts.push(`${header}\n${content}`);
  }
  let assembled = parts.join('\n\n');
  if (assembled.length > maxChars) {
    assembled = assembled.substring(0, maxChars) + '\n\n[Source content truncated at ' + maxChars + ' characters]';
  }
  return assembled;
}

/**
 * Walk a simple dot-notation path with `[]` array iteration into a structured object.
 *
 * Path examples (the path syntax is intentionally tiny — no JSONPath dependency):
 *   "categories.primary[].slug"           → for each x in obj.categories.primary, return x.slug
 *   "tags.existing[].slug"                → for each x in obj.tags.existing, return x.slug
 *   "tags.suggested_new[].label"          → for each x in obj.tags.suggested_new, return x.label
 *   "headline"                            → return [obj.headline] if string
 *   "guests[].name"                       → for each x in obj.guests, return x.name
 *   "topics[]"                            → return obj.topics (flat string array)
 *
 * Always returns an array of strings. Missing fields, wrong types, and
 * non-string leaves all collapse to an empty result rather than throwing.
 *
 * This walker is pipeline-agnostic — it does not know about categories, tags,
 * or any other content-type-specific field. The template provides the paths.
 */
function walkSlugPath(obj, path) {
  if (obj == null || typeof path !== 'string' || path.length === 0) return [];
  const segments = path.split('.');
  let curr = obj;

  for (let i = 0; i < segments.length; i++) {
    let seg = segments[i];
    if (curr == null) return [];

    const arrayIter = seg.endsWith('[]');
    if (arrayIter) seg = seg.slice(0, -2);

    const nextField = seg.length > 0 ? curr[seg] : curr;

    if (arrayIter) {
      if (!Array.isArray(nextField)) return [];
      const restPath = segments.slice(i + 1).join('.');
      if (restPath === '') {
        return nextField
          .map(x => (typeof x === 'string' ? x.trim() : ''))
          .filter(Boolean);
      }
      return nextField.flatMap(item => walkSlugPath(item, restPath));
    }

    curr = nextField;
  }

  if (typeof curr === 'string') return [curr.trim()].filter(Boolean);
  if (Array.isArray(curr)) return curr.filter(x => typeof x === 'string').map(s => s.trim()).filter(Boolean);
  return [];
}

/**
 * Parse the `allowed_slug_paths` textarea option into [{ label, path }] entries.
 *
 * Config format (one entry per line):
 *   <BracketLabel>=<dot.notation.path>
 *
 * Example (company-profile pipeline):
 *   Primary Category=categories.primary[].slug
 *   Secondary Category=categories.secondary[].slug
 *   Tag=tags.existing[].slug
 *   Tag=tags.suggested_new[].label
 *
 * Lines starting with `#` and blank lines are ignored. Labels may repeat — the
 * walker concatenates results into the same label's slug list (useful for
 * tags coming from two analyzer fields, as in the example above).
 *
 * Returns an empty array when the option is empty or missing — in which case
 * the assembleEntityContent function emits no ALLOWED SLUGS block at all,
 * preserving fully generic behavior for content types that do not use slug
 * brackets (cover letters, news articles, etc.).
 */
function parseAllowedSlugConfig(configStr) {
  if (!configStr || typeof configStr !== 'string') return [];
  return configStr
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .map(line => {
      const eq = line.indexOf('=');
      if (eq < 1) return null;
      const label = line.slice(0, eq).trim();
      const path = line.slice(eq + 1).trim();
      if (!label || !path) return null;
      return { label, path };
    })
    .filter(Boolean);
}

/**
 * Render the per-entity ALLOWED SLUGS block, IF the template configured any
 * allowed-slug paths. Otherwise return null and assembleEntityContent skips
 * the block entirely (pure-narrative content types unaffected).
 *
 * The block is prepended to the entity content so the model encounters it
 * before the narrative source pages, which historically drown structural
 * rules under prose patterns.
 */
function renderAllowedSlugsBlock(analyzerItem, config) {
  if (!Array.isArray(config) || config.length === 0) return null;
  const aj = analyzerItem && analyzerItem.analysis_json;
  if (!aj || typeof aj !== 'object') return null;

  // Group slugs by label (so e.g. "Tag" can collect from multiple paths).
  const labelToSlugs = new Map();
  for (const { label, path } of config) {
    const found = walkSlugPath(aj, path);
    if (!labelToSlugs.has(label)) labelToSlugs.set(label, []);
    labelToSlugs.get(label).push(...found);
  }
  // Deduplicate each label's list, preserve insertion order.
  for (const [label, slugs] of labelToSlugs.entries()) {
    labelToSlugs.set(label, [...new Set(slugs)]);
  }

  // If every label resolved to empty, no point emitting the block.
  const hasAnySlug = Array.from(labelToSlugs.values()).some(arr => arr.length > 0);
  if (!hasAnySlug) return null;

  const fmt = (arr) => arr.length > 0 ? arr.map(s => `\`${s}\``).join(', ') : '(none)';
  const lines = [
    '=== ALLOWED SLUGS FOR THIS ARTICLE (closed vocabulary) ===',
    '',
    "The lists below are the ONLY values you may emit inside the corresponding bracket labels in your output. Any other value is INVALID and will fail validation. The template configured these paths via the `allowed_slug_paths` submodule option.",
    '',
  ];
  for (const [label, slugs] of labelToSlugs.entries()) {
    lines.push(`**[${label}: <slug>]** — allowed values: ${fmt(slugs)}`);
  }
  lines.push('');
  lines.push("Source content (scraped pages below, if present) provides NARRATIVE MATERIAL ONLY. It does NOT provide slugs. Even if the source content repeats phrases that look like slug candidates, those are marketing or editorial language, not slugs. Slugs come exclusively from the lists above.");
  lines.push('');
  return lines.join('\n');
}

/**
 * Assemble entity content from analyzer output, optional planner output, and scraped sources.
 *
 * v1.4.0: plannerItem is optional — SEO plan section omitted when null.
 * v1.5.0: Prepend ALLOWED SLUGS block when the template configures
 *         `allowed_slug_paths`. Pipeline-agnostic: cover letters, news, podcasts,
 *         etc. that do not configure the option get unchanged behavior.
 */
function assembleEntityContent(analyzerItem, plannerItem, sourceContent, allowedSlugPaths) {
  const parts = [];

  const slugBlock = renderAllowedSlugsBlock(
    analyzerItem,
    parseAllowedSlugConfig(allowedSlugPaths)
  );
  if (slugBlock) parts.push(slugBlock);

  parts.push('=== CONTENT ANALYSIS ===');
  if (analyzerItem.analysis_json) {
    parts.push(JSON.stringify(analyzerItem.analysis_json, null, 2));
  } else {
    parts.push(JSON.stringify(analyzerItem, null, 2));
  }

  if (plannerItem) {
    parts.push('\n=== SEO CONTENT PLAN ===');
    if (plannerItem.seo_plan_json) {
      parts.push(JSON.stringify(plannerItem.seo_plan_json, null, 2));
    } else {
      parts.push(JSON.stringify(plannerItem, null, 2));
    }
  }

  parts.push('\n=== SOURCE CONTENT (scraped pages) ===');
  parts.push(sourceContent);

  return parts.join('\n');
}

async function execute(input, options, tools) {
  const { entities } = input;
  const { ai_model, ai_provider, prompt: promptTemplate, reference_docs, max_source_chars, temperature, max_tokens, allowed_slug_paths } = options;
  const { logger, progress, ai } = tools;

  const maxChars = max_source_chars || 100000;
  const results = [];
  const errors = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Writing content for ${entity.name || 'entity'}`);

    // Find upstream items via source_submodule
    const items = entity.items || [];
    const analyzerItem = items.findLast(item => item.source_submodule === 'content-analyzer');
    const plannerItem = items.findLast(item => item.source_submodule === 'seo-planner');

    // Find scraped source items: items NOT from Step 5 submodules AND with text_content
    // These are the original page-scraper items that flow through the pool
    const scrapedItems = items.filter(item =>
      item.source_submodule !== 'content-analyzer'
      && item.source_submodule !== 'seo-planner'
      && item.text_content
    );

    if (scrapedItems.length === 0) {
      logger.warn(`${entity.name}: no scraped source pages with text_content found — writer will rely on analysis/plan only`);
    }

    if (!analyzerItem) {
      const errMsg = 'Missing upstream output: content-analyzer. Run content-analyzer first.';
      logger.error(`${entity.name}: ${errMsg}`);
      errors.push(`${entity.name}: ${errMsg}`);

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          status: 'error',
          word_count: 0,
          section_count: 0,
          has_citations: false,
          meta_title: '',
          content_preview: '',
          content_markdown: '',
          error: errMsg,
        }],
        meta: { status: 'error' },
      });
      if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }
      continue;
    }

    if (!plannerItem) {
      logger.warn(`${entity.name}: no seo-planner output found — writing without SEO plan`);
    }

    try {
      // Get meta title from planner for reference (planner may be absent)
      const metaTitle = plannerItem?.seo_plan_json?.meta?.title
        || plannerItem?.meta_title
        || entity.name;

      logger.info(`${entity.name}: writing content with ${ai_provider}/${ai_model} (${scrapedItems.length} source pages)`);

      // Assemble scraped source content
      const sourceContent = assembleSourceContent(scrapedItems, maxChars);

      // Assemble all three inputs
      const entityContent = assembleEntityContent(analyzerItem, plannerItem, sourceContent, allowed_slug_paths);
      const prompt = buildPrompt(promptTemplate, entityContent, reference_docs);

      const response = await ai.complete({
        prompt,
        model: ai_model,
        provider: ai_provider,
        temperature,
        max_tokens,
      });

      // Output is always markdown (v1.2.0+: markdown-only, no JSON output)
      const contentMarkdown = response.text;

      const wordCount = countWords(contentMarkdown);
      const sectionCount = countSections(contentMarkdown);
      const citations = hasCitations(contentMarkdown);
      const contentPreview = contentMarkdown.substring(0, 300) + (contentMarkdown.length > 300 ? '...' : '');

      const resultItem = {
        entity_name: entity.name,
        status: 'written',
        word_count: wordCount,
        section_count: sectionCount,
        has_citations: citations,
        meta_title: metaTitle,
        content_preview: contentPreview,
        // Full content for detail modal (prose rendering)
        content_markdown: contentMarkdown,
        error: '',
      };

      results.push({
        entity_name: entity.name,
        items: [resultItem],
        meta: { status: 'success', word_count: wordCount, section_count: sectionCount },
      });

      logger.info(`${entity.name}: content written — ${wordCount} words, ${sectionCount} sections, citations: ${citations}`);
      if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }

    } catch (err) {
      logger.error(`${entity.name}: content writing failed — ${err.message}`);
      errors.push(`${entity.name}: ${err.message}`);

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          status: 'error',
          word_count: 0,
          section_count: 0,
          has_citations: false,
          meta_title: '',
          content_preview: '',
          content_markdown: '',
          error: err.message,
        }],
        meta: { status: 'error' },
      });
      if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }
    }
  }

  const successCount = results.filter(r => r.meta.status === 'success').length;
  const totalWords = results.reduce((sum, r) => sum + (r.meta.word_count || 0), 0);
  const description = errors.length > 0
    ? `${successCount}/${entities.length} profiles written (${totalWords} words) — ${errors.length} error(s)`
    : `${successCount} profiles written — ${totalWords} total words`;

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
// Exported for test harness use only — not part of the public submodule interface.
module.exports.__testing = {
  walkSlugPath,
  parseAllowedSlugConfig,
  renderAllowedSlugsBlock,
  assembleEntityContent,
};
