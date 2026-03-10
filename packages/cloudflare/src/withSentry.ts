import { setAsyncLocalStorageAsyncContextStrategy } from './async';
import type { CloudflareOptions } from './client';
import { isInstrumented, markAsInstrumented } from './instrument';
import { getHonoIntegration } from './integrations/hono';
import { instrumentExportedHandlerEmail } from './instrumentations/worker/instrumentEmail';
import { instrumentExportedHandlerFetch } from './instrumentations/worker/instrumentFetch';
import { instrumentExportedHandlerQueue } from './instrumentations/worker/instrumentQueue';
import { instrumentExportedHandlerScheduled } from './instrumentations/worker/instrumentScheduled';
import { instrumentExportedHandlerTail } from './instrumentations/worker/instrumentTail';

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
export function withSentry<
  Env = unknown,
  QueueHandlerMessage = unknown,
  CfHostMetadata = unknown,
  T extends ExportedHandler<Env, QueueHandlerMessage, CfHostMetadata> = ExportedHandler<
    Env,
    QueueHandlerMessage,
    CfHostMetadata
  >,
>(optionsCallback: (env: Env) => CloudflareOptions | undefined, handler: T): T {
  setAsyncLocalStorageAsyncContextStrategy();

  try {
    instrumentExportedHandlerFetch(handler, optionsCallback);
    instrumentHonoErrorHandler(handler);
    instrumentExportedHandlerScheduled(handler, optionsCallback);
    instrumentExportedHandlerEmail(handler, optionsCallback);
    instrumentExportedHandlerQueue(handler, optionsCallback);
    instrumentExportedHandlerTail(handler, optionsCallback);
    // This is here because Miniflare sometimes cannot get instrumented
  } catch {
    // Do not console anything here, we don't want to spam the console with errors
  }

  return handler;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function instrumentHonoErrorHandler<T extends ExportedHandler<any, any, any>>(handler: T): void {
  if (
    'onError' in handler &&
    'errorHandler' in handler &&
    typeof handler.errorHandler === 'function' &&
    !isInstrumented(handler.errorHandler)
  ) {
    handler.errorHandler = new Proxy(handler.errorHandler, {
      apply(target, thisArg, args) {
        const [err, context] = args;

        getHonoIntegration()?.handleHonoException(err, context);

        return Reflect.apply(target, thisArg, args);
      },
    });

    markAsInstrumented(handler.errorHandler);
  }
}
