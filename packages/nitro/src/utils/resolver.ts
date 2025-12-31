import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Resolver {
  resolve(...path: string[]): string;
}

/**
 * Creates a resolver for the given base path.
 * @example
 * ```ts
 * const resolver = createResolver(import.meta.url);
 * resolver.resolve('foo/bar.js');
 * ```
 */
export function createResolver(base: string): Resolver {
  let resolvedBase = base;
  if (base.startsWith('file://')) {
    resolvedBase = dirname(fileURLToPath(base));
  }

  return {
    resolve: (...path) => resolve(resolvedBase, ...path),
  };
}
