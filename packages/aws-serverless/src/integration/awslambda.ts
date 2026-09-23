import type { IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, getCurrentScope, safeSetSpanJSONAttributes } from '@sentry/core';
import { createRequire } from 'node:module';
import { DEBUG_BUILD } from '../debug-build';
import { parseHandlerString, resolveHandlerFile } from '../handlerResolution';

const SHIM_MODULE_ID = '@sentry/aws-serverless/run-lambda-handler';

function resolveShimFile(): string | undefined {
  try {
    // In the CJS build `require` exists; in the ESM build (and when running the TS source
    // directly, e.g. in tests) we create one. Rollup converts `import.meta.url` to an
    // equivalent for the CJS build, so both branches are always syntactically valid.
    const resolve = typeof require === 'function' ? require.resolve : createRequire(import.meta.url).resolve;
    return resolve(SHIM_MODULE_ID);
  } catch (error) {
    DEBUG_BUILD && debug.warn(`Could not resolve ${SHIM_MODULE_ID}, not instrumenting the Lambda handler.`, error);
    return undefined;
  }
}

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
export function redirectLambdaHandler(): void {
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

const AWS_LAMBDA_CONTEXT_FIELDS = [
  'aws_request_id',
  'function_name',
  'function_version',
  'invoked_function_arn',
  'execution_duration_in_millis',
  'remaining_time_in_millis',
] as const;

const AWS_CLOUDWATCH_CONTEXT_FIELDS = ['log_group', 'log_stream', 'url'] as const;

const _awsLambdaIntegration = (() => {
  return {
    name: 'AwsLambda' as const,
    setupOnce() {
      redirectLambdaHandler();
    },
    processSegmentSpan(span) {
      const { contexts } = getCurrentScope().getScopeData();

      const awsLambda = contexts['aws.lambda'];
      if (awsLambda) {
        const attrs: Record<string, unknown> = {};
        for (const field of AWS_LAMBDA_CONTEXT_FIELDS) {
          const value = awsLambda[field];
          if (typeof value === 'string' || typeof value === 'number') {
            attrs[`aws.lambda.${field}`] = value;
          }
        }
        safeSetSpanJSONAttributes(span, attrs);
      }

      const awsCloudwatch = contexts['aws.cloudwatch.logs'];
      if (awsCloudwatch) {
        const attrs: Record<string, unknown> = {};
        for (const field of AWS_CLOUDWATCH_CONTEXT_FIELDS) {
          const value = awsCloudwatch[field];
          if (typeof value === 'string' || typeof value === 'number') {
            attrs[`aws.cloudwatch.logs.${field}`] = value;
          }
        }
        safeSetSpanJSONAttributes(span, attrs);
      }
    },
  };
}) satisfies IntegrationFn;

/**
 * Instrumentation for the AWS Lambda handler.
 */
export const awsLambdaIntegration = defineIntegration(_awsLambdaIntegration);
