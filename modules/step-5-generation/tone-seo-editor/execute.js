/**
 * Tone & SEO Editor — Step 5 Generation submodule
 *
 * Post-writing editing pass that refines content for B2B tone and SEO keyword
 * integration. Takes content-writer markdown and seo-planner keyword targets,
 * applies conservative edits: keyword placement, sentence clarity, authoritative
 * tone, structural improvements.
 *
 * Data operation: TRANSFORM — replaces content_markdown with revised version.
 * Requires BOTH content-writer and seo-planner to have run first.
 */

/**
 * Tone style instruction sets.
 */
const TONE_STYLES = {
  b2b_authoritative: [
    'Use confident, authoritative language — state facts directly, avoid hedging.',
    'Lead with benefits and business outcomes, not features.',
    'Write for decision-makers: CTOs, compliance officers, procurement leads.',
    'Favor active voice and strong verbs.',
    'Avoid superlatives ("best", "leading") unless backed by specific evidence.',
    'Use industry-standard terminology without over-explaining basics.',
    'Keep sentences under 25 words where possible.',
  ].join('\n'),

  casual_informative: [
    'Use a friendly, approachable tone — knowledgeable but not stiff.',
    'Write as if explaining to a smart colleague over coffee.',
    'Use contractions naturally (it\'s, they\'re, you\'ll).',
    'Include occasional rhetorical questions to engage the reader.',
    'Keep paragraphs short — 2-3 sentences maximum.',
    'Favor simple words over complex ones where meaning is preserved.',
    'Light use of transitional phrases to maintain flow.',
  ].join('\n'),

  technical_precise: [
    'Use exact technical terminology — do not simplify domain-specific terms.',
    'Be precise: specific numbers, version numbers, protocol names.',
    'Avoid marketing language entirely — no "cutting-edge", "innovative", "revolutionary".',
    'Use passive voice when the actor is irrelevant (e.g., "The API is rate-limited to...").',
    'Structure information hierarchically — general concept, then specifics.',
    'Include technical qualifiers (e.g., "up to", "approximately", "as of").',
    'Favor completeness over brevity — do not omit relevant technical details.',
  ].join('\n'),
};

/**
 * Extract keyword targets from SEO plan items.
 * Handles both seo_plan_json.target_keywords and seo_plan_json.keywords_used shapes.
 */
function extractKeywords(seoItem) {
  const plan = seoItem.seo_plan_json || {};
  const keywords = {
    primary: [],
    secondary: [],
    long_tail: [],
    all: [],
  };

  // Shape 1: target_keywords (seo-planner v1.3.0)
  if (plan.target_keywords) {
    const tk = plan.target_keywords;
    if (tk.primary) {
      keywords.primary = Array.isArray(tk.primary) ? tk.primary : [tk.primary];
    }
    if (Array.isArray(tk.secondary)) {
      keywords.secondary = tk.secondary;
    }
    if (Array.isArray(tk.long_tail)) {
      keywords.long_tail = tk.long_tail;
    }
  }

  // Shape 2: keywords_used (alternative shape from some planners)
  if (plan.keywords_used) {
    const ku = plan.keywords_used;
    if (ku.head_terms) {
      keywords.primary = [...keywords.primary, ...(Array.isArray(ku.head_terms) ? ku.head_terms : [ku.head_terms])];
    }
    if (ku.mid_tail) {
      keywords.secondary = [...keywords.secondary, ...(Array.isArray(ku.mid_tail) ? ku.mid_tail : [ku.mid_tail])];
    }
    if (ku.long_tail) {
      keywords.long_tail = [...keywords.long_tail, ...(Array.isArray(ku.long_tail) ? ku.long_tail : [ku.long_tail])];
    }
  }

  // Deduplicate
  keywords.primary = [...new Set(keywords.primary)];
  keywords.secondary = [...new Set(keywords.secondary)];
  keywords.long_tail = [...new Set(keywords.long_tail)];
  keywords.all = [...new Set([...keywords.primary, ...keywords.secondary, ...keywords.long_tail])];

  return keywords;
}

