/**
 * Meta Output — Step 8 Bundling submodule
 *
 * Extracts and validates SEO metadata from seo_plan_json and analysis_json.
 * Produces a structured meta object per entity with title, description,
 * keywords, and optional OG/Twitter tags.
 *
 * Data-shape routing: finds input by field presence, never by source_submodule.
 */

/**
 * Assemble keywords from analysis categories/tags and SEO target keywords.
 */
function assembleKeywords(analysisJson, seoPlanJson) {
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

  if (seoPlanJson && seoPlanJson.target_keywords) {
    const tk = seoPlanJson.target_keywords;
    if (tk.primary) keywords.add(tk.primary);
    if (Array.isArray(tk.secondary)) {
      for (const kw of tk.secondary) keywords.add(kw);
    }
    if (Array.isArray(tk.long_tail)) {
      for (const kw of tk.long_tail) keywords.add(kw);
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
      const seoPlan = seoItems.at(-1).seo_plan_json;
      const analysis = analysisItems.length > 0 ? analysisItems.at(-1).analysis_json : null;

      // Extract meta title and description
      const metaTitle = (seoPlan.meta && seoPlan.meta.title) || entity.name;
      const metaDescription = (seoPlan.meta && seoPlan.meta.description) || '';
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
        metaObj.keywords = assembleKeywords(analysis, seoPlan);
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

      results.push({
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
      });

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
