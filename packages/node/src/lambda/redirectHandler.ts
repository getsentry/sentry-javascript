import { debug } from '@sentry/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEBUG_BUILD } from '../debug-build';
import { parseHandlerString, resolveHandlerFile } from './handlerResolution';

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
export function redirectLambdaHandler(resolveShimFile: () => string | undefined): void {
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

  DEBUG_BUILD &&
    debug.log('Redirected lambda handler.', { originalHandler: handlerString, newHandler: process.env._HANDLER });
}

/**
 * On Lambda, redirects the handler to the shim that answers managed tunnel requests before it, since Lambda runs no
 * HTTP server. Only takes effect when `init` runs from a preload (`NODE_OPTIONS=--import`), before the runtime loads
 * the handler.
 */
export function redirectLambdaHandlerForTunnel(): void {
  redirectLambdaHandler(() => {
    // The shim sits at `build/run-lambda-handler.mjs`, next to the `build/esm` and `build/cjs` this file is built into.
    // Rollup converts `import.meta.url` for the CJS build.
    const shimFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../run-lambda-handler.mjs');
    if (!fs.existsSync(shimFile)) {
      DEBUG_BUILD && debug.warn(`Could not find ${shimFile}, not answering tunnel requests.`);
      return undefined;
    }

    return shimFile;
  });
}
