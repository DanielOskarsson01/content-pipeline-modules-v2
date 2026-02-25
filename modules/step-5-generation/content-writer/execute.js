/**
 * Content Writer — Step 5 Generation submodule
 *
 * Writes comprehensive company profiles using THREE inputs:
 * 1. Content analysis (what to write about — categories, tags, facts)
 * 2. SEO plan (which keywords to use in each section, FAQs)
 * 3. Scraped source content (raw material for specific, detailed prose)
 *
 * v1.3.0: Writer receives scraped source content alongside analysis and plan.
 * This gives the writer raw material to produce specific prose instead of
 * inflating summaries from the analysis alone.
 *
 * Data operation: ADD (+) — adds written content alongside analysis and plan.
 * Requires BOTH content-analyzer and seo-planner to have run first.
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
 * Assemble entity content from analyzer output, planner output, AND scraped sources.
 * v1.3.0: Three sections instead of two.
 */
function assembleEntityContent(analyzerItem, plannerItem, sourceContent) {
  const parts = [];

  parts.push('=== COMPANY ANALYSIS ===');
  if (analyzerItem.analysis_json) {
    parts.push(JSON.stringify(analyzerItem.analysis_json, null, 2));
  } else {
    parts.push(JSON.stringify(analyzerItem, null, 2));
  }

  parts.push('\n=== SEO CONTENT PLAN ===');
  if (plannerItem.seo_plan_json) {
    parts.push(JSON.stringify(plannerItem.seo_plan_json, null, 2));
  } else {
    parts.push(JSON.stringify(plannerItem, null, 2));
  }

  parts.push('\n=== SOURCE CONTENT (scraped pages) ===');
  parts.push(sourceContent);

  return parts.join('\n');
}

async function execute(input, options, tools) {
  const { entities } = input;
  const { ai_model, ai_provider, prompt: promptTemplate, reference_docs, max_source_chars } = options;
  const { logger, progress, ai } = tools;

  const maxChars = max_source_chars || 100000;
  const results = [];
  const errors = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Writing content for ${entity.name || 'entity'}`);

    // Find upstream items via source_submodule
    const items = entity.items || [];
    const analyzerItem = items.find(item => item.source_submodule === 'content-analyzer');
    const plannerItem = items.find(item => item.source_submodule === 'seo-planner');

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

    if (!analyzerItem || !plannerItem) {
      const missing = [];
      if (!analyzerItem) missing.push('content-analyzer');
      if (!plannerItem) missing.push('seo-planner');
      const errMsg = `Missing upstream output: ${missing.join(', ')}. Run these submodules first.`;
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
      continue;
    }

    try {
      // Get meta title from planner for reference
      const metaTitle = plannerItem.seo_plan_json?.meta?.title
        || plannerItem.meta_title
        || entity.name;

      logger.info(`${entity.name}: writing content with ${ai_provider}/${ai_model} (${scrapedItems.length} source pages)`);

      // Assemble scraped source content
      const sourceContent = assembleSourceContent(scrapedItems, maxChars);

      // Assemble all three inputs
      const entityContent = assembleEntityContent(analyzerItem, plannerItem, sourceContent);
      const prompt = buildPrompt(promptTemplate, entityContent, reference_docs);

      const response = await ai.complete({
        prompt,
        model: ai_model,
        provider: ai_provider,
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
