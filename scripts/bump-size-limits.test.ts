import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- .mjs source has no declarations under `moduleResolution: "node"`
import * as bumpSizeLimits from './bump-size-limits.mjs';

const {
  BYTES_PER_KB,
  BYTES_PER_KIB,
  computeNewLimit,
  DRIFT_THRESHOLD_BYTES,
  extractCurrentLimit,
  HEADROOM_BYTES,
  parseSizeLimitOutput,
  renderSummary,
  rewriteSizeLimitFile,
  sanitizeMarkdownCell,
} = bumpSizeLimits;

const FIXTURE_PATH = path.join(__dirname, '__fixtures__', 'size-limit-sample.js');
function readFixture(): string {
  return fs.readFileSync(FIXTURE_PATH, 'utf8');
}

describe('constants', () => {
  it('exports the documented thresholds', () => {
    expect(DRIFT_THRESHOLD_BYTES).toBe(1000);
    expect(HEADROOM_BYTES).toBe(5000);
    expect(BYTES_PER_KB).toBe(1000);
    expect(BYTES_PER_KIB).toBe(1024);
  });
});

describe('computeNewLimit', () => {
  it('returns null when limit−current is within ±1000 bytes (within tolerance)', () => {
    expect(computeNewLimit(26_500, 27_000)).toBeNull(); // 500 below limit — fine
    expect(computeNewLimit(27_500, 27_000)).toBeNull(); // 500 over limit — fine
    expect(computeNewLimit(26_001, 27_000)).toBeNull(); // 999 below — fine
  });

  it('returns null at exact ±1000-byte boundary (≤, not <)', () => {
    expect(computeNewLimit(26_000, 27_000)).toBeNull();
    expect(computeNewLimit(28_000, 27_000)).toBeNull();
  });

  it('bumps up when current exceeds limit by more than 1000 bytes', () => {
    // current 27_500, limit 26_000, drift = 1_500 (over). new = ceil((27500+5000)/1000)*1000 = 33_000
    expect(computeNewLimit(27_500, 26_000)).toBe(33_000);
  });

  it('bumps down when current is more than 1000 bytes below limit', () => {
    // current 21_000, limit 27_000 → new = 26_000
    expect(computeNewLimit(21_000, 27_000)).toBe(26_000);
  });

  it('rounds up to next full KB', () => {
    // current 27_001 → +5000 = 32_001 → ceil to 33_000
    expect(computeNewLimit(27_001, 25_000)).toBe(33_000);
    // current 27_999 → +5000 = 32_999 → ceil to 33_000
    expect(computeNewLimit(27_999, 25_000)).toBe(33_000);
    // current 28_000 → +5000 = 33_000 → already round → 33_000
    expect(computeNewLimit(28_000, 25_000)).toBe(33_000);
  });

  it('handles zero-size measurements safely', () => {
    expect(computeNewLimit(0, 27_000)).toBe(5_000);
  });
});

describe('parseSizeLimitOutput', () => {
  it('accepts well-formed input and returns name/size/sizeLimit triples', () => {
    const raw = JSON.stringify([
      { name: '@sentry/browser', size: 27_500, sizeLimit: 27_000, passed: false },
      { name: 'CDN Bundle', size: 28_000, sizeLimit: 29_000, passed: true },
    ]);
    expect(parseSizeLimitOutput(raw)).toEqual([
      { name: '@sentry/browser', size: 27_500, sizeLimit: 27_000 },
      { name: 'CDN Bundle', size: 28_000, sizeLimit: 29_000 },
    ]);
  });

  it('rejects non-array root', () => {
    expect(() => parseSizeLimitOutput('{}')).toThrow(/expected array/i);
    expect(() => parseSizeLimitOutput('null')).toThrow(/expected array/i);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseSizeLimitOutput('not json')).toThrow(SyntaxError);
  });

  it('rejects entries missing required fields', () => {
    expect(() => parseSizeLimitOutput(JSON.stringify([{ name: 'x', size: 1 }]))).toThrow(/sizeLimit/);
    expect(() => parseSizeLimitOutput(JSON.stringify([{ size: 1, sizeLimit: 2 }]))).toThrow(/name/);
  });

  it('rejects entries with non-string name', () => {
    expect(() => parseSizeLimitOutput(JSON.stringify([{ name: 42, size: 1, sizeLimit: 2 }]))).toThrow(/name/);
  });

  it('rejects entries with non-finite numbers', () => {
    expect(() => parseSizeLimitOutput(JSON.stringify([{ name: 'x', size: 'one', sizeLimit: 2 }]))).toThrow(/size/);
    expect(() => parseSizeLimitOutput('[{"name":"x","size":1e500,"sizeLimit":2}]')).toThrow(/size/);
  });

  it('ignores extra fields without complaint', () => {
    const raw = JSON.stringify([{ name: 'x', size: 1, sizeLimit: 2, passed: true, extra: 'ok' }]);
    expect(parseSizeLimitOutput(raw)).toEqual([{ name: 'x', size: 1, sizeLimit: 2 }]);
  });
});

describe('sanitizeMarkdownCell', () => {
  it('passes plain text through unchanged', () => {
    expect(sanitizeMarkdownCell('@sentry/browser')).toBe('@sentry/browser');
  });

  it('escapes pipes', () => {
    expect(sanitizeMarkdownCell('a|b')).toBe('a\\|b');
  });

  it('escapes backticks', () => {
    expect(sanitizeMarkdownCell('a`b')).toBe('a\\`b');
  });

  it('replaces newlines with spaces', () => {
    expect(sanitizeMarkdownCell('a\nb')).toBe('a b');
    expect(sanitizeMarkdownCell('a\r\nb')).toBe('a b');
  });

  it('preserves parentheses, commas, periods', () => {
    expect(sanitizeMarkdownCell('CDN Bundle (incl. Tracing, Replay)')).toBe('CDN Bundle (incl. Tracing, Replay)');
  });
});

