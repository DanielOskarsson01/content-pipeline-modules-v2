/**
 * Meta Compliance Checker -- Step 6 QA submodule
 *
 * Validates that generated content's meta title and meta description meet
 * SEO length requirements and contain target keywords from the SEO plan.
 *
 * Data operation: TRANSFORM (=) -- same items, enriched with QA verdicts.
 * Data-shape routing: finds input by field presence, never by source_submodule.
 *
 * Checks performed:
 *   1. Meta title length <= max (default 60)
 *   2. Meta title length >= 30 (warn if too short)
 *   3. Meta description length within range (default 150-160)
 *   4. Keyword presence in title (head_terms from seo_plan_json)
 *   5. Keyword presence in description
 *   6. No truncation indicators ("..." or "...")
 *   7. No duplicate meta across entities in the same run
 */

/**
 * Try to extract meta_title and meta_description from YAML frontmatter
 * in a content_markdown string. Handles the common pattern:
 *
 *   ---
 *   title: "Some Title"
 *   description: "Some description"
 *   ---
 */
function extractMetaFromFrontmatter(markdown) {
  if (!markdown || typeof markdown !== 'string') return {};

  const frontmatterMatch = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return {};

  const frontmatter = frontmatterMatch[1];
  const result = {};

  // Extract title -- handles quoted and unquoted values
  const titleMatch = frontmatter.match(/^(?:meta_title|title)\s*:\s*["']?(.*?)["']?\s*$/m);
  if (titleMatch) result.meta_title = titleMatch[1].trim();

  // Extract description
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

  // Remove frontmatter if present
  let content = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');

  // Split into lines, skip headings and empty lines, take first paragraph
  const lines = content.split('\n');
  const paragraphLines = [];
  let foundContent = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (foundContent) break; // End of first paragraph
      continue;
    }
    if (trimmed.startsWith('#')) continue; // Skip headings
    if (trimmed.startsWith('---') || trimmed.startsWith('===')) continue;
    foundContent = true;
    paragraphLines.push(trimmed);
  }

  return paragraphLines.length > 0 ? paragraphLines.join(' ') : null;
}

/**
 * Extract head_terms from seo_plan_json. Handles multiple shapes:
 *   - seo_plan_json.head_terms (array of strings)
 *   - seo_plan_json.target_keywords.primary (string)
 *   - seo_plan_json.target_keywords.secondary (array of strings)
 *   - seo_plan_json.keywords (array of strings)
 */
