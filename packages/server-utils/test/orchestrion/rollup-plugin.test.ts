import type { InputOptions, NormalizedInputOptions, PluginContext } from 'rollup';
import { describe, expect, it, vi } from 'vitest';
import { commonJSInteropOptions, sentryOrchestrionPlugin } from '../../src/orchestrion/bundler/rollup';

type OptionsHook = (this: unknown, inputOptions: InputOptions) => null;
type BuildStartHook = (this: Pick<PluginContext, 'warn'>, rollupOptions: NormalizedInputOptions) => void;

function runBuildStart(inputOptions: InputOptions, normalizedExternal?: NormalizedInputOptions['external']): string[] {
  const plugin = sentryOrchestrionPlugin();
  const warn = vi.fn();
  (plugin.options as OptionsHook).call({}, inputOptions);
  (plugin.buildStart as BuildStartHook).call({ warn }, { external: normalizedExternal } as NormalizedInputOptions);
  return warn.mock.calls.map(call => call[0] as string);
}

describe('sentryOrchestrionPlugin (rollup) externalized-modules warning', () => {
  it('warns via the normalized predicate when Rollup provides one', () => {
    const warnings = runBuildStart({}, (source: string) => source === 'express');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('express');
  });

  describe('without a normalized predicate (Rolldown — rolldown/rolldown#1041)', () => {
    it('does not crash and stays silent when nothing is externalized', () => {
      expect(runBuildStart({ external: ['react'] })).toEqual([]);
      expect(runBuildStart({})).toEqual([]);
    });

    it('warns for a raw string entry', () => {
      const warnings = runBuildStart({ external: 'express' });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('express');
    });

    it('warns for raw array entries, including subpaths and RegExps', () => {
      const warnings = runBuildStart({ external: ['react', 'mysql/lib/index.js', /^pg$/] });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('mysql');
      expect(warnings[0]).toContain('pg');
      expect(warnings[0]).not.toContain('react');
    });

    it('warns via a raw user function', () => {
      const warnings = runBuildStart({ external: source => source === 'express' });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('express');
    });
  });
});

describe('commonJSInteropOptions', () => {
  const { requireReturnsDefault, ignoreTryCatch } = commonJSInteropOptions();

  it('resolves builtins to their default export directly', () => {
    expect(requireReturnsDefault('crypto')).toBe(true);
    expect(requireReturnsDefault('node:crypto')).toBe(true);
  });

  it('unwraps the known driver dependencies', () => {
    expect(requireReturnsDefault('mquery')).toBe(true);
    expect(requireReturnsDefault('denque')).toBe(true);
    expect(requireReturnsDefault('sqlstring')).toBe(true);
    expect(requireReturnsDefault('lodash.defaults')).toBe(true);
  });

  it('keeps auto for dependencies with call-position `.default` reads', () => {
    expect(requireReturnsDefault('debug')).toBe('auto');
    expect(requireReturnsDefault('some-unknown-package')).toBe('auto');
  });

  it('converts only builtin requires inside try blocks', () => {
    expect(ignoreTryCatch('crypto')).toBe(false);
    expect(ignoreTryCatch('node:crypto')).toBe(false);
    expect(ignoreTryCatch('kerberos')).toBe(true);
  });
});
