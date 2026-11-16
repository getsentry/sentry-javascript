import type { Plugin } from 'vite';

const SERVER_BUILD_MODULE_ID = 'virtual:react-router/server-build';

/**
 * Passes the app's `basename` from the server build to the managed tunnel, which serves under it. Only applies when
 * `serveTunnelIntegration` is set up.
 */
export function makeTunnelBasePathPlugin(): Plugin {
  return {
    name: 'sentry-react-router-tunnel-base-path',
    enforce: 'post',

    transform(code, id, options) {
      if (!options?.ssr || !id.includes(SERVER_BUILD_MODULE_ID)) {
        return null;
      }

      return {
        code: `${code}
import { _INTERNAL_setTunnelBasePath as __sentrySetTunnelBasePath } from '@sentry/react-router';
__sentrySetTunnelBasePath(typeof basename === 'string' ? basename : undefined);
`,
        map: null,
      };
    },
  };
}
