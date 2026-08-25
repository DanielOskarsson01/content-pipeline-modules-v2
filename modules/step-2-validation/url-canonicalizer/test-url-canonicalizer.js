/**
 * Standalone test harness for url-canonicalizer v1.1.0.
 *
 * Run: node modules/step-2-validation/url-canonicalizer/test-url-canonicalizer.js
 * (any cwd — paths resolved from __dirname)
 *
 * Covers:
 *   [A] default-off byte-identity: working-tree execute.js vs git HEAD execute.js
 *       on the same fixture pool (A/B, deep-compare output + _partialItems)
 *   [B] v2_behavior=true full-field-spread survival (provenance fields on every
 *       emitted row) + redirect pair shape (url=new, original_url=old,
 *       redirect_from=old, unflagged status) + unchanged rows NOT emitted
 *   [C] pool-outcome simulation using the skeleton's auto-approve + transform
 *       semantics (copied inline, NOT imported — Rule 1):
 *         - flagged filter + source_submodule stamp:
 *           content-pipeline-v2/server/routes/submoduleRuns.js:1177-1203
 *         - transform op incl. original_url removal + B054 dedup:
 *           content-pipeline-v2/server/lib/applyDataOperation.js:100-141
 *       v1 mode: redirects excluded (flagged) → old URL survives, unchanged
 *       re-emits replace rows (provenance destroyed + re-attributed) — the
 *       documented damage, kept as a regression record.
 *       v2 mode: redirect applied (old removed, new added, provenance intact),
 *       unchanged rows untouched, timeout rows survive.
 *   [D] timeout passthrough in BOTH modes — a timing-out URL is never dropped
 *   [E] manifest contract: v2_behavior option, defaults, version
 *
 * All HTTP mocked. No credentials, no network.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MODULE_DIR = __dirname;
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
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

function makeTools(headHandler) {
  return {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    progress: { update: () => {} },
    _partialItems: [],
    http: { head: headHandler },
  };
}

// ── Fixture pool: rich provenance fields that v1's 5-field whitelist destroys ──
function makeFixtureEntities() {
  return [
    {
      name: 'Acme',
      items: [
        {
          url: 'https://a.test/old-path',
          title: 'Old Path Page',
          found_via: 'sitemap-parser',
          source_location: 'https://a.test/sitemap.xml',
          link_text: 'Our Products',
          source_submodule: 'sitemap-parser',
          discovered_at: '2026-08-01T00:00:00Z',
        },
        {
          url: 'https://a.test/keep',
          title: 'Keep Page',
          found_via: 'page-links',
          source_location: 'https://a.test/',
          link_text: 'About Us',
          source_submodule: 'page-links',
          discovered_at: '2026-08-01T00:00:00Z',
        },
        {
          url: 'https://a.test/slow',
          title: 'Slow Page',
          found_via: 'page-links',
          source_location: 'https://a.test/',
          link_text: 'Contact',
          source_submodule: 'page-links',
          discovered_at: '2026-08-01T00:00:00Z',
        },
      ],
    },
    {
      name: 'Beta',
      items: [
        {
          url: 'https://b.test/x',
          title: 'B Page',
          found_via: 'browser-crawler',
          source_location: 'https://b.test/',
          link_text: 'Home',
          source_submodule: 'browser-crawler',
          discovered_at: '2026-08-02T00:00:00Z',
        },
      ],
    },
  ];
}

// Deterministic HEAD mock: one redirect, one timeout, rest unchanged.
function headMock(url) {
  if (url === 'https://a.test/old-path') {
    return Promise.resolve({ url: 'https://a.test/new-path', status: 200 });
  }
  if (url === 'https://a.test/slow') {
    return Promise.reject(new Error('Timeout after 5000ms'));
  }
  return Promise.resolve({ url, status: 200 });
}

const DEFAULTS = { ...MANIFEST.options_defaults };

// ---------------------------------------------------------------------------
// Skeleton-semantics simulation (copied, not imported — modules are standalone).
// Sources:
//   flagged filter + stamp: content-pipeline-v2/server/routes/submoduleRuns.js:1177-1203
//   transform:              content-pipeline-v2/server/lib/applyDataOperation.js:100-141
// ---------------------------------------------------------------------------

function simulateAutoApproveTransform(pool, outputItems, manifest, entityName) {
  const itemKey = manifest.item_key; // 'url'
  const flaggedWhen = manifest.output_schema?.flagged_when;

  // __all__ approval, step<6: flagged items are excluded (submoduleRuns.js:1182-1190)
  const resolvedKeys = outputItems
    .filter((item) => {
      if (!flaggedWhen) return true;
      return !Object.entries(flaggedWhen).some(([field, values]) =>
        values.includes(String(item[field] ?? ''))
      );
    })
    .map((item) => String(item[itemKey] ?? ''))
    .filter(Boolean);

  const approvedKeySet = new Set(resolvedKeys.map(String));
  // source_submodule stamped unconditionally (submoduleRuns.js:1199-1203)
  const approvedItems = outputItems
    .filter((item) => approvedKeySet.has(String(item[itemKey] ?? '')))
    .map((item) => ({ ...item, entity_name: entityName, source_submodule: 'url-canonicalizer' }));

  // transform (applyDataOperation.js:100-141)
  let entityPool = pool;
  const existingKeys = new Set(entityPool.map((item) => String(item[itemKey] ?? '')));
  const removalSet = new Set();
  const toAdd = [];
  for (const item of approvedItems) {
    const key = String(item[itemKey] ?? '');
    const origKey =
      item.original_url != null && String(item.original_url) !== key
        ? String(item.original_url)
        : null;
    if (existingKeys.has(key) || (origKey && existingKeys.has(origKey))) {
      removalSet.add(key);
      if (origKey) removalSet.add(origKey);
      toAdd.push(item);
    }
  }
  entityPool = entityPool.filter((item) => !removalSet.has(String(item[itemKey] ?? '')));
  entityPool.push(...toAdd);

  // B054 multi-source dedup collapse (applyDataOperation.js:130-138)
  const seen = new Set();
  const dedupedPool = [];
  for (const item of entityPool) {
    const keyVal = String(item[itemKey] ?? '');
    if (seen.has(keyVal)) continue;
    seen.add(keyVal);
    dedupedPool.push(item);
  }
  return dedupedPool;
}

function flatItems(output) {
  return output.results.flatMap((r) => r.items);
}

async function main() {
  // ── [A] Default-off byte-identity vs git HEAD ────────────────────────────
  console.log('\n[A] default-off byte-identity vs git HEAD execute.js');
  {
    const headSrc = execSync(
      'git -C ' + JSON.stringify(REPO_ROOT) +
        ' show HEAD:modules/step-2-validation/url-canonicalizer/execute.js',
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'urlcanon-head-'));
    const headPath = path.join(tmpDir, 'execute-head.js');
    fs.writeFileSync(headPath, headSrc);
    const executeHead = require(headPath);

    const toolsNew = makeTools(headMock);
    const toolsHead = makeTools(headMock);
    const outNew = await execute({ entities: makeFixtureEntities() }, { ...DEFAULTS, v2_behavior: false }, toolsNew);
    const outHead = await executeHead({ entities: makeFixtureEntities() }, { request_timeout: 5000, concurrency: 20 }, toolsHead);

    assert(
      JSON.stringify(outNew) === JSON.stringify(outHead),
      'default-mode output is byte-identical to git HEAD output'
    );
    assert(
      JSON.stringify(toolsNew._partialItems) === JSON.stringify(toolsHead._partialItems),
      'default-mode _partialItems are byte-identical to git HEAD'
    );

    // v1 emits unchanged + timeout rows too (timeout passthrough, [D] v1 half)
    const items = flatItems(outNew);
    const slowRow = items.find((i) => i.url === 'https://a.test/slow');
    assert(!!slowRow, 'v1: timing-out URL is emitted (passes through, never dropped)');
    assert(slowRow && slowRow.status === 'unchanged', 'v1: timing-out URL keeps status unchanged');
    assert(
      slowRow && /^Error:/.test(slowRow.redirect_detail || ''),
      'v1: timing-out URL carries Error detail'
    );

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // ── [B] v2_behavior=true emit shapes ─────────────────────────────────────
  console.log('\n[B] v2_behavior=true emit shapes');
  const toolsV2 = makeTools(headMock);
  const outV2 = await execute(
    { entities: makeFixtureEntities() },
    { ...DEFAULTS, v2_behavior: true },
    toolsV2
  );
  const v2Items = flatItems(outV2);
  {
    assert(v2Items.length === 1, `v2: only the redirect is emitted (got ${v2Items.length} items)`);
    const r = v2Items[0];
    assert(r && r.url === 'https://a.test/new-path', 'v2 redirect: url is the canonical URL');
    assert(r && r.original_url === 'https://a.test/old-path', 'v2 redirect: original_url is the old URL (drives transform add+remove)');
    assert(r && r.redirect_from === 'https://a.test/old-path', 'v2 redirect: redirect_from records the rewrite');
    assert(r && r.status !== 'redirected', 'v2 redirect: status is NOT the flagged value');
    const flaggedVals = MANIFEST.output_schema.flagged_when.status;
    assert(r && !flaggedVals.includes(String(r.status)), 'v2 redirect: status does not match manifest flagged_when (stays unflagged)');
    // full-spread provenance survival
    assert(r && r.found_via === 'sitemap-parser', 'v2 redirect: found_via survives');
    assert(r && r.source_location === 'https://a.test/sitemap.xml', 'v2 redirect: source_location survives');
    assert(r && r.link_text === 'Our Products', 'v2 redirect: link_text survives');
    assert(r && r.title === 'Old Path Page', 'v2 redirect: arbitrary fields (title) survive');
    // every emitted row carries provenance (spread applies to all emits)
    assert(
      v2Items.every((i) => i.found_via && i.link_text && i.source_location),
      'v2: every emitted row carries provenance fields'
    );
    assert(
      !v2Items.some((i) => i.url === 'https://a.test/keep' || i.url === 'https://b.test/x'),
      'v2: unchanged rows are NOT emitted'
    );
    assert(
      !v2Items.some((i) => i.url === 'https://a.test/slow'),
      'v2: timing-out row is NOT emitted (passes through the pool untouched)'
    );
    assert(
      JSON.stringify(toolsV2._partialItems) === JSON.stringify(v2Items),
      'v2: _partialItems carries exactly the emitted rows'
    );
    assert(outV2.summary.redirected === 1 && outV2.summary.unchanged === 3, 'v2 summary: counts still report redirected=1 unchanged=3');
    assert(outV2.summary.output_items === 1, 'v2 summary: output_items = emitted rows only');
  }

  // ── [C] pool-outcome simulation under skeleton semantics ─────────────────
  console.log('\n[C] pool outcome under auto-approve + transform (simulated skeleton semantics)');
  {
    // v1: the documented damage (regression record)
    const toolsV1 = makeTools(headMock);
    const entitiesV1 = makeFixtureEntities();
    const outV1 = await execute({ entities: entitiesV1 }, { ...DEFAULTS, v2_behavior: false }, toolsV1);
    const acmePoolV1 = makeFixtureEntities()[0].items;
    const acmeOutV1 = outV1.results.find((r) => r.entity_name === 'Acme').items;
    const poolAfterV1 = simulateAutoApproveTransform(acmePoolV1, acmeOutV1, MANIFEST, 'Acme');

    const oldRow = poolAfterV1.find((i) => i.url === 'https://a.test/old-path');
    assert(!!oldRow, 'v1 sim: flagged redirect excluded → old URL still in pool (zero canonicalization applied)');
    assert(!poolAfterV1.some((i) => i.url === 'https://a.test/new-path'), 'v1 sim: canonical URL never enters the pool');
    const keepRowV1 = poolAfterV1.find((i) => i.url === 'https://a.test/keep');
    assert(keepRowV1 && keepRowV1.link_text === undefined, 'v1 sim: unchanged re-emit destroys link_text (5-field whitelist)');
    assert(keepRowV1 && keepRowV1.source_submodule === 'url-canonicalizer', 'v1 sim: unchanged re-emit re-attributes source_submodule');

    // v2: rewrite applied, provenance survives, untouched rows pass through
    const acmePoolV2 = makeFixtureEntities()[0].items;
    const acmeOutV2 = outV2.results.find((r) => r.entity_name === 'Acme').items;
    const poolAfterV2 = simulateAutoApproveTransform(acmePoolV2, acmeOutV2, MANIFEST, 'Acme');

    assert(!poolAfterV2.some((i) => i.url === 'https://a.test/old-path'), 'v2 sim: old URL removed from pool');
    const newRow = poolAfterV2.find((i) => i.url === 'https://a.test/new-path');
    assert(!!newRow, 'v2 sim: canonical URL added to pool (add+remove pair applied)');
    assert(newRow && newRow.link_text === 'Our Products' && newRow.found_via === 'sitemap-parser', 'v2 sim: rewritten row keeps full provenance');
    assert(newRow && newRow.redirect_from === 'https://a.test/old-path', 'v2 sim: rewritten row records redirect_from');
    const keepRowV2 = poolAfterV2.find((i) => i.url === 'https://a.test/keep');
    assert(keepRowV2 && keepRowV2.link_text === 'About Us' && keepRowV2.source_submodule === 'page-links', 'v2 sim: unchanged row untouched (provenance + attribution intact)');
    // [D] v2 half: timeout row survives in the pool
    const slowRowV2 = poolAfterV2.find((i) => i.url === 'https://a.test/slow');
    assert(!!slowRowV2, 'v2 sim: timing-out URL survives in pool (passthrough, never dropped)');
    assert(slowRowV2 && slowRowV2.source_submodule === 'page-links', 'v2 sim: timing-out row keeps original attribution');
    assert(poolAfterV2.length === 3, `v2 sim: pool row count preserved (3 rows, got ${poolAfterV2.length})`);
  }

  // ── [F] two redirects → same canonical URL (v2 dedup bypass) ─────────────
  console.log('\n[F] v2: two redirects to one canonical target remove BOTH stale rows');
  {
    const gammaItems = [
      { url: 'https://g.test/alias-1', link_text: 'One', source_submodule: 'sitemap-parser' },
      { url: 'https://g.test/alias-2', link_text: 'Two', source_submodule: 'page-links' },
      { url: 'https://g.test/canonical', link_text: 'Canon', source_submodule: 'page-links' },
    ];
    const gammaHead = (url) => {
      if (url === 'https://g.test/alias-1' || url === 'https://g.test/alias-2') {
        return Promise.resolve({ url: 'https://g.test/canonical', status: 200 });
      }
      return Promise.resolve({ url, status: 200 });
    };
    const tools = makeTools(gammaHead);
    const out = await execute(
      { entities: [{ name: 'Gamma', items: JSON.parse(JSON.stringify(gammaItems)) }] },
      { ...DEFAULTS, v2_behavior: true },
      tools
    );
    const emitted = flatItems(out);
    assert(emitted.length === 2, `v2: both redirect emits ship (module dedup bypassed), got ${emitted.length}`);
    assert(
      emitted.every((i) => i.url === 'https://g.test/canonical'),
      'v2: both emits carry the canonical URL'
    );
    // per-entity meta counts rewrites correctly in v2 (status=canonicalized)
    const gammaMeta = out.results.find((r) => r.entity_name === 'Gamma').meta;
    assert(gammaMeta.redirected === 2 && gammaMeta.unchanged === 0, 'v2: per-entity meta counts canonicalized rows as redirected');

    const poolAfter = simulateAutoApproveTransform(
      JSON.parse(JSON.stringify(gammaItems)),
      out.results.find((r) => r.entity_name === 'Gamma').items,
      MANIFEST,
      'Gamma'
    );
    assert(
      !poolAfter.some((i) => i.url === 'https://g.test/alias-1' || i.url === 'https://g.test/alias-2'),
      'v2 sim: BOTH stale alias rows removed from pool'
    );
    const canonRows = poolAfter.filter((i) => i.url === 'https://g.test/canonical');
    assert(canonRows.length === 1, `v2 sim: exactly one pool row for the canonical URL (got ${canonRows.length})`);
    assert(poolAfter.length === 1, `v2 sim: pool collapsed to 1 row (got ${poolAfter.length})`);
  }

  // ── [E] manifest contract ────────────────────────────────────────────────
  console.log('\n[E] manifest contract');
  {
    const opt = (MANIFEST.options || []).find((o) => o.name === 'v2_behavior');
    assert(!!opt, 'manifest: v2_behavior option exists');
    assert(opt && opt.type === 'boolean', 'manifest: v2_behavior is boolean');
    assert(opt && opt.default === false, 'manifest: v2_behavior option default is false');
    assert(MANIFEST.options_defaults.v2_behavior === false, 'manifest: options_defaults.v2_behavior is false');
    assert(MANIFEST.version === '1.1.0', 'manifest: version is 1.1.0');
    assert(/auto-execute/i.test(MANIFEST.usage_notes || ''), 'manifest: usage_notes records the auto-execute incompatibility');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test harness crashed:', err);
  process.exit(1);
});
