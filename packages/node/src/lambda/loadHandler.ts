import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parseHandlerString, resolveHandlerFile } from './handlerResolution';

/**
 * Loads the handler the Lambda runtime would have loaded, from `SENTRY_ORIGINAL_HANDLER`. For the handler shims
 * `_HANDLER` is redirected to, which run it as their own handler.
 */
export async function loadOriginalLambdaHandler(): Promise<(...args: unknown[]) => unknown> {
  const taskRoot = process.env.LAMBDA_TASK_ROOT;
  const originalHandlerString = process.env.SENTRY_ORIGINAL_HANDLER;
  if (!taskRoot || !originalHandlerString) {
    failToLoad('LAMBDA_TASK_ROOT or SENTRY_ORIGINAL_HANDLER is not set.');
  }

  const parsedHandler = parseHandlerString(originalHandlerString);
  if (!parsedHandler) {
    failToLoad(`"${originalHandlerString}" is not a valid handler string.`);
  }

  const resolvedFile = resolveHandlerFile(taskRoot, parsedHandler.moduleRoot, parsedHandler.moduleName);
  if (!resolvedFile) {
    failToLoad(`Could not find module "${parsedHandler.moduleName}" for handler "${originalHandlerString}".`);
  }

  const handlerModule: Record<string, unknown> =
    resolvedFile.format === 'esm'
      ? ((await import(pathToFileURL(resolvedFile.file).href)) as Record<string, unknown>)
      : (createRequire(import.meta.url)(resolvedFile.file) as Record<string, unknown>);

  // Mirrors the AWS runtime's nested handler resolution (`_resolveHandler` in
  // https://github.com/aws/aws-lambda-nodejs-runtime-interface-client/blob/main/src/UserFunction.js),
  // e.g. `index.nested.handler`.
  const originalHandler = parsedHandler.functionPath
    .split('.')
    .reduce<unknown>((nested, key) => (nested as Record<string, unknown> | undefined)?.[key], handlerModule);
  if (typeof originalHandler !== 'function') {
    failToLoad(`"${parsedHandler.functionPath}" in module "${parsedHandler.moduleName}" is not a function.`);
  }

  return originalHandler as (...args: unknown[]) => unknown;
}

function failToLoad(message: string): never {
  throw new Error(
    `[Sentry] Failed to load the Lambda handler: ${message} If this error persists, remove the Sentry integration and contact us at https://github.com/getsentry/sentry-javascript/issues`,
  );
}
