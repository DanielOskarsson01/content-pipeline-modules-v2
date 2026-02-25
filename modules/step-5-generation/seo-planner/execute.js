/**
 * SEO Planner — Step 5 Generation submodule
 *
 * Takes content-analyzer output and generates an SEO keyword distribution plan:
 * target keywords mapped to predefined sections, meta title/description, and FAQs.
 *
 * v1.3.0: Keyword distribution only — does NOT define article structure
 * (structure is fixed in format_spec.md).
 *
 * Data operation: ADD (+) — adds SEO plan alongside analysis.
 * Requires content-analyzer to have run first (finds items via source_submodule).
 */

/**
 * Replace prompt placeholders with actual content.
 * - {entity_content} → analysis JSON
 * - {doc:filename} → reference doc content
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

async function execute(input, options, tools) {
  const { entities } = input;
  const { ai_model, ai_provider, prompt: promptTemplate, reference_docs } = options;
  const { logger, progress, ai } = tools;

  const results = [];
  const errors = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Planning SEO for ${entity.name || 'entity'}`);

    // Find content-analyzer item via source_submodule
    const items = entity.items || [];
    const analyzerItem = items.find(item => item.source_submodule === 'content-analyzer');

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
      continue;
    }

    try {
      logger.info(`${entity.name}: generating SEO plan from analyzer output with ${ai_provider}/${ai_model}`);

      // Use analysis_json as entity content
      const analysisContent = analyzerItem.analysis_json
        ? JSON.stringify(analyzerItem.analysis_json, null, 2)
        : JSON.stringify(analyzerItem, null, 2);

      const prompt = buildPrompt(promptTemplate, analysisContent, reference_docs);

      const response = await ai.complete({
        prompt,
        model: ai_model,
        provider: ai_provider,
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
