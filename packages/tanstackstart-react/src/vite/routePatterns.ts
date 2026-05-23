import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Extracts route patterns from TanStack Start's generated routeTree.gen.ts
 * and replaces `__SENTRY_ROUTE_PATTERNS__` references with the extracted patterns.
 *
 * Reads the route tree lazily during `transform` to ensure it exists after TanStack Start generates it.
 */
export function makeRoutePatternPlugin(): Plugin {
  let resolvedRoot = '';

  return {
    name: 'sentry-tanstackstart-route-patterns',
    enforce: 'post',

    configResolved(config) {
      resolvedRoot = config.root || process.cwd();
    },

    transform(code, id) {
      if (!code.includes('__SENTRY_ROUTE_PATTERNS__')) {
        return null;
      }

      const routeTreePath = path.resolve(resolvedRoot, 'src/routeTree.gen.ts');
      let patterns: string[] = ['/'];
      try {
        if (fs.existsSync(routeTreePath)) {
          patterns = extractRoutePatterns(fs.readFileSync(routeTreePath, 'utf-8'));
        }
      } catch {
        // skip
      }

      return {
        code: code.replace(/__SENTRY_ROUTE_PATTERNS__/g, JSON.stringify(patterns)),
        map: null,
      };
    },
  };
}

/**
 * Extracts full route path patterns from the content of routeTree.gen.ts.
 *
 * Parses the `fullPaths` type union which contains the resolved full paths
 * (e.g., `fullPaths: '/' | '/page-a' | '/users/$userId'`).
 * This is more reliable than `path:` properties which can be relative for nested routes.
 *
 * Only exported for testing.
 */
export function extractRoutePatterns(content: string): string[] {
  const fullPathsMatch = content.match(/fullPaths:\s*([\s\S]*?)(?:\n\s*\w|\n\})/);
  if (!fullPathsMatch) {
    return ['/'];
  }

  const patterns: string[] = [];
  const pathRegex = /'([^']+)'/g;
  let match;
  while ((match = pathRegex.exec(fullPathsMatch[1] || '')) !== null) {
    if (match[1]) {
      patterns.push(match[1]);
    }
  }

  if (!patterns.includes('/')) {
    patterns.push('/');
  }

  return [...new Set(patterns)];
}
