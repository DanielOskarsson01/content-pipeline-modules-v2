#!/usr/bin/env node
// Regenerate ALL_MODULE_READMES.md by concatenating every registered submodule's README.
// Run from the repo root after any README change:  node scripts/build-all-readmes.mjs
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const modulesDir = path.join(root, 'modules');

const entries = [];
for (const step of fs.readdirSync(modulesDir).filter((d) => /^step-\d+-/.test(d)).sort()) {
  const stepDir = path.join(modulesDir, step);
  for (const mod of fs.readdirSync(stepDir).sort()) {
    const dir = path.join(stepDir, mod);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (!fs.existsSync(path.join(dir, 'manifest.json'))) continue; // config bundles are not submodules
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const readmePath = path.join(dir, 'README.md');
    const readme = fs.existsSync(readmePath)
      ? fs.readFileSync(readmePath, 'utf8').trim()
      : `# ${manifest.id}\n\n_(no README.md)_`;
    entries.push({ step: manifest.step, id: manifest.id, version: manifest.version, readme });
  }
}
entries.sort((a, b) => a.step - b.step || a.id.localeCompare(b.id));

const toc = entries
  .map((e) => `- Step ${e.step} -- [${e.id}](#) (v${e.version})`)
  .join('\n');

const body = entries
  .map((e) => `<!-- ===== ${e.id} (step ${e.step}, v${e.version}) ===== -->\n\n${e.readme}`)
  .join('\n\n---\n\n');

const out = `# All Module READMEs

> GENERATED FILE -- do not edit by hand. Rebuild with \`node scripts/build-all-readmes.mjs\`.
> Generated ${new Date().toISOString().slice(0, 10)} from ${entries.length} submodule READMEs.
> Source of truth for options is each module's manifest.json; the loader serves manifests to the UI.

## Contents

${toc}

---

${body}
`;

fs.writeFileSync(path.join(root, 'ALL_MODULE_READMES.md'), out);
console.log(`ALL_MODULE_READMES.md rebuilt: ${entries.length} modules, ${out.length} bytes`);
