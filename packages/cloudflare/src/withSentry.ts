import type { Hono, Env as HonoEnv } from 'hono';
import { setAsyncLocalStorageAsyncContextStrategy } from './async';
import type { CloudflareOptions } from './client';
import { ensureInstrumented } from './instrument';
import { instrumentExportedHandlerEmail } from './instrumentations/worker/instrumentEmail';
import { instrumentExportedHandlerFetch } from './instrumentations/worker/instrumentFetch';
import { instrumentExportedHandlerQueue } from './instrumentations/worker/instrumentQueue';
import { instrumentExportedHandlerScheduled } from './instrumentations/worker/instrumentScheduled';
import { instrumentExportedHandlerTail } from './instrumentations/worker/instrumentTail';
import { getHonoIntegration } from './integrations/hono';
import { isCloudflareClass } from './utils/isCloudflareClass';
import {
  instrumentWorkerEntrypoint,
  type HandlerEnv,
  type WorkerEntrypointConstructor,
} from './instrumentations/instrumentWorkerEntrypoint';

// oxlint-disable-next-line typescript/no-explicit-any
type ExportedHandlerHandler<T> = Extract<T, ExportedHandler<any, any, any>>;

// oxlint-disable-next-line typescript/no-explicit-any
type HandlerWithHonoErrorHandler = ExportedHandler<any, any, any> & {
  onError?: () => void;
  errorHandler?: (err: Error, context?: unknown) => Response;
};

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
  // oxlint-disable-next-line typescript/no-explicit-any
  T extends ExportedHandler<any, any, any> | WorkerEntrypointConstructor<any, any> | Hono<HonoEnv>,
  HandlerBindings = HandlerEnv<T>,
>(optionsCallback: (env: HandlerBindings) => CloudflareOptions | undefined, handler: T): T {
  if (isCloudflareClass(handler, 'WorkerEntrypoint')) {
    return instrumentWorkerEntrypoint(optionsCallback, handler);
  }

  setAsyncLocalStorageAsyncContextStrategy();

  const exportedHandler = handler as ExportedHandlerHandler<T>;
  const instrumentOptionsCallback = optionsCallback as (
    env: HandlerEnv<ExportedHandlerHandler<T>>,
  ) => CloudflareOptions | undefined;

  try {
    instrumentExportedHandlerFetch(exportedHandler, instrumentOptionsCallback);
    instrumentHonoErrorHandler(exportedHandler);
    instrumentExportedHandlerScheduled(exportedHandler, instrumentOptionsCallback);
    instrumentExportedHandlerEmail(exportedHandler, instrumentOptionsCallback);
    instrumentExportedHandlerQueue(exportedHandler, instrumentOptionsCallback);
    instrumentExportedHandlerTail(exportedHandler, instrumentOptionsCallback);
    // This is here because Miniflare sometimes cannot get instrumented
  } catch {
    // Do not console anything here, we don't want to spam the console with errors
  }

  return handler;
}

function instrumentHonoErrorHandler(handler: HandlerWithHonoErrorHandler): void {
  if ('onError' in handler && 'errorHandler' in handler && typeof handler.errorHandler === 'function') {
    handler.errorHandler = ensureInstrumented(
      handler.errorHandler,
      original =>
        new Proxy(original, {
          apply(target, thisArg, args) {
            const [err, context] = args;

            getHonoIntegration()?.handleHonoException(err, context);

            return Reflect.apply(target, thisArg, args);
          },
        }),
    );
  }
}
