#!/usr/bin/env node
/**
 * Fails if a credential or a third-party service identifier reached the built client bundle.
 *
 * The legacy client shipped two Firebase configurations, EmailJS template ids and a mail
 * key in plain sight, because the SPA talked to those services directly. The rewrite keeps
 * every secret server-side, so the production bundle must contain none of them — that is
 * SC-007, and it is a release gate rather than a one-off check.
 *
 * The pattern list lives here, not in the workflow, so the CI step and the local run cannot
 * drift: `quickstart.md` and `.github/workflows/ci.yml` both invoke this script rather than
 * carrying their own copy of the regular expression (the duplication that lets one place
 * gain a pattern the other lacks).
 *
 * Usage: node tools/scan-bundle.js [directory]   (default: dist/apps/ui)
 *
 * Unlike `scan-secrets.js`, which scans *source* for a real credential and allows
 * placeholders, this scans a *build* and is deliberately strict: a public build has no
 * legitimate reason to contain any of these strings, so there is no placeholder exception
 * to make.
 */
const fs = require('node:fs');
const path = require('node:path');

const PATTERNS = [
  {name: 'MongoDB connection string', re: /mongodb(\+srv)?:\/\//},
  {name: 'Google/Firebase API key', re: /AIza[0-9A-Za-z_-]{35}/},
  {name: 'EmailJS service id', re: /service_[a-z0-9]{7}/},
  // The EmailJS template ids the legacy app called. The rewrite renders templates on the
  // server, so no `template_...` id belongs in the bundle.
  {name: 'EmailJS template id', re: /template_[a-z0-9]{7}/},
  {name: 'JWT secret reference', re: /JWT_SECRET/},
  {name: 'bearer access token literal', re: /accessToken/},
  // The legacy mail provider key. The rewrite reads it from the environment server-side.
  {name: 'mail provider API key', re: /MAIL_PROVIDER_API_KEY/},
  // A Gmail address is not an intentional public contact detail for this application: the
  // published contacts are on the `sisk-siechnice.pl` domain, so a Gmail address in the
  // bundle is either a leaked operator address or a copied configuration.
  {name: 'Gmail address', re: /[A-Za-z0-9._%+-]+@gmail\.com/},
];

const target = process.argv[2] ?? 'dist/apps/ui';

if (!fs.existsSync(target)) {
  console.error(`Nothing to scan: ${target} does not exist. Build the UI first.`);
  process.exit(1);
}

/** Every file under `dir`, recursively. */
const walk = (dir) =>
  fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

const findings = [];
let scanned = 0;

for (const file of walk(target)) {
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    // A binary asset (a font, an image) has nothing to match and no reason to fail the scan.
    continue;
  }
  scanned += 1;
  content.split('\n').forEach((line, index) => {
    for (const {name, re} of PATTERNS) {
      if (re.test(line)) {
        findings.push({file, line: index + 1, name, text: line.trim().slice(0, 120)});
      }
    }
  });
}

if (findings.length > 0) {
  console.error('A credential or service identifier was found in the built client assets:\n');
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.name}\n    ${f.text}`);
  }
  console.error('\nThe client bundle must not contain a secret (SC-007). Move the value server-side.');
  process.exit(1);
}

console.log(`No credential or service identifier found in ${scanned} files under ${target}.`);
