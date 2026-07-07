/**
 * LIVE test for the human-rewriter CARD: runs its `light` preset THROUGH the real
 * tone-seo-editor with a real Sonnet-class model on a short marked + cited article.
 *
 * COSTS ~1-2 cents (one Sonnet call on a short article). Requires ANTHROPIC_API_KEY;
 * exits 0 with a notice when absent so it never breaks CI.
 *
 * Run from repo root (source your profile so the key is present):
 *   zsh -c 'source ~/.zprofile; node modules/step-5-generation/card-human-rewriter/test-live-human-rewriter-card.js'
 *
 * Proves end-to-end: the card's preset config drives tone-seo-editor, the real
 * model humanizes the prose, and the [Type] markers + [#n] citations survive
 * (a dropped marker would make tone-seo-editor's own gate return status:error).
 *
 * Uses a real fetch-backed tools.ai (harness only — module code never touches an
 * SDK; in production the skeleton provides tools.ai).
 */

const tse = require('../tone-seo-editor/execute.js');
const TSE_MANIFEST = require('../tone-seo-editor/manifest.json');
const PRESET = require('./preset.json');

if (!process.env.ANTHROPIC_API_KEY) {
  console.log('ANTHROPIC_API_KEY not set — live test skipped (this is not a failure).');
  process.exit(0);
}

const MODEL_MAP = { haiku: 'claude-haiku-4-5', sonnet: 'claude-sonnet-4-6', opus: 'claude-opus-4-8' };

function makeLiveTools() {
  return {
    logger: {
      info: (m) => console.log(`  [info] ${m}`),
      warn: (m) => console.log(`  [warn] ${m}`),
      error: (m) => console.log(`  [error] ${m}`),
    },
    progress: { update: () => {} },
    _partialItems: [],
    ai: {
      complete: async (opts) => {
        const model = MODEL_MAP[opts.model] || (String(opts.model || '').startsWith('claude-') ? opts.model : 'claude-sonnet-4-6');
        const body = {
          model,
          max_tokens: opts.max_tokens || 4096,
          messages: [{ role: 'user', content: opts.prompt }],
        };
        if (opts.temperature != null) body.temperature = opts.temperature;
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(90000),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(`Anthropic ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
        const text = (json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
        return { text, tokens_in: json.usage?.input_tokens, tokens_out: json.usage?.output_tokens, model: json.model, provider: 'anthropic' };
      },
    },
  };
}

// Short, deliberately AI-sounding article with 2 [Type] markers + 2 [#n] citations.
const ARTICLE = [
  '# Bragg Gaming',
  '',
  '## [Primary Category: casino-platforms]',
  '',
  'Bragg Gaming offers a comprehensive suite of casino solutions [#1]. Furthermore, it provides a wide range of content aggregation services. Additionally, it is important to note that Bragg serves many operators [#2].',
  '',
  '## [Tag: content-aggregation]',
  '',
  'Bragg\'s platform provides seamless integration and a robust set of tools.',
].join('\n');

async function main() {
  const options = {
    ...TSE_MANIFEST.options_defaults,
    ...PRESET.presets.light,   // the card under test
    max_content_chars: 5000,
    max_tokens: 4096,
    reference_docs: {},
  };
  const entity = {
    name: 'Bragg Gaming',
    items: [
      { source_submodule: 'content-writer', content_markdown: ARTICLE },
      { source_submodule: 'seo-planner', seo_plan_json: { target_keywords: { primary: ['casino platform'], secondary: ['content aggregation'] } } },
    ],
  };

  console.log('\n── Live: human-rewriter `light` preset through tone-seo-editor (real Sonnet) ──');
  const tools = makeLiveTools();
  const res = await tse({ entities: [entity] }, options, tools);
  const item = res.results[0].items[0];

  console.log(`  ${res.summary.description}`);
  console.log(`  status=${item.status}  changed_lines=${item.tone_changes_count}  keywords_placed=${item.keywords_placed}`);
  if (item.error) console.log(`  error: ${item.error}`);
  console.log('  --- revised output ---');
  console.log((item.content_markdown || '').split('\n').map((l) => '    ' + l).join('\n'));

  const out = item.content_markdown || '';
  const markersOk = out.includes('[Primary Category: casino-platforms]') && out.includes('[Tag: content-aggregation]');
  const citationsOk = out.includes('[#1]') && out.includes('[#2]');
  const edited = item.status === 'edited';
  const changed = (item.tone_changes_count || 0) > 0;

  // Soft signal: at least one obvious AI tell reduced.
  const tellsBefore = (ARTICLE.match(/Furthermore|Additionally|comprehensive suite of|it is important to note|seamless|robust/gi) || []).length;
  const tellsAfter = (out.match(/Furthermore|Additionally|comprehensive suite of|it is important to note|seamless|robust/gi) || []).length;

  console.log('\n── Verdict ──');
  console.log(`  status edited:        ${edited ? 'PASS' : 'FAIL'}`);
  console.log(`  [Type] markers kept:  ${markersOk ? 'PASS' : 'FAIL'}`);
  console.log(`  [#n] citations kept:  ${citationsOk ? 'PASS' : 'FAIL'}`);
  console.log(`  content humanized:    ${changed ? 'PASS' : 'FAIL'} (${item.tone_changes_count} lines changed)`);
  console.log(`  AI-tell count:        ${tellsBefore} -> ${tellsAfter} (informational)`);

  const failures = [!edited, !markersOk, !citationsOk, !changed].filter(Boolean).length;
  if (failures > 0) { console.log('\nLIVE TEST FAILED.'); process.exit(1); }
  console.log('\nLIVE TEST PASSED — card preset drove a real humanization pass; [Type] markers + [#n] citations preserved.');
}

main().catch((e) => { console.error('LIVE TEST ERROR:', e); process.exit(1); });
