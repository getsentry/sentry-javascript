import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Extracts route patterns from TanStack Start's generated routeTree.gen.ts
 * and replaces `__SENTRY_ROUTE_PATTERNS__` references with the extracted patterns.
 *
 * The route tree file is read during `transform` rather than `config` because
 * TanStack Start generates it during the build.
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
      // this is set in the `wrapFetchWithSentry` where the paths are getting replaced by their parametrized counterparts
      // so this extraction should only happen once during the build (for the `wrapFetchWithSentry` file)
      if (!code.includes('__SENTRY_ROUTE_PATTERNS__')) {
        return null;
      }

      // extract the patterns from the route tree file
      const routeTreePath = path.resolve(resolvedRoot, 'src/routeTree.gen.ts');
      let patterns: string[] = [];
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
 */
export function extractRoutePatterns(content: string): string[] {
  const fullPathsMatch = content.match(/fullPaths:\s*([\s\S]*?)(?:\n\s*\w|\n\})/);
  if (!fullPathsMatch) {
    return [];
  }

  const patterns: string[] = [];
  const pathRegex = /'([^']+)'/g;
  let match;
  while ((match = pathRegex.exec(fullPathsMatch[1] || '')) !== null) {
    if (match[1]) {
      patterns.push(match[1]);
    }
  }

  return [...new Set(patterns)];
}
