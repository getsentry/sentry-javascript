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
 * Extracts route path patterns from the content of routeTree.gen.ts.
 *
 * Matches patterns like: `path: '/page-b/$id'`
 *
 * Only exported for testing.
 */
export function extractRoutePatterns(content: string): string[] {
  const patterns: string[] = [];
  const regex = /path:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const pattern = match[1];
    if (pattern && pattern !== '/') {
      patterns.push(pattern);
    }
  }
  patterns.push('/');
  return [...new Set(patterns)];
}
