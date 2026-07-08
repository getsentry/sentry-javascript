// This is the handler shim the AWS Lambda runtime loads in place of the user's handler
// when the `AwsLambda` integration has redirected `_HANDLER` (see `integration/awslambda.ts`).
//
// It is built as a standalone, ESM-only `build/npm/run-lambda-handler.mjs` because it uses
// top-level await to load the user's handler module (which may itself be ESM) before
// exporting the instrumented handler. The runtime awaits the dynamic import of this file,
// resolves the `handler` export, and invokes it for every event.
import type { Handler } from 'aws-lambda';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parseHandlerString, resolveHandlerFile } from './handlerResolution';
import { instrumentHandler } from './instrumentHandler';

function fail(message: string): never {
  throw new Error(
    `[Sentry] Failed to load the Lambda handler: ${message} If this error persists, remove the Sentry integration and contact us at https://github.com/getsentry/sentry-javascript/issues`,
  );
}

const taskRoot = process.env.LAMBDA_TASK_ROOT;
const originalHandlerString = process.env.SENTRY_ORIGINAL_HANDLER;

if (!taskRoot || !originalHandlerString) {
  fail('LAMBDA_TASK_ROOT or SENTRY_ORIGINAL_HANDLER is not set.');
}

const parsedHandler = parseHandlerString(originalHandlerString);
if (!parsedHandler) {
  fail(`"${originalHandlerString}" is not a valid handler string.`);
}

const resolvedFile = resolveHandlerFile(taskRoot, parsedHandler.moduleRoot, parsedHandler.moduleName);
if (!resolvedFile) {
  fail(`Could not find module "${parsedHandler.moduleName}" for handler "${originalHandlerString}".`);
}

const handlerModule: Record<string, unknown> =
  resolvedFile.format === 'esm'
    ? ((await import(pathToFileURL(resolvedFile.file).href)) as Record<string, unknown>)
    : (createRequire(import.meta.url)(resolvedFile.file) as Record<string, unknown>);

// Mirrors the AWS runtime's nested handler resolution, e.g. `index.nested.handler`.
const originalHandler = parsedHandler.functionPath
  .split('.')
  .reduce<unknown>((nested, key) => (nested as Record<string, unknown> | undefined)?.[key], handlerModule);

if (typeof originalHandler !== 'function') {
  fail(`"${parsedHandler.functionPath}" in module "${parsedHandler.moduleName}" is not a function.`);
}

export const handler = instrumentHandler(originalHandler as Handler);
