import type { Integration, Options } from '@sentry/core';
import { applySdkMetadata, debug, getSDKSource } from '@sentry/core';
import type { NodeClient, NodeOptions } from '@sentry/node';
import { getDefaultIntegrationsWithoutPerformance, initWithoutDefaultIntegrations } from '@sentry/node';
import type { Handler } from 'aws-lambda';
import { existsSync } from 'fs';
import { basename, resolve } from 'path';
import { DEBUG_BUILD } from './debug-build';
import { awsIntegration } from './integration/aws';
import { awsLambdaIntegration } from './integration/awslambda';
import { wrapHandler } from './wrappers/wrap-handler';

export { wrapHandler };

export type AsyncHandler<T extends Handler> = (
  event: Parameters<T>[0],
  context: Parameters<T>[1],
) => Promise<NonNullable<Parameters<Parameters<T>[2]>[1]>>;

export interface WrapperOptions {
  flushTimeout: number;
  callbackWaitsForEmptyEventLoop: boolean;
  captureTimeoutWarning: boolean;
  timeoutWarningLimit: number;
  /**
   * Capture all errors when `Promise.allSettled` is returned by the handler
   * The {@link wrapHandler} will not fail the lambda even if there are errors
   * @default false
   */
  captureAllSettledReasons: boolean;
  // TODO(v11): Remove this option since its no longer used.
  /**
   * @deprecated This option has no effect and will be removed in a future major version.
   * If you want to disable tracing, set `SENTRY_TRACES_SAMPLE_RATE` to `0.0`, otherwise OpenTelemetry will automatically trace the handler.
   */
  startTrace: boolean;
}

/**
 * Get the default integrations for the AWSLambda SDK.
 */
// NOTE: in awslambda-auto.ts, we also call the original `getDefaultIntegrations` from `@sentry/node` to load performance integrations.
// If at some point we need to filter a node integration out for good, we need to make sure to also filter it out there.
export function getDefaultIntegrations(_options: Options): Integration[] {
  return [...getDefaultIntegrationsWithoutPerformance(), awsIntegration(), awsLambdaIntegration()];
}

/**
 * Initializes the Sentry AWS Lambda SDK.
 *
 * @param options Configuration options for the SDK, @see {@link AWSLambdaOptions}.
 */
export function init(options: NodeOptions = {}): NodeClient | undefined {
  const opts = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'aws-serverless', ['aws-serverless'], getSDKSource());

  return initWithoutDefaultIntegrations(opts);
}

/** */
function tryRequire<T>(taskRoot: string, subdir: string, mod: string): T {
  const lambdaStylePath = resolve(taskRoot, subdir, mod);
  if (existsSync(lambdaStylePath) || existsSync(`${lambdaStylePath}.js`)) {
    // Lambda-style path
    return require(lambdaStylePath);
  }
  // Node-style path
  return require(require.resolve(mod, { paths: [taskRoot, subdir] }));
}

/** */
export function tryPatchHandler(taskRoot: string, handlerPath: string): void {
  type HandlerBag = HandlerModule | Handler | null | undefined;

  interface HandlerModule {
    [key: string]: HandlerBag;
  }

  const handlerDesc = basename(handlerPath);
  const match = handlerDesc.match(/^([^.]*)\.(.*)$/);
  if (!match) {
    DEBUG_BUILD && debug.error(`Bad handler ${handlerDesc}`);
    return;
  }

  const [, handlerMod = '', handlerName = ''] = match;

  let obj: HandlerBag;
  try {
    const handlerDir = handlerPath.substring(0, handlerPath.indexOf(handlerDesc));
    obj = tryRequire(taskRoot, handlerDir, handlerMod);
  } catch (e) {
    DEBUG_BUILD && debug.error(`Cannot require ${handlerPath} in ${taskRoot}`, e);
    return;
  }

  let mod: HandlerBag;
  let functionName: string | undefined;
  handlerName.split('.').forEach(name => {
    mod = obj;
    obj = obj && (obj as HandlerModule)[name];
    functionName = name;
  });
  if (!obj) {
    DEBUG_BUILD && debug.error(`${handlerPath} is undefined or not exported`);
    return;
  }
  if (typeof obj !== 'function') {
    DEBUG_BUILD && debug.error(`${handlerPath} is not a function`);
    return;
  }

  // Check for prototype pollution
  if (functionName === '__proto__' || functionName === 'constructor' || functionName === 'prototype') {
    DEBUG_BUILD && debug.error(`Invalid handler name: ${functionName}`);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  (mod as HandlerModule)[functionName!] = wrapHandler(obj);
}