function extractHeadTerms(seoPlanJson) {
  if (!seoPlanJson) return [];

  const terms = new Set();

  // Direct head_terms array
  if (Array.isArray(seoPlanJson.head_terms)) {
    for (const t of seoPlanJson.head_terms) {
      if (typeof t === 'string' && t.trim()) terms.add(t.trim().toLowerCase());
    }
  }

  // target_keywords structure (from seo-planner)
  if (seoPlanJson.target_keywords) {
    const tk = seoPlanJson.target_keywords;
    if (typeof tk.primary === 'string' && tk.primary.trim()) {
      terms.add(tk.primary.trim().toLowerCase());
    }
    if (Array.isArray(tk.secondary)) {
      for (const kw of tk.secondary) {
        if (typeof kw === 'string' && kw.trim()) terms.add(kw.trim().toLowerCase());
      }
    }
  }

  // Flat keywords array
  if (Array.isArray(seoPlanJson.keywords)) {
    for (const kw of seoPlanJson.keywords) {
      if (typeof kw === 'string' && kw.trim()) terms.add(kw.trim().toLowerCase());
    }
  }

  return [...terms];
}

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress } = tools;
  const {
    title_max_length = 60,
    description_min_length = 150,
    description_max_length = 160,
    require_keyword_in_title = true,
    require_keyword_in_description = true,
    pass_threshold = 1.0,
  } = options;

  logger.info(
    `Config: title_max=${title_max_length}, desc_range=${description_min_length}-${description_max_length}, ` +
    `keyword_in_title=${require_keyword_in_title}, keyword_in_desc=${require_keyword_in_description}, ` +
    `pass_threshold=${pass_threshold}`
  );

  const results = [];

  // Track meta values across all entities for duplicate detection
  const seenTitles = new Map();   // title -> [entity_names]
  const seenDescriptions = new Map(); // description -> [entity_names]

  // First pass: collect meta for each entity
  const entityMetas = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Checking ${entity.name}`);

    // --- Data-shape routing: find content and SEO items by field presence ---
    const contentItems = (entity.items || []).filter(
      item => item.meta_title || item.meta_description || item.content_markdown
    );
    const seoItems = (entity.items || []).filter(item => item.seo_plan_json);

    // Resolve meta_title and meta_description
    let metaTitle = null;
    let metaDescription = null;

    // Priority 1: direct fields on any item
    for (const item of contentItems) {
      if (item.meta_title && !metaTitle) metaTitle = item.meta_title;
      if (item.meta_description && !metaDescription) metaDescription = item.meta_description;
    }

    // Priority 2: extract from YAML frontmatter in content_markdown
    if (!metaTitle || !metaDescription) {
      for (const item of contentItems) {
        if (item.content_markdown) {
          const extracted = extractMetaFromFrontmatter(item.content_markdown);
          if (!metaTitle && extracted.meta_title) metaTitle = extracted.meta_title;
          if (!metaDescription && extracted.meta_description) metaDescription = extracted.meta_description;
        }
      }
    }

    // Priority 3: H1 for title, first paragraph for description
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

    // Priority 4: check SEO plan for meta
    if (!metaTitle || !metaDescription) {
      for (const item of seoItems) {
        const plan = item.seo_plan_json;
        if (plan && plan.meta) {
          if (!metaTitle && plan.meta.title) metaTitle = plan.meta.title;
          if (!metaDescription && plan.meta.description) metaDescription = plan.meta.description;
        }
      }
    }

    // Extract head_terms from SEO plan
    let headTerms = [];
    for (const item of seoItems) {
      const terms = extractHeadTerms(item.seo_plan_json);
      if (terms.length > 0) {
        headTerms = terms;
        break;
      }
    }

    // Handle missing upstream data gracefully
    if (!metaTitle && !metaDescription) {
      logger.warn(`${entity.name}: no meta_title or meta_description found in any item`);
      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          qa_pass: false,
          checks_passed: 0,
          checks_total: 0,
          meta_title: '',
          meta_title_length: 0,
          meta_description_length: 0,
          meta_description_text: '',
          violations: 'No meta_title or meta_description found in upstream data',
        }],
        error: 'No meta data found -- ensure content-writer or meta-output has run',
        meta: { qa_pass: false, checks_passed: 0, checks_total: 0 },
      });
      continue;
    }

    metaTitle = metaTitle || '';
    metaDescription = metaDescription || '';

    entityMetas.push({
      entity,
      metaTitle,
      metaDescription,
      headTerms,
    });
  }

  // Second pass: run checks (needs all entity metas for duplicate detection)
  // Build title/description maps for duplicate detection
  for (const em of entityMetas) {
    if (em.metaTitle) {
      const titleLower = em.metaTitle.toLowerCase();
      seenTitles.set(titleLower, (seenTitles.get(titleLower) || []).concat(em.entity.name));
    }
    if (em.metaDescription) {
      const descLower = em.metaDescription.toLowerCase();
      seenDescriptions.set(descLower, (seenDescriptions.get(descLower) || []).concat(em.entity.name));
    }
  }

  for (const em of entityMetas) {
    const { entity, metaTitle, metaDescription, headTerms } = em;
    const violations = [];
    let checksTotal = 0;
    let checksPassed = 0;

    // --- Check 1: Meta title too long ---
    checksTotal++;
    if (metaTitle.length > title_max_length) {
      violations.push(`Title too long: ${metaTitle.length} chars (max ${title_max_length})`);
    } else {
      checksPassed++;
    }

    // --- Check 2: Meta title too short (warning-level, still counts as check) ---
    checksTotal++;
    if (metaTitle.length > 0 && metaTitle.length < 30) {
      violations.push(`Title too short: ${metaTitle.length} chars (recommend >= 30 for SEO value)`);
    } else if (metaTitle.length === 0) {
      violations.push('Title is empty');
    } else {
      checksPassed++;
    }

    // --- Check 3: Meta description within range ---
    checksTotal++;
    if (metaDescription.length < description_min_length) {
      violations.push(`Description too short: ${metaDescription.length} chars (min ${description_min_length})`);
    } else if (metaDescription.length > description_max_length) {
      violations.push(`Description too long: ${metaDescription.length} chars (max ${description_max_length})`);
    } else {
      checksPassed++;
    }

    // --- Check 4: Keyword in title ---
    if (require_keyword_in_title) {
      checksTotal++;
      if (headTerms.length === 0) {
        violations.push('No head_terms found in SEO plan -- cannot verify keyword in title');
      } else {
        const titleLower = metaTitle.toLowerCase();
        const found = headTerms.some(term => titleLower.includes(term));
        if (!found) {
          violations.push(`No head_term found in title. Expected one of: ${headTerms.join(', ')}`);
        } else {
          checksPassed++;
        }
      }
    }

    // --- Check 5: Keyword in description ---
    if (require_keyword_in_description) {
      checksTotal++;
      if (headTerms.length === 0) {
        violations.push('No head_terms found in SEO plan -- cannot verify keyword in description');
      } else {
        const descLower = metaDescription.toLowerCase();
        const found = headTerms.some(term => descLower.includes(term));
        if (!found) {
          violations.push(`No head_term found in description. Expected one of: ${headTerms.join(', ')}`);
        } else {
          checksPassed++;
        }
      }
    }

    // --- Check 6: No truncation indicators ---
    checksTotal++;
    if (metaTitle.endsWith('...') || metaTitle.endsWith('\u2026') ||
        metaDescription.endsWith('...') || metaDescription.endsWith('\u2026')) {
      const which = [];
      if (metaTitle.endsWith('...') || metaTitle.endsWith('\u2026')) which.push('title');
      if (metaDescription.endsWith('...') || metaDescription.endsWith('\u2026')) which.push('description');
      violations.push(`Truncation indicator found in ${which.join(' and ')}`);
    } else {
      checksPassed++;
    }

    // --- Check 7: No duplicate meta across entities ---
    checksTotal++;
    const duplicateIssues = [];
    if (metaTitle) {
      const titleDupes = seenTitles.get(metaTitle.toLowerCase()) || [];
      const otherEntities = titleDupes.filter(n => n !== entity.name);
      if (otherEntities.length > 0) {
        duplicateIssues.push(`Duplicate title shared with: ${otherEntities.join(', ')}`);
      }
    }
    if (metaDescription) {
      const descDupes = seenDescriptions.get(metaDescription.toLowerCase()) || [];
      const otherEntities = descDupes.filter(n => n !== entity.name);
      if (otherEntities.length > 0) {
        duplicateIssues.push(`Duplicate description shared with: ${otherEntities.join(', ')}`);
      }
    }
    if (duplicateIssues.length > 0) {
      violations.push(...duplicateIssues);
    } else {
      checksPassed++;
    }

    // Determine pass/fail based on threshold
    const passRatio = checksTotal > 0 ? checksPassed / checksTotal : 0;
    const qaPassed = passRatio >= pass_threshold;

    const logFn = qaPassed ? 'info' : 'warn';
    logger[logFn](
      `${entity.name}: ${checksPassed}/${checksTotal} checks passed (${qaPassed ? 'PASS' : 'FAIL'})` +
      (violations.length > 0 ? ` -- ${violations.join('; ')}` : '')
    );

    results.push({
      entity_name: entity.name,
      items: [{
        entity_name: entity.name,
        qa_pass: qaPassed,
        checks_passed: checksPassed,
        checks_total: checksTotal,
        meta_title: metaTitle,
        meta_title_length: metaTitle.length,
        meta_description_length: metaDescription.length,
        meta_description_text: metaDescription,
        violations: violations.join('\n'),
      }],
      meta: {
        qa_pass: qaPassed,
        checks_passed: checksPassed,
        checks_total: checksTotal,
        violations_count: violations.length,
      },
    });
  }

  // Build summary
  const totalEntities = entities.length;
  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
  const passCount = results.filter(r => r.items.length > 0 && r.items[0].qa_pass === true).length;
  const failCount = results.filter(r => r.items.length > 0 && r.items[0].qa_pass === false).length;
  const errorEntities = results.filter(r => r.error).map(r => `${r.entity_name}: ${r.error}`);

  let description;
  if (failCount === 0 && errorEntities.length === 0) {
    description = `All ${passCount} entities passed meta compliance checks`;
  } else {
    const parts = [];
    if (passCount > 0) parts.push(`${passCount} passed`);
    if (failCount > 0) parts.push(`${failCount} failed`);
    if (errorEntities.length > 0) parts.push(`${errorEntities.length} errors`);
    description = `${parts.join(', ')} of ${totalEntities} entities`;
  }

  return {
    results,
    summary: {
      total_entities: totalEntities,
      total_items: totalItems,
      passed: passCount,
      failed: failCount,
      description,
      errors: errorEntities,
    },
  };
}

module.exports = execute;
