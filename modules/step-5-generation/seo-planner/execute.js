/**
 * SEO Planner — Step 5 Generation submodule
 *
 * Takes content-analyzer output and generates a keyword distribution plan:
 * target keywords, meta title/description, optional FAQs, and section-level
 * keyword distribution. The manifest default is fully project-agnostic;
 * pipeline-specific shapes (e.g. company-profile categories/tags/credentials
 * section breakdowns) are added via template-level prompt overrides.
 *
 * v2.0.0: keyword research pre-step via Perplexity Sonar.
 * v2.1.0: configurable perplexity_model, keyword_sources audit field.
 * v2.2.0: manifest default is fully agnostic. New options requires_prompt_override
 *         (per-template fail-loud flag) and faq_count (agnostic-path FAQ count knob).
 *         {faq_count} placeholder interpolation. Defensive parser handles markdown
 *         leakage. Raw LLM output preserved in submodule logs on parse failure.
 *
 * Data operation: ADD (+) — adds SEO plan alongside analysis.
 * Requires content-analyzer to have run first (finds items via source_submodule).
 */

const MANIFEST = require('./manifest.json');
const MANIFEST_DEFAULT_PROMPT = MANIFEST.options_defaults.prompt;

/**
 * Replace prompt placeholders with actual content.
 * - {entity_content} → analysis JSON
 * - {keyword_research} → keyword research results (or fallback to keyword-summary.md)
 * - {faq_count} → configurable FAQ count (agnostic-path knob; override prompts that
 *                 don't use the placeholder are unaffected)
 * - {doc:filename} → reference doc content
 */