/**
 * Format keyword targets as readable text for the LLM prompt.
 */
function formatKeywordTargets(keywords, seoItem) {
  const lines = [];

  if (keywords.primary.length) {
    lines.push(`Primary keywords (place in H1/H2 and first paragraphs): ${keywords.primary.join(', ')}`);
  }
  if (keywords.secondary.length) {
    lines.push(`Secondary keywords (place in subheadings and body): ${keywords.secondary.join(', ')}`);
  }
  if (keywords.long_tail.length) {
    lines.push(`Long-tail keywords (place in FAQ answers and detailed paragraphs): ${keywords.long_tail.join(', ')}`);
  }

  // Include keyword distribution if available
  const plan = seoItem.seo_plan_json || {};
  if (plan.keyword_distribution) {
    const dist = plan.keyword_distribution;
    lines.push('');
    lines.push('Keyword distribution per section:');

    if (dist.overview) {
      if (dist.overview.headline_keywords?.length) {
        lines.push(`  Overview headline: ${dist.overview.headline_keywords.join(', ')}`);
      }
      if (dist.overview.body_keywords?.length) {
        lines.push(`  Overview body: ${dist.overview.body_keywords.join(', ')}`);
      }
    }

    if (dist.categories) {
      for (const cat of dist.categories) {
        lines.push(`  ${cat.category_slug} (${cat.category_tier || '?'}):`);
        if (cat.heading_keywords?.length) {
          lines.push(`    Heading: ${cat.heading_keywords.join(', ')}`);
        }
        if (cat.body_keywords?.length) {
          lines.push(`    Body: ${cat.body_keywords.join(', ')}`);
        }
      }
    }

    if (dist.tags) {
      for (const tag of dist.tags) {
        if (tag.keywords?.length) {
          lines.push(`  Tag ${tag.tag_slug}: ${tag.keywords.join(', ')}`);
        }
      }
    }

    if (dist.faq?.keywords?.length) {
      lines.push(`  FAQ: ${dist.faq.keywords.join(', ')}`);
    }
  }

  return lines.join('\n') || 'No keyword targets available.';
}

/**
 * Build the full editing prompt from template + inputs.
 */
function buildPrompt(promptTemplate, contentMarkdown, keywordTargets, toneInstructions) {
  let prompt = promptTemplate;
  prompt = prompt.replace(/\{content_markdown\}/g, contentMarkdown);
  prompt = prompt.replace(/\{keyword_targets\}/g, keywordTargets);
  prompt = prompt.replace(/\{tone_instructions\}/g, toneInstructions);
  return prompt;
}

/**
 * Compare original and revised content line-by-line.
 * Returns a count of changed lines and a summary.
 */
function diffContent(original, revised) {
  const origLines = original.split('\n');
  const revLines = revised.split('\n');

  let changedLines = 0;
  const maxLen = Math.max(origLines.length, revLines.length);

  for (let i = 0; i < maxLen; i++) {
    const origLine = (origLines[i] || '').trim();
    const revLine = (revLines[i] || '').trim();
    if (origLine !== revLine) {
      changedLines++;
    }
  }

  return changedLines;
}

/**
 * Check which keywords now appear in headings (H1/H2) and first paragraphs.
 * Returns an array of { keyword, locations[] } objects.
 */
