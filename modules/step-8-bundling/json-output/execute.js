/**
 * JSON Output — Step 8 Bundling submodule
 *
 * Assembles a single JSON object per entity from all available data shapes.
 * Supports Strapi-ready, flat, and custom output formats.
 *
 * Data-shape routing: finds input by field presence, never by source_submodule.
 */

/**
 * Build Strapi-ready JSON structure.
 * Nests content under CMS-friendly field names.
 */
function buildStrapiFormat(entityName, data, opts) {
  const obj = { name: entityName };

  if (opts.include_markdown && data.markdown) {
    obj.content = data.markdown;
  }

  if (opts.include_analysis && data.analysis) {
    const a = data.analysis;
    // Categories: { primary: [{slug, why, source}], secondary: [{slug, ...}] }
    if (a.categories) {
      if (Array.isArray(a.categories.primary) && a.categories.primary.length > 0) {
        obj.primary_category = a.categories.primary[0].slug;
        obj.primary_category_slug = a.categories.primary[0].slug;
      }
      if (Array.isArray(a.categories.secondary) && a.categories.secondary.length > 0) {
        obj.secondary_category = a.categories.secondary[0].slug;
        obj.secondary_category_slug = a.categories.secondary[0].slug;
      }
      // All category slugs as flat array
      obj.categories = [
        ...(Array.isArray(a.categories.primary) ? a.categories.primary.map(c => c.slug) : []),
        ...(Array.isArray(a.categories.secondary) ? a.categories.secondary.map(c => c.slug) : []),
      ];
    }
    // Tags: { existing: [{slug}], suggested_new: [{label}] }
    if (a.tags) {
      const tags = [];
      if (Array.isArray(a.tags.existing)) tags.push(...a.tags.existing.map(t => t.slug || t));
      if (Array.isArray(a.tags.suggested_new)) tags.push(...a.tags.suggested_new.map(t => t.label || t.slug || t));
      obj.tags = tags;
    }
    if (a.key_facts) {
      if (opts.flatten_key_facts) {
        for (const [key, val] of Object.entries(a.key_facts)) {
          obj[key] = val;
        }
      } else {
        obj.key_facts = a.key_facts;
      }
    }
    if (a.source_citations) {
      obj.sources = a.source_citations;
    }
  }

  if (opts.include_seo_plan && data.seo) {
    obj.seo = {
      meta_title: data.seo.meta ? data.seo.meta.title : undefined,
      meta_description: data.seo.meta ? data.seo.meta.description : undefined,
      target_keywords: data.seo.target_keywords || undefined,
      faqs: data.seo.faqs || undefined,
    };
    // Remove undefined values
    for (const key of Object.keys(obj.seo)) {
      if (obj.seo[key] === undefined) delete obj.seo[key];
    }
  }

  return obj;
}

/**
 * Build flat JSON structure — all fields at top level.
 */
function buildFlatFormat(entityName, data, opts) {
  const obj = { entity_name: entityName };

  if (opts.include_markdown && data.markdown) {
    obj.content_markdown = data.markdown;
  }

  if (opts.include_analysis && data.analysis) {
    obj.analysis = data.analysis;
  }

  if (opts.include_seo_plan && data.seo) {
    obj.seo_plan = data.seo;
  }

  return obj;
}

function countFields(obj) {
  let count = 0;
  for (const val of Object.values(obj)) {
    count++;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      count += countFields(val);
    }
  }
  return count;
}

async function execute(input, options, tools) {
  const { entities } = input;
  const {
    output_format = 'strapi',
    include_markdown = true,
    include_analysis = true,
    include_seo_plan = true,
    flatten_key_facts = false,
  } = options;
  const { logger, progress } = tools;

  const opts = { include_markdown, include_analysis, include_seo_plan, flatten_key_facts };
  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Processing ${entity.name}`);

    // Data-shape routing: use latest item for each shape (supports re-runs
    // and tone-seo-editor refinement chain via add data operation)
    const markdownItems = (entity.items || []).filter(item => item.content_markdown);
    const analysisItems = (entity.items || []).filter(item => item.analysis_json);
    const seoItems = (entity.items || []).filter(item => item.seo_plan_json);

    // json-output works with ANY available data shape — no hard requirement
    if (!markdownItems.length && !analysisItems.length && !seoItems.length) {
      logger.warn(`${entity.name}: no items with any recognized data shape`);
      results.push({
        entity_name: entity.name,
        items: [],
        error: 'No items with content_markdown, analysis_json, or seo_plan_json found',
        meta: { errors: 1 },
      });
      continue;
    }

    try {
      // Use latest item for each shape (last in pool = most recent)
      const data = {
        markdown: markdownItems.length > 0 ? markdownItems.at(-1).content_markdown : null,
        analysis: analysisItems.length > 0 ? analysisItems.at(-1).analysis_json : null,
        seo: seoItems.length > 0 ? seoItems.at(-1).seo_plan_json : null,
      };

      let jsonObj;
      if (output_format === 'flat') {
        jsonObj = buildFlatFormat(entity.name, data, opts);
      } else {
        jsonObj = buildStrapiFormat(entity.name, data, opts);
      }

      const jsonString = JSON.stringify(jsonObj, null, 2);
      const sizeKb = Math.round(Buffer.byteLength(jsonString, 'utf8') / 1024 * 10) / 10;
      const fieldCount = countFields(jsonObj);

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          final_json: jsonString,
          field_count: fieldCount,
          json_size_kb: sizeKb,
          has_markdown: markdownItems.length > 0,
          has_analysis: analysisItems.length > 0,
          has_seo_plan: seoItems.length > 0,
        }],
        meta: { field_count: fieldCount, json_size_kb: sizeKb },
      });

      logger.info(`${entity.name}: ${fieldCount} fields, ${sizeKb}KB JSON (${output_format} format)`);
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

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalItems,
      description: `${totalItems} JSON outputs from ${entities.length} entities${errors.length ? ` (${errors.length} failed)` : ''}`,
      errors,
    },
  };
}

module.exports = execute;
