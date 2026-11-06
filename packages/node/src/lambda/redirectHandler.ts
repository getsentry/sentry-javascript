import { consoleSandbox, debug, GLOBAL_OBJ } from '@sentry/core';
import { createRequire } from 'node:module';
import { DEBUG_BUILD } from '../debug-build';
import { parseHandlerString, resolveHandlerFile } from './handlerResolution';

const TUNNEL_SHIM_MODULE_ID = '@sentry/node/run-lambda-handler';

/**
 * Redirects the Lambda runtime to a Sentry handler shim by rewriting the `_HANDLER`
 * environment variable. The runtime reads `_HANDLER` only after all `--import`/`--require`
 * preloads (and thus `Sentry.init()`) have run, so it loads the shim instead of the user's
 * handler. The shim (`run-lambda-handler.mjs`) then loads the module referenced by
 * `SENTRY_ORIGINAL_HANDLER`, wraps the user's handler and exports the wrapped version.
 *
 * Because the shim wraps the handler *value* (whatever the export resolves to), this also
 * covers handlers that are re-exported, wrapped (e.g. middy), bundled, or streaming.
 */
export function redirectLambdaHandler(resolveShimFile: () => string | undefined, tunnelOnly = false): void {
  const taskRoot = process.env.LAMBDA_TASK_ROOT;
  const handlerString = process.env._HANDLER;

  // _HANDLER and LAMBDA_TASK_ROOT are always defined in Lambda but guard bail out if in the future this changes.
  if (!taskRoot || !handlerString) {
    DEBUG_BUILD &&
      debug.log('Skipping lambda handler redirect: no _HANDLER or LAMBDA_TASK_ROOT.', { taskRoot, handlerString });
    return;
  }

  // Already redirected (e.g. `init()` ran twice, or the user redirected manually).
  if (process.env.SENTRY_ORIGINAL_HANDLER) {
    if (!tunnelOnly) {
      replaceTunnelOnlyShim(resolveShimFile);
    }
    DEBUG_BUILD && debug.log('Skipping lambda handler redirect: SENTRY_ORIGINAL_HANDLER is already set.');
    return;
  }

  // The runtime rejects handler strings containing '..'; leave them untouched so it
  // surfaces its own error.
  if (handlerString.includes('..')) {
    return;
  }

  const parsedHandler = parseHandlerString(handlerString);
  if (!parsedHandler) {
    DEBUG_BUILD && debug.warn('Invalid handler definition, not instrumenting the Lambda handler.', { handlerString });
    return;
  }

  // Validate that the handler module actually exists before redirecting, so a broken
  // handler configuration still produces the runtime's original error message.
  const resolvedFile = resolveHandlerFile(taskRoot, parsedHandler.moduleRoot, parsedHandler.moduleName);
  if (!resolvedFile) {
    DEBUG_BUILD &&
      debug.warn('Could not resolve the Lambda handler file, not instrumenting the Lambda handler.', {
        handlerString,
      });
    return;
  }

  const shimFile = resolveShimFile();
  if (!shimFile) {
    return;
  }

  process.env.SENTRY_ORIGINAL_HANDLER = handlerString;
  process.env._HANDLER = `${shimFile.replace(/\.mjs$/, '')}.handler`;
  if (tunnelOnly) {
    // A marker rather than the shim's path, so a full shim recognizes it even from another copy of this package.
    process.env.SENTRY_LAMBDA_TUNNEL_ONLY_SHIM = '1';
  }

  DEBUG_BUILD &&
    debug.log('Redirected lambda handler.', { originalHandler: handlerString, newHandler: process.env._HANDLER });
}

/**
 * On Lambda, redirects the handler to the shim that answers managed tunnel requests before it, since Lambda runs no
 * HTTP server. Only takes effect when `init` runs from a preload (`NODE_OPTIONS=--import`), before the runtime loads
 * the handler.
 */
export function redirectLambdaHandlerForTunnel(): void {
  // The runtime defines `awslambda` before it loads the handler, after the preloads ran. So `init` runs in the handler
  // module, where the runtime already read `_HANDLER`.
  if (typeof (GLOBAL_OBJ as { awslambda?: unknown }).awslambda !== 'undefined') {
    consoleSandbox(() => {
      // oxlint-disable-next-line no-console
      console.warn(
        "[Sentry] Sentry was initialized after the Lambda runtime loaded the handler, so tunnel requests reach the handler. Initialize Sentry from a preload (`NODE_OPTIONS=--import`), or wrap the handler with `@sentry/aws-serverless`'s `wrapHandler`.",
      );
    });
  }

  redirectLambdaHandler(() => {
    try {
      // A CJS bundle has `require`, but leaves `import.meta.url` empty, so it's only read without one.
      const resolve = typeof require === 'function' ? require.resolve : createRequire(import.meta.url).resolve;

      return resolve(TUNNEL_SHIM_MODULE_ID);
    } catch (error) {
      // With `@sentry/node` bundled into the app, there is no shim file to point the runtime at.
      DEBUG_BUILD &&
        debug.warn(
          `Could not resolve ${TUNNEL_SHIM_MODULE_ID}, not answering tunnel requests. Wrap the handler with \`@sentry/aws-serverless\`'s \`wrapHandler\` instead.`,
          error,
        );

      return undefined;
    }
  }, true);
}

/**
 * A shim with the full Lambda instrumentation, like `@sentry/aws-serverless`'s, replaces the tunnel-only one when that
 * one redirected first. It answers tunnel requests too, so the order the integrations set up in doesn't matter.
 */
function replaceTunnelOnlyShim(resolveShimFile: () => string | undefined): void {
  if (!process.env.SENTRY_LAMBDA_TUNNEL_ONLY_SHIM) {
    return;
  }

  const shimFile = resolveShimFile();
  if (shimFile) {
    process.env._HANDLER = `${shimFile.replace(/\.mjs$/, '')}.handler`;
    delete process.env.SENTRY_LAMBDA_TUNNEL_ONLY_SHIM;
  }
}