function analyzeKeywordPlacements(revisedMarkdown, keywords) {
  const placements = [];
  const lines = revisedMarkdown.split('\n');

  // Identify heading lines and first-paragraph lines (first non-empty line after a heading)
  const headingLines = [];
  const firstParaLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^#{1,2}\s+/.test(line)) {
      headingLines.push(line.toLowerCase());
      // Find next non-empty line as first paragraph
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();
        if (nextLine && !/^#{1,6}\s+/.test(nextLine)) {
          firstParaLines.push(nextLine.toLowerCase());
          break;
        }
      }
    }
  }

  const fullTextLower = revisedMarkdown.toLowerCase();

  for (const keyword of keywords.all) {
    const kwLower = keyword.toLowerCase();
    const locations = [];

    // Check headings
    for (const heading of headingLines) {
      if (heading.includes(kwLower)) {
        locations.push('heading');
        break;
      }
    }

    // Check first paragraphs
    for (const para of firstParaLines) {
      if (para.includes(kwLower)) {
        locations.push('first_paragraph');
        break;
      }
    }

    // Check body text
    if (fullTextLower.includes(kwLower)) {
      if (!locations.includes('heading') && !locations.includes('first_paragraph')) {
        locations.push('body');
      }
    }

    if (locations.length > 0) {
      placements.push({ keyword, locations });
    }
  }

  return placements;
}

/**
 * Count total keyword occurrences in text.
 */
function countKeywordOccurrences(text, keywords) {
  const textLower = text.toLowerCase();
  let total = 0;
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    let idx = 0;
    while ((idx = textLower.indexOf(kwLower, idx)) !== -1) {
      total++;
      idx += kwLower.length;
    }
  }
  return total;
}

/**
 * Format keyword placements as readable text for display.
 */
function formatPlacementsText(placements) {
  if (!placements.length) return 'No keyword placements detected.';

  return placements.map(p => {
    return `${p.keyword}: ${p.locations.join(', ')}`;
  }).join('\n');
}

