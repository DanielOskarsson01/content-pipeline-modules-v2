/**
 * Decision-Maker Selector v1.0.0 -- Step 4 Filtering submodule.
 *
 * Client-side role selection over people records fetched by Step-3 api-fetcher
 * (e.g. the Bright Data LinkedIn-people Search provider). Server-side `includes`
 * is an unanchored substring match, so it cannot select titles cleanly: the token
 * "CTO" matches "dire[cto]r" and "fa[cto]ry". This module applies WORD-BOUNDARY
 * regexes to the returned titles to keep only real decision-makers, and records
 * which pattern caught each one so misfires are diagnosable.
 *
 * The role list is fully configurable (options.roles). Nothing is hardcoded to a
 * vertical. Records whose title is null / empty / an emoji / a slogan match no
 * pattern and are dropped, not selected.
 *
 * Data operation: SELECT (<) -- fewer items out than in (non-decision-makers removed).
 */

// Default role list: acronym AND spelled-out forms. Override via options.roles.
const DEFAULT_ROLES = [
  { role: 'CEO',      patterns: ['CEO', 'Chief Executive'] },
  { role: 'CTO',      patterns: ['CTO', 'Chief Technology', 'Chief Technical'] },
  { role: 'CMO',      patterns: ['CMO', 'Chief Marketing'] },
  { role: 'CPO',      patterns: ['CPO', 'Chief Product'] },
  { role: 'Founder',  patterns: ['Founder', 'Co-Founder', 'Co Founder', 'Cofounder'] },
  { role: 'Head',     patterns: ['Head of'] },
  { role: 'VP',       patterns: ['VP', 'Vice President'] },
  { role: 'Director', patterns: ['Director of'] },
];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Flatten the role config into compiled word-boundary patterns.
// Returns [{ role, phrase, regex }]. \b anchors both ends so "CTO" cannot
// match inside "director"/"factory", while multi-word phrases ("Head of",
// "Chief Technology") match on token boundaries.
function buildRolePatterns(roleConfig) {
  const roles = Array.isArray(roleConfig) ? roleConfig : DEFAULT_ROLES;
  const out = [];
  for (const entry of roles) {
    if (!entry || !entry.role || !Array.isArray(entry.patterns)) continue;
    for (const phrase of entry.patterns) {
      if (!phrase) continue;
      out.push({ role: entry.role, phrase, regex: new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'i') });
    }
  }
  return out;
}

// Match one title against the compiled patterns. First hit wins.
// Returns { matched, role, pattern } where pattern is the catching regex source.
function matchTitle(title, patterns) {
  if (title == null || typeof title !== 'string' || title.trim() === '') return { matched: false };
  for (const p of patterns) {
    if (p.regex.test(title)) return { matched: true, role: p.role, pattern: p.regex.source };
  }
  return { matched: false };
}

// Select decision-makers from an array of records. Each kept record is annotated
// with matched_role + matched_pattern. options: { roles, titleField, _patterns }.
function selectDecisionMakers(records, options = {}) {
  const patterns = options._patterns || buildRolePatterns(options.roles);
  const titleField = options.titleField || 'position';
  const selected = [];
  for (const rec of records || []) {
    if (!rec) continue;
    const hit = matchTitle(rec[titleField], patterns);
    if (hit.matched) selected.push({ ...rec, matched_role: hit.role, matched_pattern: hit.pattern });
  }
  return selected;
}

// Accept a textarea config ("Role | phrase1, phrase2" per line) from the UI, or
// a structured array, or nothing (-> DEFAULT_ROLES).
function parseRoles(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== 'string') return DEFAULT_ROLES;
  const roles = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf('|');
    if (i === -1) { roles.push({ role: t, patterns: [t] }); continue; }
    const role = t.slice(0, i).trim();
    const patterns = t.slice(i + 1).split(',').map((s) => s.trim()).filter(Boolean);
    if (role && patterns.length) roles.push({ role, patterns });
  }
  return roles.length ? roles : DEFAULT_ROLES;
}

// ── Pipeline entry (Step 4) ───────────────────────────────────────────
// Reads pool items per entity, keeps only decision-makers by title, annotates them.
async function execute(input, options, tools) {
  const { entities } = input;
  const { logger, progress } = tools;
  const roles = parseRoles(options && options.roles);
  const patterns = buildRolePatterns(roles);
  const titleField = (options && options.title_field) || 'title';

  const results = [];
  for (let ei = 0; ei < entities.length; ei++) {
    const entity = entities[ei];
    const name = entity.name || 'unknown';
    if (progress && progress.update) progress.update(ei + 1, entities.length, `Selecting decision-makers for ${name}`);
    const items = Array.isArray(entity.items) ? entity.items : [];
    const kept = selectDecisionMakers(items, { _patterns: patterns, titleField });
    if (logger && logger.info) logger.info(`${name}: ${kept.length} decision-maker(s) of ${items.length} people`);
    results.push({
      entity_name: name,
      items: kept,
      meta: { total_in: items.length, selected: kept.length, dropped: items.length - kept.length },
    });
  }

  const totalSelected = results.reduce((s, r) => s + r.items.length, 0);
  const totalIn = results.reduce((s, r) => s + r.meta.total_in, 0);
  return {
    results,
    summary: {
      total_entities: entities.length,
      total_items: totalSelected,
      description: `${totalSelected} decision-makers selected from ${totalIn} people across ${entities.length} ${entities.length === 1 ? 'entity' : 'entities'}`,
      errors: [],
    },
  };
}

module.exports = execute;
module.exports.DEFAULT_ROLES = DEFAULT_ROLES;
module.exports.buildRolePatterns = buildRolePatterns;
module.exports.matchTitle = matchTitle;
module.exports.selectDecisionMakers = selectDecisionMakers;
module.exports.parseRoles = parseRoles;
