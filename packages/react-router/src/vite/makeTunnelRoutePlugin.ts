import type { Plugin } from 'vite';

const SERVER_BUILD_MODULE_ID = 'virtual:react-router/server-build';

/**
 * Adds the managed tunnel routes to the server build. They only serve requests when `Sentry.init` enables the
 * managed tunnel. The server build exports the app's `basename`, which the route needs to match the request URL.
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
Object.assign(routes, __sentryCreateTunnelRoutes(typeof basename === 'string' ? basename : undefined));
`,
        map: null,
      };
    },
  };
}
