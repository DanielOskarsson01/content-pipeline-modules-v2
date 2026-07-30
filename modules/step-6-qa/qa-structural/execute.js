/**
 * Structural Compliance Checker -- Step 6 QA submodule
 *
 * Checks format spec adherence: heading hierarchy, section count, FAQ
 * presence, word count per section, and total word count.
 *
 * Data operation: TRANSFORM (=) -- same entities, enriched with QA verdicts.
 * Data-shape routing: finds input by field presence (content_markdown),
 * never by source_submodule.
 *
 * Pure structural checks, no LLM needed.
 */

// ---------------------------------------------------------------------------
// Markdown structure parsing
// ---------------------------------------------------------------------------

/**
 * Parse markdown into a heading tree with word counts per section.
 *
 * Returns {
 *   h1: string[], h2: string[], h3: string[],
 *   sections: [{ level: number, title: string, wordCount: number }],
 *   totalWords: number,
 *   hasFaq: boolean,
 * }
 */
function parseStructure(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return { h1: [], h2: [], h3: [], sections: [], totalWords: 0, hasFaq: false };
  }

  // Strip frontmatter
  let content = markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');

  const lines = content.split('\n');
  const h1 = [];
  const h2 = [];
  const h3 = [];
  const sections = []; // { level, title, wordCount }
  let currentSection = null;
  let totalWords = 0;
  let hasFaq = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect headings
    const h1Match = trimmed.match(/^#\s+(.+)$/);
    const h2Match = trimmed.match(/^##\s+(.+)$/);
    const h3Match = trimmed.match(/^###\s+(.+)$/);

    if (h1Match || h2Match || h3Match) {
      // Close previous section
      if (currentSection) sections.push(currentSection);

      const level = h1Match ? 1 : h2Match ? 2 : 3;
      const title = (h1Match || h2Match || h3Match)[1].trim();

      if (level === 1) h1.push(title);
      if (level === 2) h2.push(title);
      if (level === 3) h3.push(title);

      // Check for FAQ heading
      const titleLower = title.toLowerCase();
      if (titleLower.includes('faq') || titleLower.includes('frequently asked questions')) {
        hasFaq = true;
      }

      currentSection = { level, title, wordCount: 0 };
      continue;
    }

    // Skip empty lines and non-heading markup
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue; // H4+ headings

    // Count words
    const words = trimmed.split(/\s+/).filter(w => w.length > 0).length;
    totalWords += words;
    if (currentSection) {
      currentSection.wordCount += words;
    }
  }

  // Close last section
  if (currentSection) sections.push(currentSection);

  return { h1, h2, h3, sections, totalWords, hasFaq };
}

// ---------------------------------------------------------------------------
// Main execute function
// ---------------------------------------------------------------------------

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress } = tools;
  const {
    min_sections = 5,
    require_faq = true,
    min_words_per_section = 100,
    min_total_words = 1500,
    required_heading_levels = 'h1,h2',
    pass_threshold = 0.8,
  } = options;

  const requiredLevels = typeof required_heading_levels === 'string'
    ? required_heading_levels.split(',').map(s => s.trim().toLowerCase())
    : [];

  logger.info(
    `Config: min_sections=${min_sections}, require_faq=${require_faq}, ` +
    `min_words_per_section=${min_words_per_section}, min_total_words=${min_total_words}, ` +
    `required_levels=${requiredLevels.join(',')}, pass_threshold=${pass_threshold}`
  );

  const results = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Checking structure: ${entity.name}`);

    // --- Data-shape routing: find content by field presence ---
    const contentItems = (entity.items || []).filter(item => item.content_markdown);

    if (contentItems.length === 0) {
      logger.warn(`${entity.name}: no content_markdown found`);
      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          qa_pass: false,
          structural_score: 0,
          total_words: 0,
          section_count: 0,
          has_faq: false,
          violations: 'No content_markdown found -- ensure content-writer has run.',
          section_report: '',
        }],
        meta: { qa_pass: false, structural_score: 0 },
      });
      continue;
    }

    // Combine all content_markdown
    const allMarkdown = contentItems.map(item => item.content_markdown).filter(Boolean).join('\n\n');
    const structure = parseStructure(allMarkdown);

    const violations = [];
    let checksTotal = 0;
    let checksPassed = 0;

    // --- Check 1: Required heading levels ---
    for (const level of requiredLevels) {
      checksTotal++;
      const hasLevel = (level === 'h1' && structure.h1.length > 0)
        || (level === 'h2' && structure.h2.length > 0)
        || (level === 'h3' && structure.h3.length > 0);
      if (hasLevel) {
        checksPassed++;
      } else {
        violations.push(`Missing required heading level: ${level.toUpperCase()}`);
      }
    }

    // --- Check 2: Minimum section count (H2 sections) ---
    checksTotal++;
    const h2SectionCount = structure.h2.length;
    if (h2SectionCount >= min_sections) {
      checksPassed++;
    } else {
      violations.push(`Too few H2 sections: ${h2SectionCount} (minimum ${min_sections})`);
    }

    // --- Check 3: FAQ presence ---
    if (require_faq) {
      checksTotal++;
      if (structure.hasFaq) {
        checksPassed++;
      } else {
        violations.push('No FAQ or "Frequently Asked Questions" section found');
      }
    }

    // --- Check 4: Total word count ---
    checksTotal++;
    if (structure.totalWords >= min_total_words) {
      checksPassed++;
    } else {
      violations.push(`Total word count too low: ${structure.totalWords} (minimum ${min_total_words})`);
    }

    // --- Check 5: Per-section word count (H2 sections only) ---
    const h2Sections = structure.sections.filter(s => s.level === 2);
    const thinSections = [];
    for (const section of h2Sections) {
      if (section.wordCount < min_words_per_section) {
        thinSections.push(`"${section.title}" (${section.wordCount} words)`);
      }
    }
    checksTotal++;
    if (thinSections.length === 0) {
      checksPassed++;
    } else {
      violations.push(`${thinSections.length} section(s) below ${min_words_per_section} words: ${thinSections.join(', ')}`);
    }

    // --- Check 6: taxonomy-marker leakage in headings (M3) ---
    // Observed in delivered prod output: a prompt example leaked a SECOND
    // bracketed marker into headings ("## [Tag: scratchcards] [Suggested tag]
    // Scratchcard ..."), and nothing caught it. Detect (a) any heading whose
    // title carries two leading bracketed markers, and (b) a literal
    // "[Suggested tag]" anywhere in a heading — that string is marker-grammar
    // vocabulary (like the [Tag:]/[Primary Category:] prefixes the Step 8
    // bundlers parse), never legitimate heading text.
    // These two are OUTSIDE the score ratio: (a) folding them in would dilute
    // the denominator and silently loosen every threshold-tuned template, and
    // (b) at the 0.8 default a pure marker leak would score 7/8 and PASS —
    // the exact silent-shipping this check exists to stop. Instead they
    // force qa_pass to false directly (flag/route; the entity is not failed
    // and delivery is not blocked — the human decides).
    const markerLeaks = [];
    for (const s of structure.sections) {
      if (/^\s*\[[^\]]+\]\s*\[[^\]]+\]/.test(s.title) || /\[suggested tag\]/i.test(s.title)) {
        markerLeaks.push(s.title);
      }
    }
    if (markerLeaks.length > 0) {
      const shown = markerLeaks.slice(0, 5).map(t => `"${t}"`).join(', ');
      const more = markerLeaks.length > 5 ? ` …and ${markerLeaks.length - 5} more` : '';
      violations.push(`${markerLeaks.length} heading(s) leak taxonomy markers (second bracketed marker / literal [Suggested tag]): ${shown}${more}`);
    }

    // --- Check 7: duplicated-token artifacts in headings (M3) ---
    // Observed: "Api API Integration" — a slug-derived word colliding with the
    // heading text. Fires only on consecutive words equal case-INsensitively
    // but NOT byte-identical ("Api API" yes; "Pago Pago" / "Baden-Baden" no) —
    // the mechanical artifact always mixes cases, while legitimate repeated
    // names repeat exactly. Bracketed markers are stripped first so
    // "[Tag: api] API Integration" does not false-positive.
    // ponytail: identical-case dups ("API API") are deliberately NOT flagged —
    // widen only if that variant is ever observed in real output.
    const dupTokenHeadings = [];
    for (const s of structure.sections) {
      const words = s.title.replace(/\[[^\]]*\]/g, ' ').split(/[^A-Za-z0-9'-]+/).filter(w => w.length >= 2);
      if (words.some((w, i) => i > 0 && w !== words[i - 1] && w.toLowerCase() === words[i - 1].toLowerCase())) {
        dupTokenHeadings.push(s.title);
      }
    }
    if (dupTokenHeadings.length > 0) {
      const shown = dupTokenHeadings.slice(0, 5).map(t => `"${t}"`).join(', ');
      const more = dupTokenHeadings.length > 5 ? ` …and ${dupTokenHeadings.length - 5} more` : '';
      violations.push(`${dupTokenHeadings.length} heading(s) contain duplicated-token artifacts (e.g. "Api API"): ${shown}${more}`);
    }

    // --- Calculate structural_score and pass/fail ---
    // Score semantics unchanged from v1.0 (same 5-check ratio); taxonomy
    // leakage force-fails qa_pass without touching the score.
    const structuralScore = checksTotal > 0
      ? Math.round((checksPassed / checksTotal) * 100) / 100
      : 0;
    const qaPassed = structuralScore >= pass_threshold
      && markerLeaks.length === 0
      && dupTokenHeadings.length === 0;

    // --- Build section report ---
    const reportLines = [];
    reportLines.push(`Total words: ${structure.totalWords}`);
    reportLines.push(`Headings: ${structure.h1.length} H1, ${structure.h2.length} H2, ${structure.h3.length} H3`);
    reportLines.push(`FAQ found: ${structure.hasFaq ? 'Yes' : 'No'}`);
    reportLines.push('');
    reportLines.push('Sections:');
    for (const section of structure.sections) {
      const prefix = section.level === 1 ? '#' : section.level === 2 ? '##' : '###';
      const flag = section.level === 2 && section.wordCount < min_words_per_section ? ' [THIN]' : '';
      reportLines.push(`  ${prefix} ${section.title}: ${section.wordCount} words${flag}`);
    }

    const logFn = qaPassed ? 'info' : 'warn';
    logger[logFn](
      `${entity.name}: structural_score=${structuralScore} (${qaPassed ? 'PASS' : 'FAIL'}) ` +
      `| ${structure.totalWords} words, ${h2SectionCount} H2 sections, FAQ=${structure.hasFaq}`
    );

    const entityResult = {
      entity_name: entity.name,
      items: [{
        entity_name: entity.name,
        qa_pass: qaPassed,
        structural_score: structuralScore,
        total_words: structure.totalWords,
        section_count: h2SectionCount,
        has_faq: structure.hasFaq,
        violations: violations.length > 0 ? violations.join('\n') : 'All structural checks passed.',
        section_report: reportLines.join('\n'),
      }],
      meta: {
        qa_pass: qaPassed,
        structural_score: structuralScore,
        total_words: structure.totalWords,
        section_count: h2SectionCount,
        has_faq: structure.hasFaq,
        checks_passed: checksPassed,
        checks_total: checksTotal,
        thin_sections: thinSections.length,
        marker_leak_headings: markerLeaks.length,
        dup_token_headings: dupTokenHeadings.length,
      },
    };
    results.push(entityResult);
    if (tools._partialItems) tools._partialItems.push(...entityResult.items);
  }

  // --- Summary ---
  const totalEntities = entities.length;
  const totalItems = results.reduce((sum, r) => sum + r.items.length, 0);
  const passCount = results.filter(r => r.items.length > 0 && r.items[0].qa_pass === true).length;
  const failCount = results.filter(r => r.items.length > 0 && r.items[0].qa_pass === false).length;
  const avgScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + (r.items[0]?.structural_score || 0), 0) / results.length * 100) / 100
    : 0;

  let description;
  if (failCount === 0) {
    description = `All ${passCount} entities passed structural checks (avg score: ${avgScore})`;
  } else {
    const parts = [];
    if (passCount > 0) parts.push(`${passCount} passed`);
    if (failCount > 0) parts.push(`${failCount} failed`);
    description = `${parts.join(', ')} of ${totalEntities} entities (avg score: ${avgScore})`;
  }

  return {
    results,
    summary: {
      total_entities: totalEntities,
      total_items: totalItems,
      passed: passCount,
      failed: failCount,
      average_score: avgScore,
      description,
    },
  };
}

module.exports = execute;
