#!/usr/bin/env node
/**
 * Fails if the previous tenant's brand reappears in shipped source.
 *
 * Issue #189 replaced every SISK identifier and user-facing element with Book Space. The
 * provenance stays in `README.md`, `AGENTS.md` and `specs/` (this scan does not read those), so
 * a future contributor can still trace where the rewrite came from — but a `SISK` string in an
 * identifier, a template or a UI label is a regression, and a review is not a reliable way to
 * catch one. The pattern lives here rather than in the workflow so the CI gate and a local run
 * cannot drift apart, the same reason `scan-bundle.js` owns its list.
 *
 * The match is on the brand tokens only, case-sensitively:
 *
 * - `SISK` — the uppercase brand. Lowercase `sisk` is not matched, so a variable such as
 *   `siskUrl` would slip through on its own; the identifier rename is the other half of the
 *   guard and is what the `SISK` token is checked against at the call site.
 * - `sisk-siechnice.pl` — the previous tenant's domain, which cannot appear in a generic
 *   deployment.
 *
 * `siechnice` alone is *not* a brand token: it is the city the twelve reference facilities sit
 * in (`CITIES`, the facility seed and their fixtures), which is real business data the product
 * carries.
 */
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');

const ROOTS = ['apps', 'libs', 'tools'];
const EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.cjs', '.json', '.html', '.scss', '.css']);
const IGNORED = [/(^|\/)node_modules\//, /(^|\/)dist\//, /(^|\/)\.nx\//, /(^|\/)generated\//];
// This script must name the token it matches, so it is the one file under `tools/` that is
// exempt. It is excluded by exact path, so nothing else can hide behind the exemption.
const SELF = 'tools/scan-brand.js';

const PATTERNS = [
  {name: 'SISK brand', re: /SISK/},
  {name: 'previous tenant domain', re: /sisk-siechnice\.pl/i},
];

const tracked = execFileSync('git', ['ls-files', ...ROOTS], {encoding: 'utf8'})
  .split('\n')
  .filter((file) => file !== '' && file !== SELF)
  .filter((file) => !IGNORED.some((pattern) => pattern.test(file)))
  .filter((file) => EXTENSIONS.has(file.slice(file.lastIndexOf('.'))));

const findings = [];
for (const file of tracked) {
  const text = fs.readFileSync(file, 'utf8');
  text.split('\n').forEach((line, index) => {
    for (const {name, re} of PATTERNS) {
      if (re.test(line)) {
        findings.push({file, line: index + 1, name, text: line.trim()});
      }
    }
  });
}

if (findings.length > 0) {
  for (const {file, line, name, text} of findings) {
    console.error(`::error file=${file},line=${line}::${name} in shipped source: ${text}`);
  }
  console.error(
    `\n${findings.length} SISK reference(s) found. Replace with Book Space (issue #189). ` +
      'Provenance in README.md, AGENTS.md and specs/ is allowed and is not scanned.'
  );
  process.exit(1);
}

console.log(`No SISK references in ${tracked.length} scanned source files.`);
