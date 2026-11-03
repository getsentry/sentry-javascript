import { describe, expect, it } from 'vitest';

import { orchestrionLoader } from '../../src/v3/orchestrionLoader';

describe('orchestrionLoader', () => {
  const loader = orchestrionLoader('/assets/npm/shim.js');
  const compiled = { format: 'module', source: 'export const a = 1;' };

  it('serves a module it cannot locate on disk unchanged, rather than failing the compile', () => {
    // Not a `file:` URL, so there is no path to read a package name from.
    expect(loader('data:text/javascript,export%20const%20a=1', {}, () => compiled)).toBe(compiled);
  });

  it('serves a module outside node_modules unchanged', () => {
    expect(loader('file:///app/entry.ts', {}, () => compiled)).toBe(compiled);
  });

  it('leaves non module results alone', () => {
    const css = { format: 'css', source: 'a{}' };
    expect(loader('file:///app/a.css', {}, () => css)).toBe(css);
  });
});
