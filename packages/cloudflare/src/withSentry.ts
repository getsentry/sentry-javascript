import type { env as cloudflareEnv } from 'cloudflare:workers';
import { setAsyncLocalStorageAsyncContextStrategy } from './async';
import type { CloudflareOptions } from './client';
import { instrumentExportedHandlerEmail } from './instrumentations/worker/instrumentEmail';
import { instrumentExportedHandlerFetch } from './instrumentations/worker/instrumentFetch';
import { instrumentExportedHandlerQueue } from './instrumentations/worker/instrumentQueue';
import { instrumentExportedHandlerScheduled } from './instrumentations/worker/instrumentScheduled';
import { instrumentExportedHandlerTail } from './instrumentations/worker/instrumentTail';
import { isCloudflareClass } from './utils/isCloudflareClass';
import {
  instrumentWorkerEntrypoint,
  type WorkerEntrypointConstructor,
} from './instrumentations/instrumentWorkerEntrypoint';

/**
 * Wrapper for Cloudflare handlers.
 *
 * Initializes the SDK and wraps the handler with Sentry instrumentation.
 *
 * Automatically instruments the `fetch` method of the handler.
 *
 * @param optionsCallback Function that returns the options for the SDK initialization.
 * @param handler {ExportedHandler} The handler to wrap.
 * @returns The wrapped handler.
 */
// TODO(v11): The generic types need to be rewritten to following to improve type safety:
// T extends ExportedHandler<any, any, any> | WorkerEntrypointConstructor<any, any>
export function withSentry<
  Env = typeof cloudflareEnv,
  QueueHandlerMessage = unknown,
  CfHostMetadata = unknown,
  T extends ExportedHandler<Env, QueueHandlerMessage, CfHostMetadata> | WorkerEntrypointConstructor = ExportedHandler<
    Env,
    QueueHandlerMessage,
    CfHostMetadata
  >,
>(optionsCallback: (env: Env) => CloudflareOptions | undefined, handler: T): T {
  if (isCloudflareClass(handler, 'WorkerEntrypoint')) {
    // oxlint-disable-next-line typescript/no-explicit-any
    return instrumentWorkerEntrypoint(optionsCallback as any, handler);
  }

  setAsyncLocalStorageAsyncContextStrategy();

  try {
    // oxlint-disable-next-line typescript/no-explicit-any
    instrumentExportedHandlerFetch(handler, optionsCallback as any);
    // oxlint-disable-next-line typescript/no-explicit-any
    instrumentExportedHandlerScheduled(handler, optionsCallback as any);
    // oxlint-disable-next-line typescript/no-explicit-any
    instrumentExportedHandlerEmail(handler, optionsCallback as any);
    // oxlint-disable-next-line typescript/no-explicit-any
    instrumentExportedHandlerQueue(handler, optionsCallback as any);
    // oxlint-disable-next-line typescript/no-explicit-any
    instrumentExportedHandlerTail(handler, optionsCallback as any);
    // This is here because Miniflare sometimes cannot get instrumented
  } catch {
    // Do not console anything here, we don't want to spam the console with errors
  }

  return handler;
}
