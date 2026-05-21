/**
 * SEO Planner — Step 5 Generation submodule
 *
 * Takes content-analyzer output and generates an SEO keyword distribution plan:
 * target keywords mapped to predefined sections, meta title/description, and FAQs.
 *
 * v2.0.0: Adds keyword research pre-step via Perplexity Sonar (or other search providers).
 * Researches actual keywords from the web before the LLM creates the plan.
 * Pipeline-agnostic — works for company profiles, review articles, news, bios, etc.
 *
 * Data operation: ADD (+) — adds SEO plan alongside analysis.
 * Requires content-analyzer to have run first (finds items via source_submodule).
 */

/**
 * Replace prompt placeholders with actual content.
 * - {entity_content} → analysis JSON
 * - {keyword_research} → keyword research results (or fallback to keyword-summary.md)
 * - {doc:filename} → reference doc content
 */
function buildPrompt(promptTemplate, entityContent, referenceDocs, keywordResearchText) {
  let prompt = promptTemplate.replace(/\{entity_content\}/g, entityContent);

  // Replace {keyword_research} — research results, or fallback to keyword-summary.md, or empty notice
  const keywordFallback = (referenceDocs && referenceDocs['keyword-summary.md']) || '';
  const keywordData = keywordResearchText || keywordFallback || 'No keyword research data available.';
  prompt = prompt.replace(/\{keyword_research\}/g, keywordData);

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
 * Parse JSON from LLM response, handling markdown code fences.
 * Handles: complete fences, truncated fences, preamble text.
 */
function parseJsonResponse(text) {
  let cleaned = text.trim();

  const fenceMatch = cleaned.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  } else {
    cleaned = cleaned.replace(/^```(?:json|JSON)?\s*\n?/, '').trim();
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}

/**
 * Validate meta tag lengths and return warnings.
 */
function validateMeta(meta) {
  const warnings = [];
  if (meta.title && meta.title.length > 60) {
    warnings.push(`Meta title is ${meta.title.length} chars (recommended: ≤60)`);
  }
  if (meta.description) {
    const len = meta.description.length;
    if (len < 150 || len > 160) {
      warnings.push(`Meta description is ${len} chars (recommended: 150-160)`);
    }
  }
  return warnings;
}

/**
 * Flatten SEO plan JSON into display-friendly fields.
 * Handles v1.3.0 (keyword_distribution) and v1.2.0 (content_outline) schemas.
 */
function flattenPlan(plan) {
  const keywords = plan.target_keywords || {};
  const meta = plan.meta || {};
  const faqs = plan.faqs || [];

  const primaryKeyword = keywords.primary || 'Not specified';

  // Keywords text
  const keywordsText = [
    `Primary: ${primaryKeyword}`,
    keywords.secondary?.length ? `Secondary: ${keywords.secondary.join(', ')}` : null,
    keywords.long_tail?.length ? `Long-tail: ${keywords.long_tail.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  // Keyword distribution text (v1.3.0)
  const dist = plan.keyword_distribution;
  let keywordDistText = '';
  let keywordDistPreview = '';

  if (dist) {
    const lines = [];

    // Overview
    if (dist.overview) {
      lines.push('Overview:');
      if (dist.overview.headline_keywords?.length) {
        lines.push(`  Headline: ${dist.overview.headline_keywords.join(', ')}`);
      }
      if (dist.overview.body_keywords?.length) {
        lines.push(`  Body: ${dist.overview.body_keywords.join(', ')}`);
      }
    }

    // Categories
    const cats = dist.categories || [];
    if (cats.length > 0) {
      lines.push('');
      lines.push('Categories:');
      for (const cat of cats) {
        lines.push(`  ${cat.category_slug} (${cat.category_tier || '?'}):`);
        if (cat.heading_keywords?.length) {
          lines.push(`    Heading: ${cat.heading_keywords.join(', ')}`);
        }
        if (cat.body_keywords?.length) {
          lines.push(`    Body: ${cat.body_keywords.join(', ')}`);
        }
      }
    }

    // Tags
    const tags = dist.tags || [];
    if (tags.length > 0) {
      lines.push('');
      lines.push('Tags:');
      for (const tag of tags) {
        if (tag.keywords?.length) {
          lines.push(`  ${tag.tag_slug}: ${tag.keywords.join(', ')}`);
        }
      }
    }

    // Credentials
    if (dist.credentials?.keywords?.length) {
      lines.push('');
      lines.push(`Credentials: ${dist.credentials.keywords.join(', ')}`);
    }

    // FAQ
    if (dist.faq?.keywords?.length) {
      lines.push('');
      lines.push(`FAQ: ${dist.faq.keywords.join(', ')}`);
    }

    keywordDistText = lines.join('\n') || 'No keyword distribution generated';

    // Preview: summary counts
    const totalUniqueKeywords = new Set();
    if (dist.overview) {
      (dist.overview.headline_keywords || []).forEach(k => totalUniqueKeywords.add(k));
      (dist.overview.body_keywords || []).forEach(k => totalUniqueKeywords.add(k));
    }
    for (const cat of cats) {
      (cat.heading_keywords || []).forEach(k => totalUniqueKeywords.add(k));
      (cat.body_keywords || []).forEach(k => totalUniqueKeywords.add(k));
    }
    for (const tag of tags) {
      (tag.keywords || []).forEach(k => totalUniqueKeywords.add(k));
    }
    keywordDistPreview = `${cats.length} categories, ${tags.length} tags, ${totalUniqueKeywords.size} unique keywords`;

  } else if (plan.content_outline) {
    // Fallback: v1.2.0 content_outline format
    const outline = plan.content_outline || [];
    keywordDistPreview = outline.map(s => {
      const type = s.type ? `[${s.type}]` : '';
      return `${s.heading} ${type}`.trim();
    }).slice(0, 4).join(', ')
      + (outline.length > 4 ? ` (+${outline.length - 4})` : '');

    const outlineLines = [];
    for (const section of outline) {
      const typePart = section.type ? ` [${section.type}]` : '';
      const kwPart = section.keywords?.length ? ` — kw: ${section.keywords.join(', ')}` : '';
      outlineLines.push(`${section.heading}${typePart} (${section.word_target || '?'} words)${kwPart}`);
      const subs = section.subheadings || section.subsections || [];
      for (const sub of subs) {
        outlineLines.push(`  └ ${sub.heading} (${sub.word_target || '?'} words)`);
      }
    }
    keywordDistText = outlineLines.join('\n') || 'No outline generated';
  }

  // Meta text with character counts
  const titleChars = meta.title_chars || (meta.title ? meta.title.length : 0);
  const descChars = meta.description_chars || (meta.description ? meta.description.length : 0);
  const metaText = [
    `Title: ${meta.title || 'Not generated'} (${titleChars} chars)`,
    `Description: ${meta.description || 'Not generated'} (${descChars} chars)`,
  ].join('\n');

  // FAQs text — v1.3.0: answer_brief + target_keyword; v1.2.0: answer_brief; v1.0.0: answer
  const faqsText = faqs.map((faq, i) => {
    const direction = faq.answer_brief || faq.answer || '';
    const keyword = faq.target_keyword ? `\nKeyword: ${faq.target_keyword}` : '';
    return `Q${i + 1}: ${faq.question}\nDirection: ${direction}${keyword}`;
  }).join('\n\n') || 'No FAQs generated';

  return {
    primary_keyword: primaryKeyword,
    keyword_plan_preview: keywordDistPreview,
    meta_title: meta.title || '',
    faq_count: faqs.length,
    keywords_text: keywordsText,
    keyword_distribution_text: keywordDistText,
    meta_text: metaText,
    faqs_text: faqsText,
    tone_notes: plan.tone_notes || '',
  };
}

/**
 * Extract a short context string from the analysis for research query interpolation.
 * Tries common fields across pipeline types (company profiles, categories, etc.).
 */
function buildEntityContext(entity, analyzerItem) {
  const analysis = analyzerItem.analysis_json || analyzerItem;
  const parts = [];
  if (analysis.primary_category) parts.push(analysis.primary_category);
  else if (analysis.categories?.length) parts.push(analysis.categories[0].name || analysis.categories[0]);
  if (analysis.industry) parts.push(analysis.industry);
  if (analysis.description) parts.push(analysis.description.slice(0, 100));
  return parts.join(' — ') || entity.name;
}

/**
 * Parse research_queries textarea into interpolated query strings.
 * One query per line, with {entity_name} and {entity_context} placeholders.
 */
function parseResearchQueries(template, entityName, entityContext) {
  return template
    .split('\n')
    .map(q => q.trim())
    .filter(q => q.length > 0)
    .map(q => q
      .replace(/\{entity_name\}/g, entityName)
      .replace(/\{entity_context\}/g, entityContext)
    );
}

/**
 * Run keyword research queries in parallel via the search provider.
 * Uses Promise.allSettled so partial failures don't kill the entire step.
 */
async function runKeywordResearch(queries, tools, searchProvider, logger, entityName) {
  if (queries.length > 5) {
    logger.warn(`${entityName}: ${queries.length} research queries configured (recommended: ≤5). Consider reducing to control costs.`);
  }

  logger.info(`${entityName}: running ${queries.length} research queries via ${searchProvider}`);

  const promises = queries.map((query, idx) => {
    logger.info(`${entityName}: research query ${idx + 1}/${queries.length}: ${query.slice(0, 80)}...`);
    return tools.ai.complete({
      prompt: query,
      model: 'sonar',
      provider: searchProvider,
      temperature: 0.1,
      max_tokens: 2048,
    }).then(response => ({
      query,
      response_text: response.text,
      citations: response.citations || [],
    }));
  });

  const settled = await Promise.allSettled(promises);
  const results = [];
  for (let i = 0; i < settled.length; i++) {
    if (settled[i].status === 'fulfilled') {
      results.push(settled[i].value);
    } else {
      logger.warn(`${entityName}: research query ${i + 1} failed — ${settled[i].reason?.message}`);
    }
  }
  return results;
}

/**
 * Format research results into structured markdown for the planning LLM.
 */
function synthesizeResearch(results, searchProvider) {
  if (results.length === 0) return '';

  const sections = results.map((r) => {
    const citations = r.citations.length > 0
      ? `\nSources: ${r.citations.slice(0, 5).join(', ')}`
      : '';
    return `### Query: ${r.query}\n\n${r.response_text}${citations}`;
  });

  const totalCitations = results.reduce((s, r) => s + r.citations.length, 0);
  return `## Keyword Research (${searchProvider}, ${results.length} queries, ${totalCitations} sources)\n\n${sections.join('\n\n---\n\n')}`;
}

async function execute(input, options, tools) {
  const { entities } = input;
  const { ai_model, ai_provider, prompt: promptTemplate, reference_docs, temperature, max_tokens,
          keyword_research, search_provider, research_queries } = options;
  const { logger, progress, ai } = tools;

  const results = [];
  const errors = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Planning SEO for ${entity.name || 'entity'}`);

    // Find content-analyzer item via source_submodule
    const items = entity.items || [];
    const analyzerItem = items.findLast(item => item.source_submodule === 'content-analyzer');

    if (!analyzerItem) {
      const errMsg = `No content-analyzer output found. Run content-analyzer first.`;
      logger.error(`${entity.name}: ${errMsg}`);
      errors.push(`${entity.name}: ${errMsg}`);

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          status: 'error',
          primary_keyword: '',
          keyword_plan_preview: '',
          meta_title: '',
          faq_count: 0,
          keywords_text: '',
          keyword_distribution_text: '',
          meta_text: '',
          faqs_text: '',
          tone_notes: '',
          warnings: '',
          error: errMsg,
          seo_plan_json: null,
        }],
        meta: { status: 'error' },
      });
      if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }
      continue;
    }

    try {
      // Keyword research pre-step
      let keywordResearchText = '';
      if (keyword_research && research_queries) {
        try {
          const entityContext = buildEntityContext(entity, analyzerItem);
          const queries = parseResearchQueries(research_queries, entity.name, entityContext);

          if (queries.length > 0) {
            progress.update(i + 1, entities.length, `Researching keywords for ${entity.name || 'entity'}`);
            const researchResults = await runKeywordResearch(queries, tools, search_provider, logger, entity.name);
            keywordResearchText = synthesizeResearch(researchResults, search_provider);
            logger.info(`${entity.name}: keyword research complete — ${researchResults.length}/${queries.length} queries succeeded`);
          }
        } catch (err) {
          logger.warn(`${entity.name}: keyword research failed (${err.message}), using fallback`);
        }
        progress.update(i + 1, entities.length, `Planning SEO for ${entity.name || 'entity'}`);
      }

      logger.info(`${entity.name}: generating SEO plan from analyzer output with ${ai_provider}/${ai_model}`);

      // Use analysis_json as entity content
      const analysisContent = analyzerItem.analysis_json
        ? JSON.stringify(analyzerItem.analysis_json, null, 2)
        : JSON.stringify(analyzerItem, null, 2);

      const prompt = buildPrompt(promptTemplate, analysisContent, reference_docs, keywordResearchText);

      const response = await ai.complete({
        prompt,
        model: ai_model,
        provider: ai_provider,
        temperature,
        max_tokens,
      });

      const plan = parseJsonResponse(response.text);

      // Validate meta lengths (warn, don't fail)
      const metaWarnings = validateMeta(plan.meta || {});

      // Merge LLM-generated warnings with meta validation warnings
      const llmWarnings = Array.isArray(plan.warnings) ? plan.warnings : [];
      const allWarnings = [...metaWarnings, ...llmWarnings];

      // Flatten for display
      const flat = flattenPlan(plan);

      const resultItem = {
        entity_name: entity.name,
        status: 'planned',
        primary_keyword: flat.primary_keyword,
        keyword_plan_preview: flat.keyword_plan_preview,
        meta_title: flat.meta_title,
        faq_count: flat.faq_count,
        // Detail fields
        keywords_text: flat.keywords_text,
        keyword_distribution_text: flat.keyword_distribution_text,
        meta_text: flat.meta_text,
        faqs_text: flat.faqs_text,
        tone_notes: flat.tone_notes,
        warnings: allWarnings.length > 0 ? allWarnings.join('\n') : '',
        error: '',
        // Full JSON carried to pool for content-writer
        seo_plan_json: plan,
      };

      results.push({
        entity_name: entity.name,
        items: [resultItem],
        meta: { status: 'success', warnings: allWarnings },
      });

      if (allWarnings.length > 0) {
        logger.warn(`${entity.name}: SEO plan complete with warnings — ${allWarnings.join('; ')}`);
      } else {
        logger.info(`${entity.name}: SEO plan complete — keyword: "${flat.primary_keyword}", ${flat.faq_count} FAQs`);
      }
      if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }

    } catch (err) {
      logger.error(`${entity.name}: SEO planning failed — ${err.message}`);
      errors.push(`${entity.name}: ${err.message}`);

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          status: 'error',
          primary_keyword: '',
          keyword_plan_preview: '',
          meta_title: '',
          faq_count: 0,
          keywords_text: '',
          keyword_distribution_text: '',
          meta_text: '',
          faqs_text: '',
          tone_notes: '',
          warnings: '',
          error: err.message,
          seo_plan_json: null,
        }],
        meta: { status: 'error' },
      });
      if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }
    }
  }

  const successCount = results.filter(r => r.meta.status === 'success').length;
  const description = errors.length > 0
    ? `${successCount}/${entities.length} SEO plans generated — ${errors.length} error(s)`
    : `${successCount} SEO plans generated successfully`;

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
