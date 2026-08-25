/**
 * Standalone test harness for linkedin-post-scraper v1.3.0 — feed_posts
 * `source` honoring (M2b).
 *
 * Run: node modules/step-3-scraping/linkedin-post-scraper/test-feed-targets.js
 * (any cwd — paths resolved from __dirname)
 *
 * Covers:
 *   [A] entity_field default → byte-identical to git HEAD execute.js (A/B on
 *       the same fixture + mocks; output AND http call sequence compared)
 *   [B] source=profile_scraper in feed_posts mode → company URLs read from
 *       pool items' linkedin_url field, slugs extracted, targets deduped
 *   [C] /in/ (personal) URLs in company/pool mode → correctly rejected
 *   [D] manifest contract: version bump, source option unchanged
 *
 * All HTTP mocked (health + feed-posts endpoints). requests_per_hour: 0
 * disables the rate limiter (createRateLimiter returns a resolved no-op).
 * No credentials, no network.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

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

const POST_FIXTURE = {
  post_id: 'urn:li:activity:7000000000000000001',
  post_url: 'https://www.linkedin.com/feed/update/urn:li:activity:7000000000000000001/',
  author_name: 'Acme Corp',
  author_slug: null,
  posted_at: '2026-08-01T09:00:00Z',
  post_format: 'text',
  post_text: 'one two three four five six seven eight nine ten eleven twelve',
  reactions_total: 5,
  comments_count: 2,
  reposts_count: 1,
  hashtags: ['#acme'],
  mentioned_people: [],
  mentioned_companies: [],
};

function makeTools() {
  const calls = [];
  return {
    calls,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    progress: { update: () => {} },
    _partialItems: [],
    http: {
      get: async (url) => {
        calls.push(url);
        if (url.includes('/api/health')) {
          return { status: 200, body: JSON.stringify({ status: 'ok', page: 'feed' }) };
        }
        if (url.includes('/api/feed-posts/')) {
          return { status: 200, body: JSON.stringify({ posts: [POST_FIXTURE] }) };
        }
        return { status: 404, body: JSON.stringify({ error: 'not found' }) };
      },
    },
  };
}

// requests_per_hour: 0 → rate limiter no-ops (execute.js createRateLimiter guard)
const BASE_OPTS = { mode: 'feed_posts', posts_per_profile: 5, requests_per_hour: 0, min_word_count: 10 };

function entityFieldFixture() {
  return [
    {
      name: 'Acme',
      linkedin: 'https://www.linkedin.com/company/acme-corp/',
      // pool items present but MUST be ignored in entity_field mode
      items: [{ url: 'https://x.test/1', linkedin_url: 'https://www.linkedin.com/company/should-not-be-read/' }],
    },
    { name: 'NoLinkedIn', items: [{ url: 'https://y.test/1' }] },
  ];
}

function poolFixture() {
  return [
    {
      name: 'Acme',
      items: [
        { url: 'https://a.test/1', linkedin_url: 'https://www.linkedin.com/company/acme-corp/' },
        // duplicate company URL → must dedupe to one target
        { url: 'https://a.test/2', linkedin_url: 'https://www.linkedin.com/company/acme-corp/about/' },
        // personal profile URL → must be rejected in company/pool mode
        { url: 'https://a.test/3', linkedin_url: 'https://www.linkedin.com/in/jane-doe-123/' },
        // no linkedin_url → skipped
        { url: 'https://a.test/4' },
      ],
    },
    {
      name: 'Beta',
      items: [{ url: 'https://b.test/1', linkedin_url: 'https://www.linkedin.com/company/beta-inc?trk=x' }],
    },
  ];
}

async function main() {
  // ── [A] entity_field default → byte-identical to git HEAD ────────────────
  console.log('\n[A] entity_field default byte-identity vs git HEAD execute.js');
  {
    const headSrc = execSync(
      'git -C ' + JSON.stringify(REPO_ROOT) +
        ' show HEAD:modules/step-3-scraping/linkedin-post-scraper/execute.js',
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lips-head-'));
    const headPath = path.join(tmpDir, 'execute-head.js');
    fs.writeFileSync(headPath, headSrc);
    const executeHead = require(headPath);

    const toolsNew = makeTools();
    const toolsHead = makeTools();
    const outNew = await execute({ entities: entityFieldFixture() }, { ...BASE_OPTS, source: 'entity_field' }, toolsNew);
    const outHead = await executeHead({ entities: entityFieldFixture() }, { ...BASE_OPTS, source: 'entity_field' }, toolsHead);

    assert(JSON.stringify(outNew) === JSON.stringify(outHead), 'entity_field output is byte-identical to git HEAD output');
    assert(JSON.stringify(toolsNew.calls) === JSON.stringify(toolsHead.calls), 'entity_field http call sequence is identical to git HEAD');
    assert(
      toolsNew.calls.some((u) => u.includes('/api/feed-posts/company/acme-corp?')),
      'entity_field: company target from entity.linkedin is fetched'
    );
    assert(
      !toolsNew.calls.some((u) => u.includes('should-not-be-read')),
      'entity_field: pool items are NOT read in default mode'
    );

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // ── [B] source=profile_scraper reads company URLs from pool items ────────
  console.log('\n[B] source=profile_scraper pool-item company targets');
  {
    const tools = makeTools();
    const out = await execute({ entities: poolFixture() }, { ...BASE_OPTS, source: 'profile_scraper' }, tools);

    const feedCalls = tools.calls.filter((u) => u.includes('/api/feed-posts/'));
    assert(
      feedCalls.some((u) => u.includes('/api/feed-posts/company/acme-corp?')),
      'pool mode: acme-corp company target collected from item.linkedin_url'
    );
    assert(
      feedCalls.some((u) => u.includes('/api/feed-posts/company/beta-inc?')),
      'pool mode: beta-inc company target collected (query-string URL parsed)'
    );
    assert(
      feedCalls.filter((u) => u.includes('acme-corp')).length === 1,
      'pool mode: duplicate company URLs deduped to one target'
    );
    assert(feedCalls.length === 2, `pool mode: exactly 2 feed targets fetched (got ${feedCalls.length})`);
    assert(
      !feedCalls.some((u) => u.includes('jane-doe')),
      'pool mode: /in/ personal URL rejected (no profile fetch)'
    );
    const acmeResult = out.results.find((r) => r.entity_name === 'Acme');
    assert(!!acmeResult && acmeResult.items.length === 1, 'pool mode: Acme gets its feed posts');
    assert(out.summary.mode === 'feed_posts', 'pool mode: summary mode is feed_posts');
  }

  // ── [C] /in/-only pool → no targets ──────────────────────────────────────
  console.log('\n[C] /in/-only pool in company mode → rejected, loud no-op');
  {
    const tools = makeTools();
    const out = await execute(
      { entities: [{ name: 'OnlyPeople', items: [{ url: 'https://c.test/1', linkedin_url: 'https://www.linkedin.com/in/john-smith-456/' }] }] },
      { ...BASE_OPTS, source: 'profile_scraper' },
      tools
    );
    assert(out.results.length === 0 && out.summary.total_items === 0, 'no targets collected from /in/ URLs');
    assert(/no linkedin feed targets/i.test(out.summary.description), 'summary reports no feed targets');
    assert(tools.calls.length === 0, 'no HTTP calls made (not even health) when no targets');
  }

  // ── [D] manifest contract ────────────────────────────────────────────────
  console.log('\n[D] manifest contract');
  {
    assert(MANIFEST.version === '1.3.0', 'manifest: version is 1.3.0');
    const opt = (MANIFEST.options || []).find((o) => o.name === 'source');
    assert(!!opt && opt.default === 'entity_field', 'manifest: source option present, default entity_field');
    assert(
      JSON.stringify(opt.options) === JSON.stringify(['profile_scraper', 'entity_field']),
      'manifest: source option values unchanged (no schema change)'
    );
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test harness crashed:', err);
  process.exit(1);
});
