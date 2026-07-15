/**
 * Meta Output — Step 8 Bundling submodule
 *
 * Extracts and validates SEO metadata from the entity pool. Produces a
 * structured meta object per entity with title, description, keywords, and
 * optional OG/Twitter tags.
 *
 * Meta resolution mirrors meta-compliance-checker's priority order EXACTLY —
 * the QA check is only honest if it validates what ships (BACKLOG #52):
 *   1. Direct meta_title / meta_description fields on any pool item
 *      (content-writer emits the planner candidate here since v1.6.2)
 *   2. YAML frontmatter in content_markdown
 *   3. The SEO plan: seo_plan_json.meta.{title,description} (legacy), then
 *      seo_plan_json.sections.meta.meta_{title,description}.candidate
 *   4. H1 / first-paragraph heuristics from content_markdown
 *   5. entity.name / '' (last resort — flagged via length warnings)
 * The three helper extractors are self-contained copies of the checker's
 * (Rule 4); a shared resolver across writer + checker + meta-output is the
 * noted future de-dup.
 *
 * Data-shape routing: finds input by field presence, never by source_submodule.
 */

/**
 * Try to extract meta_title and meta_description from YAML frontmatter
 * in a content_markdown string.
 */
function extractMetaFromFrontmatter(markdown) {
  if (!markdown || typeof markdown !== 'string') return {};

  const frontmatterMatch = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return {};

  const frontmatter = frontmatterMatch[1];
  const result = {};

  const titleMatch = frontmatter.match(/^(?:meta_title|title)\s*:\s*["']?(.*?)["']?\s*$/m);
  if (titleMatch) result.meta_title = titleMatch[1].trim();

  const descMatch = frontmatter.match(/^(?:meta_description|description)\s*:\s*["']?(.*?)["']?\s*$/m);
  if (descMatch) result.meta_description = descMatch[1].trim();

  return result;
}

/**
 * Try to extract a title from the first H1 in markdown content.
 */
function extractTitleFromH1(markdown) {
  if (!markdown || typeof markdown !== 'string') return null;
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  return h1Match ? h1Match[1].trim() : null;
}

/**
 * Try to extract a description from the first non-heading paragraph in markdown.
 */
function extractDescriptionFromFirstParagraph(markdown) {
  if (!markdown || typeof markdown !== 'string') return null;

  let content = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');

  const lines = content.split('\n');
  const paragraphLines = [];
  let foundContent = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (foundContent) break;
      continue;
    }
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('---') || trimmed.startsWith('===')) continue;
    foundContent = true;
    paragraphLines.push(trimmed);
  }

  return paragraphLines.length > 0 ? paragraphLines.join(' ') : null;
}

/**
 * Resolve meta title + description from the entity pool, in the checker's
 * priority order (see module docstring). Returns nulls when nothing resolves;
 * the caller applies the entity-name / empty-string last resort.
 */
function resolveMeta(items) {
  const contentItems = items.filter(
    item => item.meta_title || item.meta_description || item.content_markdown
  );
  const seoItems = items.filter(item => item.seo_plan_json);

  let metaTitle = null;
  let metaDescription = null;

  // Priority 1: direct fields on any item
  for (const item of contentItems) {
    if (item.meta_title && !metaTitle) metaTitle = item.meta_title;
    if (item.meta_description && !metaDescription) metaDescription = item.meta_description;
  }

  // Priority 2: YAML frontmatter in content_markdown
  if (!metaTitle || !metaDescription) {
    for (const item of contentItems) {
      if (item.content_markdown) {
        const extracted = extractMetaFromFrontmatter(item.content_markdown);
        if (!metaTitle && extracted.meta_title) metaTitle = extracted.meta_title;
        if (!metaDescription && extracted.meta_description) metaDescription = extracted.meta_description;
      }
    }
  }

  // Priority 3: the SEO plan — legacy top-level meta, then the planner's
  // length-validated candidates
  if (!metaTitle || !metaDescription) {
    for (const item of seoItems) {
      const plan = item.seo_plan_json;
      if (!plan) continue;
      if (plan.meta) {
        if (!metaTitle && plan.meta.title) metaTitle = plan.meta.title;
        if (!metaDescription && plan.meta.description) metaDescription = plan.meta.description;
      }
      const planMeta = plan.sections && plan.sections.meta;
      if (planMeta) {
        if (!metaTitle && planMeta.meta_title && planMeta.meta_title.candidate) {
          metaTitle = planMeta.meta_title.candidate;
        }
        if (!metaDescription && planMeta.meta_description && planMeta.meta_description.candidate) {
          metaDescription = planMeta.meta_description.candidate;
        }
      }
    }
  }

  // Priority 4 (heuristics): H1 for title, first paragraph for description
  if (!metaTitle) {
    for (const item of contentItems) {
      if (item.content_markdown) {
        const h1Title = extractTitleFromH1(item.content_markdown);
        if (h1Title) { metaTitle = h1Title; break; }
      }
    }
  }
  if (!metaDescription) {
    for (const item of contentItems) {
      if (item.content_markdown) {
        const para = extractDescriptionFromFirstParagraph(item.content_markdown);
        if (para) { metaDescription = para; break; }
      }
    }
  }

  return { metaTitle, metaDescription };
}

/**
 * Extract keywords from a single seo_plan_json — mirrors the checker's
 * extractHeadTerms (v1.0.1): head_terms, top-level target_keywords,
 * per-section target_keywords (seo-planner's actual output shape),
 * keyword_summary_table, flat keywords. Section iteration is generic
 * (Object.values) — pipeline-agnostic.
 */
function addTargetKeywords(tk, terms) {
  if (!tk || typeof tk !== 'object') return;
  const push = v => { if (typeof v === 'string' && v.trim()) terms.add(v.trim().toLowerCase()); };
  push(tk.primary);
  if (Array.isArray(tk.primary)) tk.primary.forEach(push);
  if (Array.isArray(tk.secondary)) tk.secondary.forEach(push);
  if (Array.isArray(tk.long_tail)) tk.long_tail.forEach(push);
}

function extractPlanKeywords(seoPlanJson) {
  if (!seoPlanJson) return [];

  const terms = new Set();

  if (Array.isArray(seoPlanJson.head_terms)) {
    for (const t of seoPlanJson.head_terms) {
      if (typeof t === 'string' && t.trim()) terms.add(t.trim().toLowerCase());
    }
  }

  addTargetKeywords(seoPlanJson.target_keywords, terms);

  if (seoPlanJson.sections && typeof seoPlanJson.sections === 'object') {
    for (const section of Object.values(seoPlanJson.sections)) {
      if (section && typeof section === 'object') addTargetKeywords(section.target_keywords, terms);
    }
  }

  if (Array.isArray(seoPlanJson.keyword_summary_table)) {
    for (const row of seoPlanJson.keyword_summary_table) {
      if (row && typeof row.keyword === 'string' && row.keyword.trim()) {
        terms.add(row.keyword.trim().toLowerCase());
      }
    }
  }

  if (Array.isArray(seoPlanJson.keywords)) {
    for (const kw of seoPlanJson.keywords) {
      if (typeof kw === 'string' && kw.trim()) terms.add(kw.trim().toLowerCase());
    }
  }

  return [...terms];
}

/**
 * Assemble keywords from analysis categories/tags and SEO plan keywords.
 */
function assembleKeywords(analysisJson, seoItems) {
  const keywords = new Set();

  if (analysisJson) {
    // Categories: { primary: [{slug}], secondary: [{slug}] }
    if (analysisJson.categories) {
      if (Array.isArray(analysisJson.categories.primary)) {
        for (const c of analysisJson.categories.primary) keywords.add(c.slug || String(c));
      }
      if (Array.isArray(analysisJson.categories.secondary)) {
        for (const c of analysisJson.categories.secondary) keywords.add(c.slug || String(c));
      }
    }
    // Tags: { existing: [{slug}], suggested_new: [{label}] }
    if (analysisJson.tags) {
      if (Array.isArray(analysisJson.tags.existing)) {
        for (const t of analysisJson.tags.existing) keywords.add(t.slug || String(t));
      }
      if (Array.isArray(analysisJson.tags.suggested_new)) {
        for (const t of analysisJson.tags.suggested_new) keywords.add(t.label || t.slug || String(t));
      }
    }
  }

  // First plan with any extractable keywords wins — same selection the
  // checker uses for head_terms
  for (const item of seoItems) {
    const terms = extractPlanKeywords(item.seo_plan_json);
    if (terms.length > 0) {
      for (const t of terms) keywords.add(t);
      break;
    }
  }

  return [...keywords];
}

/**
 * Generate a URL-safe slug from a string.
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .replace(/^-|-$/g, '');
}

async function execute(input, options, tools) {
  const { entities } = input;
  const {
    max_title_length = 60,
    min_description_length = 150,
    max_description_length = 160,
    include_keywords_array = true,
    include_og_tags = true,
    include_twitter_tags = false,
  } = options;
  const { logger, progress } = tools;

  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Processing ${entity.name}`);

    // Data-shape routing
    const seoItems = (entity.items || []).filter(item => item.seo_plan_json);
    const analysisItems = (entity.items || []).filter(item => item.analysis_json);

    // SEO plan is required
    if (!seoItems.length) {
      logger.warn(`${entity.name}: no items with seo_plan_json`);
      results.push({
        entity_name: entity.name,
        items: [],
        error: 'No items with seo_plan_json found — SEO plan is required input',
        meta: { errors: 1 },
      });
      continue;
    }

    try {
      const analysis = analysisItems.length > 0 ? analysisItems.at(-1).analysis_json : null;

      // Resolve meta in the checker's priority order, then last-resort fallback
      const resolved = resolveMeta(entity.items || []);
      const metaTitle = resolved.metaTitle || entity.name;
      const metaDescription = resolved.metaDescription || '';
      const titleLength = metaTitle.length;
      const descriptionLength = metaDescription.length;

      // Validate lengths
      const warnings = [];
      if (titleLength > max_title_length) {
        warnings.push(`Title too long: ${titleLength}/${max_title_length}`);
      }
      if (descriptionLength < min_description_length) {
        warnings.push(`Description too short: ${descriptionLength}/${min_description_length}`);
      }
      if (descriptionLength > max_description_length) {
        warnings.push(`Description too long: ${descriptionLength}/${max_description_length}`);
      }

      const status = warnings.length > 0 ? 'warning' : 'ok';

      // Build meta object
      const metaObj = {
        title: metaTitle,
        description: metaDescription,
        slug: slugify(entity.name),
      };

      // Keywords
      let keywordCount = 0;
      if (include_keywords_array) {
        metaObj.keywords = assembleKeywords(analysis, seoItems);
        keywordCount = metaObj.keywords.length;
      }

      // Open Graph tags
      if (include_og_tags) {
        metaObj.og = {
          'og:title': metaTitle,
          'og:description': metaDescription,
          'og:type': 'article',
        };
      }

      // Twitter Card tags
      if (include_twitter_tags) {
        metaObj.twitter = {
          'twitter:card': 'summary',
          'twitter:title': metaTitle,
          'twitter:description': metaDescription,
        };
      }

      if (warnings.length > 0) {
        metaObj.warnings = warnings;
        logger.warn(`${entity.name}: ${warnings.join('; ')}`);
      }

      const entityResult = {
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          meta_title: metaTitle,
          meta_description: metaDescription,
          title_length: titleLength,
          description_length: descriptionLength,
          keyword_count: keywordCount,
          status,
          meta_json: JSON.stringify(metaObj, null, 2),
        }],
        meta: { status, keyword_count: keywordCount, warnings },
      };
      results.push(entityResult);
      if (tools._partialItems) tools._partialItems.push(...entityResult.items);

      logger.info(`${entity.name}: title=${titleLength}ch, desc=${descriptionLength}ch, keywords=${keywordCount}, status=${status}`);
    } catch (err) {
      logger.error(`${entity.name}: ${err.message}`);
      results.push({
        entity_name: entity.name,
        items: [],
        error: err.message,
        meta: { errors: 1 },
      });
    }
  }

  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
  const errors = results.filter(r => r.error).map(r => `${r.entity_name}: ${r.error}`);
  const warningCount = results.filter(r => r.items.length > 0 && r.items[0].status === 'warning').length;

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      description: `${totalItems} meta outputs from ${entities.length} entities${warningCount ? ` (${warningCount} with warnings)` : ''}${errors.length ? ` (${errors.length} failed)` : ''}`,
      errors,
    },
  };
}

module.exports = execute;
