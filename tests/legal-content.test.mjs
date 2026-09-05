// Self-check for the legal-content loader: kind→file-name resolution,
// html-over-txt precedence, no-alias strictness, availability scan.
// Uses process.env.CONTENT_DIR override (read via test cwd trick below) —
// the loader reads <cwd>/content, so run with cwd = a temp fixture dir.
// Run: node tests/legal-content.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const fixture = mkdtempSync(path.join(tmpdir(), 'legal-content-'));
const runner = new URL('./legal-content-runner.mts', import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, '$1'); // strip pre-drive slash on Windows

function scenario(files, fn) {
  rmSync(path.join(fixture, 'content'), { recursive: true, force: true });
  mkdirSync(path.join(fixture, 'content'), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(path.join(fixture, 'content', name), body);
  }
  const out = execFileSync(
    process.execPath,
    ['--experimental-strip-types', runner, JSON.stringify(fn.map(String))],
    { cwd: fixture, encoding: 'utf8' },
  );
  return out.trim().split('\n');
}

try {
  // 1. html wins over txt; plain kind resolves by its own name
  let r = scenario({ 'privacy.txt': 'T', 'privacy.html': '<H>' }, [
    "(await getLegalContent('privacy')).format",
    "(await getLegalContent('privacy')).content",
  ]);
  assert.equal(r[0], 'html');
  assert.equal(r[1], '<H>');

  // 2. alias names are NOT resolved — one name per kind (impressum.* is not
  //    an imprint file name)
  r = scenario({ 'impressum.html': '<WRONG-NAME>' }, ["(await getLegalContent('imprint')) ?? 'null'"]);
  assert.equal(r[0], 'null');

  // 3. exact kind name resolves
  r = scenario({ 'imprint.txt': 'IMPRINT' }, ["(await getLegalContent('imprint'))?.content ?? 'null'"]);
  assert.equal(r[0], 'IMPRINT');

  // 4. availability scan lists exactly the kinds with files
  r = scenario({ 'privacy.txt': 'T', 'tos.html': '<T>' }, ['(await availableLegalKinds()).join(",")']);
  assert.equal(r[0], 'privacy,tos');

  // 5. empty content dir → null + no kinds
  r = scenario({}, ["(await getLegalContent('privacy')) ?? 'null'", '(await availableLegalKinds()).length']);
  assert.equal(r[0], 'null');
  assert.equal(r[1], '0');

  console.log('legal content loader self-check passed');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
