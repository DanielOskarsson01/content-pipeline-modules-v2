/**
 * Content Writer — Step 5 Generation submodule
 *
 * Writes content using up to THREE inputs:
 * 1. Content analysis (required — what to write about)
 * 2. SEO plan (optional — keyword distribution, FAQs)
 * 3. Scraped source content (raw material for specific, detailed prose)
 *
 * v1.4.0: seo-planner dependency is optional. Writer warns and proceeds
 *         without SEO plan section when seo-planner has not run upstream.
 * v1.5.0: agnostic allowed_slug_paths option — when set, prepends a per-entity
 *         ALLOWED SLUGS block above the narrative. Submodule code does not
 *         know about category/tag/slug as content-type-specific concepts.
 * v1.6.0: agnostic manifest default prompt (no OnlyiGaming / iGaming / bracket-
 *         heading format). New `requires_prompt_override` option mirrors the
 *         seo-planner v2.2.0 pattern: when a template sets the flag true AND
 *         no override is configured (prompt equals manifest default), refuse
 *         the run early with a clear actionable error. Templates that depend
 *         on pipeline-specific shape (company-profile bracket headings, news
 *         article structure, podcast episode layout) set the flag true on
 *         their preset_map.content-writer.fallback_values.
 *
 * Data operation: ADD (+) — adds written content alongside analysis.
 * Requires content-analyzer. seo-planner is optional.
 */

const MANIFEST = require('./manifest.json');
const MANIFEST_DEFAULT_PROMPT = MANIFEST.options_defaults.prompt;

/**
 * Replace prompt placeholders with actual content.
 *
 * Uses function-form replacement everywhere a caller-supplied value is inserted.
 * String.prototype.replace interprets $-patterns ($$, $&, $`, $', $n) in a
 * STRING replacement, which mangles scraped source content or reference docs
 * containing those sequences (ubiquitous — "$$" for money, "$&" in URLs). A
 * replacer function inserts the value literally.
 */
function buildPrompt(promptTemplate, entityContent, referenceDocs) {
  return resolveDocs(promptTemplate.replace(/\{entity_content\}/g, () => entityContent), referenceDocs);
}

/**
 * Resolve {doc:filename} placeholders + strip any that go unmatched. Shared by
 * buildPrompt and buildCachedPrompt so both produce identical bytes.
 */
function resolveDocs(text, referenceDocs) {
  let out = text;
  if (referenceDocs && typeof referenceDocs === 'object') {
    for (const [filename, content] of Object.entries(referenceDocs)) {
      const str = String(content);
      out = out.replace(new RegExp(`\\{doc:${escapeRegex(filename)}\\}`, 'g'), () => str);
    }
  }
  return out.replace(/\{doc:[^}]+\}/g, '');
}

/**
 * Cache-aware variant (BACKLOG #21, mirrors content-analyzer ff28469). Splits
 * the assembled prompt at {entity_content} so the STABLE head (instructions +
 * any {doc:} reference docs placed before the entity content) can be sent as an
 * Anthropic prompt-cache block; the VARIABLE per-entity tail is the uncached
 * remainder. Returns { prompt, cachePrefix } where cachePrefix + prompt is
 * BYTE-IDENTICAL to buildPrompt() output — caching changes billing only.
 * Splits only when {entity_content} occurs exactly once; 0 or >1 occurrences
 * fall back to the full single prompt with an empty prefix. A prefix below the
 * model's cache minimum silently won't cache — harmless (the caller logs it).
 */
function buildCachedPrompt(promptTemplate, entityContent, referenceDocs) {
  const full = buildPrompt(promptTemplate, entityContent, referenceDocs);
  const parts = promptTemplate.split('{entity_content}');
  if (parts.length === 2) {
    const cachePrefix = resolveDocs(parts[0], referenceDocs);
    const prompt = resolveDocs(entityContent + parts[1], referenceDocs);
    // BULLETPROOF GUARD: only cache-split when it reassembles to the EXACT
    // single-prompt bytes; any divergence falls back to no caching.
    if (cachePrefix + prompt === full) return { prompt, cachePrefix };
  }
  return { prompt: full, cachePrefix: '' };
}

