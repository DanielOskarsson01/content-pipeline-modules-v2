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

// ── Company anchor ──────────────────────────────────────────────────
// A matched title sometimes names an ORGANISATION that is NOT the target
// company — a side venture ("Founder of SR Collection"), another current
// employer ("Head of QA at RokkerX"), or a former one ("VP, Head of Tax,
// The LEGO Group"). Those are real title matches but wrong-company
// attributions, so we reject them. Aliases are DERIVED from the roster's own
// current_company_name / current_company_company_id values — never hardcoded —
// so "ARRISE powering Pragmatic Play" survives alongside "Pragmatic Play", and
// "Vegangster" survives "Vegangsters" / "vegangster-team".
//
// This is deliberately SEPARATE from the creative-title filter below so the two
// failure modes stay independently diagnosable, and it never touches Founder
// weighting: a bare "Founder" or "Founder of <target>" always survives.

function normalizeOrg(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Derive the target-company alias set from the roster itself.
function buildCompanyAliases(records, companyField, companyIdField) {
  const set = new Set();
  for (const rec of records || []) {
    if (!rec) continue;
    for (const f of [companyField, companyIdField]) {
      const n = normalizeOrg(rec[f]);
      if (n.length >= 3) set.add(n);
    }
  }
  return set;
}

// Does an org named in a title refer to the target? Conservative substring match
// (either direction, overlap ≥4 chars) so "pragmatic play" matches the alias
// "arrise powering pragmatic play" and "vegangster" matches "vegangsters".
// Bias is toward KEEP (returns true when too short to judge) — recall is protected.
function orgIsTarget(org, aliases) {
  const n = normalizeOrg(org);
  if (n.length < 3) return true;
  for (const a of aliases) {
    if (n === a) return true;
    if (n.length >= 4 && a.includes(n)) return true;
    if (a.length >= 4 && n.includes(a)) return true;
  }
  return false;
}

// Extract the organisation(s) a title names via employer connectors.
// High-confidence for ANY role: " at X" and "@X". For a Founder title, " of X"
// also names a company (you found companies, not departments) — but for
// Head/Director/VP "of X" is the DEPARTMENT and is ignored. A trailing
// ", <Org with a company signal>" (The LEGO Group, Foo Ltd) is also an org.
// Returns [] when the title names no organisation.
// ponytail: English connectors only (at / @ / founder-of / trailing-comma);
// multilingual (" på ", " bei ", " chez ") is a known miss — add tokens if a
// non-EN roster needs anchoring.
const ANCHOR_AT_RE = /(?:\s+at\s+|\s*@\s*)([^,/|]+)/i;
const ANCHOR_FOUNDER_OF_RE = /\b(?:co[-\s]?)?founder\b[^,/|]*?\s+of\s+([^,/|]+)/i;
const ANCHOR_TRAILING_ORG_RE =
  /,\s*((?:the\s+)?[^,]*?\b(?:group|ltd|limited|inc|llc|gmbh|holdings?|corporation|company|studios?|systems?|technologies|labs?)\b[^,]*)$/i;

function extractOrgs(title) {
  const t = String(title == null ? '' : title);
  const orgs = [];
  let m;
  if ((m = ANCHOR_AT_RE.exec(t))) orgs.push(m[1]);
  if ((m = ANCHOR_FOUNDER_OF_RE.exec(t))) orgs.push(m[1]);
  if ((m = ANCHOR_TRAILING_ORG_RE.exec(t))) orgs.push(m[1]);
  return orgs.map((o) => o.trim()).filter(Boolean);
}

// True = keep. Reject only when the title names an org AND none of the named
// orgs is the target/alias. No org named, or no target known -> keep (inert).
function passesCompanyAnchor(title, aliases) {
  const orgs = extractOrgs(title);
  if (orgs.length === 0) return true;
  if (!aliases || aliases.size === 0) return true;
  return orgs.some((o) => orgIsTarget(o, aliases));
}

// ── Creative-title filter (separate failure mode) ───────────────────
// A creative role ("Director of Photography", "Cinematographer") matches the
// "Director of X" pattern but is not an executive. Kept narrow and independent
// of the company anchor so the two are diagnosable in isolation.
// ponytail: narrow token list — widen only if a creative role slips through.
const CREATIVE_RE = /\b(?:photograph|cinematograph|videograph)/i;
function isCreativeTitle(title) {
  return CREATIVE_RE.test(String(title == null ? '' : title));
}

// Select decision-makers from an array of records. Each kept record is annotated
// with matched_role + matched_pattern. A matched title is still dropped if it is
// a creative role or if it anchors to a non-target company.
// options: { roles, titleField, companyField, companyIdField, companyAnchor,
//            _patterns, _rejections }.
function selectDecisionMakers(records, options = {}) {
  const patterns = options._patterns || buildRolePatterns(options.roles);
  const titleField = options.titleField || 'position';
  const companyField = options.companyField || 'current_company_name';
  const companyIdField = options.companyIdField || 'current_company_company_id';
  const anchorOn = options.companyAnchor !== false;
  const aliases = anchorOn ? buildCompanyAliases(records, companyField, companyIdField) : null;
  const reject = (rec, reason) => { if (options._rejections) options._rejections.push({ ...rec, rejected_by: reason }); };
  const selected = [];
  for (const rec of records || []) {
    if (!rec) continue;
    const title = rec[titleField];
    const hit = matchTitle(title, patterns);
    if (!hit.matched) continue;
    if (isCreativeTitle(title)) { reject(rec, 'creative_title'); continue; }
    if (anchorOn && !passesCompanyAnchor(title, aliases)) { reject(rec, 'company_anchor'); continue; }
    selected.push({ ...rec, matched_role: hit.role, matched_pattern: hit.pattern });
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
  const companyField = (options && options.company_field) || 'current_company_name';
  const companyIdField = (options && options.company_id_field) || 'current_company_company_id';
  const companyAnchor = !(options && options.company_anchor === false);

  const results = [];
  for (let ei = 0; ei < entities.length; ei++) {
    const entity = entities[ei];
    const name = entity.name || 'unknown';
    if (progress && progress.update) progress.update(ei + 1, entities.length, `Selecting decision-makers for ${name}`);
    const items = Array.isArray(entity.items) ? entity.items : [];
    const kept = selectDecisionMakers(items, { _patterns: patterns, titleField, companyField, companyIdField, companyAnchor });
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
module.exports.buildCompanyAliases = buildCompanyAliases;
module.exports.extractOrgs = extractOrgs;
module.exports.orgIsTarget = orgIsTarget;
module.exports.passesCompanyAnchor = passesCompanyAnchor;
module.exports.isCreativeTitle = isCreativeTitle;
