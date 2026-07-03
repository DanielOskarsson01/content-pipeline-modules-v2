/**
 * URL Heuristics - Step 2 validation submodule
 *
 * Zero-cost deterministic URL scoring. Rejects obvious non-content URLs
 * (pagination, archives, auth pages, web cruft) before the pool reaches
 * expensive scraping/LLM steps.
 *
 * Decisions: allow | allow_hint | reject, each with a reasons string.
 * Shadow mode (default) annotates every item and drops nothing;
 * enforce mode drops reject items (allow_hint always kept).
 *
 * Pure function of (items, options) — no network, no LLM, no credentials.
 */

const MANIFEST_VERSION = require('./manifest.json').version;

const PATTERN_REJECT_SCORE = 0.1;
const TITLE_PENALTY = 0.5;
const STRUCTURAL_PENALTY = 0.25; // each: depth, query params, fragment

// ── Option parsing (UI may store numbers as strings) ────────────────

function toNum(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function parseLines(val) {
  return String(val ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function compileRegexList(val, label, logger) {
  const regexes = [];
  for (const line of parseLines(val)) {
    try {
      regexes.push({ source: line, re: new RegExp(line, 'i') });
    } catch (err) {
      logger.warn(`Invalid regex in ${label} skipped: "${line}" (${err.message})`);
    }
  }
  return regexes;
}

// ── Scoring engine ───────────────────────────────────────────────────

function firstMatch(regexes, text) {
  for (const { source, re } of regexes) {
    if (re.test(text)) return source;
  }
  return null;
}

function needsRender(host, domains) {
  for (const d of domains) {
    const dom = d.toLowerCase();
    if (host === dom || host.endsWith('.' + dom)) return true;
  }
  return false;
}

function scoreUrl(item, cfg) {
  const url = item.url;
  const reasons = [];

  // Signal 1: reject patterns — any match rejects outright
  const rejectHit = firstMatch(cfg.rejectPatterns, url);
  if (rejectHit) {
    return { decision: 'reject', score: PATTERN_REJECT_SCORE, reasons: [`url_pattern: ${rejectHit}`] };
  }

  let score = 1.0;

  // Signal 4: title/snippet tells — one penalty regardless of how many patterns match
  const titleText = [item.title, item.snippet].filter((v) => typeof v === 'string' && v).join(' ');
  if (titleText) {
    const titleHit = firstMatch(cfg.titlePatterns, titleText);
    if (titleHit) {
      score -= TITLE_PENALTY;
      reasons.push(`title_pattern: ${titleHit}`);
    }
  }

  // Signal 3: structural scoring (skipped for unparseable URLs)
  let parsed = null;
  try {
    parsed = new URL(url);
  } catch (err) {
    reasons.push('unparseable_url');
  }
  if (parsed) {
    if (cfg.maxDepth > 0) {
      const depth = parsed.pathname.split('/').filter(Boolean).length;
      if (depth > cfg.maxDepth) {
        score -= STRUCTURAL_PENALTY;
        reasons.push(`depth: ${depth} > ${cfg.maxDepth}`);
      }
    }
    if (cfg.maxQueryParams > 0) {
      const paramCount = [...parsed.searchParams.keys()].length;
      if (paramCount > cfg.maxQueryParams) {
        score -= STRUCTURAL_PENALTY;
        reasons.push(`query_params: ${paramCount} > ${cfg.maxQueryParams}`);
      }
    }
    if (parsed.hash) {
      score -= STRUCTURAL_PENALTY;
      reasons.push('fragment');
    }
  }

  score = Math.max(0, score);

  // Signal 2: hint patterns — cap at allow_hint (unless score already rejects)
  const hintHit = firstMatch(cfg.hintPatterns, url);
  if (hintHit) reasons.push(`hint_pattern: ${hintHit}`);

  let decision;
  if (score < cfg.rejectThreshold) decision = 'reject';
  else if (hintHit || score < cfg.hintThreshold) decision = 'allow_hint';
  else decision = 'allow';

  return { decision, score, reasons };
}

// ── Main execute ─────────────────────────────────────────────────────

async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress } = tools;

  const cfg = {
    mode: options.mode === 'enforce' ? 'enforce' : 'shadow',
    rejectPatterns: compileRegexList(options.reject_url_patterns, 'reject_url_patterns', logger),
    hintPatterns: compileRegexList(options.hint_url_patterns, 'hint_url_patterns', logger),
    titlePatterns: compileRegexList(options.title_reject_patterns, 'title_reject_patterns', logger),
    maxDepth: toNum(options.max_depth, 6),
    maxQueryParams: toNum(options.max_query_params, 3),
    rejectThreshold: toNum(options.reject_threshold, 0.3),
    hintThreshold: toNum(options.hint_threshold, 0.6),
    renderDomains: parseLines(options.needs_render_domains),
  };

  const results = [];
  const loudNotes = [];

  for (let ei = 0; ei < entities.length; ei++) {
    const entity = entities[ei];
    progress.update(ei + 1, entities.length, `Scoring URLs: ${entity.name}`);

    const sourceItems = Array.isArray(entity.items) ? entity.items : [];
    const items = [];
    const counts = { allow: 0, allow_hint: 0, reject: 0, no_url: 0 };

    for (const item of sourceItems) {
      if (!item || typeof item.url !== 'string' || !item.url) {
        // Pass through unchanged — a missing url is not this module's verdict to make
        logger.warn(`${entity.name}: item with no url passed through unchanged`);
        counts.no_url++;
        items.push({ ...item });
        continue;
      }

      const { decision, score, reasons } = scoreUrl(item, cfg);
      counts[decision]++;

      if (cfg.mode === 'enforce' && decision === 'reject') continue;

      let host = '';
      try {
        host = new URL(item.url).hostname.toLowerCase();
      } catch (err) { /* unparseable — no render flag */ }

      items.push({
        ...item,
        entity_name: entity.name,
        decision,
        score,
        reasons: reasons.join('; '),
        needs_render: cfg.renderDomains.length > 0 ? needsRender(host, cfg.renderDomains) : false,
        validator_version: MANIFEST_VERSION,
      });
    }

    const scoredCount = sourceItems.length - counts.no_url;
    const meta = {
      total: sourceItems.length,
      allow: counts.allow,
      allow_hint: counts.allow_hint,
      rejected: counts.reject,
      no_url: counts.no_url,
      kept: items.length,
      mode: cfg.mode,
    };

    if (cfg.mode === 'enforce' && scoredCount > 0 && counts.reject === scoredCount) {
      meta.note = `all ${scoredCount} items rejected — pool will be empty for this entity`;
      loudNotes.push(`${entity.name}: all ${scoredCount} items rejected`);
      logger.warn(`${entity.name}: ${meta.note}`);
    }

    results.push({ entity_name: entity.name, items, meta });

    if (tools._partialItems) tools._partialItems.push(...items);

    logger.info(
      `${entity.name}: ${scoredCount} scored — ${counts.allow} allow, ${counts.allow_hint} hint, ${counts.reject} reject` +
      (cfg.mode === 'enforce' ? ` (${counts.reject} dropped)` : ' (shadow — nothing dropped)')
    );
  }

  const totalIn = results.reduce((s, r) => s + r.meta.total, 0);
  const totalKept = results.reduce((s, r) => s + r.meta.kept, 0);
  const totalReject = results.reduce((s, r) => s + r.meta.rejected, 0);
  const totalHint = results.reduce((s, r) => s + r.meta.allow_hint, 0);

  let description =
    cfg.mode === 'enforce'
      ? `${totalKept} of ${totalIn} URLs kept (${totalReject} rejected, ${totalHint} hinted)`
      : `${totalIn} URLs scored: ${totalReject} reject, ${totalHint} hint (shadow — nothing dropped)`;
  if (loudNotes.length > 0) description += ` — ${loudNotes.join('; ')}`;

  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalKept,
      description,
      errors: [],
    },
  };
}

module.exports = execute;
