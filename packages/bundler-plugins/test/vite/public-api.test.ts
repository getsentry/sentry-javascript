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

    expect(pluginNames).toEqual(['sentry-vite-plugin', 'sentry-vite-module-versions', 'sentry-vite-upload-staging']);
  });

  it('replaces the module versions placeholder only in its own plugin, for server environments', () => {
    const plugins = sentryVitePlugin({ telemetry: false });
    const main = plugins.find(plugin => plugin.name === 'sentry-vite-plugin');
    const moduleVersions = plugins.find(plugin => plugin.name === 'sentry-vite-module-versions') as {
      applyToEnvironment: (environment: { config: { consumer: string } }) => boolean;
      transform: { filter: { code: string } };
    };

    expect(main).not.toHaveProperty('transform');
    expect(moduleVersions.transform.filter.code).toBe('__SENTRY_SERVER_MODULES__');
    expect(moduleVersions.applyToEnvironment({ config: { consumer: 'server' } })).toBe(true);
    expect(moduleVersions.applyToEnvironment({ config: { consumer: 'client' } })).toBe(false);
  });

  it('applies the module versions plugin to every environment with `injectModuleVersions: true`', () => {
    const plugins = sentryVitePlugin({ telemetry: false, injectModuleVersions: true });

    expect(plugins.find(plugin => plugin.name === 'sentry-vite-module-versions')).not.toHaveProperty(
      'applyToEnvironment',
    );
  });

  it('adds no module versions plugin with `injectModuleVersions: false`', () => {
    const plugins = sentryVitePlugin({ telemetry: false, injectModuleVersions: false });

    expect(plugins.map(plugin => plugin.name)).not.toContain('sentry-vite-module-versions');
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
