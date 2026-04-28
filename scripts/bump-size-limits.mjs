/**
 * Auto-bumper for .size-limit.js.
 *
 * - Reads `yarn size-limit --json` output
 * - For each entry, computes a new limit of roundUpToKB(currentSize + 5000)
 *   and applies it whenever the displayed value would change
 * - Rewrites .size-limit.js as plain text (NEVER require()d — the file contains
 *   user-defined webpack/esbuild config functions that we don't want executing)
 *
 * Exit codes: 0 = wrote changes, 2 = no-op, 1 = error.
 */

import { execFile } from 'node:child_process';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const SIZE_LIMIT_FILE = path.join(REPO_ROOT, '.size-limit.js');

export const HEADROOM_BYTES = 5000;
export const BYTES_PER_KB = 1000;
export const BYTES_PER_KIB = 1024;

/**
 * Compute the new size-limit in bytes for an entry: currentSize + 5KB,
 * rounded up to the next full KB. Always returns a number — the no-op
 * check is done downstream by comparing the displayed (KB/KiB-rounded)
 * value against the existing one.
 *
 * @param {number} currentBytes - measured size in bytes
 * @returns {number} new limit in bytes, rounded up to the next KB
 */
export function computeNewLimit(currentBytes) {
  const target = currentBytes + HEADROOM_BYTES;
  return Math.ceil(target / BYTES_PER_KB) * BYTES_PER_KB;
}

/**
 * Parse and strict-validate the JSON output from `yarn size-limit --json`.
 *
 * @param {string} raw - JSON string
 * @returns {Array<{ name: string, size: number, sizeLimit: number }>}
 * @throws {TypeError | SyntaxError} on malformed input
 */
export function parseSizeLimitOutput(raw) {
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new TypeError(`size-limit output: expected array, got ${typeof data}`);
  }
  return data.map((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      throw new TypeError(`size-limit entry [${i}]: expected object`);
    }
    if (typeof entry.name !== 'string' || entry.name.length === 0) {
      throw new TypeError(`size-limit entry [${i}]: 'name' must be a non-empty string`);
    }
    if (typeof entry.size !== 'number' || !Number.isFinite(entry.size)) {
      throw new TypeError(`size-limit entry [${i}] (${entry.name}): 'size' must be a finite number`);
    }
    if (typeof entry.sizeLimit !== 'number' || !Number.isFinite(entry.sizeLimit)) {
      throw new TypeError(`size-limit entry [${i}] (${entry.name}): 'sizeLimit' must be a finite number`);
    }
    return { name: entry.name, size: entry.size, sizeLimit: entry.sizeLimit };
  });
}

/**
 * Escape a string for safe inclusion in a markdown table cell.
 * Replaces newlines with spaces, escapes pipes and backticks.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function sanitizeMarkdownCell(value) {
  return String(value)
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/[|`]/g, m => `\\${m}`);
}

/**
 * Escape a string for literal use inside a RegExp.
 */
function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Inspect the source for the current limit string of a given entry.
 * Returns null if no entry with that name is found.
 *
 * @param {string} src
 * @param {string} name
 * @returns {{ value: number, unit: 'KB' | 'KiB', raw: string } | null}
 */
export function extractCurrentLimit(src, name) {
  const namePattern = `name:\\s*'${reEscape(name)}'`;
  const limitPattern = `limit:\\s*'(\\d+(?:\\.\\d+)?)\\s*(KB|KiB)'`;
  const re = new RegExp(`${namePattern}[^]*?${limitPattern}`);
  const m = re.exec(src);
  if (!m) return null;
  return { value: Number(m[1]), unit: /** @type {'KB' | 'KiB'} */ (m[2]), raw: `${m[1]} ${m[2]}` };
}

/**
 * Convert a numeric byte value into a whole-unit display value matching the
 * entry's existing unit. KB uses 1000, KiB uses 1024.
 *
 * @param {number} newBytes
 * @param {'KB' | 'KiB'} unit
 * @returns {number}
 */
function bytesToDisplay(newBytes, unit) {
  const divisor = unit === 'KiB' ? BYTES_PER_KIB : BYTES_PER_KB;
  return Math.ceil(newBytes / divisor);
}

/**
 * Rewrite `.size-limit.js` source to apply a list of limit updates.
 * Operates on plain text — never executes the source. For each change,
 * locates the entry by exact `name:` match and rewrites the next `limit:`
 * line in that window.
 *
 * @param {string} src - contents of .size-limit.js
 * @param {Array<{ name: string, newLimitKb: number, unit: 'KB' | 'KiB' }>} changes
 * @returns {string} updated source
 * @throws {Error} if any change's name doesn't match exactly one entry
 */
