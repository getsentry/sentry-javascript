import { resolve } from 'node:path';

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
  return {
    resolve: (...path) => resolve(base, ...path),
  };
}
