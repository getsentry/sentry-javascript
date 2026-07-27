import { type Plugin } from 'vite';
import { GLOBAL_KEY } from '../server/serverBuild';

const SERVER_BUILD_MODULE_ID = 'virtual:react-router/server-build';

/**
 * A Sentry plugin for React Router to capture the server build for middleware name resolution.
 */
export function makeServerBuildCapturePlugin(): Plugin {
  return {
    name: 'sentry-react-router-server-build-capture',
    enforce: 'post',

    transform(code, id, options) {
      // Only inject into the server build module when transforming for the SSR environment.
      // `options.ssr` is set for the SSR module in both dev (`react-router dev`) and production
      // builds, so this covers both - unlike `config.build.ssr`, which is only true during a build.
      if (!options?.ssr) {
        return null;
      }

      if (!id.includes(SERVER_BUILD_MODULE_ID)) {
        return null;
      }

      // `routes` is a module-scope export in the virtual:react-router/server-build module
      const injectedCode = `${code}
if (typeof globalThis !== 'undefined' && typeof globalThis["${GLOBAL_KEY}"] === 'function') {
  globalThis["${GLOBAL_KEY}"]({ routes });
}
`;

      return { code: injectedCode, map: null };
    },
  };
}
