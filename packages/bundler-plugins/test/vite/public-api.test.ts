import { sentryVitePlugin } from '../../src/vite';
import type { Plugin, SourceMap } from 'rollup';
import { runInNewContext } from 'node:vm';
import { describe, it, expect, test, beforeEach, vi } from 'vitest';

test('Vite plugin should exist', () => {
  expect(sentryVitePlugin).toBeDefined();
  expect(typeof sentryVitePlugin).toBe('function');
});

describe('sentryVitePlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an array of Vite plugins', () => {
    const plugins = sentryVitePlugin({
      authToken: 'test-token',
      org: 'test-org',
      project: 'test-project',
    });

    expect(Array.isArray(plugins)).toBe(true);

    const pluginNames = plugins.map(plugin => plugin.name);

    expect(pluginNames).toEqual(expect.arrayContaining(['sentry-vite-plugin']));
  });

  it('returns an array of Vite pluginswhen unplugin returns a single plugin', () => {
    const plugins = sentryVitePlugin({
      authToken: 'test-token',
      org: 'test-org',
      project: 'test-project',
      disable: true, // This causes unplugin to return only the noop plugin
    });

    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThanOrEqual(1);
    expect(plugins[0]).toHaveProperty('name');
  });

  it('restores debug IDs on source maps after Vite rewrites them without changing chunk code', () => {
    const plugins = sentryVitePlugin({
      release: { inject: false },
      sourcemaps: { disable: 'disable-upload' },
      telemetry: false,
    });
    const postPlugin = plugins.find(plugin => plugin.name === 'sentry-vite-debug-id-sourcemaps');
    const debugId = 'e3ee452d-c255-448c-aa62-da0fd4c49e46';
    const code = `globalThis._sentryDebugIdIdentifier="sentry-dbid-${debugId}";\n//# debugId=${debugId}`;
    const sourceMapAsset = {
      type: 'asset' as const,
      fileName: 'entry.js.map',
      source: JSON.stringify({ version: 3, sources: ['entry.ts'], names: [], mappings: '' }),
    };
    const bundle = {
      'entry.js': { type: 'chunk' as const, fileName: 'entry.js', code },
      'entry.js.map': sourceMapAsset,
    };

    expect(postPlugin?.generateBundle).toBeDefined();
    postPlugin?.generateBundle?.handler({}, bundle);

    expect(bundle['entry.js'].code).toBe(code);
    expect(JSON.parse(sourceMapAsset.source)).toMatchObject({ debug_id: debugId, debugId });
  });

  it.each([
    ['when the directive has no semicolon', '"use strict"\n'],
    ['when another directive precedes it', '"use client";\n"use strict";\n'],
    ['after an escaped CRLF in an earlier directive', '"not strict\\\r\n";\n"use strict";\n'],
    ['before an identifier prefixed with an operator keyword', '"use strict"\nin$foo: ;\n'],
  ])('preserves strict mode %s', (_description, codePrefix) => {
    const [plugin] = sentryVitePlugin({ release: { inject: false }, telemetry: false }) as Array<Plugin>;
    const renderChunk = plugin?.renderChunk as (
      code: string,
      chunkInfo: { fileName: string },
    ) => { code: string; map: SourceMap } | null;
    const code = `${codePrefix}globalThis.strictModePreserved = (function () { return this; })() === undefined;`;

    const result = renderChunk(code, { fileName: 'bundle.js' });
    const context: { strictModePreserved?: boolean; _sentryDebugIds?: Record<string, string> } = {};

    expect(result).not.toBeNull();
    runInNewContext(result?.code ?? '', context);

    expect(context.strictModePreserved).toBe(true);
    expect(Object.keys(context._sentryDebugIds ?? {})).toHaveLength(1);
  });
});
