'use strict';
/**
 * Prompt-input guard (BACKLOG #63) — shared by the Step-5 generation modules
 * (content-writer, content-analyzer, seo-planner, tone-seo-editor) that assemble
 * an LLM prompt from a template via `{primary}` + `{doc:filename}` interpolation
 * and strip any unmatched `{doc:...}` to empty.
 *
 * That assembly path drops inputs SILENTLY in four ways. Each is a "green but
 * empty" hazard — the run succeeds and ships plausible prose the model wrote
 * from fewer inputs than intended:
 *
 *   missingPrimary            — the primary content placeholder (e.g.
 *                               `{entity_content}`) is absent, so the assembled
 *                               analysis/plan/sources is built then DISCARDED and
 *                               the model writes from the template instructions
 *                               alone. The severe case; the caller decides
 *                               fail-closed vs warn.
 *   unmatchedDocPlaceholders  — `{doc:X}` in the template with no `X` provided in
 *                               referenceDocs → stripped to empty (model never
 *                               sees X). WARN.
 *   selectedNotReferenced     — a referenceDocs entry with no `{doc:X}`
 *                               placeholder to inject it → the attached doc never
 *                               reaches the model. WARN.
 *   namedNotInjected          — a doc-like filename mentioned in the prompt PROSE
 *                               with no `{doc:filename}` placeholder anywhere
 *                               (heuristic; a prompt may legitimately mention a
 *                               filename). WARN.
 *
 * Pure detection — returns the findings; the caller logs and decides fail/warn.
 */

const DOC_PLACEHOLDER_RE = /\{doc:([^}]+)\}/g;
// Doc-ish extensions only, so an ordinary "example.com" or "v1.2" is not flagged.
// ponytail: heuristic — a prose mention of an extension not in this set won't be
// caught (warn-only, so a miss is silent-safe, not wrong). Widen if one slips.
const FILENAME_RE = /[\w-]+\.(?:md|txt|json|jsonl|csv|tsv|ya?ml|html?|pdf|docx?|xlsx?)\b/gi;

/**
 * @param {string} promptTemplate  the prompt template as configured
 * @param {object} referenceDocs   { filename: content } attached to the run
 * @param {string} primaryPlaceholder  the primary content placeholder NAME,
 *   without braces (default 'entity_content'; tone-seo-editor uses 'content_markdown')
 */
function analyzePromptInputs(promptTemplate, referenceDocs, primaryPlaceholder = 'entity_content') {
  const tpl = String(promptTemplate == null ? '' : promptTemplate);
  const docKeys = (referenceDocs && typeof referenceDocs === 'object' && !Array.isArray(referenceDocs))
    ? Object.keys(referenceDocs)
    : [];

  const placeholders = new Set();
  let m;
  DOC_PLACEHOLDER_RE.lastIndex = 0;
  while ((m = DOC_PLACEHOLDER_RE.exec(tpl)) !== null) placeholders.add(m[1].trim());

  const missingPrimary = !tpl.includes(`{${primaryPlaceholder}}`);

  const unmatchedDocPlaceholders = [...placeholders].filter(f => !docKeys.includes(f));
  const selectedNotReferenced = docKeys.filter(f => !placeholders.has(f));

  // Named-but-not-injected: scan the prose with {doc:...} tokens removed, so a
  // filename that DOES have a placeholder is never flagged.
  const prose = tpl.replace(DOC_PLACEHOLDER_RE, ' ');
  const namedNotInjected = [...new Set(prose.match(FILENAME_RE) || [])]
    .filter(f => !placeholders.has(f));

  return {
    missingPrimary,
    primaryPlaceholder,
    unmatchedDocPlaceholders,
    selectedNotReferenced,
    namedNotInjected,
  };
}

/**
 * Emit the three WARN-level conditions. Does NOT emit missingPrimary — the
 * caller owns that decision (fail-closed vs warn). Every line carries the
 * greppable tag `[prompt-input-guard]` and the entity name so a later forensic
 * can find exactly which entity dropped which input. Returns the warn count.
 */
function warnPromptInputs(logger, entityName, findings) {
  let n = 0;
  const tag = '[prompt-input-guard]';
  for (const f of findings.unmatchedDocPlaceholders) {
    logger.warn(`${tag} ${entityName}: {doc:${f}} placeholder has no matching reference doc — it is stripped to empty and the model never sees "${f}".`);
    n++;
  }
  for (const f of findings.selectedNotReferenced) {
    logger.warn(`${tag} ${entityName}: reference doc "${f}" is attached but no {doc:${f}} placeholder injects it — the model never sees it.`);
    n++;
  }
  for (const f of findings.namedNotInjected) {
    logger.warn(`${tag} ${entityName}: prompt names "${f}" in prose but has no {doc:${f}} placeholder — if it is meant to be binding, inject it with {doc:${f}} (or ignore if the mention is incidental).`);
    n++;
  }
  return n;
}

module.exports = { analyzePromptInputs, warnPromptInputs };
