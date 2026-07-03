/**
 * Standalone test harness for url-heuristics v1.0.0.
 *
 * Run: node modules/step-2-validation/url-heuristics/test-url-heuristics.js
 * From repo root.
 *
 * Covers the v1 contract (brief: docs/submodule-briefs-rev-2026-07-03/step2-learned-validator.md):
 *   - default reject patterns fire (pagination, archives, auth, cruft)
 *   - hint patterns produce allow_hint
 *   - structural penalties (depth, query params) compound toward thresholds
 *   - shadow mode returns ALL items annotated; enforce drops exactly the rejects
 *   - title signals apply only when title/snippet present
 *   - malformed regex line in options: warn + skip, never throw
 *   - item with no url: warn + pass through unchanged
 *   - reasons emitted as a joined string (ContentRenderer contract)
 *   - needs_render_domains flags needs_render
 *   - enforce mode emptying an entity is loud in the summary
 *   - string-typed numeric options from the UI are coerced
 *
 * No network. Pure deterministic engine — mocks only logger/progress/_partialItems.
 */

const execute = require('./execute.js');
const MANIFEST = require('./manifest.json');

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  PASS: ${msg}`);
    pass++;
  } else {
    console.log(`  FAIL: ${msg}`);
    fail++;
  }
}

function makeTools() {
  const logs = [];
  return {
    logs,
    logger: {
      info: (m) => logs.push({ level: 'info', message: m }),
      warn: (m) => logs.push({ level: 'warn', message: m }),
      error: (m) => logs.push({ level: 'error', message: m }),
    },
    progress: { update: () => {} },
    _partialItems: [],
  };
}

const defaults = { ...MANIFEST.options_defaults };

function makeInput(items, name = 'TestCo') {
  return {
    entities: [{ name, items }],
    run_id: 'test-run',
    step_index: 2,
    submodule_id: 'url-heuristics',
  };
}

function itemFor(result, url) {
  return result.results[0].items.find((i) => i.url === url);
}

async function main() {
  // ── 1. Default reject patterns fire ─────────────────────────────
  console.log('\n[1] default reject patterns fire');
  {
    const cruft = [
      'https://site.com/news/page/2/',
      'https://site.com/category/operators/',
      'https://site.com/tag/slots/',
      'https://site.com/author/jane/',
      'https://site.com/?s=betsson',
      'https://site.com/login',
      'https://site.com/cart',
      'https://site.com/privacy',
      'https://site.com/wp-admin/options.php',
      'https://site.com/sitemap.xml',
    ];
    const tools = makeTools();
    const res = await execute(makeInput(cruft.map((url) => ({ url }))), { ...defaults }, tools);
    for (const url of cruft) {
      const it = itemFor(res, url);
      assert(it && it.decision === 'reject', `reject: ${url}`);
    }
    const rejected = itemFor(res, cruft[0]);
    assert(rejected.score <= 0.1, 'pattern reject scores 0.1 or lower');
    assert(typeof rejected.reasons === 'string' && rejected.reasons.length > 0, 'reasons is a non-empty string');
  }

  // ── 2. Clean content URLs pass ──────────────────────────────────
  console.log('\n[2] clean content URLs → allow');
  {
    const tools = makeTools();
    const res = await execute(
      makeInput([
        { url: 'https://site.com/betsson-launches-new-platform' },
        { url: 'https://site.com/2026/06/interview-with-ceo' },
      ]),
      { ...defaults },
      tools
    );
    assert(itemFor(res, 'https://site.com/betsson-launches-new-platform').decision === 'allow', 'article slug allows');
    assert(itemFor(res, 'https://site.com/2026/06/interview-with-ceo').decision === 'allow', 'dated article allows');
    assert(itemFor(res, 'https://site.com/betsson-launches-new-platform').score === 1, 'clean URL scores 1.0');
  }

  // ── 2b. Articles that merely START with a cruft token still allow ─
  // (code-review 2026-07-03: unanchored defaults wrongly rejected these)
  console.log('\n[2b] cruft-prefixed article slugs → allow');
  {
    const articles = [
      'https://site.com/privacy-regulations-hit-igaming-2026',
      'https://site.com/terms-you-need-to-know',
      'https://site.com/sitemap-best-practices-for-seo',
      'https://site.com/login-security-best-practices',
      'https://site.com/signup-flow-optimization',
      'https://site.com/checkout-conversion-tips',
      'https://site.com/terms-and-conditions-explained',
    ];
    const tools = makeTools();
    const res = await execute(makeInput(articles.map((url) => ({ url }))), { ...defaults }, tools);
    for (const url of articles) {
      assert(itemFor(res, url).decision === 'allow', `allow article: ${url}`);
    }
    // ...while the actual cruft pages those tokens target still reject
    const cruft = [
      'https://site.com/privacy-policy',
      'https://site.com/terms-of-service',
      'https://site.com/sitemap_index.xml',
      'https://site.com/login?next=/account',
      'https://site.com/cart?id=5',
      'https://site.com/signup/',
    ];
    const res2 = await execute(makeInput(cruft.map((url) => ({ url }))), { ...defaults }, makeTools());
    for (const url of cruft) {
      assert(itemFor(res2, url).decision === 'reject', `still reject cruft: ${url}`);
    }
  }

  // ── 3. Hint patterns → allow_hint ───────────────────────────────
  console.log('\n[3] hint patterns → allow_hint');
  {
    const tools = makeTools();
    const res = await execute(
      makeInput([{ url: 'https://site.com/news/' }, { url: 'https://site.com/blog' }]),
      { ...defaults },
      tools
    );
    assert(itemFor(res, 'https://site.com/news/').decision === 'allow_hint', '/news/ root hints');
    assert(itemFor(res, 'https://site.com/blog').decision === 'allow_hint', '/blog root hints');
  }

  // ── 4. Structural penalties compound ────────────────────────────
  console.log('\n[4] structural penalties (depth, query params)');
  {
    const deep = 'https://site.com/a/b/c/d/e/f/g/h'; // 8 segments > max_depth 6 → -0.25
    const deepAndParams = 'https://site.com/a/b/c/d/e/f/g/h?p1=1&p2=2&p3=3&p4=4'; // depth + params → -0.5
    const tools = makeTools();
    const res = await execute(makeInput([{ url: deep }, { url: deepAndParams }]), { ...defaults }, tools);
    const d = itemFor(res, deep);
    assert(d.decision === 'allow' && d.score === 0.75, `depth alone penalizes to 0.75/allow (got ${d.score}/${d.decision})`);
    const dp = itemFor(res, deepAndParams);
    assert(dp.decision === 'allow_hint' && dp.score === 0.5, `depth+params → 0.5/allow_hint (got ${dp.score}/${dp.decision})`);
    assert(dp.reasons.includes('depth') && dp.reasons.includes('query_params'), 'both structural reasons recorded');
  }

  // ── 5. Title signals, only when present ─────────────────────────
  console.log('\n[5] title signals');
  {
    const tools = makeTools();
    const res = await execute(
      makeInput([
        { url: 'https://site.com/list-a', title: 'Page 2 of 14 - News archive' },
        { url: 'https://site.com/list-b', snippet: 'Browse all operators in our directory' },
        { url: 'https://site.com/no-title' },
      ]),
      { ...defaults },
      tools
    );
    const a = itemFor(res, 'https://site.com/list-a');
    assert(a.score === 0.5 && a.decision === 'allow_hint', `title "Page N of" penalizes -0.5 → allow_hint (got ${a.score}/${a.decision})`);
    const b = itemFor(res, 'https://site.com/list-b');
    assert(b.score === 0.5 && b.decision === 'allow_hint', 'snippet "Browse all" penalizes too');
    const c = itemFor(res, 'https://site.com/no-title');
    assert(c.decision === 'allow' && c.score === 1, 'missing title/snippet → no penalty, no error');
  }

  // ── 6. Title + depth compound below reject threshold ────────────
  console.log('\n[6] compounding penalties can reject');
  {
    const url = 'https://site.com/a/b/c/d/e/f/g/h';
    const tools = makeTools();
    const res = await execute(makeInput([{ url, title: 'Page 3 of 99' }]), { ...defaults }, tools);
    const it = itemFor(res, url);
    assert(it.score === 0.25 && it.decision === 'reject', `title(-0.5)+depth(-0.25) → 0.25 < 0.3 → reject (got ${it.score}/${it.decision})`);
  }

  // ── 7. Shadow keeps all; enforce drops exactly rejects ──────────
  console.log('\n[7] shadow vs enforce');
  {
    const items = [
      { url: 'https://site.com/good-article' },
      { url: 'https://site.com/category/junk/' },
      { url: 'https://site.com/news/' },
    ];
    const tShadow = makeTools();
    const shadow = await execute(makeInput(items), { ...defaults, mode: 'shadow' }, tShadow);
    assert(shadow.results[0].items.length === 3, 'shadow returns all 3 items');
    assert(itemFor(shadow, 'https://site.com/category/junk/').decision === 'reject', 'shadow still annotates reject');

    const tEnforce = makeTools();
    const enforce = await execute(makeInput(items), { ...defaults, mode: 'enforce' }, tEnforce);
    assert(enforce.results[0].items.length === 2, 'enforce drops the reject');
    assert(!itemFor(enforce, 'https://site.com/category/junk/'), 'rejected URL gone in enforce');
    assert(itemFor(enforce, 'https://site.com/news/'), 'allow_hint survives enforce');
    assert(enforce.results[0].meta.rejected === 1, 'meta counts the drop');
  }

  // ── 8. Malformed regex: warn + skip, never throw ────────────────
  console.log('\n[8] malformed regex line skipped with warning');
  {
    const tools = makeTools();
    let threw = false;
    let res;
    try {
      res = await execute(
        makeInput([{ url: 'https://site.com/fine' }]),
        { ...defaults, reject_url_patterns: '/category/\n[invalid(regex\n/tag/' },
        tools
      );
    } catch (e) {
      threw = true;
    }
    assert(!threw, 'does not throw on bad regex');
    assert(tools.logs.some((l) => l.level === 'warn' && /regex/i.test(l.message)), 'warning logged naming the bad line');
    assert(itemFor(res, 'https://site.com/fine').decision === 'allow', 'valid patterns still applied, item processed');
  }

  // ── 9. Item with no url: warn + pass through ────────────────────
  console.log('\n[9] item with no url passes through');
  {
    const tools = makeTools();
    const res = await execute(makeInput([{ title: 'orphan' }, { url: 'https://site.com/ok' }]), { ...defaults }, tools);
    assert(res.results[0].items.length === 2, 'both items returned (shadow)');
    assert(tools.logs.some((l) => l.level === 'warn' && /no url/i.test(l.message)), 'warning logged for missing url');
    const orphan = res.results[0].items.find((i) => i.title === 'orphan');
    assert(orphan && !orphan.decision, 'orphan passed through unannotated');
  }

  // ── 10. needs_render_domains ────────────────────────────────────
  console.log('\n[10] needs_render_domains flag');
  {
    const tools = makeTools();
    const res = await execute(
      makeInput([{ url: 'https://spa-site.com/article' }, { url: 'https://plain.com/article' }]),
      { ...defaults, needs_render_domains: 'spa-site.com' },
      tools
    );
    assert(itemFor(res, 'https://spa-site.com/article').needs_render === true, 'matching domain flagged');
    assert(itemFor(res, 'https://plain.com/article').needs_render === false, 'other domain not flagged');
  }

  // ── 11. Enforce emptying an entity is loud ──────────────────────
  console.log('\n[11] all-rejected entity is loud');
  {
    const tools = makeTools();
    const res = await execute(
      makeInput([{ url: 'https://site.com/category/a/' }, { url: 'https://site.com/tag/b/' }]),
      { ...defaults, mode: 'enforce' },
      tools
    );
    assert(res.results[0].items.length === 0, 'all items dropped');
    assert(/all 2 items rejected/i.test(res.summary.description) || /all 2 items rejected/i.test(res.results[0].meta.note || ''), 'summary/meta says "all N items rejected"');
  }

  // ── 12. String-typed numeric options coerced ────────────────────
  console.log('\n[12] UI string options coerced');
  {
    const tools = makeTools();
    const res = await execute(
      makeInput([{ url: 'https://site.com/a/b/c/d/e/f/g/h' }]),
      { ...defaults, max_depth: '6', reject_threshold: '0.3', hint_threshold: '0.6', max_query_params: '3' },
      tools
    );
    const it = itemFor(res, 'https://site.com/a/b/c/d/e/f/g/h');
    assert(it.score === 0.75, `string "6" max_depth still penalizes depth (got ${it.score})`);
  }

  // ── 13. Contract fields ─────────────────────────────────────────
  console.log('\n[13] contract fields');
  {
    const tools = makeTools();
    const res = await execute(makeInput([{ url: 'https://site.com/x', extra_field: 'kept' }]), { ...defaults }, tools);
    const it = itemFor(res, 'https://site.com/x');
    assert(it.validator_version === MANIFEST.version, 'validator_version = manifest version');
    assert(it.extra_field === 'kept', 'original item fields preserved');
    assert(!Array.isArray(it.reasons), 'reasons is not an array');
    assert(tools._partialItems.length > 0, '_partialItems pushed');
    assert(typeof res.summary.description === 'string' && res.summary.total_items === 1, 'summary shape');
  }

  // ── 14. Disabled structural checks (0 = off) ────────────────────
  console.log('\n[14] max_depth 0 / max_query_params 0 disable checks');
  {
    const tools = makeTools();
    const res = await execute(
      makeInput([{ url: 'https://site.com/a/b/c/d/e/f/g/h/i/j?p1=1&p2=2&p3=3&p4=4&p5=5' }]),
      { ...defaults, max_depth: 0, max_query_params: 0 },
      tools
    );
    const it = res.results[0].items[0];
    assert(it.score === 1 && it.decision === 'allow', 'no structural penalties when disabled');
  }

  console.log(`\n${'='.repeat(50)}\nTOTAL: ${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('HARNESS ERROR:', e);
  process.exit(1);
});
