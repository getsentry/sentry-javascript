import { type Plugin } from 'vite';
import { GLOBAL_KEY } from '../server/serverBuild';

const SERVER_BUILD_MODULE_ID = 'virtual:react-router/server-build';

/**
 * A Sentry plugin for React Router to capture the server build for middleware name resolution.
 */
export function makeServerBuildCapturePlugin(): Plugin {
  let isSsrBuild = false;

  return {
    name: 'sentry-react-router-server-build-capture',
    enforce: 'post',

    configResolved(config) {
      isSsrBuild = !!config.build.ssr;
    },

    transform(code, id) {
      // TODO: This only captures the server build for production SSR builds. Dev mode
      // (`react-router dev`) is not covered yet, so middleware names may be missing there - this
      // should be handled for dev too.
      if (!isSsrBuild) {
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