// ~4096 tokens — the largest documented per-model cache minimum. A shorter
// prefix is silently not cached by the API; we log so the no-op is visible.
const MIN_CACHEABLE_PREFIX_CHARS = 16384;

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Count words in a text string.
 */
function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Count markdown heading sections (## or ###).
 */
function countSections(markdown) {
  const headings = markdown.match(/^#{2,3}\s+/gm);
  return headings ? headings.length : 0;
}

/**
 * Check if content contains [#n] citation patterns (v1.2.0+ format).
 * Also checks older patterns for backwards compatibility.
 */
function hasCitations(text) {
  // v1.2.0+: [#n] inline citation format
  return /\[#\d+\]/.test(text)
    // Fallback: markdown links, (Source:...), etc.
    || /\[.*?\]\(https?:\/\/.*?\)/.test(text)
    || /\(Source:/.test(text);
}

/**
 * Assemble scraped page content into a text block, truncated to maxChars.
 */
function assembleSourceContent(scrapedItems, maxChars) {
  const parts = [];
  for (const item of scrapedItems) {
    const header = `--- Page: ${item.title || 'Untitled'} (${item.url || 'unknown'}) ---`;
    const content = item.text_content || '';
    parts.push(`${header}\n${content}`);
  }
  let assembled = parts.join('\n\n');
  if (assembled.length > maxChars) {
    assembled = assembled.substring(0, maxChars) + '\n\n[Source content truncated at ' + maxChars + ' characters]';
  }
  return assembled;
}

/**
 * Walk a simple dot-notation path with `[]` array iteration into a structured object.
 *
 * Path examples (the path syntax is intentionally tiny — no JSONPath dependency):
 *   "categories.primary[].slug"           → for each x in obj.categories.primary, return x.slug
 *   "tags.existing[].slug"                → for each x in obj.tags.existing, return x.slug
 *   "tags.suggested_new[].label"          → for each x in obj.tags.suggested_new, return x.label
 *   "headline"                            → return [obj.headline] if string
 *   "guests[].name"                       → for each x in obj.guests, return x.name
 *   "topics[]"                            → return obj.topics (flat string array)
 *
 * Always returns an array of strings. Missing fields, wrong types, and
 * non-string leaves all collapse to an empty result rather than throwing.
 *
 * This walker is pipeline-agnostic — it does not know about categories, tags,
 * or any other content-type-specific field. The template provides the paths.
 */
function walkSlugPath(obj, path) {
  if (obj == null || typeof path !== 'string' || path.length === 0) return [];
  const segments = path.split('.');
  let curr = obj;

  for (let i = 0; i < segments.length; i++) {
    let seg = segments[i];
    if (curr == null) return [];

    const arrayIter = seg.endsWith('[]');
    if (arrayIter) seg = seg.slice(0, -2);

    const nextField = seg.length > 0 ? curr[seg] : curr;

    if (arrayIter) {
      if (!Array.isArray(nextField)) return [];
      const restPath = segments.slice(i + 1).join('.');
      if (restPath === '') {
        return nextField
          .map(x => (typeof x === 'string' ? x.trim() : ''))
          .filter(Boolean);
      }
      return nextField.flatMap(item => walkSlugPath(item, restPath));
    }

    curr = nextField;
  }

  if (typeof curr === 'string') return [curr.trim()].filter(Boolean);
  if (Array.isArray(curr)) return curr.filter(x => typeof x === 'string').map(s => s.trim()).filter(Boolean);
  return [];
}

/**
 * Parse the `allowed_slug_paths` textarea option into [{ label, path }] entries.
 *
 * Config format (one entry per line):
 *   <BracketLabel>=<dot.notation.path>
 *
 * Example (company-profile pipeline):
 *   Primary Category=categories.primary[].slug
 *   Secondary Category=categories.secondary[].slug
 *   Tag=tags.existing[].slug
 *   Tag=tags.suggested_new[].label
 *
 * Lines starting with `#` and blank lines are ignored. Labels may repeat — the
 * walker concatenates results into the same label's slug list (useful for
 * tags coming from two analyzer fields, as in the example above).
 *
 * Returns an empty array when the option is empty or missing — in which case
 * the assembleEntityContent function emits no ALLOWED SLUGS block at all,
 * preserving fully generic behavior for content types that do not use slug
 * brackets (cover letters, news articles, etc.).
 */
function parseAllowedSlugConfig(configStr) {
  if (!configStr || typeof configStr !== 'string') return [];
  return configStr
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .map(line => {
      const eq = line.indexOf('=');
      if (eq < 1) return null;
      const label = line.slice(0, eq).trim();
      const path = line.slice(eq + 1).trim();
      if (!label || !path) return null;
      return { label, path };
    })
    .filter(Boolean);
}

/**
 * Count how many slugs resolve across all configured paths for an analyzer item.
 *
 * Used by execute() to detect the W1.2 "allowed_slug_paths configured but
 * nothing resolved" condition — previously a SILENT omission of the closed-
 * vocabulary block (renderAllowedSlugsBlock returns null), which let the model
 * emit invalid slug values with no signal. Returns 0 when the analyzer item has
 * no analysis_json or none of the configured paths match — exactly the cases
 * where renderAllowedSlugsBlock would have returned null for lack of slugs.
 */
function countResolvedSlugs(analyzerItem, config) {
  const aj = analyzerItem && analyzerItem.analysis_json;
  if (!aj || typeof aj !== 'object' || !Array.isArray(config)) return 0;
  let total = 0;
  for (const { path } of config) total += walkSlugPath(aj, path).length;
  return total;
}

/**
 * Render the per-entity ALLOWED SLUGS block, IF the template configured any
 * allowed-slug paths. Otherwise return null and assembleEntityContent skips
 * the block entirely (pure-narrative content types unaffected).
 *
 * The block is prepended to the entity content so the model encounters it
 * before the narrative source pages, which historically drown structural
 * rules under prose patterns.
 */
function renderAllowedSlugsBlock(analyzerItem, config) {
  if (!Array.isArray(config) || config.length === 0) return null;
  const aj = analyzerItem && analyzerItem.analysis_json;
  if (!aj || typeof aj !== 'object') return null;

  // Group slugs by label (so e.g. "Tag" can collect from multiple paths).
  const labelToSlugs = new Map();
  for (const { label, path } of config) {
    const found = walkSlugPath(aj, path);
    if (!labelToSlugs.has(label)) labelToSlugs.set(label, []);
    labelToSlugs.get(label).push(...found);
  }
  // Deduplicate each label's list, preserve insertion order.
  for (const [label, slugs] of labelToSlugs.entries()) {
    labelToSlugs.set(label, [...new Set(slugs)]);
  }

  // If every label resolved to empty, no point emitting the block.
  const hasAnySlug = Array.from(labelToSlugs.values()).some(arr => arr.length > 0);
  if (!hasAnySlug) return null;

  const fmt = (arr) => arr.length > 0 ? arr.map(s => `\`${s}\``).join(', ') : '(none)';
  const lines = [
    '=== ALLOWED SLUGS FOR THIS ARTICLE (closed vocabulary) ===',
    '',
    "The lists below are the ONLY values you may emit inside the corresponding bracket labels in your output. Any other value is INVALID and will fail validation. The template configured these paths via the `allowed_slug_paths` submodule option.",
    '',
  ];
  for (const [label, slugs] of labelToSlugs.entries()) {
    lines.push(`**[${label}: <slug>]** — allowed values: ${fmt(slugs)}`);
  }
  lines.push('');
  lines.push("Source content (scraped pages below, if present) provides NARRATIVE MATERIAL ONLY. It does NOT provide slugs. Even if the source content repeats phrases that look like slug candidates, those are marketing or editorial language, not slugs. Slugs come exclusively from the lists above.");
  lines.push('');
  return lines.join('\n');
}

/**
 * Assemble entity content from analyzer output, optional planner output, and scraped sources.
 *
 * v1.4.0: plannerItem is optional — SEO plan section omitted when null.
 * v1.5.0: Prepend ALLOWED SLUGS block when the template configures
 *         `allowed_slug_paths`. Pipeline-agnostic: cover letters, news, podcasts,
 *         etc. that do not configure the option get unchanged behavior.
 */
function assembleEntityContent(analyzerItem, plannerItem, sourceContent, allowedSlugPaths) {
  const parts = [];

  const slugBlock = renderAllowedSlugsBlock(
    analyzerItem,
    parseAllowedSlugConfig(allowedSlugPaths)
  );
  if (slugBlock) parts.push(slugBlock);

  parts.push('=== CONTENT ANALYSIS ===');
  if (analyzerItem.analysis_json) {
    parts.push(JSON.stringify(analyzerItem.analysis_json, null, 2));
  } else {
    parts.push(JSON.stringify(analyzerItem, null, 2));
  }

  if (plannerItem) {
    parts.push('\n=== SEO CONTENT PLAN ===');
    if (plannerItem.seo_plan_json) {
      parts.push(JSON.stringify(plannerItem.seo_plan_json, null, 2));
    } else {
      parts.push(JSON.stringify(plannerItem, null, 2));
    }
  }

  parts.push('\n=== SOURCE CONTENT (scraped pages) ===');
  parts.push(sourceContent);

  return parts.join('\n');
}

/**
 * Resolve meta title + description from the seo-planner output, tolerating the
 * shapes the planner actually emits. Priority:
 *   1. seo_plan_json.meta.{title,description}                       (top-level, legacy)
 *   2. seo_plan_json.sections.meta.meta_{title,description}.candidate
 *      (seo-planner's real output — length-validated candidates it already built)
 *   3. plannerItem.meta_{title,description}                         (flat field, legacy)
 *   4. entity name (title only; description stays empty rather than invented)
 *
 * Emitting these onto the pool item lets meta-compliance-checker (priority-1
 * read) see the PLANNED meta instead of the entity name / raw og:description —
 * which is what made meta:fail a batch-wide constant in the 2026-07-14
 * calibration (title "ELK Studios" = 11 chars, desc = 210+ char og:description).
 * Pipeline-agnostic: reads generic fields, no section names or content-type
 * vocabulary hardcoded.
 *
 * Step 8 meta-output consumes these fields as of BACKLOG #52 (meta-output
 * v1.0.1): its resolution chain is mirrored from meta-compliance-checker and
 * invariant-tested (the same fixture through both modules ships === validated),
 * so the SEO deliverable now carries the planned meta, not entity.name. The
 * loop is closed at delivery.
 */
function resolveMetaFromPlanner(plannerItem, entityName) {
  const plan = plannerItem && plannerItem.seo_plan_json;
  const planMeta = plan && plan.sections && plan.sections.meta;
  const metaTitle =
    (plan && plan.meta && plan.meta.title) ||
    (planMeta && planMeta.meta_title && planMeta.meta_title.candidate) ||
    (plannerItem && plannerItem.meta_title) ||
    entityName;
  const metaDescription =
    (plan && plan.meta && plan.meta.description) ||
    (planMeta && planMeta.meta_description && planMeta.meta_description.candidate) ||
    (plannerItem && plannerItem.meta_description) ||
    '';
  return { metaTitle, metaDescription };
}

async function execute(input, options, tools) {
  const { entities } = input;
  const { ai_model, ai_provider, prompt: promptTemplate, reference_docs, max_source_chars, temperature, max_tokens, allowed_slug_paths, requires_prompt_override, require_slug_paths } = options;
  const { logger, progress, ai } = tools;

  const maxChars = max_source_chars || 100000;
  const results = [];
  const errors = [];

  // Refusal check: per-template fail-loud flag. When a template sets
  // requires_prompt_override = true via preset_map.content-writer.fallback_values,
  // and no prompt override is configured (so options.prompt === the manifest
  // default), refuse the run early with a clear actionable error. The manifest
  // default remains a valid run path when this flag is not set — so cover
  // letters, news articles, podcast pages and any content type that does not
  // depend on pipeline-specific output shape can use the agnostic default.
  if (requires_prompt_override === true && promptTemplate === MANIFEST_DEFAULT_PROMPT) {
    const errMsg = 'Template requires a content-writer prompt override but none is configured. Upload a prompt override in this template\'s content-writer settings, or unset requires_prompt_override on this template.';
    logger.error(`content-writer refused run: ${errMsg}`);
    for (const entity of entities) {
      errors.push(`${entity.name}: ${errMsg}`);
      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          status: 'error',
          word_count: 0,
          section_count: 0,
          has_citations: false,
          meta_title: '',
          content_preview: '',
          content_markdown: '',
          error: errMsg,
        }],
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
        description: `0/${entities.length} items written — refused: template requires prompt override`,
        errors,
      },
    };
  }

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    progress.update(i + 1, entities.length, `Writing content for ${entity.name || 'entity'}`);

    // Find upstream items via source_submodule
    const items = entity.items || [];
    const analyzerItem = items.findLast(item => item.source_submodule === 'content-analyzer');
    const plannerItem = items.findLast(item => item.source_submodule === 'seo-planner');

    // Find scraped source items: items NOT from Step 5 submodules AND with text_content
    // These are the original page-scraper items that flow through the pool
    const scrapedItems = items.filter(item =>
      item.source_submodule !== 'content-analyzer'
      && item.source_submodule !== 'seo-planner'
      && item.text_content
    );

    if (scrapedItems.length === 0) {
      logger.warn(`${entity.name}: no scraped source pages with text_content found — writer will rely on analysis/plan only`);
    }

    if (!analyzerItem) {
      const errMsg = 'Missing upstream output: content-analyzer. Run content-analyzer first.';
      logger.error(`${entity.name}: ${errMsg}`);
      errors.push(`${entity.name}: ${errMsg}`);

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          status: 'error',
          word_count: 0,
          section_count: 0,
          has_citations: false,
          meta_title: '',
          content_preview: '',
          content_markdown: '',
          error: errMsg,
        }],
        meta: { status: 'error' },
      });
      if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }
      continue;
    }

    if (!plannerItem) {
      logger.warn(`${entity.name}: no seo-planner output found — writing without SEO plan`);
    }

    // W1.2 contract-hardening: allowed_slug_paths is configured but no slugs
    // resolved from analysis_json for this entity. Previously this was SILENT —
    // renderAllowedSlugsBlock returned null, the closed-vocabulary block was
    // omitted, and the model could emit invalid slug values with no signal.
    // Warn by default; hard-fail when require_slug_paths is set.
    const slugConfig = parseAllowedSlugConfig(allowed_slug_paths);
    if (slugConfig.length > 0 && countResolvedSlugs(analyzerItem, slugConfig) === 0) {
      const msg = `allowed_slug_paths is configured (${slugConfig.length} path(s)) but no slugs resolved from analysis_json — the closed-vocabulary block will be omitted and the model may emit invalid slug values. Check that content-analyzer produced the expected fields for these paths.`;
      if (require_slug_paths === true) {
        logger.error(`${entity.name}: ${msg}`);
        errors.push(`${entity.name}: ${msg}`);
        results.push({
          entity_name: entity.name,
          items: [{
            entity_name: entity.name,
            status: 'error',
            word_count: 0,
            section_count: 0,
            has_citations: false,
            meta_title: '',
            content_preview: '',
            content_markdown: '',
            error: msg,
          }],
          meta: { status: 'error' },
        });
        if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }
        continue;
      }
      logger.warn(`${entity.name}: ${msg}`);
    }

    try {
      // Get meta title + description from planner for reference (planner may be
      // absent — falls back to entity name for the title, empty description).
      const { metaTitle, metaDescription } = resolveMetaFromPlanner(plannerItem, entity.name);

      logger.info(`${entity.name}: writing content with ${ai_provider}/${ai_model} (${scrapedItems.length} source pages)`);

      // Assemble scraped source content
      const sourceContent = assembleSourceContent(scrapedItems, maxChars);

      // Assemble all three inputs; split the stable template head for Anthropic
      // prompt caching (BACKLOG #21). cachePrefix + prompt is byte-identical to
      // the old single-prompt output — billing-only.
      const entityContent = assembleEntityContent(analyzerItem, plannerItem, sourceContent, allowed_slug_paths);
      const { prompt, cachePrefix } = buildCachedPrompt(promptTemplate, entityContent, reference_docs);
      if (cachePrefix && cachePrefix.length < MIN_CACHEABLE_PREFIX_CHARS) {
        logger.info(`${entity.name}: cache prefix is ${cachePrefix.length} chars — below the ~${MIN_CACHEABLE_PREFIX_CHARS}-char cacheable minimum, so prompt caching will not engage. To enable it, move stable instructions and {doc:} reference docs BEFORE {entity_content} in the prompt template.`);
      }

      const response = await ai.complete({
        prompt,
        cache_prefix: cachePrefix || undefined,
        model: ai_model,
        provider: ai_provider,
        temperature,
        max_tokens,
      });

      // Output is always markdown (v1.2.0+: markdown-only, no JSON output)
      const contentMarkdown = response.text;

      const wordCount = countWords(contentMarkdown);
      const sectionCount = countSections(contentMarkdown);
      const citations = hasCitations(contentMarkdown);
      const contentPreview = contentMarkdown.substring(0, 300) + (contentMarkdown.length > 300 ? '...' : '');

      const resultItem = {
        entity_name: entity.name,
        status: 'written',
        word_count: wordCount,
        section_count: sectionCount,
        has_citations: citations,
        meta_title: metaTitle,
        meta_description: metaDescription,
        content_preview: contentPreview,
        // Full content for detail modal (prose rendering)
        content_markdown: contentMarkdown,
        error: '',
      };

      results.push({
        entity_name: entity.name,
        items: [resultItem],
        meta: { status: 'success', word_count: wordCount, section_count: sectionCount },
      });

      logger.info(`${entity.name}: content written — ${wordCount} words, ${sectionCount} sections, citations: ${citations}`);
      if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }

    } catch (err) {
      logger.error(`${entity.name}: content writing failed — ${err.message}`);
      errors.push(`${entity.name}: ${err.message}`);

      results.push({
        entity_name: entity.name,
        items: [{
          entity_name: entity.name,
          status: 'error',
          word_count: 0,
          section_count: 0,
          has_citations: false,
          meta_title: '',
          content_preview: '',
          content_markdown: '',
          error: err.message,
        }],
        meta: { status: 'error' },
      });
      if (tools._partialItems) { tools._partialItems.length = 0; tools._partialItems.push(...results.flatMap(r => r.items)); }
    }
  }

  const successCount = results.filter(r => r.meta.status === 'success').length;
  const totalWords = results.reduce((sum, r) => sum + (r.meta.word_count || 0), 0);
  const description = errors.length > 0
    ? `${successCount}/${entities.length} items written (${totalWords} words) — ${errors.length} error(s)`
    : `${successCount} items written — ${totalWords} total words`;

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
module.exports.__testing = {
  walkSlugPath,
  parseAllowedSlugConfig,
  countResolvedSlugs,
  renderAllowedSlugsBlock,
  assembleEntityContent,
  buildPrompt,
  buildCachedPrompt,
  resolveMetaFromPlanner,
  MANIFEST_DEFAULT_PROMPT,
};
