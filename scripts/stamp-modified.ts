/**
 * Stamps src/content/modified.toon with today's date whenever content changes
 * in the current commit. One date covers the whole site, so every page agrees.
 *
 * Runs from .githooks/pre-commit, so the date lands in the same commit as the
 * change that earned it. Deliberately not a build step: deriving dates from
 * `git log` at build time breaks wherever the deploy does a shallow clone,
 * since every file then reports the same single commit.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const STAMP = 'src/content/modified.toon';

/**
 * Content that doesn't live in src/content. The calendar's schedule sits in
 * TypeScript, so editing it would otherwise never stamp a date.
 */
const EXTRA = ['src/lib/calendar-data.ts'];

function today(): string {
  // Local date, not toISOString: that is UTC and rolls over a day early here
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { encoding: 'utf-8' })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const changed = staged.some(
  (file) =>
    (file.startsWith('src/content/') && file.endsWith('.toon') && file !== STAMP) ||
    EXTRA.includes(file),
);

if (!changed) process.exit(0);

const stamp = readFileSync(STAMP, 'utf-8');
const date = today();
const next = `site: ${date}\n`;

if (next === stamp) process.exit(0);

writeFileSync(STAMP, next);
execFileSync('git', ['add', STAMP]);
console.log(`stamped ${date}`);
