import { resolveReleaseName } from '@sentry/bundler-plugins/core';
import { stringifyForCodeInjection } from '@sentry/core';
import type { Plugin } from 'vite';
import { SERVER_BUILD_MODULE_ID } from './makeServerBuildCapturePlugin';
import type { SentryReactRouterBuildOptions } from './types';

/**
 * The release that the server puts in the HTML documents for the browser SDK. `undefined` when the user turned off
 * release injection, or when there is no release.
 */
export function getClientRelease(options: SentryReactRouterBuildOptions): string | undefined {
  return options.release?.inject === false ? undefined : resolveReleaseName(options.release?.name);
}

/**
 * Has the server build put the release in a meta tag of every HTML document it renders, so the release does not have
 * to be in the content-hashed client chunks.
 */
export function makeClientReleasePlugin(release: string): Plugin {
  return {
    name: 'sentry-react-router-client-release',
    enforce: 'post',

    transform(code, id, options) {
      if (!options?.ssr || !id.includes(SERVER_BUILD_MODULE_ID)) {
        return null;
      }

      return {
        code: `${code}
import { _INTERNAL_injectClientRelease as __sentryInjectClientRelease } from '@sentry/react-router';
__sentryInjectClientRelease(typeof entry === 'object' ? entry : undefined, ${stringifyForCodeInjection(release)});
`,
        map: null,
      };
    },
  };
}
