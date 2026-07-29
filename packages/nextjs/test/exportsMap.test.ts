import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The `node` export condition must offer an `import`/`require` split like its sibling conditions. When it was a bare
 * string pointing at the CJS server build, every ESM consumer under a plain Node.js loader received the CJS build
 * (`node` matches before the top-level `import` condition), so `cjs-module-lexer` could not see the bindings
 * re-exported from `@sentry/core` / `@sentry/node`: named imports failed to link and namespace imports contained
 * silently-undefined members.
 *
 * Regression test for https://github.com/getsentry/sentry-javascript/issues/22791
 */
describe('package.json exports map', () => {
  const packageRoot = resolve(__dirname, '..');
  const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
    exports: Record<string, Record<string, unknown>>;
  };

  const nodeCondition = packageJson.exports['.']?.['node'] as Record<string, string> | undefined;

  it('has an `import`/`require` split under the `node` condition of the root export', () => {
    expect(nodeCondition).toBeInstanceOf(Object);
    expect(typeof nodeCondition?.import).toBe('string');
    expect(typeof nodeCondition?.require).toBe('string');
  });

  it('points the `node.import` condition at an existing file in the ESM build output', () => {
    expect(nodeCondition?.import).toMatch(/\/esm\//);
    expect(existsSync(resolve(packageRoot, nodeCondition?.import as string))).toBe(true);
  });

  it('points the `node.require` condition at an existing file in the CJS build output', () => {
    expect(nodeCondition?.require).toMatch(/\/cjs\//);
    expect(existsSync(resolve(packageRoot, nodeCondition?.require as string))).toBe(true);
  });
});

/**
 * `next` does not declare an `exports` map, so Node's ESM resolver requires explicit file extensions for deep imports
 * like `next/constants.js`. Extensionless specifiers work in webpack/turbopack but throw `ERR_MODULE_NOT_FOUND` under
 * a plain Node.js loader, which would make the ESM server build (reachable via `node.import`) unloadable.
 *
 * Regression test for https://github.com/getsentry/sentry-javascript/issues/22791
 */
describe('ESM server build is loadable by plain Node.js', () => {
  it('uses explicit file extensions for all `next/*` deep imports in the ESM server module graph', () => {
    const packageRoot = resolve(__dirname, '..');
    const entry = resolve(packageRoot, 'build/esm/index.server.js');
    expect(existsSync(entry)).toBe(true);

    const importSpecifierRegex = /(?:from|import)\s*['"]([^'"]+)['"]/g;
    const visited = new Set<string>();
    const queue = [entry];
    const extensionlessNextImports: string[] = [];

    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (visited.has(file) || !existsSync(file)) {
        continue;
      }
      visited.add(file);

      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(importSpecifierRegex)) {
        const specifier = match[1] as string;
        if (specifier.startsWith('.')) {
          const resolved = resolve(dirname(file), specifier);
          queue.push(resolved.endsWith('.js') ? resolved : `${resolved}.js`);
        } else if (/^next\/.+/.test(specifier) && !/\.[cm]?js$/.test(specifier)) {
          extensionlessNextImports.push(`${specifier} (in ${file.replace(packageRoot, '')})`);
        }
      }
    }

    expect(visited.size).toBeGreaterThan(1);
    expect(extensionlessNextImports).toEqual([]);
  });
  it('has no unguarded __dirname in the ESM config build graph', () => {
    // `__dirname` does not exist in ESM. The config code derives a module dirname
    // from `import.meta.url` and may only reference `__dirname` behind a
    // `typeof __dirname` guard (the CJS fast path).
    const packageRoot = resolve(__dirname, '..');
    const entry = resolve(packageRoot, 'build', 'esm', 'config', 'index.js');
    expect(existsSync(entry)).toBe(true);

    const importSpecifierRegex = /(?:from|import)\s*['"]([^'"]+)['"]/g;
    const visited = new Set<string>();
    const queue = [entry];
    const unguardedDirnameUses: string[] = [];

    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (visited.has(file) || !existsSync(file)) {
        continue;
      }
      visited.add(file);

      const source = readFileSync(file, 'utf8');
      for (const line of source.split('\n')) {
        if (line.includes('__dirname') && !line.includes('typeof __dirname')) {
          unguardedDirnameUses.push(`${line.trim().slice(0, 80)} (in ${file.replace(packageRoot, '')})`);
        }
      }
      for (const match of source.matchAll(importSpecifierRegex)) {
        const specifier = match[1] as string;
        if (specifier.startsWith('.')) {
          const resolved = resolve(dirname(file), specifier);
          queue.push(resolved.endsWith('.js') ? resolved : `${resolved}.js`);
        }
      }
    }

    expect(visited.size).toBeGreaterThan(1);
    expect(unguardedDirnameUses).toEqual([]);
  });
});