function buildPrompt(promptTemplate, entityContent, referenceDocs, keywordResearchText, faqCount) {
  let prompt = promptTemplate.replace(/\{entity_content\}/g, entityContent);

  // Replace {keyword_research} — research results, or fallback to keyword-summary.md, or empty notice
  const keywordFallback = (referenceDocs && referenceDocs['keyword-summary.md']) || '';
  const keywordData = keywordResearchText || keywordFallback || 'No keyword research data available.';
  prompt = prompt.replace(/\{keyword_research\}/g, keywordData);

  // Replace {faq_count} with the configured count. Override prompts that don't
  // include the placeholder are unaffected; for them the override's own FAQ
  // instructions remain authoritative.
  prompt = prompt.replace(/\{faq_count\}/g, String(faqCount ?? 0));

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
 * Parse JSON from an LLM response.
 *
 * Strategy:
 *   1. Strip a single outer ```json fence if present
 *   2. Trim to the substring between the first `{` and the last `}`
 *   3. Try JSON.parse. If it succeeds, return the parsed plan.
 *   4. On failure, run a defensive cleaner that removes markdown-heading
 *      lines (^#.*) inside the JSON region — defense against the
 *      `# KEYWORD PLAN ... { "target_keywords": ... }` leak pattern
 *      observed in 2026-06-08 production runs.
 *   5. On final failure, throw an Error whose `.rawText` property carries
 *      the original (pre-cleanup) LLM response so the catch block can
 *      preserve it in the submodule_run logs for forensic analysis.
 */
function parseJsonResponse(text) {
  const original = typeof text === 'string' ? text : String(text ?? '');
  let cleaned = original.trim();

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

  try {
    return JSON.parse(cleaned);
  } catch (firstErr) {
    // Defensive pass: strip markdown heading lines that may have leaked
    // INTO the JSON region. A line starting with `#` is never valid JSON
    // (no JSON key/value begins with `#`), so removing such lines cannot
    // corrupt valid JSON, and may recover it from a markdown-laced response.
    const stripped = cleaned
      .split('\n')
      .filter(line => !/^\s*#/.test(line))
      .join('\n')
      .trim();
    try {
      return JSON.parse(stripped);
    } catch (secondErr) {
      const err = new Error(`JSON parse failed after defensive cleanup: ${secondErr.message}`);
      err.rawText = original;
      err.firstError = firstErr.message;
      err.secondError = secondErr.message;
      throw err;
    }
  }
}

/**
 * Call the model and parse its JSON response, with ONE corrective retry.
 *
 * Failure mode this guards (observed 2026-06-13, Wazdan + Pronet): the model
 * returns a markdown/prose plan instead of a JSON object, so parseJsonResponse
 * throws. The retry re-issues the call at temperature 0 with a strict
 * JSON-only correction that INCLUDES the prior (invalid) response, asking the
 * model to re-output the same information as a single JSON object — a reformat,
 * which models comply with far more reliably than a fresh generation.
 *
 * Pipeline-agnostic: the correction names no content-type-specific keys; it
 * only constrains the OUTPUT FORMAT. On a second failure it throws, preserving
 * .rawText (the retry response) for forensic logging — i.e. it stays loud.
 */
async function completeWithJsonRetry(ai, baseOpts, logger, entityName) {
  const first = await ai.complete(baseOpts);
  try {
    return parseJsonResponse(first.text);
  } catch (firstErr) {
    logger.warn(
      `${entityName}: SEO plan response was not valid JSON (${firstErr.message}) — ` +
      `retrying once with a strict JSON-only correction.`
    );
    const correction =
      'Your previous response was NOT valid JSON — it contained markdown, headings, prose, or code fences.\n\n' +
      'Re-output the EXACT SAME information as ONLY a single valid JSON object and nothing else: ' +
      'no markdown, no "#" headings, no "**" bold, no prose, no commentary, no code fences, no preamble. ' +
      'Your response MUST start with "{" and end with "}".\n\n' +
      'Your previous (invalid) response was:\n' + (first.text || '');
    const second = await ai.complete({ ...baseOpts, prompt: correction, temperature: 0 });
    try {
      return parseJsonResponse(second.text);
    } catch (secondErr) {
      secondErr.rawText = second.text;
      secondErr.firstAttemptText = first.text;
      throw secondErr;
    }
  }
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
 *
 * The manifest default emits target_keywords + meta + faqs + keyword_distribution
 * as a free-form object (typically {}). Company-profile overrides emit the same
 * shape PLUS keyword_distribution sub-objects for overview/categories/tags/
 * credentials/faq sections — this function renders those when present so the
 * UI can display them, but does not require them.
 *
 * Backwards-compat: also handles v1.2.0 content_outline schema if encountered.
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

  const dist = plan.keyword_distribution;
  let keywordDistText = '';
  let keywordDistPreview = '';

  if (dist && typeof dist === 'object' && !Array.isArray(dist)) {
    const lines = [];

    // Overview (company-profile override and any other override with this section)
    if (dist.overview) {
      lines.push('Overview:');
      if (dist.overview.headline_keywords?.length) {
        lines.push(`  Headline: ${dist.overview.headline_keywords.join(', ')}`);
      }
      if (dist.overview.body_keywords?.length) {
        lines.push(`  Body: ${dist.overview.body_keywords.join(', ')}`);
      }
    }

    // Categories (company-profile override)
    const cats = Array.isArray(dist.categories) ? dist.categories : [];
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

    // Tags (company-profile override)
    const tags = Array.isArray(dist.tags) ? dist.tags : [];
    if (tags.length > 0) {
      lines.push('');
      lines.push('Tags:');
      for (const tag of tags) {
        if (tag.keywords?.length) {
          lines.push(`  ${tag.tag_slug}: ${tag.keywords.join(', ')}`);
        }
      }
    }

    // Credentials (company-profile override)
    if (dist.credentials?.keywords?.length) {
      lines.push('');
      lines.push(`Credentials: ${dist.credentials.keywords.join(', ')}`);
    }

    // FAQ section keywords (company-profile override)
    if (dist.faq?.keywords?.length) {
      lines.push('');
      lines.push(`FAQ: ${dist.faq.keywords.join(', ')}`);
    }

    // Any other custom sections (other overrides) — render generically
    const knownKeys = new Set(['overview', 'categories', 'tags', 'credentials', 'faq']);
    for (const [secName, secVal] of Object.entries(dist)) {
      if (knownKeys.has(secName)) continue;
      if (secVal && typeof secVal === 'object') {
        const flat = JSON.stringify(secVal);
        if (flat !== '{}' && flat !== '[]') {
          lines.push('');
          lines.push(`${secName}: ${flat.slice(0, 200)}${flat.length > 200 ? '…' : ''}`);
        }
      }
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
    if (totalUniqueKeywords.size === 0) {
      // Agnostic path — show target_keywords counts instead
      const tk = keywords.secondary?.length || 0;
      const lt = keywords.long_tail?.length || 0;
      keywordDistPreview = `target_keywords: ${tk} secondary, ${lt} long-tail`;
    } else {
      keywordDistPreview = `${cats.length} categories, ${tags.length} tags, ${totalUniqueKeywords.size} unique keywords`;
    }

  } else if (plan.content_outline) {
    // Backwards-compat: v1.2.0 content_outline format
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
  } else {
    // No distribution at all — agnostic path with no format spec
    const tk = keywords.secondary?.length || 0;
    const lt = keywords.long_tail?.length || 0;
    keywordDistText = 'No section-level distribution (no format_spec.md provided)';
    keywordDistPreview = `target_keywords: ${tk} secondary, ${lt} long-tail`;
  }

  // Meta text with character counts
  const titleChars = meta.title_chars || (meta.title ? meta.title.length : 0);
  const descChars = meta.description_chars || (meta.description ? meta.description.length : 0);
  const metaText = [
    `Title: ${meta.title || 'Not generated'} (${titleChars} chars)`,
    `Description: ${meta.description || 'Not generated'} (${descChars} chars)`,
  ].join('\n');

  // FAQs text
  const faqsText = faqs.length === 0
    ? 'No FAQs requested'
    : faqs.map((faq, i) => {
        const direction = faq.answer_brief || faq.answer || '';
        const keyword = faq.target_keyword ? `\nKeyword: ${faq.target_keyword}` : '';
        return `Q${i + 1}: ${faq.question}\nDirection: ${direction}${keyword}`;
      }).join('\n\n');

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
 * Tries common fields across pipeline types (company profiles, news, etc.).
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
 *
 * Splits on `Query N —` markers when present (multi-line queries with shared preamble).
 * Falls back to one-query-per-line when no markers are found (simple flat lists).
 *
 * Marker matches: "Query 1 —", "Query 2 -", "Query 3 –" at start of a line.
 */
function parseResearchQueries(template, entityName, entityContext) {
  const interpolate = (s) => s
    .replace(/\{entity_name\}/g, entityName)
    .replace(/\{entity_context\}/g, entityContext);

  const MARKER = /^Query\s+\d+\s*[—–-]/m;

  if (MARKER.test(template)) {
    const parts = template.split(/^(?=Query\s+\d+\s*[—–-])/m);
    const startsWithMarker = MARKER.test(parts[0]);
    const preamble = startsWithMarker ? '' : parts[0].trim();
    const queryChunks = (startsWithMarker ? parts : parts.slice(1))
      .map(c => c.trim())
      .filter(c => c.length > 0);
    return queryChunks.map(chunk => interpolate(
      preamble ? `${preamble}\n\n${chunk}` : chunk
    ));
  }

  return template
    .split('\n')
    .map(q => q.trim())
    .filter(q => q.length > 0)
    .map(interpolate);
}

/**
 * Run keyword research queries in parallel via the search provider.
 * Uses Promise.allSettled so partial failures don't kill the entire step.
 */
async function runKeywordResearch(queries, tools, searchProvider, searchModel, logger, entityName) {
  if (queries.length > 5) {
    logger.warn(`${entityName}: ${queries.length} research queries configured (recommended: ≤5). Consider reducing to control costs.`);
  }

  logger.info(`${entityName}: running ${queries.length} research queries via ${searchProvider}/${searchModel}`);

  const promises = queries.map((query, idx) => {
    logger.info(`${entityName}: research query ${idx + 1}/${queries.length}: ${query.slice(0, 80)}...`);
    return tools.ai.complete({
      prompt: query,
      model: searchModel,
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

/**
 * Build the error-result item for a single entity when the run cannot proceed.
 */
function buildErrorItem(entityName, errMsg) {
  return {
    entity_name: entityName,
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
  };
}

async function execute(input, options, tools) {
  const { entities } = input;
  const {
    ai_model, ai_provider, prompt: promptTemplate, reference_docs,
    temperature, max_tokens,
    keyword_research, search_provider, perplexity_model, research_queries,
    faq_count, requires_prompt_override,
  } = options;
  const { logger, progress, ai } = tools;

  const results = [];
  const errors = [];

  // Refusal check: per-template fail-loud flag. When a template sets
  // requires_prompt_override = true via preset_map.<sub>.fallback_values, and
  // no prompt override is configured (so options.prompt === the manifest default),
  // refuse the run early with a clear actionable error. The manifest default
  // remains a valid run path when this flag is not set.
  if (requires_prompt_override === true && promptTemplate === MANIFEST_DEFAULT_PROMPT) {
    const errMsg = 'Template requires a seo-planner prompt override but none is configured. Upload a prompt override in this template\'s seo-planner settings, or unset requires_prompt_override on this template.';
    logger.error(`seo-planner refused run: ${errMsg}`);
    for (const entity of entities) {
      errors.push(`${entity.name}: ${errMsg}`);
      results.push({
        entity_name: entity.name,
        items: [buildErrorItem(entity.name, errMsg)],
        meta: { status: 'error' },
      });
    }
    if (tools._partialItems) {
      tools._partialItems.length = 0;
      tools._partialItems.push(...results.flatMap(r => r.items));
    }
    return {
      results,
      summary: {
        total_entities: entities.length,
        total_items: 0,
        description: `0/${entities.length} SEO plans generated — refused: template requires prompt override`,
        errors,
      },
    };
  }

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
        items: [buildErrorItem(entity.name, errMsg)],
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
            const researchResults = await runKeywordResearch(queries, tools, search_provider, perplexity_model, logger, entity.name);
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

      const prompt = buildPrompt(promptTemplate, analysisContent, reference_docs, keywordResearchText, faq_count);

      let plan;
      try {
        // Call + parse with ONE corrective retry if the model returns
        // markdown/prose instead of JSON (see completeWithJsonRetry).
        plan = await completeWithJsonRetry(
          ai,
          { prompt, model: ai_model, provider: ai_provider, temperature, max_tokens },
          logger,
          entity.name
        );
      } catch (parseErr) {
        // Forensic preservation: log the raw LLM response so the next failure
        // is debuggable in minutes rather than hours.
        const rawSnippet = (parseErr.rawText || '').slice(0, 2000);
        logger.error(
          `${entity.name}: JSON parse failed after corrective retry — ${parseErr.firstError || parseErr.message}. ` +
          `Raw retry response (first 2000 chars): ${JSON.stringify(rawSnippet)}`
        );
        throw parseErr;
      }

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
        items: [buildErrorItem(entity.name, err.message)],
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
// Exported for test harness use only — not part of the public submodule interface.
module.exports.__testing = { parseJsonResponse, completeWithJsonRetry, parseResearchQueries, buildPrompt, MANIFEST_DEFAULT_PROMPT };
