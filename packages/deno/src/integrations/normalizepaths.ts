import { defineIntegration } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';
import { createStackParser, dirname, nodeStackLineParser } from '@sentry/utils';

const INTEGRATION_NAME = 'NormalizePaths';

function appRootFromErrorStack(error: Error): string | undefined {
  // We know at the other end of the stack from here is the entry point that called 'init'
  // We assume that this stacktrace will traverse the root of the app
  const frames = createStackParser(nodeStackLineParser())(error.stack || '');

  const paths = frames
    // We're only interested in frames that are in_app with filenames
    .filter(f => f.in_app && f.filename)
    .map(
      f =>
        (f.filename as string)
          .replace(/^[A-Z]:/, '') // remove Windows-style prefix
          .replace(/\\/g, '/') // replace all `\` instances with `/`
          .split('/')
          .filter(seg => seg !== ''), // remove empty segments
    ) as string[][];

  if (paths.length == 0) {
    return undefined;
  }

  if (paths.length == 1) {
    // Assume the single file is in the root
    return dirname(paths[0].join('/'));
  }

  // Iterate over the paths and bail out when they no longer have a common root
  let i = 0;
  while (paths[0][i] && paths.every(w => w[i] === paths[0][i])) {
    i++;
  }

  return paths[0].slice(0, i).join('/');
}

function getCwd(): string | undefined {
  // We don't want to prompt for permissions so we only get the cwd if
  // permissions are already granted
  const permission = Deno.permissions.querySync({ name: 'read', path: './' });

  try {
    if (permission.state == 'granted') {
      return Deno.cwd();
    }
  } catch (_) {
    //
  }

  return undefined;
}

const _normalizePathsIntegration = (() => {
  // Cached here
  let appRoot: string | undefined;

  /** Get the app root, and cache it after it was first fetched. */
  function getAppRoot(error: Error): string | undefined {
    if (appRoot === undefined) {
      appRoot = getCwd() || appRootFromErrorStack(error);
    }

    return appRoot;
  }

  return {
    name: INTEGRATION_NAME,
    processEvent(event) {
      // This error.stack hopefully contains paths that traverse the app cwd
      const error = new Error();

      const appRoot = getAppRoot(error);

      if (appRoot) {
        for (const exception of event.exception?.values || []) {
          for (const frame of exception.stacktrace?.frames || []) {
            if (frame.filename && frame.in_app) {
              const startIndex = frame.filename.indexOf(appRoot);

              if (startIndex > -1) {
                const endIndex = startIndex + appRoot.length;
                frame.filename = `app://${frame.filename.substring(endIndex)}`;
              }
            }
          }
        }
      }

      return event;
    },
  };
}) satisfies IntegrationFn;

/**
 * Normalises paths to the app root directory.
 *
 * Enabled by default in the Deno SDK.
 *
 * ```js
 * Sentry.init({
 *   integrations: [
 *     Sentry.normalizePathsIntegration(),
 *   ],
 * })
 * ```
 */
export const normalizePathsIntegration = defineIntegration(_normalizePathsIntegration);
