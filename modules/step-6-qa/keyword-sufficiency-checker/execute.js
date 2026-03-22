/**
 * Keyword Sufficiency Checker -- Step 6 QA submodule
 *
 * Validates that generated content includes target SEO keywords at the right
 * density and in the right positions (headlines, first paragraphs, meta tags).
 *
 * Data operation: TRANSFORM (=) -- same items, enriched with QA verdicts.
 * Data-shape routing: finds input by field presence, never by source_submodule.
 *
 * Scoring components (weighted):
 *   - Head term coverage & placement  (40%)
 *   - Mid-tail term coverage          (25%)
 *   - Entity keyword coverage         (15%)
 *   - Negative keyword absence        (20%)
 *
 * No external dependencies -- pure text analysis against the keyword plan.
 */

// ---------------------------------------------------------------------------
// Markdown parsing utilities
// ---------------------------------------------------------------------------

/**
 * Strip citation references like [#1], [#2] etc. from text.
 * Keywords found only in citations should not count.
 */
function stripCitations(text) {
  return text.replace(/\[#?\d+\]/g, '');
}

/**
 * Parse markdown content into structural sections.
 * Returns { h1: string[], h2: string[], h3: string[], firstParagraphs: string[], body: string, meta: {} }
 *
 * firstParagraphs = the first non-heading paragraph after each heading.
 */
function parseMarkdownSections(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return { h1: [], h2: [], h3: [], firstParagraphs: [], body: '', meta: {}, wordCount: 0 };
  }

  // Extract and remove frontmatter
  const meta = {};
  let content = markdown;
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const fm = frontmatterMatch[1];
    const titleMatch = fm.match(/^(?:meta_title|title)\s*:\s*["']?(.*?)["']?\s*$/m);
    if (titleMatch) meta.title = titleMatch[1].trim();
    const descMatch = fm.match(/^(?:meta_description|description)\s*:\s*["']?(.*?)["']?\s*$/m);
    if (descMatch) meta.description = descMatch[1].trim();
    content = content.slice(frontmatterMatch[0].length).trim();
  }

  // Strip citations before analysis
  content = stripCitations(content);

  const lines = content.split('\n');
  const h1 = [];
  const h2 = [];
  const h3 = [];
  const firstParagraphs = [];
  let bodyLines = [];
  let expectFirstParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect headings
    const h1Match = trimmed.match(/^#\s+(.+)$/);
    const h2Match = trimmed.match(/^##\s+(.+)$/);
    const h3Match = trimmed.match(/^###\s+(.+)$/);

    if (h1Match) {
      h1.push(h1Match[1].trim());
      expectFirstParagraph = true;
      continue;
    }
    if (h2Match) {
      h2.push(h2Match[1].trim());
      expectFirstParagraph = true;
      continue;
    }
    if (h3Match) {
      h3.push(h3Match[1].trim());
      expectFirstParagraph = true;
      continue;
    }

    // Skip empty lines but keep expecting first paragraph
    if (!trimmed) continue;

    // Skip other heading levels (####, etc.)
    if (trimmed.startsWith('#')) continue;

    // First non-empty, non-heading line after a heading = first paragraph
    if (expectFirstParagraph) {
      firstParagraphs.push(trimmed);
      expectFirstParagraph = false;
    }

    bodyLines.push(trimmed);
  }

  const body = bodyLines.join(' ');
  const wordCount = body.split(/\s+/).filter(w => w.length > 0).length;

  return { h1, h2, h3, firstParagraphs, body, meta, wordCount };
}

// ---------------------------------------------------------------------------
// Keyword extraction from SEO plan
// ---------------------------------------------------------------------------

/**
 * Extract keyword lists from seo_plan_json.
 * Handles two shapes:
 *   1. Brief spec: keywords_used.head_terms, .mid_tail, .entities, .negatives
 *   2. Actual seo-planner output: target_keywords.primary/secondary/long_tail
 *      + keyword_distribution
 *
 * Returns { headTerms: string[], midTail: string[], entities: string[], negatives: string[] }
 */
function extractKeywords(seoPlanJson) {
  if (!seoPlanJson) return { headTerms: [], midTail: [], entities: [], negatives: [] };

  const plan = seoPlanJson;
  const headTerms = new Set();
  const midTail = new Set();
  const entities = new Set();
  const negatives = new Set();

  // --- Shape 1: keywords_used (brief spec shape) ---
  if (plan.keywords_used) {
    const ku = plan.keywords_used;
    if (Array.isArray(ku.head_terms)) {
      for (const t of ku.head_terms) {
        if (typeof t === 'string' && t.trim()) headTerms.add(t.trim().toLowerCase());
      }
    }
    if (Array.isArray(ku.mid_tail)) {
      for (const t of ku.mid_tail) {
        if (typeof t === 'string' && t.trim()) midTail.add(t.trim().toLowerCase());
      }
    }
    if (Array.isArray(ku.entities)) {
      for (const t of ku.entities) {
        if (typeof t === 'string' && t.trim()) entities.add(t.trim().toLowerCase());
      }
    }
    if (Array.isArray(ku.negatives)) {
      for (const t of ku.negatives) {
        if (typeof t === 'string' && t.trim()) negatives.add(t.trim().toLowerCase());
      }
    }
  }

  // --- Shape 2: target_keywords (actual seo-planner output) ---
  if (plan.target_keywords) {
    const tk = plan.target_keywords;
    // primary -> head term
    if (typeof tk.primary === 'string' && tk.primary.trim()) {
      headTerms.add(tk.primary.trim().toLowerCase());
    }
    // secondary -> mid-tail
    if (Array.isArray(tk.secondary)) {
      for (const kw of tk.secondary) {
        if (typeof kw === 'string' && kw.trim()) midTail.add(kw.trim().toLowerCase());
      }
    }
    // long_tail -> also mid-tail
    if (Array.isArray(tk.long_tail)) {
      for (const kw of tk.long_tail) {
        if (typeof kw === 'string' && kw.trim()) midTail.add(kw.trim().toLowerCase());
      }
    }
  }

  // --- keyword_distribution: extract additional keywords ---
  if (plan.keyword_distribution) {
    const dist = plan.keyword_distribution;

    // overview headline_keywords -> head terms
    if (dist.overview) {
      if (Array.isArray(dist.overview.headline_keywords)) {
        for (const kw of dist.overview.headline_keywords) {
          if (typeof kw === 'string' && kw.trim()) headTerms.add(kw.trim().toLowerCase());
        }
      }
      if (Array.isArray(dist.overview.body_keywords)) {
        for (const kw of dist.overview.body_keywords) {
          if (typeof kw === 'string' && kw.trim()) midTail.add(kw.trim().toLowerCase());
        }
      }
    }

    // categories: heading_keywords -> mid-tail, body_keywords -> mid-tail
    if (Array.isArray(dist.categories)) {
      for (const cat of dist.categories) {
        if (Array.isArray(cat.heading_keywords)) {
          for (const kw of cat.heading_keywords) {
            if (typeof kw === 'string' && kw.trim()) midTail.add(kw.trim().toLowerCase());
          }
        }
        if (Array.isArray(cat.body_keywords)) {
          for (const kw of cat.body_keywords) {
            if (typeof kw === 'string' && kw.trim()) midTail.add(kw.trim().toLowerCase());
          }
        }
      }
    }
  }

  // --- Flat arrays (generic fallback) ---
  if (Array.isArray(plan.head_terms)) {
    for (const t of plan.head_terms) {
      if (typeof t === 'string' && t.trim()) headTerms.add(t.trim().toLowerCase());
    }
  }
  if (Array.isArray(plan.negatives)) {
    for (const t of plan.negatives) {
      if (typeof t === 'string' && t.trim()) negatives.add(t.trim().toLowerCase());
    }
  }

  return {
    headTerms: [...headTerms],
    midTail: [...midTail],
    entities: [...entities],
    negatives: [...negatives],
  };
}

// ---------------------------------------------------------------------------
// Keyword analysis functions
// ---------------------------------------------------------------------------

/**
 * Count occurrences of a keyword phrase in text (case-insensitive, word-boundary aware).
 */
function countOccurrences(text, keyword) {
  if (!text || !keyword) return 0;
  // Escape regex special characters in keyword
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

/**
 * Check if keyword appears in any of the given text segments (case-insensitive).
 */
function appearsIn(segments, keyword) {
  const lower = keyword.toLowerCase();
  return segments.some(seg => {
    if (!seg) return false;
    return seg.toLowerCase().includes(lower);
  });
}

/**
 * Calculate keyword density: occurrences of keyword / total word count.
 * For multi-word keywords, each occurrence counts as 1 regardless of word count.
 */
function calculateDensity(bodyText, keyword, wordCount) {
  if (!wordCount || wordCount === 0) return 0;
  const occurrences = countOccurrences(bodyText, keyword);
  return occurrences / wordCount;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Score head term coverage and placement (0-1).
 *
 * Rules:
 *   - At least 1 head term must appear in H1/H2 or first paragraph of a section
 *   - Density should be between head_term_density_min and head_term_density_max
 *
 * Returns { score, missing, misplaced, densityReport }
 */
function scoreHeadTerms(sections, headTerms, densityMin, densityMax) {
  if (headTerms.length === 0) return { score: 1, missing: [], misplaced: [], densityReport: [] };

  const missing = [];
  const misplaced = [];
  const densityReport = [];
  let placementScore = 0;
  let densityScore = 0;

  // Prominent positions: H1, H2, first paragraphs
  const prominentSegments = [...sections.h1, ...sections.h2, ...sections.firstParagraphs];
  // Also include meta title/description as prominent positions
  if (sections.meta.title) prominentSegments.push(sections.meta.title);

  for (const term of headTerms) {
    const inProminent = appearsIn(prominentSegments, term);
    const inBody = appearsIn([sections.body], term);
    const density = calculateDensity(sections.body, term, sections.wordCount);

    if (!inBody && !inProminent) {
      missing.push(term);
    } else if (inBody && !inProminent) {
      misplaced.push(term);
      placementScore += 0.5; // Partial credit: present but not in prominent position
    } else {
      placementScore += 1;
    }

    // Density scoring
    if (density >= densityMin && density <= densityMax) {
      densityScore += 1;
      densityReport.push({ term, density: (density * 100).toFixed(2) + '%', status: 'ok' });
    } else if (density > 0 && density < densityMin) {
      densityScore += 0.5;
      densityReport.push({ term, density: (density * 100).toFixed(2) + '%', status: 'low' });
    } else if (density > densityMax) {
      densityScore += 0.3; // Keyword stuffing penalty
      densityReport.push({ term, density: (density * 100).toFixed(2) + '%', status: 'high (stuffing risk)' });
    } else {
      densityReport.push({ term, density: '0%', status: 'missing' });
    }
  }

  const maxScore = headTerms.length;
  const combinedScore = maxScore > 0
    ? ((placementScore / maxScore) * 0.6 + (densityScore / maxScore) * 0.4)
    : 1;

  return {
    score: Math.min(1, combinedScore),
    missing,
    misplaced,
    densityReport,
  };
}

/**
 * Score mid-tail term coverage (0-1).
 *
 * Rules:
 *   - At least 2 mid-tail terms must appear in subheadings (H2/H3) or body
 *   - Pure presence check -- density is not enforced for mid-tail
 */
function scoreMidTailTerms(sections, midTailTerms) {
  if (midTailTerms.length === 0) return { score: 1, missing: [] };

  const allText = [
    ...sections.h2,
    ...sections.h3,
    sections.body,
  ];

  const missing = [];
  let found = 0;

  for (const term of midTailTerms) {
    if (appearsIn(allText, term)) {
      found++;
    } else {
      missing.push(term);
    }
  }

  // Score: need at least 2 present, or all if fewer than 2 total
  const required = Math.min(2, midTailTerms.length);
  const score = found >= required
    ? Math.min(1, found / midTailTerms.length)
    : found / required * 0.5; // Harsh penalty if below minimum

  return { score, missing };
}

/**
 * Score entity keyword coverage (0-1).
 * Entities should appear where sources support them -- simple presence check.
 */
function scoreEntityTerms(sections, entityTerms) {
  if (entityTerms.length === 0) return { score: 1, missing: [] };

  const allText = [sections.body];
  const missing = [];
  let found = 0;

  for (const term of entityTerms) {
    if (appearsIn(allText, term)) {
      found++;
    } else {
      missing.push(term);
    }
  }

  return {
    score: entityTerms.length > 0 ? found / entityTerms.length : 1,
    missing,
  };
}

/**
 * Check for negative keywords (0-1 score: 1 = none found, 0 = any found).
 */
function scoreNegatives(sections, negativeTerms) {
  if (negativeTerms.length === 0) return { score: 1, found: [] };

  const textParts = [
    ...sections.h1,
    ...sections.h2,
    ...sections.h3,
    sections.body,
  ];

  // Also check meta
  if (sections.meta.title) textParts.push(sections.meta.title);
  if (sections.meta.description) textParts.push(sections.meta.description);

  const fullText = textParts.join(' ');

  const found = [];
  for (const term of negativeTerms) {
    if (appearsIn([fullText], term)) {
      found.push(term);
    }
  }

  return {
    score: found.length === 0 ? 1 : 0,
    found,
  };
}

// ---------------------------------------------------------------------------
// Main execute function
// ---------------------------------------------------------------------------

module.exports = async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress } = tools;
  const {
    pass_threshold = 0.6,
    head_term_density_min = 0.01,
    head_term_density_max = 0.03,
    check_negatives = true,
  } = options;

  logger.info(
    `Config: pass_threshold=${pass_threshold}, density=${head_term_density_min}-${head_term_density_max}, ` +
    `check_negatives=${check_negatives}`
  );

  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Checking keywords: ${entity.name}`);

    // --- Data-shape routing: find items by field presence ---
    const contentItems = (entity.items || []).filter(item => item.content_markdown);
    const seoItems = (entity.items || []).filter(item => item.seo_plan_json);

    // --- Extract SEO plan keywords ---
    let keywords = { headTerms: [], midTail: [], entities: [], negatives: [] };
    for (const item of seoItems) {
      const extracted = extractKeywords(item.seo_plan_json);
      if (extracted.headTerms.length > 0 || extracted.midTail.length > 0) {
        keywords = extracted;
        break;
      }
    }

    // Edge case: no SEO plan available -- skip check, return pass with warning
    const hasKeywordPlan = keywords.headTerms.length > 0 || keywords.midTail.length > 0;
    if (!hasKeywordPlan) {
      logger.warn(`${entity.name}: no seo_plan_json with keywords found -- skipping keyword check (pass with warning)`);
      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          qa_pass: true,
          keyword_score: 1,
          missing_keywords: JSON.stringify([]),
          misplaced_keywords: JSON.stringify([]),
          negative_keywords_found: JSON.stringify([]),
          placement_report: 'No SEO plan with keywords found. Keyword check skipped -- returning pass with warning.',
          density_report: '',
        }],
        meta: {
          qa_pass: true,
          keyword_score: 1,
          skipped: true,
          skip_reason: 'no_seo_plan',
        },
      });
      continue;
    }

    // --- Combine all content_markdown for this entity ---
    const allMarkdown = contentItems
      .map(item => item.content_markdown)
      .filter(Boolean)
      .join('\n\n');

    if (!allMarkdown) {
      logger.warn(`${entity.name}: no content_markdown found -- cannot check keywords`);
      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          qa_pass: false,
          keyword_score: 0,
          missing_keywords: JSON.stringify(keywords.headTerms.concat(keywords.midTail)),
          misplaced_keywords: JSON.stringify([]),
          negative_keywords_found: JSON.stringify([]),
          placement_report: 'No content_markdown found. Cannot perform keyword analysis.',
          density_report: '',
        }],
        meta: { qa_pass: false, keyword_score: 0, error: 'no_content_markdown' },
      });
      continue;
    }

    // --- Parse markdown into structural sections ---
    const sections = parseMarkdownSections(allMarkdown);

    // Edge case: very short content
    const shortContent = sections.wordCount < 200;
    if (shortContent) {
      logger.warn(`${entity.name}: content is very short (${sections.wordCount} words) -- density calculations may be unreliable`);
    }

    // --- Score each keyword category ---
    const headResult = scoreHeadTerms(sections, keywords.headTerms, head_term_density_min, head_term_density_max);
    const midTailResult = scoreMidTailTerms(sections, keywords.midTail);
    const entityResult = scoreEntityTerms(sections, keywords.entities);
    const negativeResult = check_negatives
      ? scoreNegatives(sections, keywords.negatives)
      : { score: 1, found: [] };

    // --- Composite score (weighted) ---
    // Weights: head terms 40%, mid-tail 25%, entities 15%, negatives 20%
    // If a category has no keywords, redistribute its weight proportionally
    const weights = {
      head: keywords.headTerms.length > 0 ? 0.4 : 0,
      midTail: keywords.midTail.length > 0 ? 0.25 : 0,
      entities: keywords.entities.length > 0 ? 0.15 : 0,
      negatives: (check_negatives && keywords.negatives.length > 0) ? 0.2 : 0,
    };

    const totalWeight = weights.head + weights.midTail + weights.entities + weights.negatives;

    let keywordScore;
    if (totalWeight === 0) {
      // No keyword categories have any terms -- pass by default
      keywordScore = 1;
    } else {
      keywordScore = (
        (headResult.score * weights.head) +
        (midTailResult.score * weights.midTail) +
        (entityResult.score * weights.entities) +
        (negativeResult.score * weights.negatives)
      ) / totalWeight;
    }

    // Round to 2 decimal places
    keywordScore = Math.round(keywordScore * 100) / 100;

    const qaPassed = keywordScore >= pass_threshold;

    // --- Build placement report ---
    const reportLines = [];

    reportLines.push(`Word count: ${sections.wordCount}${shortContent ? ' (SHORT -- density may be unreliable)' : ''}`);
    reportLines.push('');

    // Head terms
    if (keywords.headTerms.length > 0) {
      reportLines.push(`HEAD TERMS (${keywords.headTerms.length}, score: ${(headResult.score * 100).toFixed(0)}%):`);
      for (const dr of headResult.densityReport) {
        const placement = headResult.missing.includes(dr.term)
          ? 'MISSING'
          : headResult.misplaced.includes(dr.term)
            ? 'in body only (should be in H1/H2/first paragraph)'
            : 'correctly placed';
        reportLines.push(`  "${dr.term}": density=${dr.density} (${dr.status}), ${placement}`);
      }
      reportLines.push('');
    }

    // Mid-tail terms
    if (keywords.midTail.length > 0) {
      const midFound = keywords.midTail.length - midTailResult.missing.length;
      reportLines.push(`MID-TAIL TERMS (${midFound}/${keywords.midTail.length} found, score: ${(midTailResult.score * 100).toFixed(0)}%):`);
      if (midTailResult.missing.length > 0) {
        reportLines.push(`  Missing: ${midTailResult.missing.join(', ')}`);
      }
      reportLines.push('');
    }

    // Entity terms
    if (keywords.entities.length > 0) {
      const entFound = keywords.entities.length - entityResult.missing.length;
      reportLines.push(`ENTITY TERMS (${entFound}/${keywords.entities.length} found, score: ${(entityResult.score * 100).toFixed(0)}%):`);
      if (entityResult.missing.length > 0) {
        reportLines.push(`  Missing: ${entityResult.missing.join(', ')}`);
      }
      reportLines.push('');
    }

    // Negative keywords
    if (check_negatives && keywords.negatives.length > 0) {
      reportLines.push(`NEGATIVE KEYWORDS (score: ${(negativeResult.score * 100).toFixed(0)}%):`);
      if (negativeResult.found.length > 0) {
        reportLines.push(`  FOUND (must not appear): ${negativeResult.found.join(', ')}`);
      } else {
        reportLines.push('  None found (good)');
      }
      reportLines.push('');
    }

    reportLines.push(`COMPOSITE SCORE: ${(keywordScore * 100).toFixed(0)}% (threshold: ${(pass_threshold * 100).toFixed(0)}%) -- ${qaPassed ? 'PASS' : 'FAIL'}`);

    const placementReport = reportLines.join('\n');

    // Build density report for detail view
    const densityLines = headResult.densityReport.map(
      dr => `${dr.term}: ${dr.density} (${dr.status})`
    );

    // Collect all missing and misplaced
    const allMissing = [
      ...headResult.missing,
      ...midTailResult.missing,
      ...entityResult.missing,
    ];
    const allMisplaced = [...headResult.misplaced];

    const logFn = qaPassed ? 'info' : 'warn';
    logger[logFn](
      `${entity.name}: keyword_score=${keywordScore} (${qaPassed ? 'PASS' : 'FAIL'})` +
      (allMissing.length > 0 ? ` | missing: ${allMissing.join(', ')}` : '') +
      (negativeResult.found.length > 0 ? ` | NEGATIVES FOUND: ${negativeResult.found.join(', ')}` : '')
    );

    results.push({
      entity_name: entity.name,
      items: [{
        entity_name: entity.name,
        qa_pass: qaPassed,
        keyword_score: keywordScore,
        missing_keywords: JSON.stringify(allMissing),
        misplaced_keywords: JSON.stringify(allMisplaced),
        negative_keywords_found: JSON.stringify(negativeResult.found),
        placement_report: placementReport,
        density_report: densityLines.join('\n'),
      }],
      meta: {
        qa_pass: qaPassed,
        keyword_score: keywordScore,
        head_terms_checked: keywords.headTerms.length,
        mid_tail_checked: keywords.midTail.length,
        entity_terms_checked: keywords.entities.length,
        negative_terms_checked: keywords.negatives.length,
        missing_count: allMissing.length,
        misplaced_count: allMisplaced.length,
        negatives_found_count: negativeResult.found.length,
        short_content: shortContent,
      },
    });
  }

  // --- Summary ---
  const totalEntities = entities.length;
  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
  const passCount = results.filter(r => r.items.length > 0 && r.items[0].qa_pass === true).length;
  const failCount = results.filter(r => r.items.length > 0 && r.items[0].qa_pass === false).length;
  const skippedCount = results.filter(r => r.meta && r.meta.skipped).length;
  const avgScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + (r.items[0]?.keyword_score || 0), 0) / results.length * 100) / 100
    : 0;

  let description;
  if (failCount === 0) {
    description = `All ${passCount} entities passed keyword sufficiency checks (avg score: ${avgScore})`;
  } else {
    const parts = [];
    if (passCount > 0) parts.push(`${passCount} passed`);
    if (failCount > 0) parts.push(`${failCount} failed`);
    if (skippedCount > 0) parts.push(`${skippedCount} skipped (no SEO plan)`);
    description = `${parts.join(', ')} of ${totalEntities} entities (avg score: ${avgScore})`;
  }

  return {
    results,
    summary: {
      total_entities: totalEntities,
      total_items: totalItems,
      passed: passCount,
      failed: failCount,
      skipped: skippedCount,
      average_score: avgScore,
      description,
    },
  };
};
