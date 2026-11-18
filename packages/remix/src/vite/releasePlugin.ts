import { generateReleaseInjectorCode, resolveReleaseName } from '@sentry/bundler-plugins/core';
import { stringifyForCodeInjection } from '@sentry/core';
import type { Plugin } from 'vite';
import type { SentryRemixVitePluginOptions } from './types';

const SERVER_BUILD_ID = '\0virtual:remix/server-build';
const SERVER_BUILD_ENTRY_EXPORT = /export const entry\s*=\s*\{/;
const RELEASE_MODULE_ID = 'virtual:sentry-remix-release';
const RESOLVED_RELEASE_MODULE_ID = `\0${RELEASE_MODULE_ID}`;

/**
 * Delivers the release to the browser SDK through the HTML document, so it never ends up in a
 * content-hashed client chunk. A release in the client chunks changes their hashes on every release.
 *
 * Wraps `entry.server`'s default export in the Remix server build to add the release to
 * `window.__remixContext`, which `<Scripts />` already renders. The server build also sets
 * `SENTRY_RELEASE` itself, because the bundler plugin no longer injects it into any chunk.
 */
export function makeReleasePlugin(options: SentryRemixVitePluginOptions): Plugin {
  let release: string | undefined;
  let isSsrBuild = false;
  let transformedServerBuild = false;

  return {
    name: 'sentry-remix-release',
    apply: 'build',

    configResolved(config) {
      isSsrBuild = !!config.build.ssr;
      // Resolved here rather than up front: the bundler plugin loads `.env.sentry-build-plugin`,
      // which can set `SENTRY_RELEASE`, when it is created.
      release = resolveReleaseName(options.release?.name);
    },

    resolveId(id) {
      return id === RELEASE_MODULE_ID ? RESOLVED_RELEASE_MODULE_ID : null;
    },

    load(id) {
      return id === RESOLVED_RELEASE_MODULE_ID && release ? getReleaseModuleCode(release) : null;
    },

    transform(code, id) {
      if (id !== SERVER_BUILD_ID || !release || !SERVER_BUILD_ENTRY_EXPORT.test(code)) {
        return null;
      }

      transformedServerBuild = true;

      // The import comes first so `SENTRY_RELEASE` is set before `entry.server` and the routes are
      // evaluated, and it shares the first line so the module's line numbers stay the same.
      return {
        code: `import { wrapHandleRequest as __sentryWrapHandleRequest } from ${JSON.stringify(RELEASE_MODULE_ID)};${code}
entry.module = { ...entry.module, default: __sentryWrapHandleRequest(entry.module.default) };
`,
        map: null,
      };
    },

    buildEnd() {
      if (isSsrBuild && release && !transformedServerBuild) {
        this.warn(
          `Could not find the Remix server build, so the release "${release}" does not reach the browser SDK. Pass \`release\` to \`Sentry.init\` in your client entry.`,
        );
      }
    },
  };
}

/**
 * Only exported for testing.
 */
export function getReleaseModuleCode(release: string): string {
  const handoffField = `"sentryRelease":${stringifyForCodeInjection(release)}`;

  return `${generateReleaseInjectorCode({ release, injectBuildInformation: false }).code()}
const handoffField = ${stringifyForCodeInjection(handoffField)};
export function wrapHandleRequest(handleRequest) {
  if (typeof handleRequest !== 'function') {
    return handleRequest;
  }
  return function (request, statusCode, headers, context) {
    const handoff = context && context.serverHandoffString;
    if (typeof handoff === 'string' && handoff.charAt(0) === '{') {
      context.serverHandoffString = '{' + handoffField + (handoff === '{}' ? '}' : ',' + handoff.slice(1));
    }
    return handleRequest.apply(this, arguments);
  };
}
`;
}