export function rewriteSizeLimitFile(src, changes) {
  let out = src;
  for (const { name, newLimitKb, unit } of changes) {
    const namePattern = `name:\\s*'${reEscape(name)}'`;
    const limitPattern = `limit:\\s*'(\\d+(?:\\.\\d+)?)\\s*(KB|KiB)'`;
    const re = new RegExp(`(${namePattern}[^]*?)${limitPattern}`);

    let matchCount = 0;
    const replaced = out.replace(re, (_full, prefix) => {
      matchCount++;
      return `${prefix}limit: '${newLimitKb} ${unit}'`;
    });

    if (matchCount === 0) {
      throw new Error(`rewriteSizeLimitFile: no entry matched for name='${name}'`);
    }
    out = replaced;
  }
  return out;
}

/**
 * Render a markdown summary of size-limit changes for the PR body.
 *
 * @param {Array<{ name: string, oldLimit: string, newLimit: string, delta: number, unit: 'KB' | 'KiB' }>} changes
 * @returns {string}
 */
export function renderSummary(changes) {
  const header = '## Size limit auto-bump\n';
  if (changes.length === 0) {
    return `${header}\nAll size limits already provide ≥5 KB headroom. No changes needed.\n`;
  }
  const lines = [header, '| Entry | Old limit | New limit | Δ |', '| --- | --- | --- | --- |'];
  for (const c of changes) {
    const sign = c.delta >= 0 ? '+' : '';
    const delta = `${sign}${c.delta} ${c.unit}`;
    lines.push(`| ${sanitizeMarkdownCell(c.name)} | ${c.oldLimit} | ${c.newLimit} | ${delta} |`);
  }
  return `${lines.join('\n')}\n`;
}

// CLI entrypoint
async function main() {
  // 1. Run size-limit. Capture JSON. execFile (no shell).
  let raw;
  try {
    // `--silent` suppresses yarn's `yarn run v…` header and `Done in …` footer,
    // which would otherwise break JSON.parse on the captured stdout.
    const { stdout } = await execFileAsync('yarn', ['--silent', 'size-limit', '--json'], {
      cwd: REPO_ROOT,
      maxBuffer: 16 * 1024 * 1024,
    });
    raw = stdout;
  } catch (err) {
    // size-limit exits non-zero when entries fail their existing limit. We still want the JSON.
    if (err && typeof err === 'object' && 'stdout' in err && err.stdout) {
      raw = /** @type {string} */ (err.stdout);
    } else {
      throw err;
    }
  }

  const measurements = parseSizeLimitOutput(raw);

  // 2. Read .size-limit.js as text. NEVER require() it.
  const src = await readFile(SIZE_LIMIT_FILE, 'utf8');

  // 3. Compute changes.
  const changes = [];
  const summaryRows = [];
  for (const m of measurements) {
    const newBytes = computeNewLimit(m.size);

    const cur = extractCurrentLimit(src, m.name);
    if (!cur) {
      throw new Error(`size-limit reported entry '${m.name}' but it was not found in .size-limit.js`);
    }

    const displayValue = bytesToDisplay(newBytes, cur.unit);
    const newLimitStr = `${displayValue} ${cur.unit}`;

    if (newLimitStr === cur.raw) {
      // After unit conversion the displayed value didn't move. Skip — avoids
      // no-op edits caused by KiB rounding.
      continue;
    }

    changes.push({ name: m.name, newLimitKb: displayValue, unit: cur.unit });
    summaryRows.push({
      name: m.name,
      oldLimit: cur.raw,
      newLimit: newLimitStr,
      delta: displayValue - cur.value,
      unit: cur.unit,
    });
  }

  // 4. Print summary regardless (workflow captures stdout).
  process.stdout.write(renderSummary(summaryRows));

  if (changes.length === 0) {
    process.exit(2);
  }

  // 5. Atomic write: temp file + rename.
  const updated = rewriteSizeLimitFile(src, changes);
  const tmpPath = `${SIZE_LIMIT_FILE}.tmp`;
  await writeFile(tmpPath, updated, 'utf8');
  await rename(tmpPath, SIZE_LIMIT_FILE);

  process.exit(0);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch(err => {
    // oxlint-disable-next-line no-console
    console.error(err.stack || err.message || err);
    process.exit(1);
  });
}
