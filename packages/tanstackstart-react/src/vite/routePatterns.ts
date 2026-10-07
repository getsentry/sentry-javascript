import * as fs from 'node:fs';
import * as path from 'node:path';
import { uniq } from '@sentry/core';
import type { Plugin } from 'vite';

const ROUTE_TREE_FILE_NAME = 'routeTree.gen.ts';

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

    transform(code, _id) {
      // this is set in the `wrapFetchWithSentry` where the paths are getting replaced by their parametrized counterparts
      // so this extraction should only happen once during the build (for the `wrapFetchWithSentry` file)
      if (!code.includes('__SENTRY_ROUTE_PATTERNS__')) {
        return null;
      }

      let patterns: string[] = [];
      try {
        const routeTreePath = findRouteTreeFile(resolvedRoot);
        if (routeTreePath) {
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
 * Finds the generated route tree. TanStack Start writes it to `<srcDirectory>/routeTree.gen.ts`, and the
 * `srcDirectory` option (default `src`) is not exposed by its Vite plugin, so we check `src` first and then
 * every other top-level directory.
 */
export function findRouteTreeFile(root: string): string | undefined {
  const defaultPath = path.join(root, 'src', ROUTE_TREE_FILE_NAME);
  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue;
    }
    const candidate = path.join(root, entry.name, ROUTE_TREE_FILE_NAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const rootPath = path.join(root, ROUTE_TREE_FILE_NAME);
  return fs.existsSync(rootPath) ? rootPath : undefined;
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
  const pathRegex = /['"]([^'"]+)['"]/g;
  let match;
  while ((match = pathRegex.exec(fullPathsMatch[1] || '')) !== null) {
    if (match[1]) {
      patterns.push(match[1]);
    }
  }

  return uniq(patterns);
}
