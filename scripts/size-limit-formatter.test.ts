import { describe, expect, it } from 'vitest';
import {
  MAX_INCREASE_BYTES,
  SizeLimitFormatter,
} from '../dev-packages/size-limit-gh-action/utils/SizeLimitFormatter.mjs';

const formatter = new SizeLimitFormatter();

describe('bundle size comparison', () => {
  it.each([-1_000, 0, MAX_INCREASE_BYTES - 1, MAX_INCREASE_BYTES])('accepts an increase of %i bytes', increase => {
    const base = { browser: { size: 30_000 } };
    const current = { browser: { size: 30_000 + increase } };

    expect(formatter.getSizeIncreases(base, current, [{ name: 'browser', gzip: true }])).toEqual([]);
  });

  it('checks each gzipped bundle independently and ignores uncompressed growth', () => {
    const base = { browser: { size: 30_000 }, tracing: { size: 50_000 }, uncompressed: { size: 100_000 } };
    const current = {
      browser: { size: 30_000 + MAX_INCREASE_BYTES + 1 },
      tracing: { size: 40_000 },
      uncompressed: { size: 200_000 },
    };
    const config = [
      { name: 'browser', gzip: true },
      { name: 'tracing', gzip: true },
      { name: 'uncompressed', gzip: false },
    ];

    expect(formatter.getSizeIncreases(base, current, config)).toEqual([
      { name: 'browser', increase: MAX_INCREASE_BYTES + 1 },
    ]);
  });

  it('ignores added and removed scenarios but compares zero-byte baselines', () => {
    const base = { removed: { size: 30_000 }, empty: { size: 0 } };
    const current = { added: { size: 30_000 }, empty: { size: MAX_INCREASE_BYTES + 1 } };
    const config = [
      { name: 'added', gzip: true },
      { name: 'empty', gzip: true },
    ];

    expect(formatter.getSizeIncreases(base, current, config)).toEqual([
      { name: 'empty', increase: MAX_INCREASE_BYTES + 1 },
    ]);
  });

  it('parses measurements without absolute limits and ignores legacy budget fields', () => {
    const output = JSON.stringify([
      { name: 'browser', size: 30_000 },
      { name: 'tracing', size: 50_000, passed: false, sizeLimit: 40_000 },
    ]);

    expect(formatter.parseResults(output)).toEqual({
      browser: { name: 'browser', size: 30_000 },
      tracing: { name: 'tracing', size: 50_000 },
    });
  });

  it.each(['{}', '[]', '[null]', '[{"name":"browser"}]', '[{"name":"browser","size":-1}]'])(
    'rejects invalid measurements: %s',
    output => {
      expect(() => formatter.parseResults(output)).toThrow();
    },
  );

  it('reports additions and removals without absolute-limit failure markers', () => {
    const base = { removed: { name: 'removed', size: 1024 } };
    const current = { added: { name: 'added', size: 2048 } };

    expect(formatter.formatResults(base, current)).toEqual([
      ['Path', 'Size', '% Change', 'Change'],
      ['removed', '0 B', 'removed', 'removed'],
      ['added', '2.05 kB', 'added', 'added'],
    ]);
  });
});
