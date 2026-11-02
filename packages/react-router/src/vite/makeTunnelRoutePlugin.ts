import type { Plugin } from 'vite';

const SERVER_BUILD_MODULE_ID = 'virtual:react-router/server-build';

/**
 * Passes the app's `basename` from the server build to the managed tunnel, which serves under it. Only applies when
 * `serveTunnelIntegration` is set up.
 */
export function makeTunnelRoutePlugin(): Plugin {
  return {
    name: 'sentry-react-router-tunnel-route',
    enforce: 'post',

    transform(code, id, options) {
      if (!options?.ssr || !id.includes(SERVER_BUILD_MODULE_ID)) {
        return null;
      }

      return {
        code: `${code}
import { createSentryTunnelRoutes as __sentryCreateTunnelRoutes } from '@sentry/react-router';
if (typeof routes === 'object' && routes) {
  Object.assign(routes, __sentryCreateTunnelRoutes(typeof basename === 'string' ? basename : undefined));
}
`,
        map: null,
      };
    },
  };
}
