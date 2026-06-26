import * as api from '@opentelemetry/api';
import { setOpenTelemetryContextAsyncContextStrategy } from './asyncContextStrategy';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { TracingChannelBinding } from '@sentry/core';

interface ContextApi {
  _getContextManager():
    | undefined
    | {
        getAsyncLocalStorageLookup(): {
          asyncLocalStorage: unknown;
        };
      };
}

export function setNodeOpenTelemetryContextAsyncContextStrategy(options?: { skipOpenTelemetrySetup?: boolean }): void {
  setOpenTelemetryContextAsyncContextStrategy({
    getTracingChannelBinding: !options?.skipOpenTelemetrySetup
      ? getDefaultAsyncLocalStorageFactory()
      : getCustomAsyncLocalStorageFactory(),
  });
}

/**
 * In the default case, we build the local storage instance ourselves here.
 * The default asyncLocalStorageContextManager will then use this internally.
 */
function getDefaultAsyncLocalStorageFactory() {
  const defaultAsyncLocalStorage = new AsyncLocalStorage<api.Context>();

  return () => {
    return {
      asyncLocalStorage: defaultAsyncLocalStorage,
      getStoreWithActiveSpan: span => api.trace.setSpan(api.context.active(), span),
    } satisfies TracingChannelBinding;
  };
}

/**
 * If we have a custom context manager, we need to access it via the context manager
 * this may not be available yet, if this is called before the Otel ContextManager was setup
 * in this case, we need to return undefined and retry later, hoping that the setup works by then
 */
function getCustomAsyncLocalStorageFactory() {
  return () => {
    try {
      const contextManager = (api.context as unknown as ContextApi)._getContextManager();
      const asyncLocalStorage = contextManager?.getAsyncLocalStorageLookup().asyncLocalStorage;

      return {
        asyncLocalStorage,
        getStoreWithActiveSpan: span => api.trace.setSpan(api.context.active(), span as api.Span),
      } satisfies TracingChannelBinding;
    } catch {
      return undefined;
    }
  };
}