describe('renderSummary', () => {
  it('renders an empty header when there are no changes', () => {
    const out = renderSummary([]);
    expect(out).toContain('## Size limit auto-bump');
    expect(out).toContain('No drift greater than 1 KB. No changes needed.');
  });

  it('renders a markdown table for one change', () => {
    const out = renderSummary([
      { name: '@sentry/browser', oldLimit: '27 KB', newLimit: '28 KB', delta: 1, unit: 'KB' },
    ]);
    expect(out).toContain('| Entry | Old limit | New limit | Δ |');
    expect(out).toContain('| @sentry/browser | 27 KB | 28 KB | +1 KB |');
  });

  it('formats negative deltas with a minus', () => {
    const out = renderSummary([
      { name: '@sentry/node', oldLimit: '177 KB', newLimit: '175 KB', delta: -2, unit: 'KB' },
    ]);
    expect(out).toContain('| @sentry/node | 177 KB | 175 KB | -2 KB |');
  });

  it('uses the entry unit for the delta column (KiB)', () => {
    const out = renderSummary([
      {
        name: '@sentry/cloudflare (withSentry)',
        oldLimit: '420 KiB',
        newLimit: '425 KiB',
        delta: 5,
        unit: 'KiB',
      },
    ]);
    expect(out).toContain('| @sentry/cloudflare (withSentry) | 420 KiB | 425 KiB | +5 KiB |');
  });

  it('escapes pipes in entry names', () => {
    const out = renderSummary([{ name: 'evil|name', oldLimit: '1 KB', newLimit: '2 KB', delta: 1, unit: 'KB' }]);
    expect(out).toContain('evil\\|name');
  });
});

describe('rewriteSizeLimitFile', () => {
  it('updates a single entry, preserving KB unit', () => {
    const src = readFixture();
    const out = rewriteSizeLimitFile(src, [{ name: '@sentry/browser', newLimitKb: 28, unit: 'KB' }]);
    expect(out).toMatch(/name: '@sentry\/browser',[\s\S]*?limit: '28 KB',/);
    expect(out).toMatch(/name: '@sentry\/browser - with treeshaking flags',[\s\S]*?limit: '25 KB',/);
  });

  it('updates entries with name-prefix collision correctly', () => {
    const src = readFixture();
    const out = rewriteSizeLimitFile(src, [
      { name: '@sentry/browser - with treeshaking flags', newLimitKb: 30, unit: 'KB' },
    ]);
    expect(out).toMatch(/name: '@sentry\/browser',[\s\S]*?limit: '27 KB',/);
    expect(out).toMatch(/name: '@sentry\/browser - with treeshaking flags',[\s\S]*?limit: '30 KB',/);
  });

  it('preserves KiB unit', () => {
    const src = readFixture();
    const out = rewriteSizeLimitFile(src, [{ name: '@sentry/cloudflare (withSentry)', newLimitKb: 425, unit: 'KiB' }]);
    expect(out).toMatch(/name: '@sentry\/cloudflare \(withSentry\)',[\s\S]*?limit: '425 KiB',/);
  });

  it('handles names with parentheses and decimals in original limit', () => {
    const src = readFixture();
    const out = rewriteSizeLimitFile(src, [{ name: 'CDN Bundle (incl. Tracing)', newLimitKb: 50, unit: 'KB' }]);
    expect(out).toMatch(/name: 'CDN Bundle \(incl\. Tracing\)',[\s\S]*?limit: '50 KB',/);
    expect(out).not.toContain("limit: '46.5 KB'");
  });

  it('applies multiple changes', () => {
    const src = readFixture();
    const out = rewriteSizeLimitFile(src, [
      { name: '@sentry/browser', newLimitKb: 28, unit: 'KB' },
      { name: 'CDN Bundle (incl. Tracing)', newLimitKb: 50, unit: 'KB' },
    ]);
    expect(out).toContain("limit: '28 KB'");
    expect(out).toContain("limit: '50 KB'");
  });

  it('throws if a name does not match any entry', () => {
    const src = readFixture();
    expect(() => rewriteSizeLimitFile(src, [{ name: '@sentry/nonexistent', newLimitKb: 1, unit: 'KB' }])).toThrow(
      /@sentry\/nonexistent/,
    );
  });

  it('returns unchanged source when changes is empty', () => {
    const src = readFixture();
    expect(rewriteSizeLimitFile(src, [])).toBe(src);
  });

  it('does not modify the input string in-place', () => {
    const src = readFixture();
    const before = src;
    rewriteSizeLimitFile(src, [{ name: '@sentry/browser', newLimitKb: 28, unit: 'KB' }]);
    expect(src).toBe(before);
  });
});

describe('extractCurrentLimit', () => {
  const FIXTURE_SRC = `module.exports = [
  { name: '@sentry/browser', limit: '27 KB' },
  { name: '@sentry/cloudflare (withSentry)', limit: '420 KiB' },
];`;

  it('extracts the limit value and unit by name', () => {
    expect(extractCurrentLimit(FIXTURE_SRC, '@sentry/browser')).toEqual({
      value: 27,
      unit: 'KB',
      raw: '27 KB',
    });
    expect(extractCurrentLimit(FIXTURE_SRC, '@sentry/cloudflare (withSentry)')).toEqual({
      value: 420,
      unit: 'KiB',
      raw: '420 KiB',
    });
  });

  it('returns null when the name is not present', () => {
    expect(extractCurrentLimit(FIXTURE_SRC, '@sentry/missing')).toBeNull();
  });
});
