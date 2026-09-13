/**
 * QA-verdict collector for Step 8 bundlers (M2).
 *
 * Failing QA does NOT block delivery — a human decides whether thin sections
 * or a short meta description are shippable. This helper makes that decision
 * VISIBLE by carrying the verdict with the content: bundlers call it on the
 * entity's pool items and attach the result as additive metadata (json-output
 * `qa` block, markdown-output frontmatter fields). It is never a gate.
 *
 * Data-shape routing (modules CLAUDE.md, Step 8 rule): shapes are found by
 * FIELD presence, never by source_submodule —
 *   - router shape:  `decision` + `qa_scores`   (Step 7 loop-router output)
 *   - checker shape: `qa_pass`                  (Step 6 QA checker outputs)
 * `source_submodule` is read ONLY as a provenance label for failed checker
 * names when no router item names them.
 *
 * Returns null when the pool carries no QA shapes — callers omit the block,
 * so bundles from QA-less pipelines are byte-identical to before.
 *
 * UNIT D — reviewable detail: `qa.flags` surfaces WHICH items each failed check
 * objects to, so a reviewer checks two or three sentences instead of re-reading
 * the whole profile. It is present ONLY when at least one failed check carries
 * detail (so a clean or detail-less pool stays byte-identical). The shape is
 * generic — an array of `{ check, <detail> }` — so a new check adds its own
 * detail extractor here without any consumer schema change. Today only
 * hallucination-detector populates it (per-claim {claim, severity, verdict,
 * evidence, cited_source?}); a structural/meta check would add its own branch.
 */
function collectQaVerdict(items) {
  const list = items || [];
  const routerItems = list.filter(it => it && it.decision !== undefined && it.qa_scores !== undefined);
  const checkItems = list.filter(it => it && it.qa_pass !== undefined);
  if (!routerItems.length && !checkItems.length) return null;

  // Latest item per shape — same convention the bundlers use for content
  // (step-6/7 `add` upserts by (entity, source_submodule), so per checker
  // only the latest round survives in the pool anyway).
  const router = routerItems.length ? routerItems.at(-1) : null;
  const failed = checkItems.filter(it => it.qa_pass === false || it.qa_pass === 'false');
  const passed = checkItems.filter(it => it.qa_pass === true || it.qa_pass === 'true');

  const qa = {};
  if (router) {
    qa.verdict = router.decision;
    const fc = router.failed_checks;
    // loop-router emits the SENTINEL 'none' for approved entities — that is
    // "no failed checks", not a check named none. Filter it out so clean
    // bundles carry failed_checks: [].
    qa.failed_checks = (Array.isArray(fc)
      ? fc.map(s => String(s).trim())
      : String(fc || '').split(',').map(s => s.trim())
    ).filter(s => s && s.toLowerCase() !== 'none');
  } else {
    qa.verdict = failed.length > 0 ? 'qa_failed' : 'qa_passed';
    qa.failed_checks = failed.map(it => it.source_submodule || 'unknown-check');
  }
  if (router && router.qa_scores && typeof router.qa_scores === 'object') {
    qa.scores = router.qa_scores;
  }
  qa.checks_passed = passed.length;
  qa.checks_failed = failed.length;
  // Flagged = the router did not approve (e.g. flag_manual), or — with no
  // router in the pool — any checker failed. A human should look before
  // publishing; delivery itself is unaffected.
  qa.flagged = router ? router.decision !== 'approve' : failed.length > 0;

  // UNIT D: reviewable per-check detail. Built from the failed CHECKER items
  // (independent of the router — the detail lives on the checker output, e.g.
  // hallucination-detector's flagged_claims). Only checks that carry detail
  // contribute an entry; if none do, `flags` is omitted entirely so clean /
  // detail-less pools are byte-identical to before.
  const flags = [];
  for (const it of failed) {
    const entry = { check: it.source_submodule || 'unknown-check' };
    // hallucination-detector detail: the specific unsupported claims. Carry the
    // reviewer-relevant fields; drop `cited_source` when absent (unsupported
    // claims have no supporting quote) to keep the payload lean.
    if (Array.isArray(it.flagged_claims) && it.flagged_claims.length) {
      entry.claims = it.flagged_claims.map(c => {
        const d = { claim: c.claim, severity: c.severity, verdict: 'unsupported' };
        if (c.evidence) d.evidence = c.evidence;   // detector's stated reason (evidence location)
        if (c.quote) d.cited_source = c.quote;
        return d;
      });
    }
    // (future: structural failing sections, meta failing fields — add a branch
    //  populating entry.<detail>; consumers iterate `flags` generically.)
    if (Object.keys(entry).length > 1) flags.push(entry); // has detail beyond the name
  }
  if (flags.length) qa.flags = flags;

  return qa;
}

module.exports = { collectQaVerdict };
