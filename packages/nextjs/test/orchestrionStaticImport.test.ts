import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `@sentry/server-utils/orchestrion/webpack` bundles the code-transformer bundler plugin, whose
 * vendored core compiles a WASM lexer at module-evaluation time. A static import of this subpath
 * anywhere in the package pulls that module into the runtime server entry's static graph, so on
 * Cloudflare Workers — where runtime WASM compilation is forbidden — every cold start threw a
 * `CompileError`, even with the feature disabled. It must only ever be reached through the deferred
 * `loadModule(...)` in `loadOrchestrionBundlerPlugin`.
 *
 * Regression test for https://github.com/getsentry/sentry-javascript/issues/22794
 */
describe('`@sentry/server-utils/orchestrion/webpack` is never a static import in the built package', () => {
  const builds = {
    cjs: resolve(__dirname, '../build/cjs'),
    esm: resolve(__dirname, '../build/esm'),
  };

  const SUBPATH = '@sentry/server-utils/orchestrion/webpack';

  // Static ESM `import`/`export … from '<subpath>'` (named, namespace, or bare side-effect import).
  const STATIC_IMPORT = new RegExp(String.raw`\b(?:import|export)\b[^;]*?from\s*['"]${escapeRegExp(SUBPATH)}['"]`);
  const BARE_IMPORT = new RegExp(String.raw`\bimport\s*['"]${escapeRegExp(SUBPATH)}['"]`);
  // Static CJS `require('<subpath>')` — distinct from the deferred `loadModule('<subpath>', module)`.
  const STATIC_REQUIRE = new RegExp(String.raw`\brequire\(\s*['"]${escapeRegExp(SUBPATH)}['"]`);

  it.each(Object.keys(builds))('has no static import of the orchestrion webpack subpath in the %s build', build => {
    const root = builds[build as keyof typeof builds];

    const offenders = jsFiles(root)
      .filter(file => {
        const source = readFileSync(file, 'utf8');
        return STATIC_IMPORT.test(source) || BARE_IMPORT.test(source) || STATIC_REQUIRE.test(source);
      })
      .map(file => relative(root, file));

    expect(offenders).toEqual([]);
  });

  it('reaches the orchestrion webpack subpath only through the deferred loader', () => {
    for (const [, root] of Object.entries(builds)) {
      const referencing = jsFiles(root).filter(file => readFileSync(file, 'utf8').includes(SUBPATH));
      expect(referencing.map(file => relative(root, file))).toEqual([
        join('config', 'loadOrchestrionBundlerPlugin.js'),
      ]);
      expect(readFileSync(referencing[0]!, 'utf8')).toMatch(
        new RegExp(String.raw`loadModule\(\s*['"]${escapeRegExp(SUBPATH)}['"]\s*,\s*module\s*\)`),
      );
    }
  });
});

function jsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...jsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
