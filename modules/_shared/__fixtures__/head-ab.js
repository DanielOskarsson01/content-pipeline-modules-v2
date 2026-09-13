/**
 * Byte-identity test util. Loads a module's COMMITTED (prod HEAD) execute.js as a
 * require-able module so a test can run HEAD vs the working tree on the same input
 * and prove the default path is byte-identical. The HEAD source is written into
 * the module's OWN directory so its relative requires (../../_shared/...) resolve;
 * the temp file is removed on process exit (and via cleanupHead()).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..'); // modules/_shared/__fixtures__ -> repo root
const tmpFiles = [];

function loadHeadExecute(relPath) {
  const abs = path.join(repoRoot, relPath);
  const src = execSync(`git show HEAD:${relPath}`, { cwd: repoRoot }).toString();
  const tmp = abs.replace(/\.js$/, '.__head__.js');
  fs.writeFileSync(tmp, src);
  tmpFiles.push(tmp);
  return require(tmp);
}

function cleanupHead() {
  for (const f of tmpFiles.splice(0)) { try { fs.unlinkSync(f); } catch { /* already gone */ } }
}
process.on('exit', cleanupHead);

module.exports = { loadHeadExecute, cleanupHead, repoRoot };
