#!/usr/bin/env node
/**
 * Fails if a real credential appears in a tracked file.
 *
 * Placeholders are deliberately allowed: `.env.example` and spec docs need to
 * show the shape of a connection string, and unit tests need a well-formed URI
 * to exercise validation. A naive `mongodb+srv://user:pass@...` pattern flags
 * all of those, so the host and password are checked against known dummy values
 * instead of matching any credential-shaped string.
 */
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');

// Hosts and values that are safe to commit. Anything else is treated as real.
const PLACEHOLDER_HOSTS = [
  'cluster.mongodb.net',
  'book-space.example.com',
  'localhost',
  'example.com',
  'host',
  'your-cluster.mongodb.net',
];
const PLACEHOLDER_PASSWORDS = [
  'password',
  'pass',
  'passwd',
  'secret',
  'changeme',
  'your-password',
  'realpassword',
  'test',
  'dummy',
  'example',
];

const PATTERNS = [
  {name: 'mongodb connection string', re: /mongodb(\+srv)?:\/\/[^\s:@/]+:([^\s@/]+)@([^\s/]+)/g},
  {name: 'google api key', re: /AIza[0-9A-Za-z_-]{35}/g},
  {name: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g},
  {name: 'github token', re: /github_pat_[A-Za-z0-9_]{20,}/g},
];

const isPlaceholderHost = host =>
  PLACEHOLDER_HOSTS.some(p => host === p || host.endsWith(`.${p}`)) || host.includes('example') || host.includes('<');

const isPlaceholderPassword = pw => {
  const lower = pw.toLowerCase();
  if (lower.includes('<') || lower.includes('>')) return true;
  if (lower.includes('your-') || lower.includes('your_')) return true;
  return PLACEHOLDER_PASSWORDS.includes(lower);
};

const files = execFileSync('git', ['ls-files'], {encoding: 'utf8'}).split('\n').filter(Boolean);
const findings = [];

for (const file of files) {
  if (/\.(example|md|lock)$/.test(file) || file.endsWith('yarn.lock') || file.endsWith('package-lock.json')) continue;
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    for (const {name, re} of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        if (name === 'mongodb connection string') {
          const [, , password, host] = m;
          if (isPlaceholderHost(host) || isPlaceholderPassword(password)) continue;
        }
        findings.push({file, line: i + 1, name, text: line.trim().slice(0, 120)});
      }
    }
  });
}

if (findings.length > 0) {
  console.error('A hard-coded credential was found in a tracked file:\n');
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.name}\n    ${f.text}`);
  console.error('\nMove the value to apps/server/.env (gitignored) or use a secret store.');
  process.exit(1);
}

console.log(`No committed credential found in ${files.length} tracked files.`);
