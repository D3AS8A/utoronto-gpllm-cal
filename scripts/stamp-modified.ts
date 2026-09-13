/**
 * Stamps src/content/modified.toon with today's date for every content file
 * staged in the current commit.
 *
 * Runs from .githooks/pre-commit, so the date lands in the same commit as the
 * change that earned it. Deliberately not a build step: deriving dates from
 * `git log` at build time breaks wherever the deploy does a shallow clone,
 * since every file then reports the same single commit.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const STAMP = 'src/content/modified.toon';

function today(): string {
  // Local date, not toISOString: that is UTC and rolls over a day early here
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--', 'src/content'], {
  encoding: 'utf-8',
})
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.endsWith('.toon') && basename(line) !== basename(STAMP));

if (staged.length === 0) process.exit(0);

const stamp = readFileSync(STAMP, 'utf-8');
const date = today();
let next = stamp;

for (const file of staged) {
  const page = basename(file, '.toon');
  if (page === 'global') continue; // site-wide, not a page
  const line = new RegExp(`^${page}: .*$`, 'm');
  next = line.test(next) ? next.replace(line, `${page}: ${date}`) : `${next.trimEnd()}\n${page}: ${date}\n`;
}

if (next === stamp) process.exit(0);

writeFileSync(STAMP, next);
execFileSync('git', ['add', STAMP]);
console.log(`stamped ${date}: ${staged.map((f) => basename(f, '.toon')).join(', ')}`);
