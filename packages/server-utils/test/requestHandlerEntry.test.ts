import { builtinModules } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Cloudflare imports the `request-handler` entry on workers without the `nodejs_compat` compatibility
 * flag, where any Node.js import fails at startup. Assert on the module graph itself rather than on
 * any bundler's output.
 */
const ENTRY_POINT = resolve(__dirname, '../src/index.request-handler.ts');
const IMPORT_SPECIFIER_REGEX = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g;

function collectExternals(entryPoint: string): string[] {
  const modules = new Set<string>();
  const externals = new Set<string>();
  const queue = [entryPoint];

  while (queue.length) {
    const importer = queue.pop() as string;
    if (modules.has(importer)) {
      continue;
    }
    modules.add(importer);

    for (const match of readFileSync(importer, 'utf8').matchAll(IMPORT_SPECIFIER_REGEX)) {
      const specifier = match[1] ?? (match[2] as string);
      if (specifier.startsWith('.')) {
        const withoutExtension = join(dirname(importer), specifier);
        const resolved = [`${withoutExtension}.ts`, join(withoutExtension, 'index.ts')].find(existsSync);
        if (!resolved) {
          throw new Error(`Could not resolve '${specifier}' imported from '${importer}'`);
        }
        queue.push(resolved);
      } else {
        externals.add(specifier);
      }
    }
  }

  return [...externals].sort();
}

describe('module graph of the `request-handler` entry', () => {
  it('contains no Node.js built-in module and no package that needs Node.js', () => {
    const externals = collectExternals(ENTRY_POINT);

    expect(externals.filter(specifier => specifier.startsWith('node:') || builtinModules.includes(specifier))).toEqual(
      [],
    );
    expect(externals.filter(specifier => /^@sentry\/(node|server-utils)(\/|$)/.test(specifier))).toEqual([]);
  });
});
