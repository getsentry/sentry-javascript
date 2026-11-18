import { generateReleaseInjectorCode, resolveReleaseName } from '@sentry/bundler-plugins/core';
import { stringifyForCodeInjection } from '@sentry/core';
import type { Plugin } from 'vite';
import { SERVER_BUILD_MODULE_ID } from './makeServerBuildCapturePlugin';
import type { SentryReactRouterBuildOptions } from './types';

const RELEASE_MODULE_ID = 'virtual:sentry-react-router-release';
const RESOLVED_RELEASE_MODULE_ID = `\0${RELEASE_MODULE_ID}`;

/**
 * The release that the server puts in the HTML documents for the browser SDK. `undefined` when the user turned off
 * release injection, or when there is no release.
 */
export function getClientRelease(options: SentryReactRouterBuildOptions): string | undefined {
  return options.release?.inject === false ? undefined : resolveReleaseName(options.release?.name);
}

/**
 * Has the server build put the release in a meta tag of every HTML document it renders, so the release does not have
 * to be in the content-hashed client chunks. The bundler plugin injects the release into no chunk, so the server build
 * also sets `SENTRY_RELEASE` itself.
 */
export function makeClientReleasePlugin(release: string): Plugin {
  return {
    name: 'sentry-react-router-client-release',
    enforce: 'post',

    resolveId(id) {
      return id === RELEASE_MODULE_ID ? RESOLVED_RELEASE_MODULE_ID : null;
    },

    load(id) {
      return id === RESOLVED_RELEASE_MODULE_ID
        ? generateReleaseInjectorCode({ release, injectBuildInformation: false }).code()
        : null;
    },

    transform(code, id, options) {
      if (!options?.ssr || !id.includes(SERVER_BUILD_MODULE_ID)) {
        return null;
      }

      // The import comes first so `SENTRY_RELEASE` is set before `entry.server` and the routes are evaluated, and it
      // shares the first line so the module's line numbers stay the same.
      return {
        code: `import ${JSON.stringify(RELEASE_MODULE_ID)};${code}
import { _INTERNAL_injectClientRelease as __sentryInjectClientRelease } from '@sentry/react-router';
__sentryInjectClientRelease(typeof entry === 'object' ? entry : undefined, ${stringifyForCodeInjection(release)});
`,
        map: null,
      };
    },
  };
}
