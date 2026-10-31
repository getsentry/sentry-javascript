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
    // Nitro writes plugin paths verbatim into a generated `import "…"` statement, where the
    // backslashes of a Windows path read as escape sequences (`C:\Users` becomes `C:Users`).
    // Forward slashes resolve on every platform, so normalize to them.
    resolve: (...path) => resolve(resolvedBase, ...path).replace(/\\/g, '/'),
  };
}
