import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `wrapRequestHandler` — exposed both from the main entry point and from `@sentry/cloudflare/request`
 * — has to run on runtimes that cannot enable the `nodejs_compat` compatibility flag, such as Shopify
 * Oxygen. A single `node:` import anywhere in its module graph breaks those workers at startup with
 * `No such module "node:…"`.
 *
 * Bundlers usually tree-shake an unused Node.js import away, but that is not something to rely on, so
 * assert on the module graph itself rather than on any bundler's output.
 */
const SRC_DIR = resolve(__dirname, '../src');
const ENTRY_POINT = join(SRC_DIR, 'request.ts');

const IMPORT_SPECIFIER_REGEX = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g;

function resolveRelativeImport(importer: string, specifier: string): string {
  const withoutExtension = join(dirname(importer), specifier);
  const candidates = [`${withoutExtension}.ts`, join(withoutExtension, 'index.ts')];
  const resolved = candidates.find(candidate => existsSync(candidate));

  if (!resolved) {
    throw new Error(`Could not resolve '${specifier}' imported from '${relative(SRC_DIR, importer)}'`);
  }

  return resolved;
}

/** Walks the module graph of `entryPoint`, returning the local modules and the external specifiers. */
function collectModuleGraph(entryPoint: string): { modules: string[]; externals: string[] } {
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
        queue.push(resolveRelativeImport(importer, specifier));
      } else {
        externals.add(specifier);
      }
    }
  }

  return {
    modules: [...modules].map(module => relative(SRC_DIR, module)).sort(),
    externals: [...externals].sort(),
  };
}

describe('module graph of `wrapRequestHandler`', () => {
  const { modules, externals } = collectModuleGraph(ENTRY_POINT);

  it('contains no Node.js built-in module', () => {
    expect(externals.filter(specifier => specifier.startsWith('node:'))).toEqual([]);
  });

  it('contains no package that depends on Node.js APIs', () => {
    // `@sentry/server-utils` subscribes to `node:diagnostics_channel` and `@sentry/node` needs Node.js
    // throughout. Both are only allowed in `sdk.ts`, `index.ts` and `vite/` (see `.oxlintrc.json`).
    expect(externals.filter(specifier => /^@sentry\/(node|server-utils)(\/|$)/.test(specifier))).toEqual([]);
  });

  it('does not reach `async.ts`, the only shipped module importing `node:async_hooks`', () => {
    expect(modules).not.toContain('async.ts');
  });

  it('does not reach `sdk.ts`, which holds the default integrations that need `nodejs_compat`', () => {
    expect(modules).not.toContain('sdk.ts');
  });
});
