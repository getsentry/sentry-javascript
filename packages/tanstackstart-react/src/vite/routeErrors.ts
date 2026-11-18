import type { Plugin } from 'vite';

const ROUTE_TREE_FILE = /routeTree\.gen\.[cm]?[jt]sx?$/;
const ROUTE_TREE_EXPORT = /export\s+const\s+routeTree\b/;

/**
 * Appends a call to the generated route tree module that hooks every route's `onError`, so the SDK captures
 * `loader` and `beforeLoad` errors of server-rendered pages. This only applies to server environments.
 */
export function makeRouteErrorPlugin(): Plugin {
  return {
    name: 'sentry-tanstackstart-route-errors',
    enforce: 'post',

    transform(code, id) {
      if (this.environment?.config.consumer !== 'server') {
        return null;
      }

      return addRouteTreeInstrumentation(code, id);
    },
  };
}

/**
 * Returns the route tree module with the instrumentation call appended, or `null` if `id` is not the generated
 * route tree.
 */
export function addRouteTreeInstrumentation(code: string, id: string): { code: string; map: null } | null {
  if (!ROUTE_TREE_FILE.test(id.split('?')[0] || '') || !ROUTE_TREE_EXPORT.test(code)) {
    return null;
  }

  return {
    // Appending keeps the existing line mappings valid, so no new source map is needed.
    code: `${code}
import { _INTERNAL_instrumentServerRouteTree as __sentryInstrumentServerRouteTree } from '@sentry/tanstackstart-react';
__sentryInstrumentServerRouteTree(routeTree);
`,
    map: null,
  };
}
