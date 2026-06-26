import * as api from '@opentelemetry/api';
import { setOpenTelemetryContextAsyncContextStrategy } from './asyncContextStrategy';
import { AsyncLocalStorage } from 'node:async_hooks';

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
  const defaultAsyncLocalStorage = new AsyncLocalStorage<api.Context>();

  setOpenTelemetryContextAsyncContextStrategy({
    getTracingChannelBinding: () => {
      // Default case: by default we can just access the async local storage instance here
      // this will work no matter if this called before or after the Otel ContextManager was setup
      if (!options?.skipOpenTelemetrySetup) {
        return {
          asyncLocalStorage: defaultAsyncLocalStorage,
          getStoreWithActiveSpan: span => api.trace.setSpan(api.context.active(), span),
        };
      }

      // Else, if we have a custom context manager, we need to access it via the context manager
      // this may not be available yet, if this is called before the Otel ContextManager was setup
      // in this case, we need to return undefined and retry later, hoping that the setup works by then
      try {
        const contextManager = (api.context as unknown as ContextApi)._getContextManager();
        const asyncLocalStorage = contextManager?.getAsyncLocalStorageLookup().asyncLocalStorage;

        return {
          asyncLocalStorage,
          getStoreWithActiveSpan: span => api.trace.setSpan(api.context.active(), span as api.Span),
        };
      } catch {
        return undefined;
      }
    },
  });
}