async function execute(input, options, tools) {
  const { entities } = input;
  const { ai_model, ai_provider, prompt: promptTemplate, temperature, tone_style, max_content_chars } = options;
  const { logger, progress, ai } = tools;

  const maxChars = max_content_chars || 50000;
  const toneInstructions = TONE_STYLES[tone_style] || TONE_STYLES.b2b_authoritative;
  const results = [];
  const errors = [];

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Editing ${entity.name}`);

    // Data-shape routing: find content and SEO items by field presence
    const items = entity.items || [];
    const contentItems = items.filter(item => item.content_markdown);
    const seoItems = items.filter(item => item.seo_plan_json);

    if (contentItems.length === 0) {
      const errMsg = 'No content_markdown found. Run content-writer first.';
      logger.error(`${entity.name}: ${errMsg}`);
      errors.push(`${entity.name}: ${errMsg}`);

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          status: 'error',
          word_count: 0,
          tone_changes_count: 0,
          keywords_placed: 0,
          revision_summary: '',
          content_preview: '',
          content_markdown: '',
          keyword_placements: [],
          keyword_placements_text: '',
          error: errMsg,
        }],
        meta: { status: 'error' },
      });
      continue;
    }

    // Use the first content item (content-writer produces one per entity)
    const contentItem = contentItems[0];
    const originalMarkdown = contentItem.content_markdown || '';

    // Truncate if necessary
    const truncatedMarkdown = originalMarkdown.length > maxChars
      ? originalMarkdown.substring(0, maxChars) + '\n\n[Content truncated at ' + maxChars + ' characters]'
      : originalMarkdown;

    // Extract keywords from SEO plan if available
    const seoItem = seoItems.length > 0 ? seoItems[0] : null;
    const keywords = seoItem ? extractKeywords(seoItem) : { primary: [], secondary: [], long_tail: [], all: [] };
    const keywordTargets = seoItem
      ? formatKeywordTargets(keywords, seoItem)
      : 'No SEO plan available. Focus on tone improvements only.';

    if (!seoItem) {
      logger.warn(`${entity.name}: no seo_plan_json found — editing for tone only, no keyword targets`);
    }

    try {
      logger.info(`${entity.name}: editing content with ${ai_provider}/${ai_model} (tone: ${tone_style}, temp: ${temperature})`);

      const prompt = buildPrompt(promptTemplate, truncatedMarkdown, keywordTargets, toneInstructions);

      const response = await ai.complete({
        prompt,
        model: ai_model,
        provider: ai_provider,
      });

      // The LLM returns revised markdown directly
      let revisedMarkdown = response.text;

      // Strip code fences if LLM wrapped the output despite instructions
      revisedMarkdown = revisedMarkdown.replace(/^```(?:markdown|md)?\s*\n?/, '').replace(/\n?```\s*$/, '');

      // Compute diff stats
      const toneChangesCount = diffContent(originalMarkdown, revisedMarkdown);

      // Analyze keyword placements in revised content
      const placements = analyzeKeywordPlacements(revisedMarkdown, keywords);
      const keywordsPlacedCount = placements.length;

      // Count keyword occurrences before and after
      const kwBefore = countKeywordOccurrences(originalMarkdown, keywords.all);
      const kwAfter = countKeywordOccurrences(revisedMarkdown, keywords.all);

      // Build revision summary
      const wordCountOriginal = originalMarkdown.split(/\s+/).filter(Boolean).length;
      const wordCountRevised = revisedMarkdown.split(/\s+/).filter(Boolean).length;
      const wordDiff = wordCountRevised - wordCountOriginal;
      const wordDiffStr = wordDiff >= 0 ? `+${wordDiff}` : `${wordDiff}`;

      const summaryParts = [
        `${toneChangesCount} lines changed`,
        `${keywordsPlacedCount}/${keywords.all.length} target keywords placed`,
        `keyword occurrences: ${kwBefore} -> ${kwAfter}`,
        `word count: ${wordCountOriginal} -> ${wordCountRevised} (${wordDiffStr})`,
        `tone style: ${tone_style}`,
      ];
      const revisionSummary = summaryParts.join(' | ');

      const contentPreview = revisedMarkdown.substring(0, 300) + (revisedMarkdown.length > 300 ? '...' : '');

      const resultItem = {
        entity_name: entity.name,
        status: 'edited',
        word_count: wordCountRevised,
        tone_changes_count: toneChangesCount,
        keywords_placed: keywordsPlacedCount,
        revision_summary: revisionSummary,
        content_preview: contentPreview,
        content_markdown: revisedMarkdown,
        keyword_placements: placements,
        keyword_placements_text: formatPlacementsText(placements),
        error: '',
      };

      results.push({
        entity_name: entity.name,
        items: [resultItem],
        meta: {
          status: 'success',
          tone_changes_count: toneChangesCount,
          keywords_placed: keywordsPlacedCount,
          word_count: wordCountRevised,
        },
      });

      logger.info(`${entity.name}: editing complete — ${toneChangesCount} lines changed, ${keywordsPlacedCount} keywords placed, kw occurrences ${kwBefore}->${kwAfter}`);

    } catch (err) {
      logger.error(`${entity.name}: editing failed — ${err.message}`);
      errors.push(`${entity.name}: ${err.message}`);

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          status: 'error',
          word_count: 0,
          tone_changes_count: 0,
          keywords_placed: 0,
          revision_summary: '',
          content_preview: '',
          content_markdown: '',
          keyword_placements: [],
          keyword_placements_text: '',
          error: err.message,
        }],
        meta: { status: 'error' },
      });
    }
  }

  const successCount = results.filter(r => r.meta.status === 'success').length;
  const totalChanges = results.reduce((sum, r) => sum + (r.meta.tone_changes_count || 0), 0);
  const totalKeywords = results.reduce((sum, r) => sum + (r.meta.keywords_placed || 0), 0);
  const description = errors.length > 0
    ? `${successCount}/${entities.length} entities edited (${totalChanges} line changes, ${totalKeywords} keywords placed) — ${errors.length} error(s)`
    : `${successCount} entities edited — ${totalChanges} total line changes, ${totalKeywords} keywords placed`;

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
