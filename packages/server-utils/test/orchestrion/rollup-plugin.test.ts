import type { InputOptions, NormalizedInputOptions, PluginContext } from 'rollup';
import { describe, expect, it, vi } from 'vitest';
import {
  commonJSInteropOptions,
  sentryCommonJSInteropPlugin,
  sentryOrchestrionPlugin,
} from '../../src/orchestrion/bundler/rollup';

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

  it('keeps auto for external packages', () => {
    expect(requireReturnsDefault('mquery')).toBe('auto');
    expect(requireReturnsDefault('debug')).toBe('auto');
  });

  it('converts only builtin requires inside try blocks', () => {
    expect(ignoreTryCatch('crypto')).toBe(false);
    expect(ignoreTryCatch('node:crypto')).toBe(false);
    expect(ignoreTryCatch('kerberos')).toBe(true);
  });
});

describe('sentryCommonJSInteropPlugin', () => {
  const transform = sentryCommonJSInteropPlugin().transform as (
    code: string,
    id: string,
  ) => { code: string; map: null } | null;

  const brokenHelper =
    'export function getDefaultExportFromNamespaceIfNotNamed (n) {\n' +
    "\treturn n && Object.prototype.hasOwnProperty.call(n, 'default') && Object.keys(n).length === 1 ? n['default'] : n;\n" +
    '}\n';

  it('patches the namespace check in the commonjs helpers module', () => {
    const result = transform(brokenHelper, '\0commonjsHelpers.js');

    expect(result?.code).toContain("Object.keys(n).filter(k => k !== 'module.exports').length === 1");
    expect(result?.code).not.toContain('Object.keys(n).length === 1');
  });

  it('ignores other modules', () => {
    expect(transform(brokenHelper, '/app/node_modules/mongoose/lib/index.js')).toBeNull();
  });

  it('leaves an already-fixed helpers module unchanged', () => {
    const fixedHelper = brokenHelper.replace(
      'Object.keys(n).length === 1',
      "Object.keys(n).filter(k => k !== 'module.exports').length === 1",
    );

    expect(transform(fixedHelper, '\0commonjsHelpers.js')).toBeNull();
  });
});
