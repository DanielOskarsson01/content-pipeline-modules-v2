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
 * Add every string in a target_keywords object to the term set. Handles
 * primary (string or array), secondary (array), and long_tail (array); each
 * value may be a string or missing. Pipeline-agnostic — no field is
 * content-type specific.
 */
function addTargetKeywords(tk, terms) {
  if (!tk || typeof tk !== 'object') return;
  const push = v => { if (typeof v === 'string' && v.trim()) terms.add(v.trim().toLowerCase()); };
  push(tk.primary);
  if (Array.isArray(tk.primary)) tk.primary.forEach(push);
  if (Array.isArray(tk.secondary)) tk.secondary.forEach(push);
  if (Array.isArray(tk.long_tail)) tk.long_tail.forEach(push);
}

/**
 * Extract head_terms from seo_plan_json. Handles multiple shapes:
 *   - seo_plan_json.head_terms (array of strings)
 *   - seo_plan_json.target_keywords.{primary,secondary,long_tail} (top-level)
 *   - seo_plan_json.sections.<any>.target_keywords.{primary,secondary,long_tail}
 *     (seo-planner emits keywords PER SECTION, not at top level — this is the
 *     shape the 2026-07-14 calibration produced, which caused a batch-wide
 *     "No head_terms found" auto-fail before this was read)
 *   - seo_plan_json.keyword_summary_table[].keyword (the typed rollup)
 *   - seo_plan_json.keywords (flat array of strings)
 *
 * Section iteration is generic (Object.values) — no section name is hardcoded,
 * so it stays pipeline-agnostic across content types.
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

  // Top-level target_keywords structure
  addTargetKeywords(seoPlanJson.target_keywords, terms);

  // Per-section target_keywords (seo-planner's actual output shape)
  if (seoPlanJson.sections && typeof seoPlanJson.sections === 'object') {
    for (const section of Object.values(seoPlanJson.sections)) {
      if (section && typeof section === 'object') addTargetKeywords(section.target_keywords, terms);
    }
  }

  // Typed keyword rollup table
  if (Array.isArray(seoPlanJson.keyword_summary_table)) {
    for (const row of seoPlanJson.keyword_summary_table) {
      if (row && typeof row.keyword === 'string' && row.keyword.trim()) {
        terms.add(row.keyword.trim().toLowerCase());
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
    title_min_length = 30,
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

    // Priority 3: the SEO plan's meta. Two shapes:
    //   - plan.meta.{title,description} (top-level, legacy)
    //   - plan.sections.meta.meta_{title,description}.candidate (seo-planner's
    //     actual output — length-validated candidates the planner already built)
    // This is the AUTHORITATIVE planned meta, so it beats the H1/first-paragraph
    // HEURISTICS below (a guessed H1 title like "ELK Studios" is worse than the
    // planner's validated candidate). It sits AFTER the writer's own meta fields
    // (priority 1) — which, once content-writer emits the candidate, already
    // carry it — and after explicit frontmatter (priority 2).
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

    // Priority 4 (last resort): H1 for title, first paragraph for description.
    // Only used when no explicit/planned meta exists — a heuristic guess.
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
    if (metaTitle.length > 0 && metaTitle.length < title_min_length) {
      violations.push(`Title too short: ${metaTitle.length} chars (recommend >= ${title_min_length} for SEO value)`);
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

    const entityResult = {
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
    };
    results.push(entityResult);
    if (tools._partialItems) tools._partialItems.push(...entityResult.items);
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
// Exported for unit tests only.
module.exports.__testing = { extractHeadTerms, addTargetKeywords, extractMetaFromFrontmatter };
